# Pinned public wallet executors

These are unchanged public browser executors from the existing wallet lock,
retained to make clean builds independent of mutable upstream download URLs.
They contain no local wallet state or account keys. Every load still verifies
the complete SHA-256 against `../lock.json`; a mismatch fails closed.

- Meteor Wallet: `meteor_wallet_sdk`, GPL-3.0. Original download and digest in
  the lock. Source: https://github.com/Meteor-Wallet/meteor_wallet_sdk
- Intear Wallet: `INTEARnear/wallet`, AGPL-3.0. Original download and digest in
  the lock. Source: https://github.com/INTEARnear/wallet

Upstream license texts are retained beside the executors. Bundled attribution
comments are unchanged. These third-party files keep their upstream licenses;
they are not authored by Hedgeveil.

On 14 November 2026 the Meteor `latest` URL returned a different artifact from
the previously pinned one. The existing locally retained artifact matched the
lock exactly and was copied here. No permissions, metadata, hash or wallet code
was upgraded. Future upgrades require explicit review and wallet acceptance.
