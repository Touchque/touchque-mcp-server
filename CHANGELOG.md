# Changelog

## 2.4.0

Updated for the TouchQue 4.0.0 server SDKs, `@touchque/web` 1.5.0 and
`@touchque/react` 1.1.0 (3.4 to 3.7 ship inside 4.0.0).

- Bundled docs and types regenerated from the 4.0.0 SDKs: TouchQue Actions,
  action types under `actionTypes`, `context`, `onChallenge` on the blocking
  `verify()`, "Why?" case codes, silent sign-ins, Never Locked Out recovery
  and the Vishing Shield.
- The Go package is `github.com/Touchque/touchque-go/v4`.
- `touchque_help`, the server instructions and the prompts define action
  types with `tq.actionTypes.define` and list what is new in 4.0.0.
- `validate_integration`:
  - The blocking-`verify()` check says how to show the number first
    (`onChallenge`) for jobs, CLIs and sockets.
  - New unscored advisories: `action_types_renamed` (a pre-4.0
    `actions.define` call in any language, which fails on 4.x) and
    `go_module_not_v4` (a Go import of an older major).

## 2.3.0

Updated for the TouchQue 3.3.0 server SDKs and `@touchque/web` 1.2.0.

- Bundled docs and types regenerated from the 3.3.0 SDKs: the Next.js `ip` /
  `trustedProxyHops` options and the Vercel / Cloudflare presets, Go's
  end-user address (`RequireOptions.IP`, no port), `telemetryToken`, and the
  `PASSKEY_ENROLL` approval before a passkey is added.
- `touchque_help` and the server instructions list what is new in 3.3.0.
- `validate_integration` has two new unscored advisories:
  - `client_ip_from_leftmost_xff`: the end user's address is read from the
    leftmost `X-Forwarded-For` hop, which the client controls, so an
    attacker can pick the address the risk checks see. Any language.
  - `nextjs_no_client_ip`: a Next.js `withTouchQue` with neither `ip` nor
    `trustedProxyHops`, so the address-based risk checks are skipped.

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
