#!/usr/bin/env python3
"""Build normal and explicit fault-injection artifacts; no network deployment."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'research/g1'
OUTPUT = ROOT / 'target/g1-artifacts'
OUTPUT.mkdir(parents=True, exist_ok=True)
base = ['cargo', '+1.96.0', 'build', '--manifest-path', str(WORK / 'Cargo.toml'),
        '--target', 'wasm32-unknown-unknown', '--release', '--locked']
subprocess.run(base, cwd=ROOT, check=True)
for name in ('core', 'oracle', 'tokens', 'receiver'):
    shutil.copyfile(WORK / f'target/wasm32-unknown-unknown/release/g1_{name}.wasm', OUTPUT / f'{name}.wasm')
subprocess.run(base + ['-p', 'g1-core', '--features', 'fault-injection'], cwd=ROOT, check=True)
shutil.copyfile(WORK / 'target/wasm32-unknown-unknown/release/g1_core.wasm', OUTPUT / 'core-fault.wasm')
manifest = {p.name: {'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size}
            for p in sorted(OUTPUT.glob('*.wasm'))}
(OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
