import {lstat, readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {privateDirectory, privateRead} from '../../services/demo/storage.mjs';

// This is a restore prerequisite, not a database/chain readiness assertion.
// Never creates a workspace, removes a lock, or loads account private keys.
export async function checkWorkspace(directory, expected) {
    await privateDirectory(directory);
    try {
        await lstat(join(directory, 'running'));
        throw Error('RETAINED_PROCESS_LOCK');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const plan = await privateRead(join(directory, 'plan.json'));
    const deployment = await privateRead(join(directory, 'deployment.json'));
    if (plan.version !== 1 || plan.network !== 'testnet' || plan.kind !== 'hedgeveil-expiry-testnet' || plan.vault_enabled !== false || plan.deployment_hold) throw Error('WORKSPACE_PROFILE');
    for (const field of ['network', 'chain_id', 'genesis_hash', 'contract_id', 'code_hash']) {
        if (!expected.client[field] || deployment.client?.[field] !== expected.client[field]) throw Error('DEPLOYMENT_MISMATCH');
    }
    for (const file of ['signers.json', 'postgres.json', 'anchor.json']) {
        const stat = await lstat(join(directory, file));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw Error('PRIVATE_FILE_PERMISSIONS');
    }
    for (const dir of ['postgres', 'makers', 'admin-journal', 'wallet-journal', 'maker-journals']) await privateDirectory(join(directory, dir));
    const versionFile = join(directory, 'postgres/PG_VERSION');
    const stat = await lstat(versionFile);
    if (!stat.isFile() || stat.isSymbolicLink()) throw Error('DATABASE_RESTORE_REQUIRED');
    if ((await readFile(versionFile, 'utf8')).trim() !== '18') throw Error('POSTGRES_VERSION_MISMATCH');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        if (process.getuid() === 0) throw Error('NON_ROOT_USER_REQUIRED');
        const expected = JSON.parse(await readFile('deploy/testnet/expiry-deployment.json', 'utf8'));
        await checkWorkspace(resolve('.local/testnet/expiry'), expected);
        console.log('Retained workspace prerequisites passed; chain reconciliation is still required.');
    } catch {
        // No paths, RPC payloads, secrets or private journal contents in logs.
        console.error('BACKEND_START_BLOCKED: verify restored expiry workspace, ownership, PostgreSQL 18 and retained process lock. Nothing reset or resent.');
        process.exitCode = 1;
    }
}
