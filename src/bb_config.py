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

# Port the CLI (bb.py) uses to talk to a running `bb.py serve`.
# Doesn't need to match anything in-game.
control_port = 12526

# Daemon side only: interface `serve` binds the control-plane socket to.
# Leave as loopback if the CLI only ever runs on this same machine.
# Set to a LAN IP (or "0.0.0.0") to let a CLI on another machine reach it --
# control_token is REQUIRED in that case, and `serve` refuses to start
# without one.
control_bind = "127.0.0.1"

# Client side only: host the CLI dials to reach a running `bb.py serve`.
# Point this at the gaming PC's LAN IP when running the CLI from elsewhere.
control_host = "127.0.0.1"

# Shared secret checked on every control-plane request. Required whenever
# control_bind isn't loopback. Leave blank for same-machine-only use.
control_token = ""

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
    control_bind: str = "127.0.0.1"
    control_host: str = "127.0.0.1"
    control_token: str = ""
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
        control_bind=data.get("control_bind", "127.0.0.1"),
        control_host=data.get("control_host", "127.0.0.1"),
        control_token=data.get("control_token", ""),
        server=data.get("server", "home"),
        include_extensions=list(data.get("include_extensions", DEFAULT_INCLUDE_EXTENSIONS)),
        exclude_patterns=list(data.get("exclude_patterns", DEFAULT_EXCLUDE_PATTERNS)),
    )
