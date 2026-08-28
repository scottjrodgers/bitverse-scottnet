"""
Deciding which local files count as "syncable" and walking a directory to
find them all, for a one-shot manual `sync`.
"""

from __future__ import annotations

import fnmatch
from pathlib import Path
from typing import Iterator


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
