"""
Local filesystem path <-> Bitburner filename conversion.

Kept in one place on purpose. The Go-based tool this project replaces
(BitburnerGoFilesync) had a bug here: it converted the file's path to
forward slashes before stripping the sync root off of it, but never
converted the sync root itself - so on Windows the two strings never
matched, TrimPrefix was a no-op, and the *full absolute path* got synced
to the game instead of a relative one.

pathlib's relative_to() + as_posix() sidesteps that whole class of bug:
there's no manual prefix stripping and no separator bookkeeping to get
wrong.
"""

from __future__ import annotations

from pathlib import Path


def to_bitburner_filename(local_path: Path, root: Path) -> str:
    """
    Convert an absolute (or relative) local file path into the
    forward-slash, root-relative filename Bitburner expects.

    Raises ValueError if local_path isn't inside root.
    """
    rel = local_path.resolve().relative_to(root.resolve())
    return rel.as_posix()


def to_local_path(filename: str, root: Path) -> Path:
    """Convert a Bitburner filename (forward-slash, relative) to a local absolute path.

    Bitburner filenames may carry a leading "/" (its filesystem is flat but
    slash-prefixed). ``Path("/tmp") / "/etc/passwd"`` discards the left operand
    entirely and yields ``/etc/passwd``, so an absolute-looking filename would
    escape ``root``. Strip leading slashes before joining.
    """
    return (root / filename.lstrip("/")).resolve()
