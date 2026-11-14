#!/bin/sh
set -eu
cd /app
node deploy/container/check-workspace.mjs
exec node services/testnet/cli.mjs serve --name expiry --port 8796
