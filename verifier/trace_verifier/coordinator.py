import asyncio
import base64
import json
import os
import random
import secrets
import sqlite3
import statistics
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import ValidationError

from .attestation import Attestation
from .chain import Chain, Relayer
from .clips import PUBLIC_FILES, clip_ids, load_physics, load_rules
from .hashing import attempt_id, content_hash, from_hex, item_id, to_hex
from .models import Annotation

SCHEMA = """
CREATE TABLE IF NOT EXISTS leases (
  lease_id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  issued_at REAL NOT NULL,
  expires_at REAL NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS leases_player ON leases (player, expires_at);
CREATE TABLE IF NOT EXISTS attempts (
  attempt_id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw BLOB NOT NULL,
  passed INTEGER NOT NULL,
  score INTEGER NOT NULL,
  reason TEXT NOT NULL,
  attestation TEXT NOT NULL,
  signatures TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  submitted_at REAL NOT NULL,
  sign_ms INTEGER NOT NULL,
  tx_hash TEXT,
  paid TEXT,
  confirm_ms INTEGER,
  gas_used INTEGER,
  gas_price TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS attempts_player ON attempts (player, clip_id);
CREATE INDEX IF NOT EXISTS attempts_status ON attempts (status);
CREATE TABLE IF NOT EXISTS claims (
  claim_id TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  dataset TEXT NOT NULL,
  requested TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at REAL NOT NULL,
  tx_hash TEXT,
  amount TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS claims_holder ON claims (holder, status);
CREATE TABLE IF NOT EXISTS votes (
  attempt_id TEXT NOT NULL,
  node TEXT NOT NULL,
  signer TEXT,
  passed INTEGER,
  score INTEGER,
  ms INTEGER NOT NULL,
  agreed INTEGER,
  error TEXT
);
"""


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(q * (len(ordered) - 1))))]


class Coordinator:
    def __init__(self) -> None:
        root = Path(__file__).resolve().parents[2]
        self.slug = os.environ.get("TASK_SLUG", "grasp-slip-01")
        self.clips_dir = Path(os.environ.get("CLIPS_DIR", root / "clips" / self.slug))
        deployment_path = Path(os.environ.get("DEPLOYMENT", root / "contracts" / "deployments" / f"{os.environ.get('CHAIN_ID', '31337')}.json"))
        self.deployment = json.loads(deployment_path.read_text())
        self.task_id = self.deployment["taskId"].lower()
        self.chain = Chain(os.environ["RPC_URL"], self.deployment, Path(os.environ.get("CONTRACTS_OUT", root / "contracts" / "out")))
        self.relayer = Relayer(self.chain, [k.strip() for k in os.environ["RELAYER_KEYS"].split(",") if k.strip()])
        self.nodes = [u.strip().rstrip("/") for u in os.environ["NODE_URLS"].split(",") if u.strip()]
        self.rules, _ = load_rules(self.clips_dir)
        self.clips = clip_ids(self.clips_dir)
        _, local_root = load_physics(self.clips_dir)
        onchain_root = to_hex(self.chain.task(self.task_id)["clipsRoot"])
        if local_root.lower() != onchain_root.lower():
            raise RuntimeError(f"clips do not match the task's clipsRoot: local {local_root}, on chain {onchain_root}")
        self.deadline_s = int(os.environ.get("ATTESTATION_TTL_S", "300"))
        self.rate_limit_s = float(os.environ.get("RATE_LIMIT_S", "2"))
        self.db = sqlite3.connect(os.environ.get("DB_PATH", "coordinator.db"), check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        self.db.commit()
        self.http = httpx.AsyncClient(timeout=float(os.environ.get("NODE_TIMEOUT_S", "5")))
        self.last_submit: dict[str, float] = {}
        self.background: set[asyncio.Task] = set()
        self.dataset = self.chain.task(self.task_id)["dataset"]
        for row in self.db.execute("SELECT attempt_id FROM attempts WHERE status = 'pending'").fetchall():
            self._spawn(self._relay(row["attempt_id"]))
        for row in self.db.execute("SELECT claim_id FROM claims WHERE status = 'pending'").fetchall():
            self._spawn(self._relay_claim(row["claim_id"]))

    def _spawn(self, coro) -> None:
        task = asyncio.get_running_loop().create_task(coro)
        self.background.add(task)
        task.add_done_callback(self.background.discard)

    async def _relay(self, aid: str) -> None:
        row = self.db.execute("SELECT attestation, signatures, submitted_at FROM attempts WHERE attempt_id = ?", (aid,)).fetchone()
        att = Attestation(**json.loads(row["attestation"]))
        try:
            result = await asyncio.to_thread(self.relayer.record, att, json.loads(row["signatures"]))
            status = "confirmed" if result["status"] == 1 else "failed"
            self.db.execute(
                "UPDATE attempts SET status = ?, tx_hash = ?, paid = ?, confirm_ms = ?, gas_used = ?, gas_price = ?, error = NULL WHERE attempt_id = ?",
                (status, result["tx_hash"], str(result["paid"]), round((time.time() - row["submitted_at"]) * 1000), result["gas_used"], str(result["gas_price"]), aid),
            )
        except Exception as e:
            already = await asyncio.to_thread(self.chain.seen, from_hex(aid))
            self.db.execute(
                "UPDATE attempts SET status = ?, error = ? WHERE attempt_id = ?",
                ("confirmed" if already else "failed", str(e)[:500], aid),
            )
        self.db.commit()

    async def _relay_claim(self, claim_id: str) -> None:
        row = self.db.execute("SELECT holder, dataset FROM claims WHERE claim_id = ?", (claim_id,)).fetchone()
        try:
            result = await asyncio.to_thread(self.relayer.claim_for, row["dataset"], row["holder"])
            self.db.execute(
                "UPDATE claims SET status = ?, tx_hash = ?, amount = ? WHERE claim_id = ?",
                ("confirmed" if result["status"] == 1 else "failed", result["tx_hash"], str(result["amount"]), claim_id),
            )
        except Exception as e:
            self.db.execute("UPDATE claims SET status = 'failed', error = ? WHERE claim_id = ?", (str(e)[:500], claim_id))
        self.db.commit()

    async def _ask(self, node: str, payload: dict) -> dict:
        started = time.time()
        try:
            r = await self.http.post(f"{node}/verify", json=payload)
            r.raise_for_status()
            body = r.json()
            body["ms"] = round((time.time() - started) * 1000)
            body["node"] = node
            return body
        except Exception as e:
            return {"node": node, "error": str(e)[:200], "ms": round((time.time() - started) * 1000)}

    async def quorum(self, raw: bytes, deadline: int) -> tuple[list[dict], list[dict], asyncio.Future]:
        need = 2
        payload = {"annotation_b64": base64.b64encode(raw).decode(), "deadline": deadline}
        pending = {asyncio.ensure_future(self._ask(n, payload)) for n in self.nodes}
        votes: list[dict] = []
        winners: list[dict] = []
        while pending and not winners:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
            for f in done:
                vote = f.result()
                votes.append(vote)
                if "error" in vote:
                    continue
                same = [v for v in votes if "error" not in v and (v["passed"], v["score"]) == (vote["passed"], vote["score"])]
                if len(same) >= need:
                    winners = same[:need]
        rest = asyncio.gather(*pending) if pending else asyncio.sleep(0, result=[])
        return winners, votes, rest

    def record_votes(self, aid: str, votes: list[dict], winners: list[dict]) -> None:
        verdict = (winners[0]["passed"], winners[0]["score"]) if winners else None
        for v in votes:
            agreed = None if "error" in v or verdict is None else int((v["passed"], v["score"]) == verdict)
            self.db.execute(
                "INSERT INTO votes VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (aid, v["node"], v.get("signer"), v.get("passed"), v.get("score"), v["ms"], agreed, v.get("error")),
            )
        self.db.commit()


coord: Coordinator | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global coord
    coord = Coordinator()
    yield
    await coord.http.aclose()
    coord.db.close()


app = FastAPI(title="Trace coordinator", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5200").split(",")],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _task_or_404(slug: str) -> None:
    if slug != coord.slug:
        raise HTTPException(404, "unknown task")


def _player(player: str) -> str:
    if not player.startswith("0x") or len(player) != 42:
        raise HTTPException(422, "player must be an address")
    return player.lower()


@app.get("/health")
def health() -> dict:
    return {"task": coord.slug, "clips": len(coord.clips), "nodes": coord.nodes, "relayers": coord.relayer.addresses()}


@app.get("/t/{slug}")
async def task_info(slug: str, player: str | None = Query(default=None)) -> dict:
    _task_or_404(slug)
    task = await asyncio.to_thread(coord.chain.task, coord.task_id)
    remaining_cap = None
    if player:
        paid = await asyncio.to_thread(coord.chain.paid_count, coord.task_id, _player(player))
        remaining_cap = max(0, task["maxPaidPerContributor"] - paid)
    return {
        "slug": coord.slug,
        "taskId": coord.task_id,
        "chainId": coord.chain.chain_id,
        "registry": coord.deployment["registry"],
        "usdc": coord.deployment["usdc"],
        "mockUsdc": coord.deployment.get("mockUsdc", False),
        "dataset": task["dataset"],
        "payPerItem": str(task["payPerItem"]),
        "remaining": str(task["remaining"]),
        "maxPaidPerContributor": task["maxPaidPerContributor"],
        "remainingCap": remaining_cap,
        "deadline": task["deadline"],
        "clips": len(coord.clips),
        "rules": coord.rules,
    }


def _clip_urls(request: Request, clip: str) -> dict:
    base = (os.environ.get("PUBLIC_URL") or str(request.base_url)).rstrip("/")
    return {
        "videoUrl": f"{base}/clips/{clip}/video.mp4",
        "sensorsUrl": f"{base}/clips/{clip}/sensors.json",
        "thumbUrl": f"{base}/clips/{clip}/thumb.jpg",
    }


@app.get("/t/{slug}/next")
def next_clip(slug: str, request: Request, player: str = Query()) -> dict:
    _task_or_404(slug)
    player = _player(player)
    now = time.time()
    active = coord.db.execute(
        "SELECT * FROM leases WHERE player = ? AND used = 0 AND expires_at > ? ORDER BY expires_at DESC LIMIT 1", (player, now)
    ).fetchone()
    if active:
        return {"clipId": active["clip_id"], "leaseId": active["lease_id"], "expiresAt": active["expires_at"], **_clip_urls(request, active["clip_id"])}
    done = {r["clip_id"] for r in coord.db.execute("SELECT clip_id FROM attempts WHERE player = ?", (player,))}
    open_clips = [c for c in coord.clips if c not in done]
    if not open_clips:
        raise HTTPException(404, "you have annotated every clip in this task")
    clip = random.choice(open_clips)
    lease_id = secrets.token_hex(12)
    expires = now + int(coord.rules.get("lease_s", 60))
    coord.db.execute("INSERT INTO leases VALUES (?, ?, ?, ?, ?, 0)", (lease_id, player, clip, now, expires))
    coord.db.commit()
    return {"clipId": clip, "leaseId": lease_id, "expiresAt": expires, **_clip_urls(request, clip)}


@app.post("/annotations")
async def submit(request: Request) -> dict:
    raw = await request.body()
    if len(raw) > 4096:
        raise HTTPException(413, "annotation too large")
    try:
        ann = Annotation.model_validate_json(raw)
    except ValidationError as e:
        raise HTTPException(422, f"bad annotation: {e.errors()[0]['loc']} {e.errors()[0]['msg']}")
    if ann.task_id != coord.task_id:
        raise HTTPException(422, "annotation is for another task")
    player = ann.player.lower()
    now = time.time()
    ip = request.client.host if request.client else "?"
    for key in (player, ip):
        if now - coord.last_submit.get(key, 0) < coord.rate_limit_s:
            raise HTTPException(429, "slow down")
    lease = coord.db.execute("SELECT * FROM leases WHERE lease_id = ?", (ann.lease_id,)).fetchone()
    if not lease or lease["player"] != player or lease["clip_id"] != ann.clip_id:
        raise HTTPException(409, "no lease for this clip")
    if lease["used"]:
        raise HTTPException(409, "lease already used")
    if lease["expires_at"] < now:
        raise HTTPException(410, "lease expired, load the next clip")
    aid = to_hex(attempt_id(from_hex(coord.task_id), item_id(ann.clip_id), ann.player))
    if coord.db.execute("SELECT 1 FROM attempts WHERE attempt_id = ?", (aid,)).fetchone():
        raise HTTPException(409, "already annotated this clip")
    task = await asyncio.to_thread(coord.chain.task, coord.task_id)
    paid = await asyncio.to_thread(coord.chain.paid_count, coord.task_id, ann.player)
    if paid >= task["maxPaidPerContributor"]:
        raise HTTPException(409, "you reached this task's per-contributor cap")
    coord.last_submit[player] = now
    coord.last_submit[ip] = now
    coord.db.execute("UPDATE leases SET used = 1 WHERE lease_id = ?", (ann.lease_id,))
    coord.db.commit()

    deadline = int(now) + coord.deadline_s
    started = time.time()
    winners, votes, rest = await coord.quorum(raw, deadline)
    sign_ms = round((time.time() - started) * 1000)
    if not winners:
        coord.record_votes(aid, votes, winners)
        coord.db.execute("UPDATE leases SET used = 0 WHERE lease_id = ?", (ann.lease_id,))
        coord.db.commit()
        raise HTTPException(503, "verifier nodes did not reach quorum, try again")

    winners.sort(key=lambda v: int(v["signer"], 16))
    att = winners[0]["attestation"]
    coord.db.execute(
        "INSERT INTO attempts (attempt_id, player, clip_id, content_hash, raw, passed, score, reason, attestation, signatures, status, submitted_at, sign_ms)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
        (aid, player, ann.clip_id, to_hex(content_hash(raw)), raw, int(att["passed"]), att["score"], winners[0]["reason"],
         json.dumps(att), json.dumps([v["signature"] for v in winners]), now, sign_ms),
    )
    coord.db.commit()
    coord._spawn(coord._relay(aid))

    async def finish_votes() -> None:
        late = await rest
        coord.record_votes(aid, votes + list(late), winners)

    coord._spawn(finish_votes())
    return {"attemptId": aid, "passed": att["passed"], "score": att["score"], "reason": winners[0]["reason"], "status": "submitted"}


@app.get("/attempts/{aid}")
def attempt(aid: str) -> dict:
    row = coord.db.execute("SELECT * FROM attempts WHERE attempt_id = ?", (aid.lower(),)).fetchone()
    if not row:
        raise HTTPException(404, "unknown attempt")
    return {
        "attemptId": row["attempt_id"],
        "status": row["status"],
        "passed": bool(row["passed"]),
        "score": row["score"],
        "reason": row["reason"],
        "txHash": row["tx_hash"],
        "paid": row["paid"],
        "confirmMs": row["confirm_ms"],
        "error": row["error"],
    }


@app.get("/stats")
def stats() -> dict:
    rows = coord.db.execute("SELECT sign_ms, confirm_ms, status, gas_used, gas_price FROM attempts").fetchall()
    sign = [r["sign_ms"] for r in rows]
    confirm = [r["confirm_ms"] for r in rows if r["confirm_ms"] is not None]
    nodes = coord.db.execute(
        "SELECT signer, COUNT(*) AS signatures, SUM(CASE WHEN agreed = 0 THEN 1 ELSE 0 END) AS disagreements"
        " FROM votes WHERE signer IS NOT NULL GROUP BY signer ORDER BY signer"
    ).fetchall()
    errors = coord.db.execute("SELECT node, COUNT(*) AS n FROM votes WHERE error IS NOT NULL GROUP BY node").fetchall()
    return {
        "attempts": len(rows),
        "pending": sum(1 for r in rows if r["status"] == "pending"),
        "failed": sum(1 for r in rows if r["status"] == "failed"),
        "signMs": {"median": statistics.median(sign) if sign else None, "p95": percentile(sign, 0.95)},
        "submitToReceiptMs": {"median": statistics.median(confirm) if confirm else None, "p95": percentile(confirm, 0.95)},
        "nodes": [dict(r) for r in nodes],
        "nodeErrors": [dict(r) for r in errors],
        "relayers": coord.relayer.addresses(),
    }


@app.get("/clips/{clip}/{name}")
def clip_file(clip: str, name: str) -> FileResponse:
    if clip not in coord.clips or name not in PUBLIC_FILES:
        raise HTTPException(404, "not found")
    return FileResponse(coord.clips_dir / clip / name, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/holders/{holder}")
async def holder(holder: str) -> dict:
    who = _player(holder)
    h = await asyncio.to_thread(coord.chain.holder, coord.dataset, who)
    pending = coord.db.execute("SELECT claim_id FROM claims WHERE holder = ? AND status = 'pending'", (who,)).fetchone()
    return {
        "dataset": coord.dataset,
        "balance": str(h["balance"]),
        "claimable": str(h["claimable"]),
        "withdrawn": str(h["withdrawn"]),
        "totalSupply": str(h["totalSupply"]),
        "pendingClaim": pending["claim_id"] if pending else None,
    }


@app.post("/claims")
async def create_claim(body: dict) -> dict:
    who = _player(str(body.get("holder", "")))
    if coord.db.execute("SELECT 1 FROM claims WHERE holder = ? AND status = 'pending'", (who,)).fetchone():
        raise HTTPException(409, "a claim is already on its way")
    h = await asyncio.to_thread(coord.chain.holder, coord.dataset, who)
    if h["claimable"] == 0:
        raise HTTPException(409, "nothing to claim yet")
    claim_id = secrets.token_hex(12)
    coord.db.execute(
        "INSERT INTO claims (claim_id, holder, dataset, requested, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
        (claim_id, who, coord.dataset, str(h["claimable"]), time.time()),
    )
    coord.db.commit()
    coord._spawn(coord._relay_claim(claim_id))
    return {"claimId": claim_id, "requested": str(h["claimable"]), "status": "pending"}


@app.get("/claims/{claim_id}")
def get_claim(claim_id: str) -> dict:
    row = coord.db.execute("SELECT * FROM claims WHERE claim_id = ?", (claim_id,)).fetchone()
    if not row:
        raise HTTPException(404, "unknown claim")
    return {"claimId": row["claim_id"], "status": row["status"], "txHash": row["tx_hash"], "amount": row["amount"], "error": row["error"]}
