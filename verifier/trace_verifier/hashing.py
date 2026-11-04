from eth_abi import encode
from eth_utils import keccak, to_checksum_address


def item_id(clip_id: str) -> bytes:
    return keccak(text=clip_id)


def content_hash(raw: bytes) -> bytes:
    return keccak(raw)


def attempt_id(task_id: bytes, item: bytes, contributor: str) -> bytes:
    return keccak(encode(["bytes32", "bytes32", "address"], [task_id, item, to_checksum_address(contributor)]))


def clip_leaf(clip_id: str, physics_raw: bytes) -> bytes:
    return keccak(encode(["bytes32", "bytes32"], [item_id(clip_id), keccak(physics_raw)]))


def merkle_root(leaves: list[bytes]) -> bytes:
    if not leaves:
        raise ValueError("no leaves")
    level = sorted(leaves)
    while len(level) > 1:
        nxt = []
        for i in range(0, len(level), 2):
            if i + 1 == len(level):
                nxt.append(level[i])
            else:
                a, b = sorted((level[i], level[i + 1]))
                nxt.append(keccak(a + b))
        level = nxt
    return level[0]


def to_hex(b: bytes) -> str:
    return "0x" + b.hex()


def from_hex(s: str) -> bytes:
    return bytes.fromhex(s[2:] if s.startswith("0x") else s)
