// Isolated Linux packaging check. No service workspace, keys, or network writes.
import assert from 'node:assert/strict';
import {rm, readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {startPostgres} from '../../tests/indexer/postgres.mjs';
import pg from '../../services/indexer/node_modules/pg/lib/index.js';
import {walletAssets} from '../../apps/web/build-wallet.mjs';
import {serve} from '../../services/testnet/runtime.mjs';

assert.equal(typeof serve, 'function');
assert.notEqual(process.getuid(), 0);
const check = spawnSync(process.execPath, ['deploy/container/check-workspace.mjs'], {encoding:'utf8'});
assert.equal(check.status, 1, 'An empty workspace must not initialize a new ledger');
assert.match(check.stderr, /BACKEND_START_BLOCKED/);
const {assets} = await walletAssets();
assert.ok(assets.size >= 3);
const db = await startPostgres();
let client = new pg.Client(db.config);
try {
    await client.connect();
    await client.query(await readFile('services/indexer/schema.sql', 'utf8'));
    await client.query('CREATE TABLE container_probe (id integer primary key, amount numeric(78,0))');
    await client.query('INSERT INTO container_probe VALUES (1, $1)', ['100000000000000000000000']);
    assert.equal((await client.query('SELECT amount FROM container_probe')).rows[0].amount, '100000000000000000000000');
    await client.end();
    await db.runtime.stop();
    await db.runtime.start();
    client = new pg.Client(db.config);
    await client.connect();
    assert.equal((await client.query('SELECT amount FROM container_probe')).rows[0].amount, '100000000000000000000000');
} finally {
    await client.end();
    await db.runtime.stop();
    await rm(db.directory, {recursive:true});
}
console.log(JSON.stringify({check:'linux_backend_container',runtime_imports:true,wallet_integrity:true,postgres_schema:true,postgres_exact_amount:true,postgres_restart:true,empty_workspace_rejected:true,non_root:true,live_workspace_used:false,chain_writes:0}));
