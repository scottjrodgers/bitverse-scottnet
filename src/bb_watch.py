"""
Filesystem side of the tool: deciding which files should sync, walking a
directory for a one-shot manual sync, and an optional continuous
watchdog-based watcher for automatic sync.

The watcher and the manual walk share the same include/exclude matching
logic so "watched" and "manually triggered" sync can never disagree about
which files count.
"""

from __future__ import annotations

import fnmatch
import threading
from pathlib import Path
from typing import Callable, Iterator

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

OnChangeFn = Callable[[Path, bool], None]  # (local_path, deleted) -> None


def _is_syncable(rel_posix: str, include_extensions: list[str], exclude_patterns: list[str]) -> bool:
    if any(fnmatch.fnmatch(rel_posix, pattern) for pattern in exclude_patterns):
        return False
    return any(rel_posix.endswith(ext) for ext in include_extensions)


def iter_syncable_files(root: Path, include_extensions: list[str], exclude_patterns: list[str]) -> Iterator[Path]:
    """Walk root and yield every file that matches the include/exclude rules."""
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel_posix = path.relative_to(root).as_posix()
        if _is_syncable(rel_posix, include_extensions, exclude_patterns):
            yield path


class _Handler(FileSystemEventHandler):
    """
    Translates raw watchdog events into debounced (path, deleted) calls.

    Debouncing matters because editors often fire multiple modify events
    (or a delete+create pair) for what's conceptually a single save, and
    we don't want to push a half-written file or double up work.
    """

    def __init__(
        self,
        root: Path,
        include_extensions: list[str],
        exclude_patterns: list[str],
        on_change: OnChangeFn,
        debounce_seconds: float = 0.3,
    ):
        self.root = root
        self.include_extensions = include_extensions
        self.exclude_patterns = exclude_patterns
        self.on_change = on_change
        self.debounce_seconds = debounce_seconds
        self._timers: dict[str, threading.Timer] = {}
        self._lock = threading.Lock()

    def _matches(self, path_str: str) -> bool:
        try:
            rel_posix = Path(path_str).resolve().relative_to(self.root).as_posix()
        except ValueError:
            return False
        return _is_syncable(rel_posix, self.include_extensions, self.exclude_patterns)

    def _schedule(self, path_str: str, deleted: bool) -> None:
        with self._lock:
            existing = self._timers.pop(path_str, None)
            if existing:
                existing.cancel()
            timer = threading.Timer(self.debounce_seconds, self._fire, args=(path_str, deleted))
            timer.daemon = True
            self._timers[path_str] = timer
            timer.start()

    def _fire(self, path_str: str, deleted: bool) -> None:
        with self._lock:
            self._timers.pop(path_str, None)
        self.on_change(Path(path_str), deleted)

    def on_created(self, event):
        if not event.is_directory and self._matches(event.src_path):
            self._schedule(event.src_path, deleted=False)

    def on_modified(self, event):
        if not event.is_directory and self._matches(event.src_path):
            self._schedule(event.src_path, deleted=False)

    def on_deleted(self, event):
        if not event.is_directory and self._matches(event.src_path):
            self._schedule(event.src_path, deleted=True)

    def on_moved(self, event):
        if event.is_directory:
            return
        if self._matches(event.src_path):
            self._schedule(event.src_path, deleted=True)
        if self._matches(event.dest_path):
            self._schedule(event.dest_path, deleted=False)


class BBWatcher:
    @staticmethod
    def start(
        root: Path,
        include_extensions: list[str],
        exclude_patterns: list[str],
        on_change: OnChangeFn,
    ) -> Observer:
        """Start watching root in a background thread. Returns the Observer (call .stop()/.join() to stop)."""
        handler = _Handler(root, include_extensions, exclude_patterns, on_change)
        observer = Observer()
        observer.schedule(handler, str(root), recursive=True)
        observer.start()
        return observer
