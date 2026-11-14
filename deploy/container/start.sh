#!/bin/sh
set -eu
cd /app
if [ "${HEDGEVEIL_MIGRATION_HOLD:-0}" = "1" ]; then
    # No sockets, database, keys or workers are opened during restore.
    exec node -e 'console.log("MIGRATION_HOLD: workers disabled"); setInterval(() => {}, 60000); process.on("SIGTERM", () => process.exit(0));'
fi
node deploy/container/check-workspace.mjs
exec node services/testnet/cli.mjs serve --name expiry --port 8796
