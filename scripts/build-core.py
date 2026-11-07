#!/usr/bin/env python3
"""Build bounded core plus separately marked Sandbox oracle/fault artifacts."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'target/core-artifacts'
OUT.mkdir(parents=True, exist_ok=True)
base = ['cargo', '+1.96.0', 'build', '--manifest-path', str(ROOT/'contracts/Cargo.toml'),
        '--target', 'wasm32-unknown-unknown', '--release', '--locked']
subprocess.run(base, cwd=ROOT, check=True)
wasm = ROOT/'contracts/target/wasm32-unknown-unknown/release'
shutil.copyfile(wasm/'hedgeveil_clearinghouse.wasm', OUT/'clearinghouse.wasm')
shutil.copyfile(wasm/'hedgeveil_oracle_fixture.wasm', OUT/'oracle-fixture.wasm')
shutil.copyfile(wasm/'hedgeveil_account_fixture.wasm', OUT/'account-fixture.wasm')
subprocess.run(base+['-p','hedgeveil-clearinghouse','--features','fault-injection'],cwd=ROOT,check=True)
shutil.copyfile(wasm/'hedgeveil_clearinghouse.wasm',OUT/'clearinghouse-fault.wasm')
manifest={p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
          for p in sorted(OUT.glob('*.wasm'))}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
