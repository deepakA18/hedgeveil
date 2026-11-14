# Hosted deployment preparation

14 November 2026. **Public testnet demo deployed at the user's direction.**
Frontend: https://hedgeveil.vercel.app. Backend:
https://hedgeveil-backend-production.up.railway.app (gateway credential required).
This is not production approval or G9 completion. The root
[plan](../IMPLEMENTATION_PLAN.md) remains authoritative. Existing settlement,
renewal, public-origin monetary acceptance and independent-review gates remain open.
[Actual hosting evidence](../research/reports/public-hosting-2026-11-14.json).

The active expiry runtime is now Railway, with persistent volume
`/app/.local/testnet`. The old laptop expiry runtime is stopped. Its retained
workspace is a pre-cutover backup, **not an instance safe to restart** after
Railway has made progress. The retired deployment on port 8794 remains separate.

## Local development topology (expiry stopped after cutover)

| Process | Local address | Persistent requirements |
| --- | --- | --- |
| Next.js frontend | `127.0.0.1:3000` | Release build; status history is currently memory-only |
| Expiry backend | `127.0.0.1:8796` | `.local/testnet/expiry` including PostgreSQL, keys, journals, maker state and evidence |
| Two makers, settlement and renewal workers | Backend child processes | Owned by that single backend instance |
| PostgreSQL 18 | Random loopback port owned by backend | Embedded database in the expiry workspace |
| Retired deployment | Separate local service on 8794 | Preserve its remaining obligations and recovery access |

Contracts already exist on NEAR testnet. Hosting the web app does **not** require
another contract deployment, new funding bootstrap or new service keys.
Public contract bindings are in `deploy/testnet/expiry-deployment.json`.
Never copy old deployments into the active expiry namespace.

The current service requires a persistent machine and a single writer. A stateless
function host cannot run this backend as written. Start with one persistent host;
do not horizontally scale the signer, scheduler or embedded database. Target-host
capacity must be measured with ten simultaneous users, including quotes and
receipt checks, not inferred from a provider's instance label.

## Read-only readiness report

From the repository root, with the current frontend running:

```sh
node scripts/deployment-preflight.mjs --origin http://127.0.0.1:3000
node --test tests/demo/deployment-preflight.test.mjs
```

Exit 1 means release gates remain open; exit 2 means invalid invocation or manifest.
Without `--origin`, runtime observations are unknown. The command never reads
`.env`, private keys or journals, submits a transaction, starts workers or retries
writes. It only outputs allowlisted service states and timestamps. Unknown,
duplicate, stale and future observations fail closed. `runtime_ready` describes
observed health, **not** release readiness. Public readiness remains false until
the gates below have implementation and acceptance evidence and the checker is
reviewed accordingly. Do not add a command-line bypass.

## Public access boundary: actual host checks passed

Hosted mode is explicit; the default remains loopback-only. Next.js verifies the
exact configured frontend Host/Origin and fetch-site, then contacts only the
configured HTTPS backend. Server-only bearer authentication identifies the bridge;
browser Authorization/proxy headers and unrelated cookies are discarded. The
backend requires its exact public Host, the configured frontend Origin, the
service credential and HTTPS proxy indication. Only the platform's TLS ingress
may reach its hosted listener. PostgreSQL remains on loopback. No wildcard preview
origins, redirects to arbitrary upstreams or browser-visible bridge secret.

Wallet connection alone is insufficient. Users sign a NEP-413 message containing
the account, frontend origin, contract, genesis and two-minute expiry. The server
verifies the signature and full-access key membership at a verified finalized
block. A separate HttpOnly challenge cookie binds the response to its browser;
challenges are consumed once, including failed verification. Authentication cannot
create access keys, send a transaction or lift trading/receipt gates.

Sessions last 15 minutes, use `__Host-` Secure/HttpOnly/SameSite=Strict cookies,
rotate on successful verification and are revoked on logout. Sessions/challenges
are bounded in memory; restart requires verification again. A removed account key
may leave an existing session valid until its 15-minute expiry; wallet transactions
still require the wallet. Account switching requires verification for the selected
account. Wallet-return evidence stays in the URL until authenticated recovery can
retain it. Persistent operation journals are not rewritten on login or restart.

The verified account owns prepare/list/live/quotes and every operation ID access:
handoff, cancel, recovery and remembered hashes. Foreign and missing IDs both
return 404. Public chain snapshots, chain evidence and sanitized service health
remain readable through the authenticated bridge without wallet login. Browser
filters are presentation only; ownership is enforced on the backend.

Single-backend limits (not per Vercel instance):

| Resource | Limit |
| --- | --- |
| JSON body | 64 KiB; backend request timeout 15 s, headers 10 s |
| Bridge call | 45 s timeout, redirects disabled, no write retries |
| All gateway requests | 1,200/minute; at most 32 in flight |
| POST requests in flight | 8 globally; capacity held until handler completes |
| Authentication writes | 60/minute globally; 4 challenges/account/minute |
| Authenticated actions including receipt checks | 30/account/minute |
| RFQ requests | 12/account/minute, within the action budget |
| New retained operation records | 100/account, 1,000 total; serialized cap check |
| Sessions / outstanding challenges | 256 / 128; expired entries pruned |

Exhaustion returns an explicit error; rate limits use HTTP 429 and Retry-After.
Operation capacity stops new preparation, never deletes records or permits resend.
Existing recovery remains available within request limits. These are initial demo
limits, not a sustained ten-user capacity claim. Full target-host load testing and
independent security review remain pending.

Verification: `tests/wallet/hosted-auth.test.mjs` checks cryptographic signatures,
replay/expiry/domain/account/key rejection, browser challenge binding, foreign ID
access across every mutation, unknown quarantine preservation and ten concurrent
session identities. `tests/e2e/next-bridge.test.mjs` covers origins, forged proxy
headers, secret/cookie isolation, JSON limits and no retries. These use local test
keys/transport fixtures; they are not public wallet acceptance. Before opening
trading, verify the actual HTTPS ingress, both pinned wallets, popup/rejection and
interrupted-response recovery on the final Vercel origin.

## Build inventory for a clean target checkout

Use the lockfiles and a Node version satisfying the repository engine requirement
(`>=22.22.2`). Build on the target OS; do not transfer macOS `node_modules` or
PostgreSQL executables to Linux. These commands only install/build application
code and verify the pinned wallet assets:

```sh
npm ci --prefix tests/sandbox
npm ci --prefix services/indexer --include=dev
npm ci --prefix apps/web --include=dev
npm ci --prefix apps/frontend --include=dev
npm run build:wallet --prefix apps/web
npm run build --prefix apps/frontend -- --webpack
```

Current packaging constraints: runtime imports `near-api-js` from
`tests/sandbox/node_modules`, `embedded-postgres` from the indexer's development
dependencies, and `esbuild` from the web package. Omitting those directories or
using `npm ci --omit=dev` breaks startup. This inventory is based on current
imports; Linux container build/import acceptance now passes. Actual host restore and access-boundary checks pass; live RFQ and remaining
monetary lifecycle acceptance remain pending. No contract build or
Sandbox execution is needed merely to serve the existing deployment.

Frontend server environment (not browser-public variables):

```dotenv
HEDGEVEIL_FRONTEND_ORIGIN=http://127.0.0.1:3000
HEDGEVEIL_BACKEND_ORIGIN=http://127.0.0.1:8796
```

These are local values. For hosted mode, set the following on both servers:

```dotenv
HEDGEVEIL_HOSTED_MODE=1
HEDGEVEIL_FRONTEND_ORIGIN=https://hedgeveil.vercel.app
HEDGEVEIL_BACKEND_ORIGIN=https://YOUR-BACKEND-HOST
HEDGEVEIL_BRIDGE_SECRET=<same-64-character-random-hex-secret>
```

Generate the secret into protected secret storage; never paste it into chat or
commit it. The placeholder is not a working credential. Rotate it on both servers
together. Use Railway TLS ingress targeting port 8796; do not expose PostgreSQL.
The hosted wallet API listens on 0.0.0.0 only in this explicit mode. Local-mode
Host/Origin rewriting is not a deployment workaround.
Keep `.env`, `.local`, logs and backups out of git, build contexts and publicly
served directories. Do not use `NEXT_PUBLIC_` for credentials or backend settings.

## State migration and rollback

Migration has not been executed. Before cutover:

1. Record the exact source commit, public contract bindings, finalized ledger
   reconciliation, pending withdrawals and unresolved operation IDs. Resolve
   settlement acceptance blockers before calling this a ready release.
2. Prepare a protected PostgreSQL logical backup using the matching PostgreSQL 18
   tools and a mode-0600 credential file; never print a database URI/password or
   put it in a command argument. Restore into an isolated database without any
   maker/settlement workers and verify schema, receipt counts and cursors.
3. Schedule cutover, stop the old backend gracefully and verify **all** workers
   and its database are stopped. Take the final consistent database backup and
   copy the retained journals, maker state, market evidence, deployment records
   and signer files through encrypted transport. Keep a protected rollback copy.
   A running data-directory copy is not a backup. Do not copy platform-specific
   PostgreSQL binaries/symlinks as the Linux restore procedure.
4. Restore into a workspace owned by a dedicated non-root service user, directory
   mode 0700 and private files 0600. The private-file reader checks ownership and
   rejects symlinks. Inspect a retained `running` lock against the old processes;
   remove it only after proving that its owner is stopped. Never delete journals
   or reset the workspace to make startup succeed.
5. Start exactly one backend from the repository root, then the frontend:

   ```sh
   node services/testnet/cli.mjs serve --name expiry --port 8796
   npm run start --prefix apps/frontend
   ```

6. Check same-block reconciliation, exact existing holdings, unknown-operation
   preservation and actual funded offers. Exercise graceful stop/restart. Do not
   expose the listener until public access and wallet-origin acceptance passes.

Host-specific restore and process-supervisor commands must be finalized after the
host is chosen. A supervisor must deliver SIGTERM, allow workers/database to drain
and leave a crash lock for inspection. Never run old and new schedulers together.
After any new host write, rollback requires transferring its newest journals and
state back; restoring an older snapshot and resending actions is unsafe.

## Remaining release evidence

| Gate | Current evidence / missing acceptance |
| --- | --- |
| Owner deposit, both-leg buy/sell, withdrawal, split/merge | Retained real receipts in `research/reports/BACKEND_RESUME_2026-11-13.md` |
| New-account single first deposit | Local/Sandbox evidence; first-time external wallet run pending |
| Expiry settlement and both-leg redemption | New-profile final lifecycle acceptance pending |
| Settlement signer recovery | `QGtg5ZYzVotHzMzw7Wk2QP3XK8P1XDLap9dNRGW2kh3` is retained as unknown; no timeout-based resend |
| Subsequent ladder renewal | Blocked by unresolved service operation; final receipt acceptance pending |
| Full-block audit | Incomplete/rate-limited; additive only under the approved receipt-reconciliation demo mode |
| Public API isolation and abuse limits | Implemented; local adversarial/ten-session checks pass; final-host and independent acceptance pending |
| Hosted restore, sustained ten-user load, final-origin wallet flow | Pending selected host and executable checks |
| Release candidate and independent review | Fresh rehearsal and independent review pending |

The status page is application telemetry, not an independent uptime monitor.
After hosting, add external reachability monitoring and backup/restore checks;
do not manufacture historical uptime. Vault and production execution stay disabled.

## Vercel frontend setup

Import the repository into Vercel with these settings:

| Setting | Value |
| --- | --- |
| Project name | `hedgeveil`, if available |
| Framework | Next.js |
| Root directory | `apps/frontend` |
| Include source files outside the Root Directory in the Build Step | Enabled; shared SDK, valuation modules and wallet lock live outside this directory |
| Install command | `npm ci --include=dev` |
| Build command | `npm run build -- --webpack` |
| Output directory | Next.js default; do not select static export |
| Node version | Supported version satisfying `>=22.22.2`; use the same version in validation |

`apps/frontend/vercel.json` supplies the framework/install/build settings. The root
`.vercelignore` excludes local state and secrets from CLI uploads; use Git import
from a committed source tree, and inspect uploaded files before any manual upload.
Never upload the private expiry workspace to Vercel.

Use a protected preview for build inspection first. Configure the exact final
frontend/backend HTTPS origins and shared server-only bridge secret as described
above. A preview URL is not automatically trusted; use an isolated backend if a
separate preview origin needs authenticated testing. Do not point the backend
origin at your laptop's loopback address, which would refer to the Vercel function
itself. Actual host restore and final-origin wallet acceptance are still pending.

The existing backend uses a long-running process tree and persistent files, which
do not fit Vercel Functions' request lifecycle and read-only filesystem with
temporary scratch space. Run that backend on the separate persistent host.
Reference: [Vercel monorepo setup](https://vercel.com/docs/monorepos/monorepo-faq)
and [function runtimes](https://vercel.com/docs/functions/runtimes).


## Railway backend container

The backend Dockerfile is `deploy/container/Dockerfile`, built from repository
root. It pins the Node base image by digest, installs locked Linux dependencies,
verifies the pinned wallet executors, and runs as UID/GID 1000. `.dockerignore`
allowlists source inputs and excludes private workspaces, environment files,
local dependencies and compiled targets. No live data is baked into the image.

```sh
docker build --platform linux/amd64 -f deploy/container/Dockerfile -t hedgeveil-backend:preflight .
docker run --rm --platform linux/amd64 --network none --entrypoint node hedgeveil-backend:preflight deploy/container/smoke.mjs
node --test tests/demo/container-workspace.test.mjs tests/demo/deployment-preflight.test.mjs
```

The smoke test uses an isolated temporary PostgreSQL database, exercises the
actual schema and exact amount persistence through database restart, checks
runtime imports and wallet integrity, and rejects an absent deployment workspace.
It does not start makers or settlement workers, load live keys, or submit actions.
This does not replace restoration of actual journals/database on the target host.

Railway settings (public testnet service):

| Setting | Value |
| --- | --- |
| Repository root | `/` (not `apps/frontend`) |
| Config file | `/deploy/container/railway.json` |
| Build | Dockerfile in the configuration above |
| Start | Image entrypoint; no dashboard override |
| Volume mount | `/app/.local/testnet` |
| Volume capacity | Start with 5 GB; monitor growth and backups |
| Replicas | One, one region; never copy these signers to a second worker service |
| Restart | `NEVER` during migration; inspect retained crash locks before restarting |
| Drain | 150 seconds; verify actual host termination behavior |
| Public domain / TCP proxy | HTTPS domain above; authenticated bridge only; no database TCP proxy |
| Automatic deployments / PR environments | Disabled for this stateful signer service |

Use a non-sleeping service. Budget and measure memory/CPU with ten users before
selecting final limits; a container build is not a load test. The Docker image is
also usable on Render with a persistent disk, but do not run both hosts.

Provisioning and state transfer passed on 14 November. Railway volumes can initially
be root-owned. During the isolated restore procedure, set the mount and restored
files to UID/GID 1000 with private permissions. Do not run the backend as root to
work around ownership errors; its startup precheck refuses root. Do not blindly
recursively chmod/chown a live workspace. An empty volume is deliberately rejected:
restore PostgreSQL 18 logically and copy the retained private state before startup.
The precheck also rejects another deployment, unsafe file permissions/symlinks,
missing journal directories, and any retained `running` lock. It never removes
locks or initializes a replacement database. The runtime's atomic lock remains
the actual single-writer guard after this read-only precheck.

A Railway volume prevents overlapping deployments on that volume, but cannot
prevent the old laptop instance from signing. Stop and verify the old instance
before bringing up the restored service. `overlapSeconds: 0` alone is not a
cross-host lock. Reusing a signer on two hosts is forbidden by this runbook.

Hosted mode binds the application listener for Railway ingress. Default local
mode remains loopback-only. Only Vercel's configured server-side gateway may
access the hosted API; direct anonymous backend requests are denied. PostgreSQL
continues to bind loopback. No proxy-header rewriting bypass was introduced.

### Actual cutover and migration procedure

`deploy/container/migrate.mjs` exports a stopped expiry workspace into an
AES-256-GCM encrypted archive, including a PostgreSQL 18 logical INSERT dump and
retained application files. It excludes physical PostgreSQL files and process
locks. `HEDGEVEIL_MIGRATION_HOLD=1` holds the new container before any database,
maker or settlement worker starts. Default/unset or `0` starts the normal guarded
entrypoint. Set it to `0` only after restoring and verifying the workspace.

The export key is stored separately with private permissions. Transfer the encrypted
archive over authenticated SSH; deliver the key through SSH stdin into the restore
process environment, never through command arguments, logs or persistent host
variables. Run restoration as UID/GID 1000 into an absent target. The tool refuses
existing workspaces, traversal/symlinks, tampered archives and table digest mismatch.
On failure, preserve the target for inspection; do not overwrite it or remove locks.
The Mac export currently uses Docker's `host.docker.internal` for the pinned
PostgreSQL 18 dump client. Other export hosts need an explicitly tested connection.

The actual restore matched 1,148 retained files, 12 tables and 2,310 rows. The
empty maker-journals directory was created where absent; no journal records were
reset. A UTC serialization adjustment resolved cross-host timestamp digest formatting
before the successful restore. No failed restore was promoted to the live workspace.
The original laptop runtime was stopped and verified exited before export; no
second signing runtime was started during Linux restore tests.

Railway application PID 1 runs as UID/GID 1000. Its initially root-owned empty
volume mount was assigned narrowly to that UID through an administrative SSH
session. No root service setting was applied. Source uploads exclude private
state; the encrypted migration is separate from the container and frontend builds.

After migration, backup the **current Railway state**, not the stale laptop copy.
A volume is persistence, not an independent backup. Automated scheduled backups
and a target-host restart drill remain acceptance work. Before rollback, drain and
stop Railway, verify no process can sign, export its latest state and restore it on
the rollback host. Never resume the pre-cutover laptop DB/journals after remote writes.

Provider references: [Railway configuration](https://docs.railway.com/config-as-code/reference),
[Railway volume limitations](https://docs.railway.com/volumes/reference).


Local packaging evidence: [backend container checks](../research/reports/backend-container-2026-11-14.json).
The initial clean build correctly rejected changed upstream Meteor bytes. The
existing hash-matching public executors and upstream licenses are now retained
in `apps/web/wallets/executors`; downloads cannot silently upgrade wallet code.

### Railway update discipline

Keep `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0` and `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=150` for the sole signer runtime. Before replacing a runtime, send SIGTERM and allow its normal worker/database drain to finish. Deployment status alone does not prove process shutdown. Never remove ownership locks while their process may still be alive. The 14 November recovery update used explicit graceful shutdown and preserved journals; the replacement deployment started without clearing locks.


## Settlement retry policy and delivery archive

The expiry workspace may contain private `delivery-retry-policies.json`, an object keyed by series ID. Absence means the normal one-request policy. A malformed file fails closed. A policy must satisfy `validateRetryPolicy` in `services/outlayer/delivery-retry.mjs`: version, series ID, original request hash, 2–3 total attempts, 30–600 second backoff, an authorization interval no longer than 15 minutes, and individually reviewed prior request/worker-result hashes. This is a bounded reviewed probe mechanism, not permission for unlimited retries. Do not install a policy merely because the UI says delayed. STALE_TRADE and UNKNOWN are not eligible timeout proofs.

Delivery observations are durably retained under `admin-journal/delivery-observations`. `node scripts/record-delivery-history.mjs` reads the configured expiry workspace and retained FINAL evidence (RPC fallback where needed), writes additive timing records, and never signs or resends. It records source request and resolver callback nanoseconds as decimal strings; executor pickup is null unless separately evidenced. Public state exposes only projected series/request/outcome/timing fields, never raw journals or keys. Retain this directory with the existing persistent volume and backups.
