#!/usr/bin/env python3
"""Take periodic snapshots of the dashboard state."""

import json
import time
import urllib.request
from datetime import datetime
from pathlib import Path

SNAPSHOT_DIR = Path(__file__).parent.parent / "snapshots"
SNAPSHOT_DIR.mkdir(exist_ok=True)

def get_status():
    try:
        with urllib.request.urlopen("http://localhost:8080/api/status", timeout=5) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}

def take_snapshot(num):
    ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    data = get_status()

    if "error" in data:
        print(f"[{ts}] Snapshot {num}: ERROR - {data['error']}")
        return

    # Calculate summary stats
    nodes = list(data.items())
    online = [n for n in nodes if n[1].get("connected_peers", 0) > 0]
    heights = [n[1].get("local_chain_height", 0) for n in online]
    pows = [n[1].get("mempool_pow", 0) for n in online if n[1].get("mempool_pow") is not None]
    thresholds = [n for n in online if (n[1].get("mempool_pow", 0) or 0) >= 30]
    waiting = [n for n in online if (n[1].get("mempool_waiting_secs", 0) or 0) > 0]

    # Top 5 by mempool PoW
    top5 = sorted(online, key=lambda x: x[1].get("mempool_pow", 0) or 0, reverse=True)[:5]

    snapshot = {
        "timestamp": ts,
        "snapshot": num,
        "online_nodes": len(online),
        "chain_height": max(heights) if heights else 0,
        "max_mempool_pow": max(pows) if pows else 0,
        "avg_mempool_pow": int(sum(pows) / len(pows)) if pows else 0,
        "nodes_above_threshold": len(thresholds),
        "nodes_waiting": len(waiting),
        "top_5": [
            {
                "name": n[0],
                "pow": n[1].get("mempool_pow", 0),
                "actions": n[1].get("mempool_actions", 0),
                "waiting": n[1].get("mempool_waiting_secs", 0)
            }
            for n in top5
        ]
    }

    # Save snapshot
    filepath = SNAPSHOT_DIR / f"snap_{num:02d}_{ts}.json"
    with open(filepath, "w") as f:
        json.dump(snapshot, f, indent=2)

    print(f"[{ts}] Snapshot {num}: height={snapshot['chain_height']}, max_pow={snapshot['max_mempool_pow']}, above_threshold={snapshot['nodes_above_threshold']}, waiting={snapshot['nodes_waiting']}")

def main():
    print("Starting 15 snapshots, one per minute...")
    for i in range(1, 16):
        take_snapshot(i)
        if i < 15:
            time.sleep(60)
    print("Done!")

if __name__ == "__main__":
    main()
