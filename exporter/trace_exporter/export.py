import argparse
import json
import subprocess
from pathlib import Path

import mujoco
import numpy as np
from PIL import Image

from trace_verifier.hashing import clip_leaf, keccak, merkle_root, to_hex

from .grasp import valid_zone
from .scene import SCENE
from .sim import GRIP_FORCE, HEIGHT, WIDTH, Ik, Params, project, smooth

DURATION_S = 12.0
FPS = 30
RATE_HZ = 50
CONTACT_EPS_N = 0.05
LOST_HOLD_S = 0.04
RULES = {
    "schema_version": "1.0",
    "task": "grasp-slip-01",
    "annotation": "failure_moment",
    "failure_moment": {"tolerance_s": 0.15, "require_type": True},
    "grasp_point": {"enabled": False},
    "min_dwell_ms": 3000,
    "lease_s": 60,
}

HOME = np.array([0.22, 0.30])
ABOVE = np.array([0.40, 0.22])
GRASP = np.array([0.40, 0.05])
LIFTED = np.array([0.40, 0.30])


def grip_target(t: float) -> tuple[np.ndarray, bool]:
    if t < 2.0:
        return HOME + (ABOVE - HOME) * smooth(t / 2.0), False
    if t < 3.2:
        return ABOVE + (GRASP - ABOVE) * smooth((t - 2.0) / 1.2), False
    if t < 3.8:
        return GRASP, True
    if t < 6.0:
        return GRASP + (LIFTED - GRASP) * smooth((t - 3.8) / 2.2), True
    return LIFTED, True


def grip_force(t: float, p: Params) -> float:
    if t < 3.2:
        return -4.0
    if t < 3.6:
        return GRIP_FORCE * smooth((t - 3.2) / 0.4)
    if t < p.decay_start:
        return GRIP_FORCE
    return max(0.6, GRIP_FORCE * (1 - p.decay_rate * (t - p.decay_start)))


def cup_box(model: mujoco.MjModel, data: mujoco.MjData, cam: int) -> list[float]:
    c = data.xpos[model.body("cup").id]
    corners = [c + np.array([dx, dy, dz]) for dx in (-0.03, 0.05) for dy in (-0.03, 0.03) for dz in (-0.05, 0.05)]
    uv = np.array([project(model, data, cam, p) for p in corners])
    x0, y0 = uv.min(axis=0)
    x1, y1 = uv.max(axis=0)
    return [round(float(x0), 4), round(float(y0), 4), round(float(x1 - x0), 4), round(float(y1 - y0), 4)]


def simulate(p: Params, render: bool):
    m = mujoco.MjModel.from_xml_string(SCENE)
    cup_geom = m.geom("cup").id
    m.geom_friction[cup_geom][0] = p.friction
    m.body_mass[m.body("cup").id] = p.mass
    d = mujoco.MjData(m)
    fingers = {m.geom("finger_l").id, m.geom("finger_r").id}
    table = m.geom("table").id
    cam = m.camera("side").id
    act = [m.actuator(n).id for n in ("a1", "a2", "a3")]
    gl, gr = m.actuator("gl").id, m.actuator("gr").id
    ik = Ik(m)
    q = ik.solve(np.array([0.6, 1.2, 1.3]), HOME)
    d.qpos[ik.qpos] = q
    d.ctrl[act] = q
    mujoco.mj_forward(m, d)

    renderer = mujoco.Renderer(m, HEIGHT, WIDTH) if render else None
    frames: list[np.ndarray] = []
    force_series: list[float] = []
    torque_series: dict[str, list[float]] = {"j1": [], "j2": [], "j3": []}
    events: list[dict] = []
    held_since = None
    lost_since = None
    contact_lost_t = None
    airborne = False
    box = None
    steps = int(round(DURATION_S / m.opt.timestep))
    total_frames = int(round(DURATION_S * FPS))
    per_sample = int(round(1 / (RATE_HZ * m.opt.timestep)))
    cf = np.zeros(6)

    if renderer:
        renderer.update_scene(d, camera=cam)
        frames.append(renderer.render().copy())
    for i in range(steps):
        t = i * m.opt.timestep
        if i % 10 == 0:
            target, _ = grip_target(t)
            q = ik.solve(q, target)
            d.ctrl[act] = q
        g = grip_force(t, p)
        d.ctrl[gl] = g
        d.ctrl[gr] = g
        mujoco.mj_step(m, d)

        grip_n = 0.0
        on_table = False
        for k in range(d.ncon):
            c = d.contact[k]
            pair = {c.geom1, c.geom2}
            if cup_geom in pair and pair & fingers:
                mujoco.mj_contactForce(m, d, k, cf)
                grip_n += abs(cf[0])
            elif pair == {cup_geom, table}:
                on_table = True

        now = (i + 1) * m.opt.timestep
        if contact_lost_t is None:
            if grip_n > CONTACT_EPS_N:
                held_since = held_since if held_since is not None else now
                lost_since = None
            elif held_since is not None and now - held_since > 0.5:
                lost_since = lost_since if lost_since is not None else now
                if now - lost_since >= LOST_HOLD_S:
                    contact_lost_t = lost_since
                    events.append({"type": "contact_lost", "t": round(contact_lost_t, 3), "body": "cup"})
            else:
                held_since = None
        if contact_lost_t is not None and not on_table:
            airborne = True
        if airborne and on_table and not any(e["type"] == "collision" for e in events):
            events.append({"type": "collision", "t": round(now, 3), "geoms": ["cup", "table"]})

        if (i + 1) % per_sample == 0:
            force_series.append(round(grip_n, 3))
            for name, a in zip(("j1", "j2", "j3"), act):
                torque_series[name].append(round(float(d.actuator_force[a]), 3))
        while renderer and len(frames) < total_frames and len(frames) / FPS <= now + 1e-9:
            renderer.update_scene(d, camera=cam)
            frames.append(renderer.render().copy())
        if box is None and now >= 1.0:
            box = cup_box(m, d, cam)

    if renderer:
        renderer.close()
    return contact_lost_t, events, force_series, torque_series, frames, box


def encode(frames: list[np.ndarray], path: Path) -> None:
    proc = subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "26", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", str(path)],
        stdin=subprocess.PIPE,
    )
    for f in frames:
        proc.stdin.write(f.tobytes())
    proc.stdin.close()
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg failed")


def sample_params(rng: np.random.Generator) -> Params:
    return Params(
        friction=float(rng.uniform(0.35, 0.8)),
        mass=float(rng.uniform(0.15, 0.4)),
        decay_start=float(rng.uniform(4.6, 6.8)),
        decay_rate=float(rng.uniform(0.22, 0.5)),
    )


def export(out: Path, count: int, seed: int, grasp: bool) -> None:
    rng = np.random.default_rng(seed)
    out.mkdir(parents=True, exist_ok=True)
    leaves = []
    made = 0
    tries = 0
    while made < count:
        tries += 1
        if tries > count * 10:
            raise RuntimeError("too many clips without a slip in the window")
        p = sample_params(rng)
        lost, *_ = simulate(p, render=False)
        if lost is None or not 4.5 <= lost <= DURATION_S - 1.5:
            continue
        lost, events, force, torque, frames, box = simulate(p, render=True)
        clip_id = f"c{made:02d}"
        clip_dir = out / clip_id
        clip_dir.mkdir(exist_ok=True)
        encode(frames, clip_dir / "video.mp4")
        Image.fromarray(frames[int(FPS * 1.0)]).save(clip_dir / "thumb.jpg", quality=80)
        sensors = {
            "schema_version": "1.0",
            "clip_id": clip_id,
            "fps": FPS,
            "duration_s": DURATION_S,
            "rate_hz": RATE_HZ,
            "series": {"gripper_contact_force_n": force, "joint_torque_nm": torque},
        }
        (clip_dir / "sensors.json").write_text(json.dumps(sensors, separators=(",", ":")))
        zone = valid_zone(p)
        physics = {
            "schema_version": "1.0",
            "clip_id": clip_id,
            "events": events,
            "primary_event": {"type": "contact_lost", "t": round(lost, 3)},
            "grasp": {"frame_t": 1.0, "valid_zone": zone} if zone else None,
            "objects": [{"name": "cup", "frame_t": 1.0, "box": box}],
            "params": {k: round(v, 4) for k, v in p.__dict__.items()},
        }
        raw = json.dumps(physics, separators=(",", ":"), sort_keys=True).encode()
        (clip_dir / "physics.json").write_bytes(raw)
        leaves.append(clip_leaf(clip_id, raw))
        made += 1
        print(f"{clip_id}: contact lost at {lost:.3f} s (friction {p.friction:.2f}, mass {p.mass:.2f} kg)")

    rules = {**RULES, "grasp_point": {"enabled": grasp}}
    rules_raw = json.dumps(rules, separators=(",", ":"), sort_keys=True).encode()
    (out / "rules.json").write_bytes(rules_raw)
    task = {"task": rules["task"], "clips": made, "clipsRoot": to_hex(merkle_root(leaves)), "rulesHash": to_hex(keccak(rules_raw))}
    (out / "task.json").write_text(json.dumps(task, indent=2))
    print(json.dumps(task, indent=2))


def main() -> None:
    ap = argparse.ArgumentParser(description="Export grasp-slip clips from MuJoCo")
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "clips" / "grasp-slip-01")
    ap.add_argument("--count", type=int, default=24)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--grasp", action="store_true", help="require a grasp point too")
    args = ap.parse_args()
    export(args.out, args.count, args.seed, args.grasp)


if __name__ == "__main__":
    main()
