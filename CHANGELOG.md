# Changelog

## 2.2.0

Updated for the TouchQue 3.2.0 server SDKs (Node, Python, PHP, Go).

- Bundled docs and types regenerated from the 3.2.0 SDKs. The type bundles now
  also carry device-proof verification, `login` with `reportFraud`, the Go
  `RequireOptions`, the Python/PHP framework adapters and the public part of
  every relay router (`scripts/sync-bundled.js`).
- `validate_integration`:
  - The relay routers count as route protection in every language, not only
    Node's `touchqueRouter`: Python `touchque_relay_blueprint` /
    `touchque_relay_router` / `touchque_relay_view` / `touchque_relay_urls` /
    `RelayHandler`, PHP `TouchQueRelay::routes` / `RelayHandler`, Go
    `touchque.NewRelayHandler`.
  - New scored Go check `go_options_user_required`: a
    `touchque.RequireOptions{…}` without `User:` or a `touchque.RelayOptions{…}`
    without `UserID:` panics at startup since SDK 3.1.1 / 3.2.0.
  - New advisory `unpinned_approval_proof`: device proof verified with
    `allowUnpinnedKey` (any language) — trust on first use only; pin the key.
  - New hint `approval_proof_not_verified`: code acts on a confirmed/approved
    request but never verifies the device proof.
- `integrate_touchque` and `audit_touchque_integration` prompts cover the relay
  routers in all four languages, pinned device-proof verification and fraud
  reports for chargebacks and account takeover.
- `touchque_help` lists the 3.2.0 features.

## 2.1.0

- Offline QR linked to its push (`requestId`, reject kills the QR) and number
  matching (`challengeCode`); bundled SDK docs regenerated.
