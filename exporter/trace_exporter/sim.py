from dataclasses import dataclass

import mujoco
import numpy as np

WIDTH, HEIGHT = 640, 480
GRIP_FORCE = 15.0


@dataclass
class Params:
    friction: float
    mass: float
    decay_start: float
    decay_rate: float


def smooth(u: float) -> float:
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


class Ik:
    def __init__(self, model: mujoco.MjModel) -> None:
        self.m = model
        self.d = mujoco.MjData(model)
        self.site = model.site("grip").id
        self.hand = model.body("hand").id
        self.dofs = [model.joint(n).dofadr[0] for n in ("j1", "j2", "j3")]
        self.qpos = [model.joint(n).qposadr[0] for n in ("j1", "j2", "j3")]

    def solve(self, q0: np.ndarray, target_xz: np.ndarray) -> np.ndarray:
        q = q0.copy()
        jacp = np.zeros((3, self.m.nv))
        jacr = np.zeros((3, self.m.nv))
        for _ in range(30):
            self.d.qpos[self.qpos] = q
            mujoco.mj_kinematics(self.m, self.d)
            mujoco.mj_comPos(self.m, self.d)
            pos = self.d.site_xpos[self.site]
            down = self.d.xmat[self.hand].reshape(3, 3)[:, 2]
            err = np.array([target_xz[0] - pos[0], target_xz[1] - pos[2], np.cross(down, [0, 0, -1])[1]])
            if np.linalg.norm(err) < 1e-5:
                break
            mujoco.mj_jacSite(self.m, self.d, jacp, jacr, self.site)
            j = np.vstack([jacp[0, self.dofs], jacp[2, self.dofs], jacr[1, self.dofs]])
            q += j.T @ np.linalg.solve(j @ j.T + 1e-4 * np.eye(3), err)
        return q


def project(model: mujoco.MjModel, data: mujoco.MjData, cam: int, point: np.ndarray) -> tuple[float, float]:
    pos = data.cam_xpos[cam]
    rot = data.cam_xmat[cam].reshape(3, 3)
    local = rot.T @ (point - pos)
    f = 0.5 * HEIGHT / np.tan(np.deg2rad(model.cam_fovy[cam]) / 2)
    u = WIDTH / 2 + f * local[0] / -local[2]
    v = HEIGHT / 2 - f * local[1] / -local[2]
    return u / WIDTH, v / HEIGHT
