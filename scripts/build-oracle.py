#!/usr/bin/env python3
"""Build G4 oracle artifacts separately from historical G1/G3 evidence."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'target/oracle-artifacts'
OUT.mkdir(parents=True,exist_ok=True)
base=['cargo','+1.96.0','build','--manifest-path',str(ROOT/'contracts/Cargo.toml'),
      '--target','wasm32-unknown-unknown','--release','--locked']
subprocess.run(base+['-p','hedgeveil-clearinghouse','-p','hedgeveil-settlement-oracle'],cwd=ROOT,check=True)
wasm=ROOT/'contracts/target/wasm32-unknown-unknown/release'
for src,dest in [('hedgeveil_clearinghouse','clearinghouse'),('hedgeveil_settlement_oracle','settlement-oracle')]:
    shutil.copyfile(wasm/(src+'.wasm'),OUT/(dest+'.wasm'))
subprocess.run(base+['-p','hedgeveil-settlement-oracle','--features','fault-injection'],cwd=ROOT,check=True)
shutil.copyfile(wasm/'hedgeveil_settlement_oracle.wasm',OUT/'settlement-oracle-fault.wasm')
manifest={p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted(OUT.glob('*.wasm'))}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
