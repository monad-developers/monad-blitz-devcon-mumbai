from dataclasses import dataclass, asdict

from eth_account import Account
from eth_account.messages import encode_typed_data

from .hashing import from_hex, to_hex

TYPES = {
    "Attestation": [
        {"name": "taskId", "type": "bytes32"},
        {"name": "itemId", "type": "bytes32"},
        {"name": "contributor", "type": "address"},
        {"name": "contentHash", "type": "bytes32"},
        {"name": "kind", "type": "uint8"},
        {"name": "passed", "type": "bool"},
        {"name": "score", "type": "uint16"},
        {"name": "deadline", "type": "uint64"},
    ]
}


@dataclass(frozen=True)
class Attestation:
    taskId: str
    itemId: str
    contributor: str
    contentHash: str
    kind: int
    passed: bool
    score: int
    deadline: int

    def message(self) -> dict:
        m = asdict(self)
        for k in ("taskId", "itemId", "contentHash"):
            m[k] = from_hex(m[k])
        return m

    def as_tuple(self) -> tuple:
        m = self.message()
        return (m["taskId"], m["itemId"], m["contributor"], m["contentHash"], m["kind"], m["passed"], m["score"], m["deadline"])


def domain(chain_id: int, registry: str) -> dict:
    return {"name": "Trace", "version": "1", "chainId": chain_id, "verifyingContract": registry}


def sign(att: Attestation, key: str, chain_id: int, registry: str) -> str:
    signed = Account.sign_typed_data(key, domain_data=domain(chain_id, registry), message_types=TYPES, message_data=att.message())
    return to_hex(signed.signature)


def recover(att: Attestation, signature: str, chain_id: int, registry: str) -> str:
    msg = encode_typed_data(domain_data=domain(chain_id, registry), message_types=TYPES, message_data=att.message())
    return Account.recover_message(msg, signature=from_hex(signature))
