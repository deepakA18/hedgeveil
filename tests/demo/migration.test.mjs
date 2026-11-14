import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {safePath, seal, unseal, restoreWorkspace} from '../../deploy/container/migrate.mjs';
import {mkdtemp, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('encrypted migration rejects tampering and the wrong key', () => {
    const key = randomBytes(32), value = {sql: 'retained database', files: [{data: 'private'}]};
    const data = seal(value, key);
    assert.deepEqual(unseal(data, key), value);
    assert.equal(data.includes(Buffer.from('private')), false);
    assert.throws(() => unseal(data, randomBytes(32)));
    data[data.length - 1] ^= 1;
    assert.throws(() => unseal(data, key));
});
test('migration refuses traversal, physical databases and process locks', () => {
    for (const path of ['/abs', '../key', 'a/../b', 'a//b', 'a\\b', 'postgres/PG_VERSION', 'running/owner.json', 'a\0b']) assert.throws(() => safePath(path));
    assert.equal(safePath('admin-journal/retained.json'), 'admin-journal/retained.json');
});
test('restore never overwrites an existing workspace', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-migration-'));
    await writeFile(join(dir, 'sentinel'), 'keep');
    await assert.rejects(restoreWorkspace('/nonexistent', dir, randomBytes(32)), /TARGET_ALREADY_EXISTS|NON_ROOT/);
});
