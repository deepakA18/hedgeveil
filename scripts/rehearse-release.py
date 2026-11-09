#!/usr/bin/env python3
"""REL-01 local clean-checkout rehearsal and bounded public submission package."""
import argparse
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("review", ROOT / "verification/review_bundle.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)
NEW_INPUTS = {"scripts/rehearse-release.py", "tests/release/walkthrough.mjs",
              "tests/release/test_package.py", "docs/RELEASE.md", "docs/SUBMISSION.md"}
PHASE_REPORTS = ("walkthrough", "browser", "keeper", "payout", "resume", "wallet", "near_connect")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode()


def public_path(name):
    path = review.safe_path(name)
    artifacts = {f"artifacts/{role}/{file}" for names in review.ARTIFACTS.values() for file, role in names.items()}
    allowed = name in {"README.md", "manifest.json"} or name in artifacts
    if name.startswith("source/"):
        allowed = review.selected(name.removeprefix("source/"))
    if len(path.parts) == 2 and path.parts[0] == "evidence" and path.suffix == ".json" and not path.name.startswith("."):
        allowed = True
    if not allowed:
        raise ValueError("nonpublic package path")


def source_inputs():
    tracked = set(subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).decode().split("\0")) - {""}
    files = {}
    for name in sorted(tracked | NEW_INPUTS):
        if not review.selected(name) or name.startswith("research/reports/rel01-"):
            continue
        file = ROOT / name
        if name in NEW_INPUTS and not file.exists():
            raise ValueError(f"missing release input: {name}")
        if file.is_symlink() or not file.is_file():
            raise ValueError(f"source must be regular: {name}")
        data = file.read_bytes()
        review.no_secret(name, data)
        files[name] = data
    untracked = subprocess.check_output(["git", "ls-files", "--others", "--exclude-standard", "-z"], cwd=ROOT).decode().split("\0")
    for name in filter(None, untracked):
        if review.selected(name) and name not in NEW_INPUTS and not name.startswith("research/reports/rel01-"):
            raise ValueError(f"unaccounted active source; commit or explicitly include it: {name}")
    return files


def acceptance(reports):
    for name in PHASE_REPORTS:
        if reports.get(name, {}).get("passed") is not True or not reports[name].get("checks"):
            raise ValueError(f"missing or failed local phase: {name}")
    # Every row states its actual surface. Separate fixtures are never relabelled
    # as a single approved strategy or a public testnet lifecycle.
    rows = [
        (1, "Fresh wallet/storage", ["walkthrough", "browser", "wallet", "near_connect"], "Local generated signer and browser test-wallet transport only; external wallet/testnet acceptance pending"),
        (2, "Deposit/split/reserves", ["walkthrough"], "Actual Sandbox receipts and indexed custody"),
        (3, "Funded N sale", ["walkthrough"], "Two makers; exact signed sale executes"),
        (4, "P basket/shares", ["walkthrough", "browser"], "Sandbox proportional basket; no selected tracking policy"),
        (5, "Bounded roll", ["keeper"], "Separate experimental one-shot fixture; no approved recurring strategy"),
        (6, "Crash/loss/accounting", ["economics"], "Synthetic offline stress simulation, not a live browser price-crash transaction"),
        (7, "No liquidity/deferred roll/in-kind exit", ["walkthrough", "keeper"], "Same-demo maker removal/exit; deferred roll in separate experimental fixture"),
        (8, "Dispute/finality/both-leg redemption", ["walkthrough"], "Real committed synthetic oracle receipts"),
        (9, "Failed and UNKNOWN payouts", ["walkthrough", "payout"], "Normal failed transfer plus separate deterministic fault artifact"),
        (10, "Withdraw/reconcile", ["walkthrough"], "Confirmed CLI payout and core/oracle indexer reconciliation"),
        (11, "Restart/frontend-offline recovery", ["walkthrough", "resume"], "Actual closed HTTP listener and CLI exit; separate retained-process restart"),
        (12, "Stress/risk report", ["economics"], "Frozen 9,180 synthetic cases rerun; no passing rolling candidate"),
    ]
    return {"track": "open", "mode": "local-sandbox", "local_rehearsal_passed": True,
            "release_authorized": False, "public_testnet_complete": False,
            "independent_review": "PENDING", "steps": [{"step": n, "requirement": title, "evidence": refs, "scope": scope} for n, title, refs, scope in rows],
            "remaining": ["Public wallet and testnet lifecycle/receipts/access-key inventory",
                          "Approved tracking/roll policy; testnet vault stays disabled",
                          "Independent G8/SEC-02 review and critical/high disposition",
                          "Public deployment links and walkthrough video; external submission not performed"]}


def read_phase(directory, name):
    file = directory / (name + ".json")
    if not file.is_file():
        raise ValueError(f"{name}: process exited without evidence")
    report = json.loads(file.read_text())
    if report.get("passed") is not True or not report.get("checks"):
        raise ValueError(f"{name}: incomplete or failed evidence")
    return report


def package(destination, files):
    if destination.exists():
        raise ValueError("submission package already exists")
    for name, data in files.items():
        public_path(name)
        if not name.endswith(".wasm"):
            review.no_secret(name, data)
    manifest = {"schema_version": 1, "release_authorized": False,
                "files": {name: {"sha256": sha(data), "bytes": len(data)} for name, data in sorted(files.items())}}
    payload = {**files, "manifest.json": encoded(manifest)}
    with destination.open("xb") as output, tarfile.open(fileobj=output, mode="w:gz") as archive:
        for name, data in sorted(payload.items()):
            item = tarfile.TarInfo(name)
            item.size, item.mode, item.mtime = len(data), 0o644, 0
            archive.addfile(item, io.BytesIO(data))
    return sha(destination.read_bytes())


def verify_package(file, digest):
    if not re.fullmatch(r"[0-9a-f]{64}", digest) or sha(file.read_bytes()) != digest:
        raise ValueError("package does not match external digest")
    contents, total = {}, 0
    with tarfile.open(file, "r:gz") as archive:
        for item in archive:
            public_path(item.name)
            total += item.size
            if not item.isfile() or item.name in contents or item.size > 64 * 1024**2 or total > 256 * 1024**2 or len(contents) >= 2000:
                raise ValueError("unsupported archive member or size")
            contents[item.name] = archive.extractfile(item).read()
    manifest = json.loads(contents.pop("manifest.json"))
    if manifest.get("schema_version") != 1 or manifest.get("release_authorized") is not False:
        raise ValueError("unsupported package or approval claim")
    if set(contents) != set(manifest["files"]):
        raise ValueError("missing or unexpected package file")
    for name, data in contents.items():
        if manifest["files"][name] != {"sha256": sha(data), "bytes": len(data)}:
            raise ValueError(f"package content mismatch: {name}")
    state = json.loads(contents["evidence/acceptance.json"])
    if state.get("release_authorized") is not False or state.get("public_testnet_complete") is not False:
        raise ValueError("package cannot authorize public release")
    return manifest


def rehearse(name):
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,31}", name):
        raise ValueError("use a new lowercase rehearsal name, maximum 32 characters")
    files = source_inputs()
    base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip()
    work = ROOT / "target/releases" / name
    work.parent.mkdir(parents=True, exist_ok=True)
    work.mkdir(mode=0o700)
    seed, checkout, logs = work / "snapshot", work / "checkout", work / "logs"
    seed.mkdir(); logs.mkdir()
    commands = []

    def run(label, args, cwd=checkout):
        print(f"RUN {label}", flush=True)
        env = os.environ.copy()
        env.setdefault("UV_CACHE_DIR", "/private/tmp/hedgeveil-uv-cache")
        with (logs / (label + ".log")).open("wb") as log:
            result = subprocess.run(args, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
        commands.append({"label": label, "command": args, "exit_code": result.returncode})
        if result.returncode:
            raise RuntimeError(f"{label} failed; inspect private log {logs / (label + '.log')}")
        if label in PHASE_REPORTS:
            read_phase(checkout / "target/release-public", label)
        print(f"PASS {label}", flush=True)

    for relative, data in files.items():
        file = seed / relative
        file.parent.mkdir(parents=True, exist_ok=True); file.write_bytes(data)
    run("snapshot-init", ["git", "-c", "init.defaultBranch=release-snapshot", "init", "--quiet", "--template="], seed)
    run("snapshot-stage", ["git", "add", "--all"], seed)
    run("snapshot-commit", ["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false", "-c", "user.name=Hedgeveil Local Rehearsal", "-c", "user.email=local-rehearsal@example.invalid", "commit", "--quiet", "--no-verify", "-m", "Temporary local release input snapshot; not a project release commit"], seed)
    run("fresh-clone", ["git", "-c", "core.hooksPath=/dev/null", "clone", "--quiet", "--template=", "--no-hardlinks", str(seed), str(checkout)], work)
    snapshot_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=checkout).decode().strip()
    for relative in ("target", "node_modules", "tests/sandbox/node_modules", "services/indexer/node_modules", "apps/web/node_modules", ".env", ".local"):
        if (checkout / relative).exists():
            raise ValueError("fresh checkout contains excluded local state")
    for directory in ("tests/sandbox", "services/indexer", "apps/web", "tests/wallet"):
        run("install-" + directory.replace("/", "-"), ["npm", "ci", "--prefix", directory, "--ignore-scripts", "--no-audit", "--no-fund"])
    run("wallet-assets", ["node", "apps/web/build-wallet.mjs"])
    run("chromium", ["npm", "exec", "--prefix", "apps/web", "--", "playwright", "install", "chromium"])
    run("origin-guards", ["node", "--test", "tests/e2e/origin.test.mjs"])
    run("core-build", ["python3", "scripts/build-core.py"])
    run("oracle-build", ["python3", "scripts/build-oracle.py"])
    run("reference", ["python3", "-m", "unittest", "discover", "-s", "research/reference-model", "-p", "test_*.py"])
    run("vectors", ["python3", "research/reference-model/generate_vectors.py", "--check"])
    for directory, prefix in ((checkout, "math"), (checkout / "contracts", "contracts")):
        run(prefix + "-tests", ["cargo", "test", "--workspace", "--locked"], directory)
        run(prefix + "-format", ["cargo", "fmt", "--all", "--", "--check"], directory)
        target = ["--all-targets"] if prefix == "math" else ["--target", "wasm32-unknown-unknown"]
        run(prefix + "-clippy", ["cargo", "clippy", "--workspace", "--locked", *target, "--", "-D", "warnings"], directory)
    run("schema-generate", ["python3", "packages/shared-schemas/build_schema.py"])
    run("schema-check", ["python3", "packages/shared-schemas/build_schema.py", "--check"])
    run("schemas", ["uv", "run", "--with", "jsonschema==4.23.0", "python", "-m", "unittest", "discover", "-s", "tests/schemas"])
    run("release-unit", ["python3", "-m", "unittest", "discover", "-s", "tests/release"])
    run("review-bundle-unit", ["python3", "-m", "unittest", "discover", "-s", "tests/security"])
    run("sdk-wallet-units", ["node", "--test", "tests/sdk/client.test.mjs", "tests/wallet/boundary.test.mjs", "tests/wallet/near-connect.test.mjs"])
    run("sdk-types", ["tsc", "--noEmit", "--strict", "--target", "ES2022", "--module", "NodeNext", "--moduleResolution", "NodeNext", "tests/sdk/types.mts"])
    run("wallet-types", ["tsc", "--noEmit", "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "Bundler", "--typeRoots", "tests/sandbox/node_modules/@types", "tests/wallet/types.mts"])
    run("finite-models", ["python3", "verification/check_models.py", "--check"])
    run("symbolic", ["uv", "run", "--with-requirements", "verification/requirements.txt", "python", "verification/check_symbolic.py", "--check"])
    run("economics-unit", ["python3", "-m", "unittest", "discover", "-s", "tests/economics"])
    run("scenarios", ["python3", "research/scenarios/generate.py", "--check"])
    run("economics", ["python3", "research/policy-comparison/run.py", "--check"])
    public = checkout / "target/release-public"
    public.mkdir(parents=True)
    run("walkthrough", ["node", "tests/release/walkthrough.mjs", "target/release-public/walkthrough.json"])
    for label, script in (("browser", "tests/e2e/browser.mjs"), ("keeper", "tests/sandbox/g6-keeper.mjs"), ("payout", "tests/sandbox/g7.mjs"), ("resume", "tests/demo/resume.mjs"), ("wallet", "tests/wallet/browser.mjs"), ("near_connect", "tests/wallet/near-connect-browser.mjs")):
        run(label, ["node", script, "--report", f"target/release-public/{label}.json"])
    reports = {name: read_phase(public, name) for name in PHASE_REPORTS}
    state = acceptance(reports)
    # No recorded input is allowed to drift during the rehearsal.
    for relative, data in files.items():
        if (checkout / relative).read_bytes() != data:
            raise ValueError(f"source changed during rehearsal: {relative}")
    provenance = {"source_kind": "Working-tree inputs committed only in a temporary repository, then freshly cloned; not a public project release commit",
                  "project_base_commit": base, "temporary_snapshot_commit": snapshot_commit,
                  "source_sha256": {name: sha(data) for name, data in sorted(files.items())},
                  "shared_caches": "Host npm/uv/Cargo download caches, Rust toolchains, Chromium and Sandbox binaries may be reused; no project build, node_modules, wallet, journal or database was copied",
                  "commands": commands}
    payload = {"source/" + name: data for name, data in files.items()}
    payload.update({"evidence/" + name + ".json": (public / (name + ".json")).read_bytes() for name in PHASE_REPORTS})
    payload["evidence/economics.json"] = (checkout / "research/reports/g2-economics.json").read_bytes()
    payload["evidence/acceptance.json"], payload["evidence/provenance.json"] = encoded(state), encoded(provenance)
    for directory, names in review.ARTIFACTS.items():
        for file, role in names.items():
            payload[f"artifacts/{role}/{file}"] = (checkout / directory / file).read_bytes()
    payload["README.md"] = b"# Hedgeveil local release rehearsal\n\nLOCAL SANDBOX ONLY. DEMO ORACLE - SYNTHETIC PRICES.\n\nStart with source/docs/RELEASE.md and source/docs/SUBMISSION.md.\nSee evidence/acceptance.json for all twelve steps and pending public gates.\nSource comes from a temporary working-tree snapshot, not a public release commit.\nOnly public evidence and code are included; never publish the enclosing rehearsal workspace.\nIndependent review and public testnet acceptance remain pending. No release approval.\n"
    artifact = work / "hedgeveil-local-rehearsal.tar.gz"
    digest = package(artifact, payload)
    verify_package(artifact, digest)
    result = {"passed": True, "scope": "REL-01 local release rehearsal only", "project_base_commit": base,
              "temporary_snapshot_commit": snapshot_commit, "archive": str(artifact.relative_to(ROOT)), "archive_sha256": digest,
              "source_manifest_sha256": sha(encoded(provenance["source_sha256"])), "source_files": len(files),
              "phase_checks": {k: len(v["checks"]) for k, v in reports.items()}, "acceptance": state,
              "release_authorized": False, "public_testnet_complete": False}
    (work / "result.json").write_bytes(encoded(result))
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    run = commands.add_parser("run"); run.add_argument("name")
    verify = commands.add_parser("verify"); verify.add_argument("archive", type=Path); verify.add_argument("--sha256", required=True)
    args = parser.parse_args()
    if args.command == "run":
        rehearse(args.name)
    else:
        result = verify_package(args.archive, args.sha256)
        print(f"Verified {len(result['files'])} package files; local rehearsal only; no release authorization")
