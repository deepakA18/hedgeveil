#!/usr/bin/env python3
"""Prepare and verify a local SEC-02 handoff. Never grants release approval."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {"AGENTS.md", "IMPLEMENTATION_PLAN.md", "README.md", "Cargo.toml",
              "Cargo.lock", "rust-toolchain.toml", ".gitignore", ".env.example",
              ".cargo/config.toml", "contracts/.cargo/config.toml", "crates/protocol-types/.cargo/config.toml"}
COMPILE_INPUTS = ("contracts", "crates", "Cargo.toml", "Cargo.lock", "rust-toolchain.toml", ".cargo/config.toml")
ROOT_DIRS = {"contracts", "crates", "packages", "apps", "services", "tests",
             "verification", "research", "fixtures", "scripts", "docs", "deploy"}
EXCLUDED = {"archive", ".git", ".local", ".aws", ".venv", "node_modules", "target", "__pycache__"}
EXTENSIONS = {".rs", ".toml", ".lock", ".md", ".json", ".mjs", ".mts", ".js",
              ".css", ".html", ".py", ".txt", ".csv", ".sh", ".yaml", ".yml", ".smt2", ".sql"}
ARTIFACTS = {
    "target/core-artifacts": {"clearinghouse.wasm": "normal", "clearinghouse-fault.wasm": "fixtures",
                              "account-fixture.wasm": "fixtures", "oracle-fixture.wasm": "fixtures"},
    "target/oracle-artifacts": {"settlement-oracle.wasm": "normal", "settlement-oracle-fault.wasm": "fixtures"},
}
# NEAR public transaction signatures also encode 64 bytes with ed25519:. Do
# not classify signatures as secrets merely by length. This is a limited guard,
# not a complete secret scan; committed source still needs independent review.
SECRET = re.compile(rb"-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH PRIVATE KEY)-----|(?:private[_-]?key|secret[_-]?key|account[_-]?key)[\"']?\s*[:=]\s*[\"']?ed25519:[1-9A-HJ-NP-Za-km-z]{80,}", re.I)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()


def safe_path(name):
    path = PurePosixPath(name)
    if not name or path.is_absolute() or str(path) != name or any(p in (".", "..") for p in path.parts) or "\\" in name:
        raise ValueError("noncanonical relative path")
    return path


def selected(name):
    parts = safe_path(name).parts
    if name in ROOT_FILES:
        return True
    if any(p in EXCLUDED or (p.startswith(".") and p not in ROOT_FILES) for p in parts):
        return False
    if any(p.startswith(".env") and p != ".env.example" for p in parts):
        return False
    return name in ROOT_FILES or (parts[0] in ROOT_DIRS and PurePosixPath(name).suffix in EXTENSIONS)


def no_secret(name, data):
    if SECRET.search(data):
        # Never echo the matching bytes.
        raise ValueError(f"private-key-shaped content excluded: {name}")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def snapshot(revision):
    commit = git("rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}").decode().strip()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("full candidate commit required")
    files = {}
    for record in git("ls-tree", "-r", "-z", commit).split(b"\0"):
        if not record:
            continue
        header, raw_name = record.split(b"\t", 1)
        mode, kind, oid = header.decode().split()
        name = raw_name.decode()
        if not selected(name):
            continue
        if kind != "blob" or mode not in ("100644", "100755"):
            raise ValueError(f"nonregular committed entry: {name}")
        data = git("cat-file", "blob", oid)
        no_secret(name, data)
        files[name] = data
    # Artifacts were built from the worktree: bind ALL compiled inputs to the
    # chosen commit, including added/deleted/untracked source files.
    for name, data in files.items():
        if name.startswith(("contracts/", "crates/")) or name in COMPILE_INPUTS:
            current = ROOT / name
            if current.is_symlink() or not current.is_file() or current.read_bytes() != data:
                raise ValueError(f"compiled input differs from candidate commit: {name}")
    changes = git("diff", "--name-only", commit, "--", *COMPILE_INPUTS)
    untracked = git("ls-files", "--others", "--exclude-standard", "--", *COMPILE_INPUTS)
    if changes.strip() or untracked.strip():
        raise ValueError("compiled inputs have changes outside the candidate snapshot")
    return commit, files


def artifact_bytes():
    files = {}
    for directory, names in ARTIFACTS.items():
        manifest_file = ROOT / directory / "manifest.json"
        if manifest_file.is_symlink() or not manifest_file.is_file():
            raise ValueError("artifact manifest must be a regular file")
        manifest = json.loads(manifest_file.read_text())
        for name, role in names.items():
            file = ROOT / directory / name
            if file.is_symlink() or not file.is_file():
                raise ValueError("artifact must be a regular file")
            data = file.read_bytes()
            if not data.startswith(b"\0asm\x01\0\0\0") or manifest[name] != {"sha256": sha(data), "bytes": len(data)}:
                raise ValueError(f"artifact manifest mismatch: {name}")
            files[f"wasm/{role}/{name}"] = data
    return files


def document(files, name):
    safe_path(name)
    return json.loads(files[name])


def source_mismatches(files, report):
    sources = report.get("sources", {})
    if not isinstance(sources, dict):
        raise ValueError("invalid source map")
    mismatches = []
    for name, digest in sources.items():
        safe_path(name)
        if name not in files or sha(files[name]) != digest:
            mismatches.append(name)
    return sorted(mismatches)


def validate_evidence(files, wasm):
    summary = document(files, "research/reports/g8-security.json")
    if summary.get("passed") is not True or summary["runner_sha256"] != sha(files["scripts/check-security.py"]):
        raise ValueError("SEC-01 runner/summary mismatch")
    references = [summary["models"], summary["symbolic"], *summary["runs"]]
    required = {"research/reports/g8-models.json", "research/reports/g8-symbolic.json",
                *(f"research/reports/g8-stateful-{s}.json" for s in (20903, 65537, 3735928559))}
    if len(references) != 5 or {r["path"] for r in references} != required:
        raise ValueError("incomplete SEC-01 evidence graph")
    artifact_hashes = {PurePosixPath(name).name: sha(data) for name, data in wasm.items()}
    for ref in references:
        name = str(safe_path(ref["path"]))
        if sha(files[name]) != ref["sha256"]:
            raise ValueError(f"SEC-01 report digest mismatch: {name}")
        report = document(files, name)
        if report.get("passed") is not True or not report.get("sources") or source_mismatches(files, report):
            raise ValueError(f"stale/failed SEC-01 evidence: {name}")
        for artifact, meta in report.get("artifacts", {}).items():
            if artifact_hashes.get(artifact) != meta["sha256"]:
                raise ValueError(f"SEC-01 Wasm evidence mismatch: {artifact}")
    symbolic = document(files, summary["symbolic"]["path"])
    for query in symbolic["obligations"]:
        name = str(safe_path("verification/smt/" + query["name"] + ".smt2"))
        if sha(files[name]) != query["smt_sha256"]:
            raise ValueError("symbolic query digest mismatch")
    # Other reports can be historical. Matching only their recorded inputs does
    # not establish complete coverage of the candidate.
    inventory = []
    for name, data in sorted(files.items()):
        if not name.startswith("research/reports/") or not name.endswith(".json"):
            continue
        report = json.loads(data)
        if not isinstance(report, dict) or "sources" not in report:
            continue
        differences = source_mismatches(files, report)
        artifact_differences = sorted(a for a, m in report.get("artifacts", {}).items()
                                      if artifact_hashes.get(a) != m.get("sha256"))
        inventory.append({"path": name, "reported_passed": report.get("passed") is True,
                          "recorded_inputs_match": bool(report["sources"]) and not differences and not artifact_differences,
                          "source_mismatches": differences, "artifact_mismatches": artifact_differences})
    # Normal oracle must have at least one passed report matching its recorded
    # sources/artifacts; no substitution of the older core or a fault artifact.
    oracle_covered = any(item["reported_passed"] and item["recorded_inputs_match"]
                         and "settlement-oracle.wasm" in document(files, item["path"]).get("artifacts", {})
                         for item in inventory)
    if not oracle_covered:
        raise ValueError("no current recorded-input evidence for normal oracle")
    return inventory


HANDOFF = b"""# SEC-02 reviewer handoff

This is an unreviewed local candidate. Integrity verification is not a security
approval. No deployment, release approval or independent sign-off is included.

Review source/IMPLEMENTATION_PLAN.md, source/docs/SPEC.md, source/docs/THREAT_MODEL.md,
source/verification/README.md and source/research/reports/G8_SECURITY.md first.
The manifest pins the existing committed candidate and distinguishes normal Wasm
from fixtures. Historical evidence remains labelled by input mismatches.

Required independent work: challenge custody/storage isolation, UNKNOWN payout
handling and callback provenance, oracle arbitration/import ordering, RFQ nonce
and funding atomicity, vault rounding/keeper authority, SDK/indexer/browser trust
boundaries, dependency/build provenance, key custody and deployment authority.
Model/SMT assumptions and untested concurrent/load schedules need explicit review.

Send findings separately, bound to the externally supplied manifest SHA-256 and
source commit. Include reviewer identity/independence, exact scope and exclusions,
severity, affected paths, reproduction, impact and proposed remediation. For each
fix record the new commit/Wasm, regression evidence and reviewer retest. Any source
or Wasm change needs a new candidate; prior sign-off never transfers automatically.

No findings have been supplied. An empty findings list is NOT a clean audit.
Independent review, critical/high disposition and release decisions are PENDING.
No public testnet deployment or production approval is represented here.
"""


def write_bundle(destination, commit, files, wasm, evidence):
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("full source commit required")
    destination = Path(destination).absolute()
    if destination.exists() or destination.is_symlink():
        raise ValueError("bundle destination already exists")
    destination.parent.mkdir(parents=True, exist_ok=True)
    payload = {"source/" + str(safe_path(k)): v for k, v in files.items()}
    payload.update(wasm)
    payload["HANDOFF.md"] = HANDOFF
    payload["tooling/review_bundle.py"] = Path(__file__).read_bytes()
    for name, data in payload.items():
        safe_path(name)
        if not name.endswith(".wasm"):
            no_secret(name, data)
    manifest = {"schema_version": 1, "source_commit": commit, "scope": "local SEC-02 review candidate",
                "independent_review": "PENDING", "findings_status": "NOT_SUPPLIED",
                "release_authorized": False, "evidence": evidence,
                "files": {name: {"sha256": sha(data), "bytes": len(data)} for name, data in sorted(payload.items())}}
    encoded = canonical(manifest)
    staging = Path(tempfile.mkdtemp(prefix=".review-", dir=destination.parent))
    try:
        for name, data in payload.items():
            file = staging / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
        (staging / "manifest.json").write_bytes(encoded)
        # Reserve the destination without replacing another user's directory.
        destination.mkdir()
        try:
            for file in staging.iterdir():
                file.rename(destination / file.name)
        except BaseException:
            shutil.rmtree(destination)
            raise
    finally:
        shutil.rmtree(staging)
    return sha(encoded), manifest


def verify_bundle(directory, expected):
    if not re.fullmatch(r"[0-9a-f]{64}", expected):
        raise ValueError("external manifest SHA-256 required")
    directory = Path(directory)
    if directory.is_symlink() or (directory / "manifest.json").is_symlink():
        raise ValueError("bundle/manifest symlink rejected")
    if not (directory / "manifest.json").is_file():
        raise ValueError("manifest must be a regular file")
    encoded = (directory / "manifest.json").read_bytes()
    if sha(encoded) != expected:
        raise ValueError("manifest does not match external digest")
    manifest = json.loads(encoded)
    if manifest.get("schema_version") != 1 or manifest.get("release_authorized") is not False or manifest.get("independent_review") != "PENDING" or manifest.get("findings_status") != "NOT_SUPPLIED":
        raise ValueError("unsupported bundle or approval claim")
    if not re.fullmatch(r"[0-9a-f]{40}", manifest.get("source_commit", "")):
        raise ValueError("invalid candidate commit")
    required = {"HANDOFF.md", "tooling/review_bundle.py", "wasm/normal/clearinghouse.wasm",
                "wasm/normal/settlement-oracle.wasm"}
    if not required.issubset(manifest["files"]):
        raise ValueError("incomplete review bundle")
    actual = set()
    for parent, dirs, files in os.walk(directory, followlinks=False):
        for name in dirs + files:
            if (Path(parent) / name).is_symlink():
                raise ValueError("symlink in bundle")
        for name in files:
            file = Path(parent) / name
            relative = file.relative_to(directory).as_posix()
            if not stat.S_ISREG(file.lstat().st_mode):
                raise ValueError("nonregular bundle file")
            if relative == "manifest.json":
                continue
            actual.add(relative)
            meta = manifest["files"].get(relative)
            data = file.read_bytes()
            if meta != {"sha256": sha(data), "bytes": len(data)}:
                raise ValueError(f"altered or extra bundle file: {relative}")
    for name in manifest["files"]:
        safe_path(name)
    if actual != set(manifest["files"]):
        raise ValueError("missing bundle file")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create")
    create.add_argument("--commit", default="HEAD")
    create.add_argument("--out", required=True)
    verify = commands.add_parser("verify")
    verify.add_argument("directory")
    verify.add_argument("--sha256", required=True)
    args = parser.parse_args()
    if args.command == "create":
        commit, files = snapshot(args.commit)
        wasm = artifact_bytes()
        evidence = validate_evidence(files, wasm)
        digest, manifest = write_bundle(args.out, commit, files, wasm, evidence)
        verify_bundle(args.out, digest)
        print(json.dumps({"source_commit": commit, "manifest_sha256": digest, "files": len(manifest["files"]),
                          "independent_review": "PENDING", "release_authorized": False}, indent=2))
    else:
        manifest = verify_bundle(args.directory, args.sha256)
        print(f"Integrity verified: {len(manifest['files'])} files; independent review PENDING; no release approval")


if __name__ == "__main__":
    main()
