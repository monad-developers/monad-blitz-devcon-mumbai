import json
from pathlib import Path

import pytest
from eth_account import Account
from web3 import Web3

from trace_verifier.attestation import Attestation, recover, sign
from trace_verifier.hashing import attempt_id, clip_leaf, from_hex, merkle_root, to_hex

KEY = "0x" + "11" * 32
REGISTRY = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
ROOT = Path(__file__).resolve().parents[2]


def att(**kw):
    base = dict(
        taskId="0x" + "ab" * 32,
        itemId="0x" + "cd" * 32,
        contributor=Account.from_key("0x" + "22" * 32).address,
        contentHash="0x" + "ef" * 32,
        kind=0,
        passed=True,
        score=6000,
        deadline=2_000_000_000,
    )
    base.update(kw)
    return Attestation(**base)


def test_sign_recovers_signer():
    a = att()
    assert recover(a, sign(a, KEY, 31337, REGISTRY), 31337, REGISTRY) == Account.from_key(KEY).address


def test_signature_binds_every_field():
    a = att()
    sig = sign(a, KEY, 31337, REGISTRY)
    assert recover(att(passed=False), sig, 31337, REGISTRY) != Account.from_key(KEY).address


def test_merkle_root_is_order_independent():
    leaves = [clip_leaf(f"c{i:02d}", f"log{i}".encode()) for i in range(5)]
    assert merkle_root(leaves) == merkle_root(list(reversed(leaves)))


def _deployment():
    path = ROOT / "contracts" / "deployments" / "31337.json"
    if not path.exists():
        return None
    w3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))
    if not w3.is_connected():
        return None
    return w3, json.loads(path.read_text())


def test_matches_onchain_digest_and_attempt_id():
    found = _deployment()
    if not found:
        pytest.skip("no local anvil deployment")
    w3, dep = found
    abi = json.loads((ROOT / "contracts/out/AttemptRegistry.sol/AttemptRegistry.json").read_text())["abi"]
    registry = w3.eth.contract(address=dep["registry"], abi=abi)
    a = att()
    onchain = registry.functions.digest(a.as_tuple()).call()
    from eth_account.messages import encode_typed_data, _hash_eip191_message
    from trace_verifier.attestation import TYPES, domain

    local = _hash_eip191_message(encode_typed_data(domain_data=domain(31337, dep["registry"]), message_types=TYPES, message_data=a.message()))
    assert onchain == local
    assert registry.functions.attemptId(from_hex(a.taskId), from_hex(a.itemId), a.contributor).call() == attempt_id(
        from_hex(a.taskId), from_hex(a.itemId), a.contributor
    )
