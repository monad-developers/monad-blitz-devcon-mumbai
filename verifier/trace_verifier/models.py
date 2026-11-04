import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

HEX32 = re.compile(r"^0x[0-9a-fA-F]{64}$")
ADDR = re.compile(r"^0x[0-9a-fA-F]{40}$")
CLIP = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class FailureMoment(BaseModel):
    t: float = Field(ge=0, le=3600)
    type: Literal["contact_lost", "collision"]


class GraspPoint(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class Annotation(BaseModel):
    schema_version: Literal["1.0"]
    task_id: str
    clip_id: str
    player: str
    lease_id: str = Field(min_length=1, max_length=64)
    kind: Literal["annotation"]
    failure_moment: FailureMoment | None = None
    grasp_point: GraspPoint | None = None
    dwell_ms: int = Field(ge=0, le=3_600_000)
    client: str = Field(max_length=64)

    @field_validator("task_id")
    @classmethod
    def _task(cls, v: str) -> str:
        if not HEX32.match(v):
            raise ValueError("task_id must be 0x + 32 bytes")
        return v.lower()

    @field_validator("player")
    @classmethod
    def _player(cls, v: str) -> str:
        if not ADDR.match(v):
            raise ValueError("player must be an address")
        return v

    @field_validator("clip_id")
    @classmethod
    def _clip(cls, v: str) -> str:
        if not CLIP.match(v):
            raise ValueError("bad clip_id")
        return v


class VerifyRequest(BaseModel):
    annotation_b64: str
    deadline: int


class VerifyResponse(BaseModel):
    passed: bool
    score: int
    reason: str
    signature: str
    signer: str
    attestation: dict
