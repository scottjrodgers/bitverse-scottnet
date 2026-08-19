"""
Config loading for the Bitburner filesync tool.

A config.toml is created with sane defaults the first time you run
`bb.py init` (or any command that can't find one), mirroring how
BitburnerGoFilesync bootstraps its own config file.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib  # type: ignore[no-redef]


DEFAULT_CONFIG_TEXT = """\
# Bitburner filesync config

# Local directory to sync. Relative paths are resolved against the
# location of this config file.
directory = "./scripts"

# Port Bitburner connects to. Set the same port under
# Options -> Remote API -> port in-game, then press Connect.
game_port = 12525

# Local-only port the CLI (bb.py) uses to talk to a running `bb.py serve`.
# Doesn't need to match anything in-game.
control_port = 12526

# In-game server files are pushed to / pulled from by default.
server = "home"

# File extensions synced by `sync` and by the watcher.
include_extensions = [".js", ".ts", ".txt", ".script", ".json"]

# fnmatch-style patterns checked against the relative path; always excluded.
exclude_patterns = ["*.d.ts", "node_modules/*", ".git/*", "__pycache__/*"]
"""

DEFAULT_INCLUDE_EXTENSIONS = [".js", ".ts", ".txt", ".script", ".json"]
DEFAULT_EXCLUDE_PATTERNS = ["*.d.ts", "node_modules/*", ".git/*", "__pycache__/*"]


@dataclass
class Config:
    directory: Path
    game_port: int = 12525
    control_port: int = 12526
    server: str = "home"
    include_extensions: list[str] = field(default_factory=lambda: list(DEFAULT_INCLUDE_EXTENSIONS))
    exclude_patterns: list[str] = field(default_factory=lambda: list(DEFAULT_EXCLUDE_PATTERNS))


def load_config(path: Path) -> Config:
    """Load config.toml, creating it with defaults first if it doesn't exist."""
    path = path.resolve()

    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(DEFAULT_CONFIG_TEXT, encoding="utf-8")

    with path.open("rb") as f:
        data = tomllib.load(f)

    directory = Path(data.get("directory", "./scripts"))
    if not directory.is_absolute():
        directory = (path.parent / directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)

    return Config(
        directory=directory,
        game_port=int(data.get("game_port", 12525)),
        control_port=int(data.get("control_port", 12526)),
        server=data.get("server", "home"),
        include_extensions=list(data.get("include_extensions", DEFAULT_INCLUDE_EXTENSIONS)),
        exclude_patterns=list(data.get("exclude_patterns", DEFAULT_EXCLUDE_PATTERNS)),
    )
