# APP-02 local page navigation fix

The local-origin guard rejected every `Sec-Fetch-Site: cross-site` request,
including a normal top-level link to the wallet desk. Chromium reproduced the
reported `403 {"error":"LOCAL_ORIGIN_ONLY"}` when following a link from
`localhost` to `127.0.0.1`.

The guard now permits only `GET /` (including query parameters) with fetch mode
`navigate` and destination `document`. Exact loopback Host and supplied Origin
checks still apply. API navigation, cross-site fetches, frames, assets and all
POST routes retain their previous origin restrictions. Query parameters remain
untrusted recovery hints; this change authorizes no transaction.

Dependencies: APP-01/02 local gateway and existing wallet desk assets. Invariant:
opening the document cannot authorize a send or expose the journal to another
origin. Failure path: foreign Host/Origin, API or frame navigation and cross-site
writes return `LOCAL_ORIGIN_ONLY`. Reviewer: Product/QA/security and independent
review **pending**.

Validation:

```sh
node --test tests/e2e/origin.test.mjs
```

- 40 HTTP cases plus the parent test and a real Chromium test: **42 passed**.
- Chromium verifies the actual cross-site request metadata, successful app load,
  Meteor/Intear picker rendering, reload and absence of browser exceptions.
- The same external navigation failed before the fix. Raw Node HTTP is used for
  the header matrix because Node fetch overwrites `Sec-Fetch-Mode` with `cors`.
- Locked root/contracts workspace tests, format and Clippy passed (contracts use
  the Wasm target). Five reference tests, 565 vectors, schema regeneration/check,
  11 schema tests and 9 release packaging tests passed.

The release rehearsal now runs this regression after installing Chromium and
verifying wallet assets. Prior wallet reports remain historical snapshots of
their recorded source; this follow-up changes the server guard, not their
recorded receipts. No contract, payout, deployment or wallet acceptance gate was
changed. Public testnet/vendor signing and independent review remain pending.

Restart the existing wallet process with `npm --prefix apps/web run wallet` to
load the fix, then reopen `http://127.0.0.1:8790/`.
