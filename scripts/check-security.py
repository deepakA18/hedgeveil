#!/usr/bin/env python3
"""Run the SEC-01 finite models and three seeded compiled-Wasm regressions."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SEEDS = (20903, 65537, 3735928559)
STEPS = 80


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def run(*args):
    environment = os.environ.copy()
    environment.setdefault("UV_CACHE_DIR", "/private/tmp/hedgeveil-uv-cache")
    subprocess.run(args, cwd=ROOT, check=True, env=environment)


def summarize():
    reports, methods = [], {}
    for seed in SEEDS:
        file = ROOT / f"research/reports/g8-stateful-{seed}.json"
        report = json.loads(file.read_text())
        if not (report["passed"] and report["trades"] and report["seed"] == str(seed) and report["steps"] == STEPS):
            raise ValueError(f"wrong scope or failed evidence: {file.name}")
        for source, expected in report["sources"].items():
            if sha(ROOT / source) != expected:
                raise ValueError(f"stale source evidence: {source}")
        for artifact, meta in report["artifacts"].items():
            if sha(ROOT / "target/core-artifacts" / artifact) != meta["sha256"]:
                raise ValueError(f"stale Wasm evidence: {artifact}")
        for tx in report["transactions"]:
            name = tx["label"].split(".")[-1]
            method = methods.setdefault(name, {"attempts": 0, "max_transaction_gas": 0, "max_receipt_gas": 0})
            method["attempts"] += 1
            method["max_transaction_gas"] = max(method["max_transaction_gas"], int(tx["gas_burnt"]))
            method["max_receipt_gas"] = max(method["max_receipt_gas"], max(int(r["gas_burnt"]) for r in tx["receipts"]))
        reports.append({"path": str(file.relative_to(ROOT)), "sha256": sha(file), "seed": seed,
                        "checks": len(report["checks"]), "transactions": len(report["transactions"]),
                        "events": len(report["events"]), "model_steps": len(report["model_actions"]),
                        "signed_fills": sum(x["succeeded"] for x in report["quote_attempts"]),
                        "limits": report["limits"]})
    models = ROOT / "research/reports/g8-models.json"
    symbolic = ROOT / "research/reports/g8-symbolic.json"
    result = {"scope": "Local SEC-01 bounded verification; independent review and general Rust refinement pending",
              "passed": True, "models": {"path": str(models.relative_to(ROOT)), "sha256": sha(models)},
              "symbolic": {"path": str(symbolic.relative_to(ROOT)), "sha256": sha(symbolic)},
              "runs": reports, "observed_gas_including_expected_failures": methods,
              "runner_sha256": sha(Path(__file__)),
              "limitations": ["Finite abstract models are not a proof of Rust or runtime refinement",
                              "Three seeds do not exhaust cross-module or concurrent transaction schedules",
                              "Observed gas/storage at local caps are not production throughput benchmarks",
                              "Existing G4-G7 and browser evidence remain separately scoped historical runs"]}
    (ROOT / "research/reports/g8-security.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(f"PASS SEC-01: {sum(r['model_steps'] for r in reports)} model steps, "
          f"{sum(r['signed_fills'] for r in reports)} signed fills, "
          f"{sum(r['transactions'] for r in reports)} actual transactions")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summarize", action="store_true", help="verify current source/Wasm hashes and aggregate existing runs")
    args = parser.parse_args()
    run("python3", "verification/check_models.py", "--check")
    run("uv", "run", "--offline", "--with-requirements", "verification/requirements.txt",
        "python", "verification/check_symbolic.py", "--check")
    if not args.summarize:
        run("python3", "scripts/build-core.py")
        for seed in SEEDS:
            run("node", "tests/sandbox/g3.mjs", "--trades", "--seed", str(seed), "--steps", str(STEPS),
                "--report", f"research/reports/g8-stateful-{seed}.json")
    summarize()
