# Hosted deployment preparation

14 November 2026. **Public launch is blocked.** This runbook prepares the current
options demo for hosting; it does not authorize production or mark G9 complete.
The root [plan](../IMPLEMENTATION_PLAN.md) remains authoritative. The user selected
Vercel for the frontend, targeting `hedgeveil.vercel.app` (availability unverified).
Railway is the recommended persistent backend from the user's Render/Railway
choices. No server, DNS record or public listener has been created.

## Current topology

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

## Public access boundary: implement before exposing the application

The bridge in `apps/frontend/lib/desk-bridge.ts` currently accepts loopback HTTP
origins only. `apps/web/server.mjs` exposes a local, shared operation journal.
Wallet connection is not authentication: knowing an account name or an operation
ID must not allow one user to list or mutate another user's operation records.

Required changes and acceptance:

1. Configure one explicit HTTPS frontend origin with exact Host/Origin checks,
   secure session cookies, CSRF protection and trusted-proxy handling. Keep the
   backend and database on loopback. Test cross-origin and forged proxy headers.
2. Establish verifiable per-user operation ownership. Bind prepare, list, handoff,
   cancel, recovery and remembered hashes to that owner. Test two separate browser
   sessions/accounts against every operation endpoint, including guessed IDs.
   A frontend filter alone is insufficient. Preserve the existing local journal
   and quarantine semantics during migration.
3. Bound requests per session and client, concurrent RFQs, prepared operations
   and recovery requests. Test overflow and sustained ten-user load. Preserve
   recovery availability without allowing unauthenticated journal exhaustion.
4. Confirm wallet executors, CSP, callbacks, rejection and interrupted response
   recovery on the final HTTPS origin. No backend user-wallet signing authority.

Do not reverse-proxy a public origin into the loopback bridge by rewriting Host
and Origin to bypass these checks. Until these requirements pass, any remote
staging installation must be reachable only through an operator SSH tunnel or
an equivalent private network. It is not a multi-user public demo.

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
imports; Linux container build/import acceptance now passes. Actual host restore
and live service acceptance remain pending. No contract build or
Sandbox execution is needed merely to serve the existing deployment.

Frontend server environment (not browser-public variables):

```dotenv
HEDGEVEIL_FRONTEND_ORIGIN=http://127.0.0.1:3000
HEDGEVEIL_BACKEND_ORIGIN=http://127.0.0.1:8796
```

These are **private staging** values, not final public-origin configuration.
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
| Public API isolation and abuse limits | Implementation and cross-user acceptance required |
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

Use a protected preview for build inspection first. This configuration is a
**build preparation**, not a working public trading deployment: desk APIs, spot,
wallet executors and status still use the loopback-only bridge. Setting
`HEDGEVEIL_FRONTEND_ORIGIN=https://hedgeveil.vercel.app` currently fails validation.
Do not point `HEDGEVEIL_BACKEND_ORIGIN` at your laptop's `127.0.0.1`; that address
would refer to the Vercel function itself. Secure hosted bridge support and its
backend authentication must land before configuring the final server-only values.
Do not infer trusted origins from arbitrary preview Host headers.

The existing backend uses a long-running process tree and persistent files, which
do not fit Vercel Functions' request lifecycle and read-only filesystem with
temporary scratch space. Run that backend on the separate persistent host.
Reference: [Vercel monorepo setup](https://vercel.com/docs/monorepos/monorepo-faq)
and [function runtimes](https://vercel.com/docs/functions/runtimes).


## Railway backend container (private staging only)

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

Railway settings for the eventual private staging service:

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
| Public domain / TCP proxy | None until authenticated gateway acceptance |
| Automatic deployments / PR environments | Disabled for this stateful signer service |

Use a non-sleeping service. Budget and measure memory/CPU with ten users before
selecting final limits; a container build is not a load test. The Docker image is
also usable on Render with a persistent disk, but do not run both hosts.

Provisioning and state transfer are still pending. Railway volumes can initially
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

This image currently listens on **container loopback only**. It is packaging for
private staging, not a public Railway API. Vercel cannot call this loopback
listener. The authenticated gateway and user-owned operation sessions described
above must be implemented and tested before connecting the two hosts. Do not
use public proxy header rewriting as a shortcut.

Provider references: [Railway configuration](https://docs.railway.com/config-as-code/reference),
[Railway volume limitations](https://docs.railway.com/volumes/reference).


Local packaging evidence: [backend container checks](../research/reports/backend-container-2026-11-14.json).
The initial clean build correctly rejected changed upstream Meteor bytes. The
existing hash-matching public executors and upstream licenses are now retained
in `apps/web/wallets/executors`; downloads cannot silently upgrade wallet code.
