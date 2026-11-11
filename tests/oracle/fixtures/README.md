# Outlayer documentation example

`outlayer-published-example.json` transcribes the inner JSON response displayed
under “Example response (real output)” in
[Outlayer's signed-price documentation](https://price-oracle.outlayer.ai/docs/),
retrieved through web browsing on 9 November 2026.

**This sample does not verify against the public key printed alongside it.**
Both Node crypto and the independently implemented TweetNaCl verifier return
false. It is a negative interoperability/regression vector, not a verified
historical observation, current price, deployment record or acceptance evidence.
Do not fix/re-sign the example to make an external integration appear successful.

Other signed-intake tests generate local ephemeral keys solely for adversarial
unit tests. Those test payloads never enter a public maker, UI or settlement path.
