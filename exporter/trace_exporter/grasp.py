import mujoco
import numpy as np

from .sim import GRIP_FORCE, Ik, Params, project, smooth
from .scene import SCENE

LIFT_Z = 0.30
SETTLE_S = 0.6
TORQUE_HEADROOM = 0.95


def grasp_holds(p: Params, grip: tuple[float, float]) -> bool:
    m = mujoco.MjModel.from_xml_string(SCENE)
    m.geom_friction[m.geom("cup").id][0] = p.friction
    m.body_mass[m.body("cup").id] = p.mass
    d = mujoco.MjData(m)
    cup_body = m.body("cup").id
    act = [m.actuator(n).id for n in ("a1", "a2", "a3")]
    limits = np.abs(m.actuator_forcerange[act, 1])
    gl, gr = m.actuator("gl").id, m.actuator("gr").id
    ik = Ik(m)
    above = np.array([grip[0], 0.22])
    target = np.array(grip)
    lifted = np.array([grip[0], LIFT_Z])
    q = ik.solve(np.array([0.6, 1.2, 1.3]), above)
    d.qpos[ik.qpos] = q
    d.ctrl[act] = q
    mujoco.mj_forward(m, d)
    total = 1.0 + 0.4 + 1.2 + SETTLE_S
    for i in range(int(total / m.opt.timestep)):
        t = i * m.opt.timestep
        if t < 1.0:
            goal, force = above + (target - above) * smooth(t / 1.0), -4.0
        elif t < 1.4:
            goal, force = target, GRIP_FORCE * smooth((t - 1.0) / 0.4)
        else:
            goal, force = target + (lifted - target) * smooth((t - 1.4) / 1.2), GRIP_FORCE
        if i % 10 == 0:
            q = ik.solve(q, goal)
            d.ctrl[act] = q
        d.ctrl[gl] = force
        d.ctrl[gr] = force
        mujoco.mj_step(m, d)
        if t > 1.4 and np.any(np.abs(d.actuator_force[act]) > TORQUE_HEADROOM * limits):
            return False
    return d.xpos[cup_body][2] > LIFT_Z - 0.08


def hull(points: list[tuple[float, float]]) -> list[list[float]]:
    pts = sorted(set(points))
    if len(pts) < 3:
        return []
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for pt in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], pt) <= 0:
            lower.pop()
        lower.append(pt)
    for pt in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], pt) <= 0:
            upper.pop()
        upper.append(pt)
    return [[round(x, 4), round(y, 4)] for x, y in lower[:-1] + upper[:-1]]


def valid_zone(p: Params, cup_x: float = 0.40) -> list[list[float]]:
    m = mujoco.MjModel.from_xml_string(SCENE)
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    cam = m.camera("side").id
    ok = []
    for dx in np.linspace(-0.035, 0.035, 7):
        for z in np.linspace(0.015, 0.115, 6):
            if grasp_holds(p, (cup_x + dx, z)):
                u, v = project(m, d, cam, np.array([cup_x + dx, 0.0, z]))
                ok.append((float(u), float(v)))
    return hull(ok)
