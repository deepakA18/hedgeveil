// Read-only release inventory. Never loads .env, keys or private operation journals.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';

const required = ['frontend','prices','api','indexer','rpc','contracts','maker-1','maker-2','settlement','renewal'];
const states = new Set(['operational','degraded','unavailable','unknown']);
const gates = [
  ['PUBLIC_ACCESS_BOUNDARY', 'HTTPS bridge, signed account sessions and request limits pass local checks; final-host ingress, wallet and independent security acceptance remain pending.'],
  ['SETTLEMENT_ACCEPTANCE', 'Current-profile settlement, import and both-leg redemption require final receipt evidence.'],
  ['RENEWAL_ACCEPTANCE', 'A subsequent public market renewal requires final receipt evidence.'],
  ['FIRST_DEPOSIT_ACCEPTANCE', 'Combined first-deposit flow requires a first-time external wallet acceptance run.'],
  ['HOST_RESTORE_ACCEPTANCE', 'Target-host restore, restart, backup and single-signer ownership need acceptance.'],
  ['PUBLIC_WALLET_ACCEPTANCE', 'Wallet connect, signing, rejection and receipt recovery need checks on the final HTTPS origin.'],
  ['INDEPENDENT_REVIEW', 'Independent release review remains pending.'],
];

export function statusOrigin(input) {
  const u = new URL(input);
  if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1' || u.username || u.password || u.search || u.hash || u.pathname !== '/') throw Error('LOOPBACK_ORIGIN_REQUIRED');
  return u.origin;
}

export function assessStatus(snapshot, now = Date.now()) {
  const at = Date.parse(snapshot?.checked_at);
  const fresh = Number.isFinite(at) && at <= now && now-at < 60000;
  const rows = Array.isArray(snapshot?.services) ? snapshot.services : [];
  // Allowlist only identifiers, states and valid timestamps; never echo server details.
  return [...required, 'discovery'].map(id => {
    const matches = rows.filter(row => row?.id === id);
    const row = matches.length === 1 ? matches[0] : null;
    const observed = Date.parse(row?.observed_at);
    const limit = id==='prices' ? 30000 : id==='settlement' ? 120000 : id==='renewal' || id==='discovery' ? 180000 : id.startsWith('maker-') ? 90000 : 60000;
    const recent = Number.isFinite(observed) && observed <= now && now-observed < limit;
    return {id, required: required.includes(id), state: fresh && recent && states.has(row?.state) ? row.state : 'unknown', observed_at: recent ? new Date(observed).toISOString() : null};
  });
}

export async function preflight({origin, transport = fetch, now} = {}) {
  const checks = [];
  const [major,minor,patch] = process.versions.node.split('.').map(Number);
  checks.push({id:'node', pass:major>22 || major===22 && (minor>22 || minor===22 && patch>=2)});
  const deployment = JSON.parse(await readFile(new URL('../deploy/testnet/expiry-deployment.json', import.meta.url), 'utf8'));
  checks.push({id:'testnet-binding',pass:deployment.network==='testnet' && deployment.client?.network==='testnet' && deployment.indexer?.network==='testnet' && deployment.vault_enabled===false});
  let status = null;
  if (origin) {
    const endpoint = statusOrigin(origin);
    try {
      const response = await transport(`${endpoint}/api/status`, {redirect:'error', signal:AbortSignal.timeout(10000), headers:{accept:'application/json'}});
      if (!response.ok) throw Error('STATUS_UNAVAILABLE');
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      while (true) {
        const {done,value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 131072) {await reader.cancel(); throw Error('STATUS_TOO_LARGE');}
        chunks.push(Buffer.from(value));
      }
      status = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { /* Unavailable data remains unknown. Never print transport errors. */ }
  }
  // Compare against receipt time, not request start (the server samples during the request).
  const checkedAt = now ?? Date.now();
  const services = assessStatus(status, checkedAt);
  return {
    version:1, checked_at:new Date(checkedAt).toISOString(), scope:'deployment-preparation',
    public_ready:false, production_enabled:false,
    checks, services,
    blockers:gates.map(([id,detail])=>({id,detail})),
    runtime_ready:checks.every(c=>c.pass) && services.filter(s=>s.required).every(s=>s.state==='operational'),
    note:'Runtime health is not release acceptance. FASTNEAR is an incomplete additive audit in the approved receipt-reconciliation demo mode. Manual gates cannot be waived by this command.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const {values} = parseArgs({options:{origin:{type:'string'}}});
    const report = await preflight({origin:values.origin});
    console.log(JSON.stringify(report,null,2));
    process.exitCode = report.public_ready ? 0 : 1;
  } catch {
    console.error('PREFLIGHT_FAILED: use --origin http://127.0.0.1:3000 and verify the public deployment manifest.');
    process.exitCode = 2;
  }
}
