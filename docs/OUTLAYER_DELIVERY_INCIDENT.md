# Outlayer testnet settlement delivery incident

## Measurement update: 14 November, 10:53 UTC

[Eight receipt-bound observations](../research/reports/delivery-distribution-2026-11-14.json) are retained: four `YIELD_TIMEOUT`, three `STALE_TRADE`, one `ACCEPTED`. Successful request 44377 reached the resolver callback in 26.650681276 seconds. These span different series/windows and are not a controlled cohort or P99 estimate. The earlier description of four STALE_TRADE failures is not supported by these records; three are evidenced.

The new metric ends at the **resolver callback block**, whereas the earlier failed-request assessment ended at source completion. That extra receipt hop explains timing differences. Executor pickup times remain unknown; delivery latency must not be called pickup latency. Future recoveries record the same metric, and `scripts/record-delivery-history.mjs` backfills retained FINAL evidence without signing. No further paid probes were submitted for this update. The UI exposes observed attempt counts and stops; next eligibility is shown only for a fresh, authorized backoff state. Durable provider results remain an open architecture request; no support message has been sent.


## Update: one controlled retry succeeded

At 10:34 UTC on 14 November, request **44377** delivered the same immutable
historical window successfully. The resolver accepted **3.329403079313 USD/NEAR**
26.651 seconds after the source request. Its exact response replays in Rust and
Python. Finalization, core import, both project-owned redemptions and withdrawal
completed by 10:36 UTC. [Retry receipt](https://testnet.nearblocks.io/txns/2NWCHvCvbr1Jrx7fLt7wSpJmhGpqB8yYWDy9FwtJdBBS).

This establishes variable delivery latency and one successful recovery. It does
not identify the earlier scheduling cause, guarantee future delivery or recover
older cases. Durable authenticated results remain the provider architecture ask.
Only one additional paid attempt was authorized; no overlap or contract change.
[Evidence](../research/reports/sequential-delivery-retry-2026-11-14.json).

The original incident and prepared support request follow for context.

14 November 2026. Prepared for the operator to share; no message has been sent.

## Support request

Our NEAR testnet historical-price worker completes, but its result is submitted
after the on-chain execution request has expired. Our primary request is a
supported, durable authenticated result record that survives yield expiry and
can be verified by a NEAR contract. Please also investigate executor pickup and
result-submission latency for request **44151**, job **105659**, to restore the
current callback integration. An HTTP-only calculation or operator-supplied
replacement price does not satisfy our settlement authentication requirements.

Please clarify:

1. Can a completed result be retrieved independently of yield resume, keyed by
   a canonical input/configuration hash and pinned Wasm hash? What on-chain proof
   or signature verification, signer authorization and key-rotation rules apply?
2. Can a fresh request reuse a previously authenticated execution output for the
   exact same input/Wasm/source, with explicit binding to the new request? Does
   this avoid the original pickup delay?
3. What are testnet pickup and end-to-end submission P50/P99 latencies? Is
   delivery within 150 blocks a supported guarantee or only a target?
4. Why did requests 43889, 43897 and 43906 also fail with
   `Execution request not found`? Please provide enqueue, pickup, execution and
   submission timestamps so we can distinguish discovery lag, scheduling,
   cold-start and submission delay. We have not established identical latency
   across these requests or ruled out load.
5. Is there a supported application-accessible receipt notification/relay path
   to accelerate discovery, or a documented way to warm the pinned worker?

- [Request transaction](https://testnet.nearblocks.io/txns/AMyGrRQFB2Yddx4xF58JYB8GoTTUB2vvH5Vp8ipBppYs)
- [Failed worker result submission](https://testnet.nearblocks.io/txns/G6AM4vsnhntjLndVvb8VhGtj3Tv2qhQDi8g8STeXfLUH)
- Result signer: `worker.outlayer.testnet`.
- Method: `submit_execution_output_and_resolve`.
- Request: block **277641372**, 09:56:47.209811455 UTC.
- Failed yielded callback: block **277641573**, 09:58:41.595511504 UTC.
- Elapsed: **201 blocks / 114.385700049 seconds**.
- Provider job record: 09:59:05.509 UTC; reported execution time **881 ms**.
- Worker-submitted arguments: `success: true`, `error: null`, JSON calculation
  plus historical trade evidence.
- Submission failed with `Execution request not found` at `src/execution.rs:1023`.
- The callback returned null; our resolver rejected it and did not finalize.
- Request paid 0.02 test NEAR; source contract refunded 0.019 test NEAR in receipts.

The market expired at 09:56:42 UTC. Our request followed approximately five
seconds later. The fixed Wasm is
`86b6d24556ca55356ff37421cbcbcf3a8e021d543fbdb04bb3a55d6ec365ac43`.
It fetches Coinbase NEAR-USD trades for the fixed preceding 30 minutes. Replaying
the exact output in the failed worker submission matches both our Rust and
independent Python arithmetic at **3.329403079313 USD/NEAR**. This establishes
calculation agreement, not an accepted settlement or independent TEE attestation.

Similar earlier requests 43889, 43897 and 43906 also failed result submission
with `Execution request not found`. Separate older requests 43911, 43917 and
43926 failed the worker's `STALE_TRADE` rule; those are different data-quality
failures and are not silently repriced.

## Application disposition

The current pair remains backed by 0.01 NEAR. No payout was credited; no paid
request was automatically repeated. Finalized request receipts have reconciled,
and both makers returned funded P/N offers at 10:00:50 UTC. Existing rejected
series retain their terms. A provider fix must be followed by actual accepted
callback, finalization/import, exact redemption and successful withdrawal checks
before new-profile settlement can be called complete.

[Retained evidence](../research/reports/timely-settlement-delivery-failure-2026-11-14.json)
includes failure details, replay output, receipt timing and the public quote check.

## Recovery design assessment — 14 November 2026

[NEAR yield documentation](https://docs.near.org/smart-contracts/anatomy/yield-resume)
describes a 200-block timeout. The observed 201-block callback completion is
consistent with that limit; 114.386 seconds is this request's observed elapsed
time, not a configurable fixed timeout in seconds. Increasing the worker's
`max_execution_seconds` does not extend the yielded promise's lifetime.

The deployed Hedgeveil resolver allows one pending request per series
(`contracts/expiry-settlement/src/lib.rs`, `request`) and accepts only the
matching private callback (`on_result`). Requests staggered at expiry +5, +50
and +95 seconds would hit `pending or immutable result`; the existing duplicate
guard is not a concurrent first-success collector. Requests made directly to
Outlayer would not deliver accepted evidence into this resolver.

Even with a redesigned collector, staggering does not extend any request's own
deadline. A constant 138-second per-request pickup delay would defeat every
approximately 114-second window. Overlap could help variable latency, worker
warm-up or authenticated cache reuse, but these are hypotheses, not evidence.
The observed 0.019-NEAR refund is not guaranteed for future attempts. A proposed
three-attempt experiment must budget the full 0.06 test NEAR plus gas, retain
each distinct intent/result, and never resend UNKNOWN operations. No such
experiment or new paid request has been executed for this assessment.

A pre-expiry settlement request is rejected by the deployed resolver. A separate
throwaway warm-up could test cold-start behavior, but cannot provide evidence
for a window that has not ended and must never be used as its settlement result.

For a future durable delivery integration, bind verified output to the full
immutable profile: network/domain, intended resolver or explicitly permitted
reuse scope, source, exact window, selection/validation rules, pinned Wasm and
input/configuration hash. Verify authorized provenance and recompute evidence;
a config hash alone authenticates nothing. Accept once, reject conflicting or
replayed outputs, and prevent late failed callbacks from clearing acceptance.
Delivery time must not change the selected window. Preserve authenticated
evidence promptly: the current worker's bounded historical retrieval can fail
later even when the intended window is immutable. Identical validated evidence
replays deterministically; identical successful retrieval on every retry is not
guaranteed.

Dependencies: a documented provider result/verification interface, SPEC revision,
new integration/deployment compatibility review and adversarial callback tests.
Invariant: no alternative source, operator fallback price, altered old terms or
timeout-authorized payout. Failure path: missing/invalid/conflicting evidence
keeps settlement pending and backing intact. Acceptance requires real retained
result verification, finalization/import, exact redemption and confirmed
withdrawal. Status: design proposal only; independent reviewer pending.

## Sequential retry assessment — 14 November 2026, 10:25 UTC

Read-only remeasurement of seven existing requests establishes variation in
end-to-end callback timing, without spending more test NEAR:

| Request | Callback elapsed | Blocks | Outcome |
| --- | ---: | ---: | --- |
| 43889 | 106.518 s | 201 | Yield expired; later submission rejected |
| 43897 | 115.018 s | 201 | Yield expired; later submission rejected |
| 43906 | 122.023 s | 201 | Yield expired; later submission rejected |
| 43911 | 98.715 s | 163 | Worker returned STALE_TRADE |
| 43917 | 64.913 s | 107 | Worker returned STALE_TRADE |
| 43926 | 102.570 s | 180 | Worker returned STALE_TRADE |
| 44151 | 114.386 s | 201 | Yield expired; later submission rejected |

Thus some error results arrived within the deadline; a fixed 138-second delay
is not established. Successful authenticated price delivery is still unproven.
Provider `created_at` offsets range from 66.150 to 183.488 seconds and can follow
the failed callback; that field must not be called pickup time without provider
confirmation. The previously described late job record is not, on its own,
proof that execution started late. This sample covers roughly 09:11–09:59 UTC,
not different times of day or a reliable latency distribution.

Keep single-pending unchanged. A future capped sequential retry scheduler needs
no resolver change, but must use a new immutable journal intent per attempt,
verify the previous request's FINAL receipts and a fresh matching REJECTED case
with pending/accepted/price all null, enforce backoff and a total spend cap, and
stop on UNKNOWN, acceptance or exhausted budget. A null callback clears the
pending request; it leaves settlement unresolved, not a pending request. Never
retry deterministic STALE_TRADE/evidence-validation failures as a delivery fix.
A null alone does not classify the failure: retain source receipts and provider
diagnostics before deciding eligibility. The present coordinator deliberately
halts after rejection and has no such retry scheduler yet.

Next experiment should target a recent valid historical window, use read-only
history preflight to avoid known retrieval/validation failures, and stop at the
configured attempt cap. Preflight is diagnostic, not authentication. No new paid
probe or runtime change was performed. Provider-independent result verification
remains the architectural solution; alternative source/operator pricing remains
excluded. [Measured evidence](../research/reports/outlayer-latency-assessment-2026-11-14.json).
