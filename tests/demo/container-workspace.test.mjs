import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, symlink, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkWorkspace} from '../../deploy/container/check-workspace.mjs';

const expected = {client:{network:'testnet',chain_id:'testnet',genesis_hash:'genesis',contract_id:'core',code_hash:'code'}};
async function workspace(t) {
    const dir = await mkdtemp(join(tmpdir(), 'hv-container-'));
    t.after(() => rm(dir, {recursive:true,force:true}));
    const json = (name, value) => writeFile(join(dir, name), JSON.stringify(value), {mode:0o600});
    await json('plan.json', {version:1,network:'testnet',kind:'hedgeveil-expiry-testnet',vault_enabled:false});
    await json('deployment.json', expected);
    for (const file of ['signers.json','postgres.json','anchor.json']) await json(file, {});
    for (const name of ['postgres','makers','admin-journal','wallet-journal','maker-journals']) await mkdir(join(dir,name),{mode:0o700});
    await writeFile(join(dir,'postgres/PG_VERSION'),'18\n',{mode:0o600});
    return {dir,json};
}
test('restore prerequisites pass without loading secrets or creating a process lock', async t => {
    const {dir} = await workspace(t);
    await writeFile(join(dir,'signers.json'),'not parsed by precheck',{mode:0o600});
    await checkWorkspace(dir, expected);
});
test('retained crash lock blocks restart and remains intact', async t => {
    const {dir} = await workspace(t);
    await mkdir(join(dir,'running'),{mode:0o700});
    await assert.rejects(checkWorkspace(dir,expected),/RETAINED_PROCESS_LOCK/);
    await assert.rejects(mkdir(join(dir,'running')), {code:'EEXIST'});
});
test('missing database and incompatible database cannot silently initialize', async t => {
    const {dir} = await workspace(t);
    await writeFile(join(dir,'postgres/PG_VERSION'),'17');
    await assert.rejects(checkWorkspace(dir,expected),/POSTGRES_VERSION_MISMATCH/);
    await rm(join(dir,'postgres/PG_VERSION'));
    await assert.rejects(checkWorkspace(dir,expected),{code:'ENOENT'});
});
test('wrong deployment and unsafe private files block startup', async t => {
    const {dir,json} = await workspace(t);
    await json('deployment.json',{client:{...expected.client,contract_id:'old-core'}});
    await assert.rejects(checkWorkspace(dir,expected),/DEPLOYMENT_MISMATCH/);
    await json('deployment.json',expected);
    await chmod(join(dir,'postgres.json'),0o644);
    await assert.rejects(checkWorkspace(dir,expected),/PRIVATE_FILE_PERMISSIONS/);
    await rm(join(dir,'postgres.json'));
    await symlink('anchor.json',join(dir,'postgres.json'));
    await assert.rejects(checkWorkspace(dir,expected),/PRIVATE_FILE_PERMISSIONS/);
});
