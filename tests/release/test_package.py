import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("release", ROOT / "scripts/rehearse-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "bundle.tar.gz"
        self.reports = {name: {"passed": True, "checks": ["actual check"]} for name in release.PHASE_REPORTS}
        self.files = {"source/README.md": b"local source", "evidence/acceptance.json": release.encoded(release.acceptance(self.reports))}

    def test_roundtrip_never_promotes_local_checks_to_release(self):
        digest = release.package(self.path, self.files)
        manifest = release.verify_package(self.path, digest)
        self.assertFalse(manifest["release_authorized"])
        state = release.acceptance(self.reports)
        self.assertEqual([s["step"] for s in state["steps"]], list(range(1, 13)))
        self.assertFalse(state["public_testnet_complete"])
        self.assertEqual(state["independent_review"], "PENDING")
        self.assertIn("Separate experimental", state["steps"][4]["scope"])

    def test_missing_failed_or_empty_phase_rejected(self):
        for name in release.PHASE_REPORTS:
            for replacement in (None, {"passed": False, "checks": ["x"]}, {"passed": True, "checks": []}):
                reports = self.reports.copy()
                if replacement is None:
                    reports.pop(name)
                else:
                    reports[name] = replacement
                with self.subTest(name=name), self.assertRaises(ValueError):
                    release.acceptance(reports)

    def test_zero_exit_without_evidence_cannot_pass(self):
        directory = Path(self.temp.name)
        with self.assertRaisesRegex(ValueError, "without evidence"):
            release.read_phase(directory, "walkthrough")
        (directory / "walkthrough.json").write_text('{"passed":true,"checks":[]}')
        with self.assertRaisesRegex(ValueError, "incomplete"):
            release.read_phase(directory, "walkthrough")

    def test_fresh_source_contains_indexer_database_schema(self):
        self.assertTrue(release.review.selected("services/indexer/schema.sql"))
        release.public_path("source/services/indexer/schema.sql")
        # Isolate the source-selection regression from unrelated untracked work.
        root = Path(self.temp.name)
        schema = root / "services/indexer/schema.sql"
        schema.parent.mkdir(parents=True)
        schema.write_bytes(b"CREATE TABLE retained_evidence (id integer);")
        with patch.object(release, "ROOT", root), patch.object(release, "NEW_INPUTS", set()), patch.object(
            release.subprocess, "check_output", side_effect=[b"services/indexer/schema.sql\0", b""]
        ):
            self.assertEqual(release.source_inputs()["services/indexer/schema.sql"], schema.read_bytes())

    def test_existing_output_and_wrong_external_digest_rejected(self):
        digest = release.package(self.path, self.files)
        with self.assertRaises(ValueError):
            release.package(self.path, self.files)
        with self.assertRaises(ValueError):
            release.verify_package(self.path, "0" * 64)
        release.verify_package(self.path, digest)

    def test_package_creation_rejects_traversal_and_private_key_field(self):
        with self.assertRaises(ValueError):
            release.package(self.path, {"../outside": b"bad"})
        with self.assertRaises(ValueError):
            release.package(self.path, {"source/key.json": b'{"private_key":"ed25519:' + b"A" * 88 + b'"}'})
        for name in ("source/.env", "source/.local/signers.json", "source/target/demos/state.json", "logs/runtime.txt"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                release.package(self.path, {name: b"excluded even without a recognizable secret"})

    def archive(self, entries):
        with tarfile.open(self.path, "w:gz") as output:
            for name, data, link in entries:
                item = tarfile.TarInfo(name)
                if link:
                    item.type, item.linkname = tarfile.SYMTYPE, "/outside"
                    output.addfile(item)
                else:
                    item.size = len(data)
                    output.addfile(item, io.BytesIO(data))
        return release.sha(self.path.read_bytes())

    def test_verification_rejects_symlinks_duplicates_and_traversal(self):
        for entries in ([('../escape', b'x', False)], [('source/README.md', b'', True)], [('source/README.md', b'a', False), ('source/README.md', b'a', False)]):
            digest = self.archive(entries)
            with self.assertRaises(ValueError):
                release.verify_package(self.path, digest)

    def test_content_tampering_even_with_new_archive_digest_rejected(self):
        release.package(self.path, self.files)
        with tarfile.open(self.path) as archive:
            entries = [(x.name, archive.extractfile(x).read(), False) for x in archive]
        entries = [(name, b"modified" if name == "source/README.md" else data, link) for name, data, link in entries]
        digest = self.archive(entries)
        with self.assertRaisesRegex(ValueError, "content mismatch"):
            release.verify_package(self.path, digest)

    def test_public_release_claim_rejected(self):
        state = json.loads(self.files["evidence/acceptance.json"])
        state["public_testnet_complete"] = True
        self.files["evidence/acceptance.json"] = release.encoded(state)
        digest = release.package(self.path, self.files)
        with self.assertRaisesRegex(ValueError, "public release"):
            release.verify_package(self.path, digest)


if __name__ == "__main__":
    unittest.main()
