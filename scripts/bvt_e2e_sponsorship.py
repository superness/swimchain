#!/usr/bin/env python3
"""BVT B5: end-to-end sponsorship through the public gateway.

Mints a throwaway Ed25519 identity, claims the faucet's auto-approve offer via
/rpc exactly like the reef/chess onboarding does (SHA-256 claim PoW + signed
claim), and polls until the chain records the sponsorship. Prints one final
line: `SPONSORED <address-prefix> in <N>s` or `FAILED: <reason>`.

Consumes one faucet slot per run — that's the point: it proves the whole
newcomer funnel (gateway -> allowlist proxy -> node -> offer gossip -> faucet
node auto-approve sweep -> block -> status propagation) with zero mocking.

Requires: pip install pynacl (ed25519). Stdlib otherwise.
"""

import hashlib
import json
import os
import struct
import sys
import time
import urllib.request

try:
    from nacl.signing import SigningKey
except ImportError:
    print("FAILED: pynacl not installed (pip install pynacl)")
    sys.exit(1)

RPC_URL = sys.argv[1] if len(sys.argv) > 1 else "https://swimchain.io/rpc"
TIMEOUT_S = 180


def rpc(method, params):
    req = urllib.request.Request(
        RPC_URL,
        data=json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode(),
        headers={"Content-Type": "application/json", "Host": "swimchain.io"},
    )
    resp = json.load(urllib.request.urlopen(req, timeout=15))
    if "error" in resp:
        raise RuntimeError(f"{method}: {resp['error']}")
    return resp["result"]


def mine_claim_pow(min_zero_bits):
    nonce_space = os.urandom(32)
    nonce = 0
    while nonce < 10_000_000:
        # 40-byte preimage: nonce_space(32) + nonce u32 LE + 4 zero bytes,
        # matching ensureSponsored.ts (Uint8Array(40), nonce at offset 32).
        h = hashlib.sha256(nonce_space + struct.pack("<I", nonce) + b"\x00" * 4).digest()
        bits = 0
        for byte in h:
            if byte == 0:
                bits += 8
                continue
            for i in range(7, -1, -1):
                if byte >> i:
                    break
                bits += 1
            break
        if bits >= min_zero_bits:
            return nonce, nonce_space, h
        nonce += 1
    raise RuntimeError("claim PoW exhausted")


def main():
    t0 = time.time()
    sk = SigningKey.generate()
    pk_hex = sk.verify_key.encode().hex()

    offers = rpc("list_sponsorship_offers", {})["offers"]
    autos = [o for o in offers if o.get("auto_approve") and o["slots_remaining"] > 0]
    if not autos:
        print("FAILED: no auto-approve offers with open slots")
        return 1
    pick = max(autos, key=lambda o: o["slots_remaining"])

    diff = max((pick.get("requirements") or {}).get("min_pow_difficulty", 0), 1)
    nonce, nonce_space, pow_hash = mine_claim_pow(diff)
    ts = int(time.time())
    msg = bytes.fromhex(pick["offer_id"]) + bytes.fromhex(pk_hex) + struct.pack(">Q", ts) + pow_hash
    sig = sk.sign(msg).signature

    rpc("claim_sponsorship_offer", {
        "offer_id": pick["offer_id"],
        "claimant_pubkey": pk_hex,
        "application_text": None,
        "pow_nonce": nonce,
        "pow_difficulty": diff,
        "pow_nonce_space": nonce_space.hex(),
        "pow_hash": pow_hash.hex(),
        "signature": sig.hex(),
        "timestamp": ts,
    })

    deadline = time.time() + TIMEOUT_S
    while time.time() < deadline:
        time.sleep(5)
        try:
            st = rpc("get_sponsorship_status", {"identity": pk_hex})
            if st.get("has_sponsorship") or st.get("is_sponsored"):
                print(f"SPONSORED {pk_hex[:12]} in {int(time.time() - t0)}s")
                return 0
        except Exception:
            pass
    print(f"FAILED: not sponsored within {TIMEOUT_S}s (claimed offer {pick['offer_id'][:12]})")
    return 1


if __name__ == "__main__":
    sys.exit(main())
