import {mkdir, open, link, unlink, readFile, readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {canonical, fail} from './intent.mjs';
import {hash32} from './rpc.mjs';

const terminals = new Set(['SUCCEEDED', 'FAILED_CONFIRMED', 'WITHDRAWAL_SUCCEEDED', 'WITHDRAWAL_FAILED_CONFIRMED']);
export const terminal = state => terminals.has(state);

async function syncDir(dir) {
    const handle = await open(dir, 'r');
    try { await handle.sync(); }
    finally { await handle.close(); }
}
async function read(path) {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (e) {
        if (e.code === 'ENOENT') return null;
        fail('JOURNAL_CORRUPT');
    }
}
async function exclusive(dir, name, value) {
    await mkdir(dir, {recursive:true, mode:0o700});
    const temp = join(dir, `.${randomUUID()}.tmp`);
    const handle = await open(temp, 'wx', 0o600);
    try {
        await handle.writeFile(JSON.stringify(value) + '\n');
        await handle.sync();
    } finally { await handle.close(); }
    try {
        // A hard link publishes a fully written file without replacing a competing winner.
        await link(temp, join(dir, name));
        await syncDir(dir);
    } finally { await unlink(temp); }
}

export class FileJournal {
    constructor(directory, {isTerminal = terminal} = {}) { this.directory = directory; this.isTerminal = isTerminal; }
    path(id) {
        if (!/^[0-9a-f]{64}$/.test(id)) fail('INVALID_OPERATION_ID');
        return join(this.directory, id);
    }
    async create(intent, binding) {
        const dir = this.path(intent.operation_id), value = {version:1, intent, binding};
        try {
            await exclusive(dir, 'intent.json', value);
            await syncDir(this.directory);
        } catch (e) {
            if (e.code !== 'EEXIST') throw e;
            if (canonical(await read(join(dir, 'intent.json'))) !== canonical(value)) fail('OPERATION_ID_CONFLICT');
        }
        return value;
    }
    async get(id) {
        const dir = this.path(id), value = await read(join(dir, 'intent.json'));
        if (value?.version !== 1 || value.intent?.operation_id !== id) fail('JOURNAL_MISSING_OR_CORRUPT');
        let attempted = false;
        try { await stat(join(dir, 'attempt.json')); attempted = true; }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
        const hash = await read(join(dir, 'hash.json'));
        if (hash !== null && typeof hash.hash !== 'string') fail('JOURNAL_CORRUPT');
        const files = (await readdir(dir)).filter(name => name.startsWith('observation-'));
        const observations = await Promise.all(files.map(name => read(join(dir, name))));
        if (observations.some(x => !x?.result?.state || typeof x.observed_at !== 'string')) fail('JOURNAL_CORRUPT');
        observations.sort((a, b) => a.observed_at.localeCompare(b.observed_at));
        const done = observations.filter(x => this.isTerminal(x.result.state));
        const terminalIdentities = done.map(x => canonical([x.result.state, x.result.hash ?? null, x.result.ticket_id ?? null]));
        if (new Set(terminalIdentities).size > 1) fail('JOURNAL_EVIDENCE_CONFLICT');
        return {...value, attempted, hash:hash?.hash ?? null,
            candidate_hash:observations.filter(x => x.result.candidate_hash).at(-1)?.result.candidate_hash ?? null,
            result:(done.at(-1) || observations.at(-1))?.result ?? null};
    }
    async claim(id) {
        await this.get(id);
        try { await exclusive(this.path(id), 'attempt.json', {attempted_at:new Date().toISOString()}); }
        catch (e) {
            if (e.code === 'EEXIST') fail('ALREADY_ATTEMPTED');
            throw e;
        }
    }
    async bind(id, hash) {
        hash32(hash);
        const current = await this.get(id);
        if (!current.attempted) fail('NOT_ATTEMPTED');
        if (current.hash && current.hash !== hash) fail('HASH_CONFLICT');
        const domain = canonical(current.binding);
        // Preserve old journals: hashes bound before the owner index also count.
        // Run one client version per retained journal during upgrades.
        for (const other of await readdir(this.directory)) {
            if (other === id || !/^[a-f0-9]{64}$/.test(other)) continue;
            const value = await read(join(this.path(other), 'hash.json'));
            if (value?.hash === hash) {
                const intent = await read(join(this.path(other), 'intent.json'));
                if (!intent?.binding) fail('JOURNAL_CORRUPT');
                if (canonical(intent.binding) === domain) fail('HASH_ALREADY_BOUND');
            }
        }
        const owners = join(this.directory, '.hash-bindings');
        const key = createHash('sha256').update(domain).digest('hex') + '-' + hash;
        try {
            // Claim first so concurrent recovery of identical intents has one winner.
            // A crash here reserves the hash for this ID; it never authorizes a resend.
            await exclusive(owners, key, {operation_id:id});
            await syncDir(this.directory);
        } catch (e) {
            if (e.code !== 'EEXIST') throw e;
            if ((await read(join(owners, key)))?.operation_id !== id) fail('HASH_ALREADY_BOUND');
        }
        try { await exclusive(this.path(id), 'hash.json', {hash}); }
        catch (e) {
            if (e.code !== 'EEXIST') throw e;
            if ((await read(join(this.path(id), 'hash.json')))?.hash !== hash) fail('HASH_CONFLICT');
        }
    }
    async observe(id, result, evidence = null) {
        await exclusive(this.path(id), `observation-${randomUUID()}.json`, {observed_at:new Date().toISOString(), result, evidence});
        return result;
    }
}
