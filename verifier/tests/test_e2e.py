import json
import time
from pathlib import Path

import httpx
import pytest
from eth_account import Account
from web3 import Web3

ROOT = Path(__file__).resolve().parents[2]
API = "http://127.0.0.1:8100"
CLIPS = ROOT / "clips" / "grasp-slip-01"
ERC20 = [{"name": "balanceOf", "type": "function", "stateMutability": "view", "inputs": [{"name": "a", "type": "address"}], "outputs": [{"type": "uint256"}]}]


def _up() -> bool:
    try:
        return httpx.get(f"{API}/health", timeout=1).status_code == 200
    except httpx.HTTPError:
        return False


pytestmark = pytest.mark.skipif(not _up(), reason="local stack not running (scripts/local-up.sh)")


def _annotation(task: dict, lease: dict, player: str, t: float, dwell: int = 4200) -> bytes:
    return json.dumps({
        "schema_version": "1.0",
        "task_id": task["taskId"],
        "clip_id": lease["clipId"],
        "player": player,
        "lease_id": lease["leaseId"],
        "kind": "annotation",
        "failure_moment": {"t": round(t, 3), "type": "contact_lost"},
        "grasp_point": None,
        "dwell_ms": dwell,
        "client": "e2e-test",
    }).encode()


def _truth(clip: str) -> float:
    return json.loads((CLIPS / clip / "physics.json").read_text())["primary_event"]["t"]


def _wait(aid: str) -> dict:
    for _ in range(100):
        a = httpx.get(f"{API}/attempts/{aid}").json()
        if a["status"] != "pending":
            return a
        time.sleep(0.2)
    raise AssertionError("attempt never confirmed")


def test_annotate_verify_pay_mint_end_to_end():
    player = Account.create().address
    task = httpx.get(f"{API}/t/grasp-slip-01", params={"player": player}).json()
    dep = json.loads((ROOT / "contracts/deployments/31337.json").read_text())
    w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))
    usdc = w3.eth.contract(address=dep["usdc"], abi=ERC20)
    dataset = w3.eth.contract(address=task["dataset"], abi=ERC20)

    lease = httpx.get(f"{API}/t/grasp-slip-01/next", params={"player": player}).json()
    assert lease["videoUrl"].endswith("/video.mp4")
    assert httpx.get(lease["sensorsUrl"]).status_code == 200
    assert httpx.get(f"{API}/clips/{lease['clipId']}/physics.json").status_code == 404

    good = _annotation(task, lease, player, _truth(lease["clipId"]) + 0.05)
    r = httpx.post(f"{API}/annotations", content=good, headers={"Content-Type": "application/json"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["passed"] and body["score"] > 6000
    done = _wait(body["attemptId"])
    assert done["status"] == "confirmed", done
    assert done["paid"] == task["payPerItem"]
    assert usdc.functions.balanceOf(player).call() == int(task["payPerItem"])
    assert dataset.functions.balanceOf(player).call() == 10**18

    replay = httpx.post(f"{API}/annotations", content=good, headers={"Content-Type": "application/json"})
    assert replay.status_code in (409, 429)

    time.sleep(2.1)
    lease2 = httpx.get(f"{API}/t/grasp-slip-01/next", params={"player": player}).json()
    assert lease2["clipId"] != lease["clipId"]
    truth2 = _truth(lease2["clipId"])
    bad = _annotation(task, lease2, player, truth2 + 0.4)
    r2 = httpx.post(f"{API}/annotations", content=bad, headers={"Content-Type": "application/json"})
    assert r2.status_code == 200, r2.text
    assert not r2.json()["passed"]
    assert f"{truth2:.2f} s" in r2.json()["reason"]
    done2 = _wait(r2.json()["attemptId"])
    assert done2["status"] == "confirmed" and done2["paid"] == "0"
    assert usdc.functions.balanceOf(player).call() == int(task["payPerItem"])

    stats = httpx.get(f"{API}/stats").json()
    assert stats["signMs"]["median"] is not None
    assert len(stats["nodes"]) >= 2


def test_rejects_fast_and_unleased_annotations():
    time.sleep(2.1)
    player = Account.create().address
    task = httpx.get(f"{API}/t/grasp-slip-01").json()
    lease = httpx.get(f"{API}/t/grasp-slip-01/next", params={"player": player}).json()
    forged = dict(lease, leaseId="not-a-lease")
    r = httpx.post(f"{API}/annotations", content=_annotation(task, forged, player, 5.0), headers={"Content-Type": "application/json"})
    assert r.status_code == 409
    fast = _annotation(task, lease, player, _truth(lease["clipId"]), dwell=900)
    r = httpx.post(f"{API}/annotations", content=fast, headers={"Content-Type": "application/json"})
    assert r.status_code == 200
    assert not r.json()["passed"] and "900 ms" in r.json()["reason"]


def _send(w3: Web3, key: str, call) -> None:
    acct = Account.from_key(key)
    tx = call.build_transaction({"from": acct.address, "nonce": w3.eth.get_transaction_count(acct.address), "chainId": 31337})
    receipt = w3.eth.wait_for_transaction_receipt(w3.eth.send_raw_transaction(acct.sign_transaction(tx).raw_transaction))
    assert receipt["status"] == 1


def test_license_then_gasless_claim():
    time.sleep(2.1)
    engineer_key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    lab_key = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"
    player = Account.create().address
    task = httpx.get(f"{API}/t/grasp-slip-01").json()
    lease = httpx.get(f"{API}/t/grasp-slip-01/next", params={"player": player}).json()
    r = httpx.post(f"{API}/annotations", content=_annotation(task, lease, player, _truth(lease["clipId"])), headers={"Content-Type": "application/json"})
    assert _wait(r.json()["attemptId"])["paid"] == task["payPerItem"]
    assert httpx.post(f"{API}/claims", json={"holder": player}).status_code == 409

    dep = json.loads((ROOT / "contracts/deployments/31337.json").read_text())
    out = ROOT / "contracts/out"
    w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))
    abi = lambda n: json.loads((out / f"{n}.sol/{n}.json").read_text())["abi"]
    vault = w3.eth.contract(address=dep["vault"], abi=abi("DataVault"))
    usdc = w3.eth.contract(address=dep["usdc"], abi=abi("MockUSDC"))
    lab = Account.from_key(lab_key).address
    price = 3_000_000
    _send(w3, engineer_key, vault.functions.setLicensePrice(task["dataset"], price))
    _send(w3, lab_key, usdc.functions.mint(lab, price))
    _send(w3, lab_key, usdc.functions.approve(dep["vault"], price))
    _send(w3, lab_key, vault.functions.license(task["dataset"]))

    holder = httpx.get(f"{API}/holders/{player}").json()
    assert int(holder["claimable"]) > 0
    before = usdc.functions.balanceOf(player).call()
    c = httpx.post(f"{API}/claims", json={"holder": player})
    assert c.status_code == 200, c.text
    for _ in range(100):
        claim = httpx.get(f"{API}/claims/{c.json()['claimId']}").json()
        if claim["status"] != "pending":
            break
        time.sleep(0.2)
    assert claim["status"] == "confirmed", claim
    assert usdc.functions.balanceOf(player).call() - before == int(holder["claimable"])
    assert w3.eth.get_balance(player) == 0
    assert httpx.get(f"{API}/holders/{player}").json()["claimable"] == "0"
