# ADR 0002: adopt the Open Innovation public-ledger plan

Status: accepted by the user's revised implementation plan, 7 November 2026.

Target `open`. Native NEAR collateral backs complementary public P/N claims, a
funded public RFQ market and one public rules-based USD-tracking vault. Use one
narrow clearinghouse with a separate versioned settlement oracle. Critical
internal asset changes remain atomic within one receipt.

Retain payoff math, reference vectors, integer validation, repository checks and
financial loss disclosures. Replace the note/public-input schema with a new
versioned public-ledger schema. Retire the old private-quantity restrictions;
account balances, reserve/supply changes, trade history and vault shares are
public and auditable.

Move ZK, private AI, encrypted RFQ/note-recovery work and all their dependencies,
fixtures, commands and evidence under `archive/privacy-track`. Preserve bytes and
historical deployment records; they are not current G1 evidence or future backlog.
Do not import archived modules into active builds. Do not contact AI services,
request inference keys or resume circuit work for this release.

Default development to Sandbox; use separately configured faucet-funded testnet
and synthetic prices for the public demo. Do not repurpose the old verifier
account as the new clearinghouse. Mainnet and paid fallbacks remain disabled by
default. Existing ignored secrets/local state are user-managed and are not copied
into source or silently rewritten.

G1 now measures runtime/toolchain, P/N and share-token interface coexistence,
the demo oracle boundary, and withdrawal quarantine/recovery. Target standards
only after full callback/resolver/storage conformance; an internal ledger is the
honest interim interface. G9 is the hackathon completion gate. Production
historical oracles, reviewed payout recovery and independent audit belong to G10;
additional trust boundaries belong to G11.

No live deployment, key revocation, trade or public submission is needed for this
repository migration. Archive preservation is not endorsement of obsolete claims.
