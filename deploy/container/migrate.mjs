// Operator-only, offline migration. Never starts contract/maker workers.
import {readFile, writeFile, mkdir, readdir, lstat, access} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes, createHash, createCipheriv, createDecipheriv} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import pg from '../../services/indexer/node_modules/pg/lib/index.js';
import EmbeddedPostgres from '../../services/indexer/node_modules/embedded-postgres/dist/index.js';
import {freePort} from '../../tests/indexer/postgres.mjs';
import {privateRead, privateDirectory} from '../../services/demo/storage.mjs';
import {checkWorkspace} from './check-workspace.mjs';

const run = promisify(execFile), LIMIT = 512 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const identifier = value => '"' + value.replaceAll('"', '""') + '"';
async function absent(path) {
    try { await access(path); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    throw Error('TARGET_ALREADY_EXISTS_OR_SOURCE_RUNNING');
}
export function safePath(path) {
    if (typeof path !== 'string' || !path || path.includes('\\') || path.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f]/.test(path) || ['postgres', 'running'].includes(path.split('/')[0])) throw Error('INVALID_ARCHIVE_PATH');
    return path;
}
export function seal(value, key) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(gzipSync(JSON.stringify(value))), cipher.final()]);
    return Buffer.concat([Buffer.from('HVM1'), iv, cipher.getAuthTag(), data]);
}
export function unseal(data, key) {
    if (data.length > LIMIT || data.subarray(0, 4).toString() !== 'HVM1') throw Error('INVALID_ARCHIVE');
    const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(4, 16));
    decipher.setAuthTag(data.subarray(16, 32));
    return JSON.parse(gunzipSync(Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]), {maxOutputLength: LIMIT}));
}
export async function databaseDigest(client) {
    // Timestamp serialization must not depend on the host's local timezone.
    await client.query("SET TIME ZONE 'UTC'; SET DateStyle TO 'ISO, YMD'; SET extra_float_digits TO 3");
    const tables = await client.query("SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_toast%' ORDER BY schemaname, tablename");
    const result = [];
    for (const {schemaname, tablename} of tables.rows) {
        const rows = await client.query(`SELECT row_to_json(t)::text AS value FROM ${identifier(schemaname)}.${identifier(tablename)} t ORDER BY row_to_json(t)::text COLLATE "C"`);
        result.push({schema: schemaname, table: tablename, rows: rows.rowCount, sha256: hash(rows.rows.map(r => r.value + '\n').join(''))});
    }
    return result;
}
async function database(directory, initialise) {
    const {password} = await privateRead(join(directory, 'postgres.json')), port = await freePort();
    const runtime = new EmbeddedPostgres({databaseDir: join(directory, 'postgres'), port, user: 'postgres', password, persistent: true, createPostgresUser: false, autoRehydrateSymlinks: true, postgresFlags: ['-h','127.0.0.1','-k',''], initdbFlags: ['--locale=C','--encoding=UTF8'], onLog: () => {}, onError: () => {}});
    if (initialise) await runtime.initialise();
    await runtime.start();
    const client = new pg.Client({host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres'});
    await client.connect();
    return {runtime, client, password, port, stop: async () => { await client.end(); await runtime.stop(); }};
}
async function filesAt(root, relative = '') {
    const files = [], directories = [];
    for (const name of (await readdir(join(root, relative))).sort()) {
        if (!relative && ['postgres','running'].includes(name)) continue;
        const path = safePath(relative ? relative + '/' + name : name), stat = await lstat(join(root, path));
        if (stat.isSymbolicLink()) throw Error('SYMLINK_IN_PRIVATE_STATE');
        if (stat.isDirectory()) { directories.push(path); const child = await filesAt(root, path); files.push(...child.files); directories.push(...child.directories); }
        else if (stat.isFile()) { const bytes = await readFile(join(root, path)); files.push({path, sha256: hash(bytes), data: bytes.toString('base64')}); }
        else throw Error('UNSUPPORTED_PRIVATE_STATE');
    }
    return {files, directories};
}
export async function exportWorkspace(directory, output, keyFile) {
    await privateDirectory(directory); await absent(join(directory, 'running')); await absent(output); await absent(keyFile);
    const db = await database(directory, false);
    let archive;
    try {
        const digest = await databaseDigest(db.client);
        // pg_dump's password is inherited by Docker, never placed in argv/logs.
        const {stdout: sql} = await run('docker', ['run','--rm','--env','PGPASSWORD','postgres:18-bookworm@sha256:ece55f7868da684e400f82f1030a050718adbdd65c23aa500c486f6e2950dc0f','pg_dump','--host=host.docker.internal',`--port=${db.port}`,'--username=postgres','--dbname=postgres','--format=plain','--inserts','--no-owner','--no-privileges'], {env: {...process.env, PGPASSWORD: db.password}, maxBuffer: LIMIT});
        archive = {version: 1, created_at: new Date().toISOString(), digest, sql, ...await filesAt(directory)};
    } finally { await db.stop(); }
    const key = randomBytes(32);
    await writeFile(keyFile, key.toString('hex'), {flag: 'wx', mode: 0o600});
    await writeFile(output, seal(archive, key), {flag: 'wx', mode: 0o600});
    return {files: archive.files.length, tables: archive.digest.length};
}
export async function restoreWorkspace(input, directory, key) {
    if (process.getuid() === 0) throw Error('NON_ROOT_USER_REQUIRED');
    await absent(directory);
    const archive = unseal(await readFile(input), key);
    if (archive.version !== 1 || typeof archive.sql !== 'string' || !Array.isArray(archive.files) || !Array.isArray(archive.directories) || !Array.isArray(archive.digest)) throw Error('INVALID_ARCHIVE');
    const paths = new Set();
    for (const dir of archive.directories) { safePath(dir); if (paths.has(dir)) throw Error('DUPLICATE_PATH'); paths.add(dir); }
    for (const file of archive.files) { safePath(file.path); if (paths.has(file.path) || hash(Buffer.from(file.data, 'base64')) !== file.sha256) throw Error('ARCHIVE_FILE_MISMATCH'); paths.add(file.path); }
    // pg_dump 18 uses only these two psql guard directives in an INSERT dump.
    const sql = archive.sql.replace(/^\\(?:un)?restrict [A-Za-z0-9]+\r?\n/gm, '');
    if (/^\\/m.test(sql)) throw Error('UNEXPECTED_PSQL_DIRECTIVE');
    await mkdir(directory, {mode: 0o700});
    for (const dir of archive.directories.sort((a,b) => a.split('/').length-b.split('/').length)) await mkdir(join(directory, dir), {mode: 0o700});
    for (const file of archive.files) await writeFile(join(directory, file.path), Buffer.from(file.data, 'base64'), {flag: 'wx', mode: 0o600});
    // Empty journals may never have been created on the source; no records reset.
    if (!paths.has('maker-journals')) await mkdir(join(directory, 'maker-journals'), {mode: 0o700});
    const db = await database(directory, true);
    try {
        await db.client.query(sql);
        if (JSON.stringify(await databaseDigest(db.client)) !== JSON.stringify(archive.digest)) throw Error('DATABASE_RESTORE_MISMATCH');
    } finally { await db.stop(); }
    const expected = JSON.parse(await readFile('deploy/testnet/expiry-deployment.json', 'utf8'));
    await checkWorkspace(directory, expected);
    return {files: archive.files.length, tables: archive.digest.length, rows: archive.digest.reduce((n,t) => n+t.rows,0), verified: true};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        const [command, first, second, third] = process.argv.slice(2);
        let result;
        if (command === 'export') result = await exportWorkspace(resolve(first), resolve(second), resolve(third));
        else if (command === 'restore' && /^[a-f0-9]{64}$/.test(process.env.HEDGEVEIL_MIGRATION_KEY ?? '')) result = await restoreWorkspace(resolve(first), resolve(second), Buffer.from(process.env.HEDGEVEIL_MIGRATION_KEY, 'hex'));
        else throw Error('INVALID_COMMAND');
        console.log(JSON.stringify(result));
    } catch { console.error('MIGRATION_FAILED: retained state was not removed; inspect restore prerequisites before retrying.'); process.exitCode = 1; }
}
