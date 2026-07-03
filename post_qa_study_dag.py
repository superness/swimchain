"""Dispatch a swimchain QA study round to the Overmind board (:9200).

Reads docs/qa/personas.json, posts one lane per persona plus one operator-only
SYNTHESIS lane gated on all of them (checkpoint-tagged: arms cannot claim or
complete it). See docs/qa/QA_PROGRAM.md for the full round protocol; Track 0
static gates should be green BEFORE dispatching this.

Usage:
  python post_qa_study_dag.py                # full panel
  python post_qa_study_dag.py diane theo     # subset by persona id (Diane is
                                             # mandatory and auto-included)

Idempotent per round: lanes are titled QA-<round>-<persona> where <round> is
today's date passed via --round YYYY-MM-DD (required, no clock access games);
existing non-done lanes with the same title are skipped.
"""

import argparse
import json
import sys
import urllib.request

BASE = "http://localhost:9200"
POSTED_BY = "operator-qa"


def board(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=10))


def lane_detail(persona, round_id):
    shots = f"docs/qa/rounds/{round_id}/shots"
    tasks = "\n".join(f"  T{i+1}. {t}" for i, t in enumerate(persona["tasks"]))
    if persona.get("method") == "api":
        how = (f"Probe with curl only (no browser). Record status, response shape, and "
               f"timing for every call. Write your report to docs/qa/rounds/{round_id}/"
               f"{persona['id']}.md with marks /10 per task + deviations from docs.")
    else:
        how = (f"Operate the LIVE clients in character via your browser. Screenshot EVERY "
               f"task to {shots}/{persona['id']}-T<n>-<label>.png (full viewport). Record "
               f"real timings (page load, action-to-visible). Write your report to "
               f"docs/qa/rounds/{round_id}/{persona['id']}.md: marks /10 per task, every "
               f"friction in character, and a one-line verdict. Stay in persona - your "
               f"vocabulary, patience, and device are part of the test.")
    return (f"QA study round {round_id}. Adopt this persona completely:\n\n"
            f"{persona['profile']}\n\nTasks:\n{tasks}\n\n{how}\n\n"
            f"Do NOT fix anything you find. Do NOT mark other lanes. Report only.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ids", nargs="*", help="persona ids to run (Diane always included)")
    ap.add_argument("--round", required=True, help="round id, e.g. 2026-07-03")
    args = ap.parse_args()

    panel = json.load(open("docs/qa/personas.json", encoding="utf-8"))["personas"]
    if args.ids:
        wanted = set(args.ids) | {"diane"}          # the Mom test never sits out
        panel = [p for p in panel if p["id"] in wanted]

    existing = {i["title"] for i in board("GET", "/board")["board"] if i["state"] != "done"}
    lane_ids, posted = [], 0
    for p in panel:
        title = f"QA-{args.round}-{p['id']}: {p['name']}"
        if title in existing:
            print(f"  skip {p['id']} (already on board)")
            continue
        item = board("POST", "/board", {
            "title": title,
            "detail": lane_detail(p, args.round),
            "tags": ["qa-study", f"round-{args.round}", p.get("priority", "P2")],
            "posted_by": POSTED_BY,
            "depends_on": [],
        })["item"]
        lane_ids.append(item["id"])
        posted += 1
        print(f"  posted {p['id']} -> {item['id']}")

    if lane_ids:
        syn = board("POST", "/board", {
            "title": f"QA-{args.round}-SYNTHESIS: operator vision review + perf + findings",
            "detail": (f"OPERATOR ONLY. When persona lanes finish: Read the key screenshots in "
                       f"docs/qa/rounds/{args.round}/shots (the arms are text-blind - unviewed "
                       f"screenshots are a discarded study), build the perf table from your own "
                       f"curl -w numbers, fuse persona+owner findings into docs/qa/rounds/"
                       f"{args.round}/FINDINGS.md, compare to the prior round, lead with the "
                       f"Diane time-to-first-message number. See docs/qa/QA_PROGRAM.md."),
            "tags": ["qa-study", f"round-{args.round}", "checkpoint"],
            "posted_by": POSTED_BY,
            "depends_on": lane_ids,
        })["item"]
        print(f"  posted SYNTHESIS -> {syn['id']} (gated on {len(lane_ids)} personas, operator-only)")
    print(f"\n{posted} persona lanes posted for round {args.round}.")
    if posted and not args.ids:
        print("Full panel dispatched. Remember: Track 0 gates first; synthesis is yours.")


if __name__ == "__main__":
    main()
