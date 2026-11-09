import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("review_bundle", ROOT / "verification/review_bundle.py")
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class ReviewBundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "candidate"
        self.files = {"contracts/core.rs": b"candidate", "scripts/check-security.py": b"runner"}
        self.wasm = {"wasm/normal/clearinghouse.wasm": b"core", "wasm/normal/settlement-oracle.wasm": b"oracle"}

    def bundle(self):
        return review.write_bundle(self.path, "a" * 40, self.files, self.wasm, [])

    def evidence(self):
        source = {"contracts/core.rs": review.sha(self.files["contracts/core.rs"])}
        references = []
        for name in ("g8-models.json", "g8-symbolic.json", "g8-stateful-20903.json",
                     "g8-stateful-65537.json", "g8-stateful-3735928559.json"):
            report = {"passed": True, "sources": source, "obligations": []}
            path = "research/reports/" + name
            self.files[path] = review.canonical(report)
            references.append({"path": path, "sha256": review.sha(self.files[path])})
        summary = {"passed": True, "runner_sha256": review.sha(self.files["scripts/check-security.py"]),
                   "models": references[0], "symbolic": references[1], "runs": references[2:]}
        self.files["research/reports/g8-security.json"] = review.canonical(summary)
        oracle = {"passed": True, "sources": source, "artifacts": {"settlement-oracle.wasm":
                  {"sha256": review.sha(self.wasm["wasm/normal/settlement-oracle.wasm"])}}}
        self.files["research/reports/oracle.json"] = review.canonical(oracle)

    def test_exact_roundtrip_never_approves_release(self):
        digest, manifest = self.bundle()
        self.assertEqual(review.verify_bundle(self.path, digest), manifest)
        self.assertFalse(manifest["release_authorized"])
        self.assertEqual(manifest["findings_status"], "NOT_SUPPLIED")
        self.assertEqual(manifest["source_commit"], "a" * 40)

    def test_source_wasm_missing_extra_and_manifest_tampering(self):
        digest, _ = self.bundle()
        for relative in ("source/contracts/core.rs", "wasm/normal/clearinghouse.wasm", "manifest.json"):
            with self.subTest(relative=relative):
                file = self.path / relative
                original = file.read_bytes()
                file.write_bytes(original + b"changed")
                with self.assertRaises(ValueError):
                    review.verify_bundle(self.path, digest)
                file.unlink()
                with self.assertRaises((ValueError, FileNotFoundError)):
                    review.verify_bundle(self.path, digest)
                file.write_bytes(original)
        (self.path / "unlisted.txt").write_text("extra")
        with self.assertRaises(ValueError):
            review.verify_bundle(self.path, digest)

    def test_external_anchor_and_approval_claim_rejected(self):
        digest, manifest = self.bundle()
        with self.assertRaises(ValueError):
            review.verify_bundle(self.path, "0" * 64)
        manifest["release_authorized"] = True
        encoded = review.canonical(manifest)
        (self.path / "manifest.json").write_bytes(encoded)
        # Even supplying the modified digest cannot turn integrity into approval.
        with self.assertRaises(ValueError):
            review.verify_bundle(self.path, review.sha(encoded))

    def test_symlink_and_fifo_rejected_without_following(self):
        digest, _ = self.bundle()
        file = self.path / "source/contracts/core.rs"
        file.unlink()
        file.symlink_to(ROOT / "README.md")
        with self.assertRaises(ValueError):
            review.verify_bundle(self.path, digest)
        file.unlink()
        review.os.mkfifo(file)
        with self.assertRaises(ValueError):
            review.verify_bundle(self.path, digest)

    def test_existing_destination_preserved(self):
        digest, _ = self.bundle()
        with self.assertRaises(ValueError):
            self.bundle()
        review.verify_bundle(self.path, digest)

    def test_path_traversal_and_secret_location_exclusions(self):
        for path in ("../outside", "/absolute", "a/../b", "a//b", "a\\b"):
            with self.subTest(path=path), self.assertRaises(ValueError):
                review.safe_path(path)
        for path in (".env", ".env.testnet", ".local/keys.json", "archive/privacy-track/proof.json",
                     "tests/node_modules/module.json", "contracts/target/cache.json", ".aws/config"):
            self.assertFalse(review.selected(path), path)
        self.assertTrue(review.selected(".env.example"))
        self.assertTrue(review.selected("contracts/clearinghouse/Cargo.lock"))
        self.assertTrue(review.selected(".cargo/config.toml"))
        self.assertFalse(review.selected(".cargo/credentials.toml"))

    def test_snapshot_rejects_modified_or_untracked_compiled_inputs(self):
        root = Path(self.temp.name)
        (root / "contracts").mkdir()
        (root / "contracts/core.rs").write_bytes(b"candidate")
        def git(*args):
            if args[0] == "rev-parse":
                return ("a" * 40).encode()
            if args[0] == "ls-tree":
                return b"100644 blob abc\tcontracts/core.rs\0"
            if args[0] == "cat-file":
                return b"candidate"
            return b""
        with patch.object(review, "ROOT", root), patch.object(review, "git", side_effect=git):
            commit, files = review.snapshot("HEAD")
            self.assertEqual(commit, "a" * 40)
            self.assertEqual(files["contracts/core.rs"], b"candidate")
            (root / "contracts/core.rs").write_bytes(b"modified")
            with self.assertRaisesRegex(ValueError, "differs"):
                review.snapshot("HEAD")
            (root / "contracts/core.rs").write_bytes(b"candidate")
        with patch.object(review, "ROOT", root), patch.object(review, "git", side_effect=lambda *args: b"contracts/extra.rs" if args[0] == "ls-files" else git(*args)):
            with self.assertRaisesRegex(ValueError, "outside"):
                review.snapshot("HEAD")

    def test_committed_symlink_rejected_before_read(self):
        def git(*args):
            if args[0] == "rev-parse":
                return ("a" * 40).encode()
            if args[0] == "ls-tree":
                return b"120000 blob abc\tcontracts/core.rs\0"
            self.fail("must not read symlink contents")
        with patch.object(review, "git", side_effect=git), self.assertRaisesRegex(ValueError, "nonregular"):
            review.snapshot("HEAD")

    def test_private_key_guards_preserve_public_receipt_signatures(self):
        private = b'{"private_key":"ed25519:' + b"A" * 88 + b'"}'
        with self.assertRaisesRegex(ValueError, "private-key-shaped"):
            review.no_secret("fixture.json", private)
        with self.assertRaises(ValueError):
            review.no_secret("fixture.txt", b"-----BEGIN " + b"PRIVATE KEY-----")
        review.no_secret("receipt.json", b'{"signature":"ed25519:' + b"A" * 88 + b'"}')

    def test_evidence_inputs_current_and_historical_are_distinguished(self):
        self.evidence()
        self.files["research/reports/old.json"] = review.canonical({"passed": True, "sources": {"contracts/core.rs": "0" * 64}})
        result = review.validate_evidence(self.files, self.wasm)
        self.assertTrue(next(r for r in result if r["path"].endswith("oracle.json"))["recorded_inputs_match"])
        self.assertFalse(next(r for r in result if r["path"].endswith("old.json"))["recorded_inputs_match"])

    def test_stale_source_report_or_oracle_wasm_fails(self):
        self.evidence()
        for target in ("contracts/core.rs", "research/reports/g8-models.json", "scripts/check-security.py"):
            original = self.files[target]
            self.files[target] += b"changed"
            with self.subTest(target=target), self.assertRaises((ValueError, KeyError)):
                review.validate_evidence(self.files, self.wasm)
            self.files[target] = original
        self.wasm["wasm/normal/settlement-oracle.wasm"] = b"wrong oracle"
        with self.assertRaisesRegex(ValueError, "no current"):
            review.validate_evidence(self.files, self.wasm)

    def test_missing_seed_and_missing_symbolic_query_fail(self):
        self.evidence()
        summary_path = "research/reports/g8-security.json"
        original = self.files[summary_path]
        summary = json.loads(original)
        summary["runs"].pop()
        self.files[summary_path] = review.canonical(summary)
        with self.assertRaisesRegex(ValueError, "incomplete"):
            review.validate_evidence(self.files, self.wasm)
        self.files[summary_path] = original
        path = "research/reports/g8-symbolic.json"
        symbolic = json.loads(self.files[path])
        symbolic["obligations"] = [{"name": "missing", "smt_sha256": "0" * 64}]
        self.files[path] = review.canonical(symbolic)
        summary = json.loads(original)
        summary["symbolic"]["sha256"] = review.sha(self.files[path])
        self.files[summary_path] = review.canonical(summary)
        with self.assertRaises(KeyError):
            review.validate_evidence(self.files, self.wasm)


if __name__ == "__main__":
    unittest.main()
