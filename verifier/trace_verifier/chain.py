import json
import threading
import time
from pathlib import Path

from eth_account import Account
from web3 import Web3
from web3.logs import DISCARD

from .attestation import Attestation
from .hashing import from_hex


def load_abi(contracts_out: Path, name: str) -> list:
    return json.loads((contracts_out / f"{name}.sol" / f"{name}.json").read_text())["abi"]


class Chain:
    def __init__(self, rpc_url: str, deployment: dict, contracts_out: Path) -> None:
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 15}))
        self.chain_id = int(deployment["chainId"])
        self.registry = self.w3.eth.contract(address=deployment["registry"], abi=load_abi(contracts_out, "AttemptRegistry"))
        self.escrow = self.w3.eth.contract(address=deployment["escrow"], abi=load_abi(contracts_out, "TaskEscrow"))
        self.dataset_abi = load_abi(contracts_out, "DatasetToken")

    def dataset(self, address: str):
        return self.w3.eth.contract(address=Web3.to_checksum_address(address), abi=self.dataset_abi)

    def holder(self, dataset: str, holder: str) -> dict:
        token = self.dataset(dataset)
        who = Web3.to_checksum_address(holder)
        return {
            "balance": token.functions.balanceOf(who).call(),
            "claimable": token.functions.claimable(who).call(),
            "withdrawn": token.functions.withdrawn(who).call(),
            "totalSupply": token.functions.totalSupply().call(),
        }

    def task(self, task_id: str) -> dict:
        t = self.escrow.functions.getTask(from_hex(task_id)).call()
        keys = ["engineer", "dataset", "payPerItem", "remaining", "verifierFee", "maxPaidPerContributor", "quorum", "deadline", "clipsRoot", "rulesHash"]
        return dict(zip(keys, t))

    def paid_count(self, task_id: str, player: str) -> int:
        return self.registry.functions.paidCount(from_hex(task_id), Web3.to_checksum_address(player)).call()

    def seen(self, attempt_id: bytes) -> bool:
        return self.registry.functions.seen(attempt_id).call()


class RelayerKey:
    def __init__(self, chain: Chain, key: str) -> None:
        self.chain = chain
        self.account = Account.from_key(key)
        self.lock = threading.Lock()
        self.nonce: int | None = None

    def _next_nonce(self) -> int:
        if self.nonce is None:
            self.nonce = self.chain.w3.eth.get_transaction_count(self.account.address, "pending")
        n = self.nonce
        self.nonce += 1
        return n

    def reset(self) -> None:
        self.nonce = None


class Relayer:
    def __init__(self, chain: Chain, keys: list[str], gas_margin: float = 1.25) -> None:
        if not keys:
            raise ValueError("at least one relayer key is required")
        self.chain = chain
        self.keys = [RelayerKey(chain, k) for k in keys]
        self.gas_margin = gas_margin
        self.gas_limits: dict[str, int] = {}
        self.turn = 0
        self.turn_lock = threading.Lock()

    def addresses(self) -> list[str]:
        return [k.account.address for k in self.keys]

    def _pick(self) -> RelayerKey:
        with self.turn_lock:
            key = self.keys[self.turn % len(self.keys)]
            self.turn += 1
        return key

    def _send(self, call, gas_key: str) -> tuple[dict, str, float]:
        key = self._pick()
        w3 = self.chain.w3
        with key.lock:
            if gas_key not in self.gas_limits:
                self.gas_limits[gas_key] = int(call.estimate_gas({"from": key.account.address}) * self.gas_margin)
            fees = w3.eth.fee_history(1, "latest", [50])
            base = fees["baseFeePerGas"][-1]
            tip = max(fees["reward"][0][0], w3.to_wei(1, "gwei")) if fees.get("reward") else w3.to_wei(1, "gwei")
            try:
                tx = call.build_transaction({
                    "from": key.account.address,
                    "nonce": key._next_nonce(),
                    "gas": self.gas_limits[gas_key],
                    "maxFeePerGas": base * 2 + tip,
                    "maxPriorityFeePerGas": tip,
                    "chainId": self.chain.chain_id,
                })
                signed = key.account.sign_transaction(tx)
                sent_at = time.time()
                tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
            except Exception:
                key.reset()
                raise
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60, poll_latency=0.1)
        return receipt, "0x" + tx_hash.hex().removeprefix("0x"), sent_at

    @staticmethod
    def _summary(receipt: dict, tx_hash: str, sent_at: float) -> dict:
        return {
            "tx_hash": tx_hash,
            "status": int(receipt["status"]),
            "gas_used": int(receipt["gasUsed"]),
            "gas_price": int(receipt.get("effectiveGasPrice", 0)),
            "block": int(receipt["blockNumber"]),
            "receipt_ms": round((time.time() - sent_at) * 1000),
        }

    def record(self, att: Attestation, signatures: list[str]) -> dict:
        call = self.chain.registry.functions.record(att.as_tuple(), [from_hex(s) for s in signatures])
        receipt, tx_hash, sent_at = self._send(call, f"record:{att.passed}")
        events = self.chain.registry.events.AttemptRecorded().process_receipt(receipt, errors=DISCARD)
        return {"paid": int(events[0]["args"]["paid"]) if events else 0, **self._summary(receipt, tx_hash, sent_at)}

    def claim_for(self, dataset: str, holder: str) -> dict:
        token = self.chain.dataset(dataset)
        call = token.functions.claimFor(Web3.to_checksum_address(holder))
        receipt, tx_hash, sent_at = self._send(call, "claimFor")
        events = token.events.Claimed().process_receipt(receipt, errors=DISCARD)
        return {"amount": int(events[0]["args"]["amount"]) if events else 0, **self._summary(receipt, tx_hash, sent_at)}
