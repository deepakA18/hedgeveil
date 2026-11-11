"""Build candidate external resolver and separately labelled Sandbox source fixture."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'target/external-oracle-artifacts'
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(['cargo', '+1.96.0', 'build', '--manifest-path', str(ROOT/'contracts/Cargo.toml'),
                '--locked', '--target', 'wasm32-unknown-unknown', '--release',
                '-p', 'hedgeveil-external-settlement', '-p', 'hedgeveil-external-source-fixture'], cwd=ROOT, check=True)
for name in ['external_settlement', 'external_source_fixture']:
    shutil.copyfile(ROOT/f'contracts/target/wasm32-unknown-unknown/release/hedgeveil_{name}.wasm', OUT/(name+'.wasm'))
manifest = {p.name: {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size}
            for p in sorted(OUT.glob('*.wasm'))}
(OUT/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps(manifest, indent=2))
