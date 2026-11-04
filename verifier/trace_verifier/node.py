import base64
import json
import os
import sqlite3
import time
from contextlib import asynccontextmanager
from pathlib import Path

from eth_account import Account
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError

from .attestation import Attestation, sign
from .checks import verify_annotation
from .clips import load_physics, load_rules
from .hashing import content_hash, item_id, to_hex
from .models import Annotation, VerifyRequest, VerifyResponse


class NodeState:
    def __init__(self) -> None:
        self.key = os.environ["NODE_KEY"]
        self.signer = Account.from_key(self.key).address
        self.chain_id = int(os.environ["CHAIN_ID"])
        self.registry = os.environ["REGISTRY_ADDRESS"]
        self.task_id = os.environ["TASK_ID"].lower()
        self.task_dir = Path(os.environ["PHYSICS_DIR"])
        self.physics, root = load_physics(self.task_dir)
        expected = os.environ["CLIPS_ROOT"].lower()
        if root.lower() != expected:
            raise RuntimeError(f"physics logs do not match clipsRoot: computed {root}, expected {expected}")
        self.rules, _ = load_rules(self.task_dir)
        db_path = os.environ.get("NODE_DB", f"node-{self.signer.lower()}.db")
        self.db = sqlite3.connect(db_path, check_same_thread=False)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS verdicts (content_hash TEXT PRIMARY KEY, raw BLOB NOT NULL, passed INTEGER NOT NULL,"
            " score INTEGER NOT NULL, reason TEXT NOT NULL, deadline INTEGER NOT NULL, signature TEXT NOT NULL, created_at REAL NOT NULL)"
        )
        self.db.commit()


state: NodeState | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global state
    state = NodeState()
    yield
    state.db.close()


app = FastAPI(title="Trace verifier node", lifespan=lifespan)


@app.get("/health")
def health() -> dict:
    return {"signer": state.signer, "clips": len(state.physics), "task_id": state.task_id}


@app.post("/verify", response_model=VerifyResponse)
def verify(req: VerifyRequest) -> VerifyResponse:
    raw = base64.b64decode(req.annotation_b64, validate=True)
    try:
        annotation = Annotation.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(422, f"bad annotation: {e.errors()[0]['msg']}")
    if annotation.task_id != state.task_id:
        raise HTTPException(422, "annotation is for another task")
    physics = state.physics.get(annotation.clip_id)
    if physics is None:
        raise HTTPException(404, "unknown clip")
    verdict = verify_annotation(json.loads(raw), physics, state.rules)
    att = Attestation(
        taskId=state.task_id,
        itemId=to_hex(item_id(annotation.clip_id)),
        contributor=annotation.player,
        contentHash=to_hex(content_hash(raw)),
        kind=0,
        passed=verdict.passed,
        score=verdict.score,
        deadline=req.deadline,
    )
    signature = sign(att, state.key, state.chain_id, state.registry)
    state.db.execute(
        "INSERT OR REPLACE INTO verdicts VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (att.contentHash, raw, int(verdict.passed), verdict.score, verdict.reason, req.deadline, signature, time.time()),
    )
    state.db.commit()
    return VerifyResponse(
        passed=verdict.passed,
        score=verdict.score,
        reason=verdict.reason,
        signature=signature,
        signer=state.signer,
        attestation=att.__dict__,
    )
