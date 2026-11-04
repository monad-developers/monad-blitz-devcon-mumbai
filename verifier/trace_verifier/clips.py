import json
from pathlib import Path

from .hashing import clip_leaf, merkle_root, to_hex

PUBLIC_FILES = {"video.mp4", "sensors.json", "thumb.jpg"}


def clip_ids(task_dir: Path) -> list[str]:
    return sorted(p.name for p in task_dir.iterdir() if p.is_dir() and (p / "sensors.json").exists())


def load_physics(task_dir: Path) -> tuple[dict[str, dict], str]:
    logs: dict[str, dict] = {}
    leaves = []
    for clip in clip_ids(task_dir):
        raw = (task_dir / clip / "physics.json").read_bytes()
        logs[clip] = json.loads(raw)
        leaves.append(clip_leaf(clip, raw))
    return logs, to_hex(merkle_root(leaves))


def load_rules(task_dir: Path) -> tuple[dict, bytes]:
    raw = (task_dir / "rules.json").read_bytes()
    return json.loads(raw), raw
