CREATE TABLE IF NOT EXISTS meta (
    id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL CHECK(version=1),
    binding jsonb NOT NULL, cursor_hash text NOT NULL, cursor_height bigint NOT NULL,
    generation bigint NOT NULL DEFAULT 0, checked_at timestamptz, health jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
    hash text PRIMARY KEY, height bigint UNIQUE NOT NULL, prev_hash text NOT NULL,
    timestamp_ns numeric(20,0) NOT NULL, body jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
    hash text PRIMARY KEY, signer text NOT NULL, receiver text NOT NULL,
    inclusion_hash text NOT NULL REFERENCES blocks(hash), body jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS outcomes (
    id text PRIMARY KEY, tx_hash text NOT NULL REFERENCES transactions(hash),
    block_hash text NOT NULL, executor text NOT NULL, body jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS receipt_links (
    parent text NOT NULL REFERENCES outcomes(id), child text NOT NULL REFERENCES outcomes(id),
    PRIMARY KEY(parent,child)
);
CREATE TABLE IF NOT EXISTS events (
    receipt_id text NOT NULL REFERENCES outcomes(id), log_index integer NOT NULL,
    item_index integer NOT NULL, contract text NOT NULL, kind text NOT NULL,
    name text NOT NULL, payload jsonb NOT NULL, sequence bigint,
    PRIMARY KEY(receipt_id,log_index,item_index), UNIQUE(contract,sequence)
);
CREATE TABLE IF NOT EXISTS balances (
    contract text NOT NULL, owner text NOT NULL, bucket text NOT NULL,
    ledger_id text NOT NULL, asset text NOT NULL, amount numeric(39,0) NOT NULL,
    CHECK(amount>0 AND amount<340282366920938463463374607431768211456),
    PRIMARY KEY(contract,owner,bucket,ledger_id,asset)
);
CREATE TABLE IF NOT EXISTS snapshots (
    contract text PRIMARY KEY, kind text NOT NULL, block_hash text NOT NULL REFERENCES blocks(hash),
    body jsonb NOT NULL, reconciliation jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
    code text NOT NULL, contract text NOT NULL, entity text NOT NULL, severity text NOT NULL,
    PRIMARY KEY(code,contract,entity)
);
CREATE INDEX IF NOT EXISTS outcome_block ON outcomes(block_hash);
CREATE INDEX IF NOT EXISTS event_contract_sequence ON events(contract,sequence);
CREATE TABLE IF NOT EXISTS rpc_cache (
    key text PRIMARY KEY, body jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rpc_cache_age ON rpc_cache(created_at);
CREATE TABLE IF NOT EXISTS feed_cursor (
    id integer PRIMARY KEY CHECK(id=1), baseline_height bigint NOT NULL,
    baseline_hash text NOT NULL, height bigint NOT NULL, block_height bigint NOT NULL,
    block_hash text NOT NULL, observed_height bigint NOT NULL,
    state text NOT NULL, checked_at timestamptz
);
CREATE TABLE IF NOT EXISTS feed_candidates (
    hash text PRIMARY KEY, signer_id text NOT NULL, discovered_height bigint NOT NULL
);
ALTER TABLE feed_cursor ADD COLUMN IF NOT EXISTS retry_at_ms bigint NOT NULL DEFAULT 0;
