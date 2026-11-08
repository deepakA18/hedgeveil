#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ClientError, fail } from '../packages/sdk/intent.mjs';
import { Client } from '../packages/sdk/index.mjs';
try {
    const { values: v, positionals } = parseArgs({ allowPositionals: true, options: Object.fromEntries(['config', 'journal', 'account', 'method', 'args', 'deposit', 'id', 'hash', 'signer'].map(k => [k, { type: 'string' }])) });
    const [command] = positionals;
    if (positionals.length !== 1 || !v.config || !v.journal)
        fail('USAGE');
    const client = new Client({ config: JSON.parse(await readFile(v.config, 'utf8')), journal: resolve(v.journal) });
    let result;
    switch (command) {
        case 'balances':
            result = await client.balances(v.account);
            break;
        case 'prepare':
            result = await client.prepare({ signer_id: v.account, method: v.method,
                args: JSON.parse(v.args ?? '{}'), attached_deposit: v.deposit, ...(v.id ? { operation_id: v.id } : {}) });
            break;
        case 'inspect':
            result = await client.record(v.id);
            break;
        case 'recover':
            result = await client.recover(v.id, v.hash);
            break;
        case 'submit': {
            if (!v.signer)
                fail('SIGNER_REQUIRED');
            const adapter = await import(pathToFileURL(resolve(v.signer)).href);
            if (typeof adapter.sign !== 'function')
                fail('INVALID_SIGNER');
            result = await client.submit(v.id, adapter.sign);
            break;
        }
        default: fail('USAGE');
    }
    process.stdout.write(JSON.stringify(result) + '\n');
}
catch (e) {
    // Never print arbitrary adapter/RPC errors or private module paths.
    const safe = e instanceof ClientError ? e.code : 'CLIENT_ERROR';
    process.stderr.write(JSON.stringify({ error: safe }) + '\n');
    process.exitCode = 1;
}
finally {
    if (process.connected)
        process.disconnect();
}
