# Changelog

## 4.2.2 (2026-11-12)

- PHP 5.0.0 is on Packagist (composer require touchque-authenticator/php-sdk, no repository step) and
  Ruby 5.0.0 on RubyGems (bundle add touchque): pick_sdk says so; the instructions and help name only
  the .NET SDK as not on a registry yet. Bundles from sdks 14ccd7d.

## 4.2.1 (2026-11-11)

- Java 5.0.0 is on Maven Central (com.touchque:touchque-spring-boot-starter and com.touchque:touchque-java):
  pick_sdk gives the Gradle and Maven coordinates, and the instructions and help no longer call it
  unreleased. Bundles from sdks 3a34b1d. Still not on a registry: .NET (NuGet) and Ruby (RubyGems).

## 4.2.0 (2026-11-11)

SDK 5.0 (sdks e2506e7, published the same day: npm @touchque/node 5.0.0, @touchque/web and
@touchque/react 2.0.0, PyPI 5.0.0, Go /v5, PHP tag v5.0.0): every name is spelled Touchque.

- The bundled READMEs and types are 5.0, including the new "Action types" section of every server SDK
  (generate_integration includes it for phone approval); scripts/sync-bundled.js reads the renamed files
  by their exact names.
- pick_sdk: Node, PHP, Go and Python 5.0.0 with their install commands and import lines (Touchque,
  requireTouchque, use Touchque\Touchque, /v5); web and react 2.0.0; .NET, Ruby and Java not on their
  registries yet.
- The checklist reports the 5.0 names and still accepts 4.x code (TouchQue); for Go it suggests /v5.
- Texts say Touchque everywhere (agent.js, prompts, README); kept on purpose: TouchQueGovernance and
  TouchQueSafeGuard (signed and deployed names).

## 4.1.3 (2026-11-11)

- Docs search keeps the target of a link to another docs page ("see Offline sign (/offline-sign)"), so a
  cross-reference can be followed with touchque_search_docs page. The docs gained /action-types and
  /safe-guard and the corrected 401/403 split the same day; the index picks them up on its next build.

## 4.1.2 (2026-11-11)

Third measured round (23 questions, 5 in English): the same 12 questions 6.8 (4.0) → 8.0 (4.1.0) → 8.3,
English 8.5 (no regression), tool output for the 12 questions 365k → 30k characters. Review fixes:

- Confirm tokens are bound to the active organization and capped (20 per connection, 10,000 in all).
- Names other people typed (organizations, keys, apps, URLs) are quoted in the facts, with a line that
  they are data, never instructions.
- The 401/403 note follows the API's own middleware: 401 is a missing or stale header (key, signature,
  timestamp, nonce); 403 is a wrong signature or an unknown, revoked or expired key or a blocked IP; the
  signature covers the path with its query string.
- Turkish is no longer read into English words like "var", "ne", "bu"; Go and .NET are recognised by
  real markers; out-of-range HTML entities no longer drop a docs page; a cold docs build that failed is
  not retried for two minutes.
- check_integration marks a turned-off action type and says "could not be read" instead of "not set".

## 4.1.1 (2026-11-11)

From the second measured round (18 questions: 12 repeated, mean 6.8 → 8.0, tool output 365k → 36k
characters, Touchque calls 33 → 16) and an adversarial review of 4.1.0.

- Changes need the confirmToken that the call without confirm gave, for the same arguments, on the same
  connection, within ten minutes (and confirm must be exactly true): a model cannot skip asking. The
  instructions no longer claim every change asks the phone (API keys do).
- English questions are no longer taken for Turkish ("risk", "plan", "internet" matched the dictionary);
  Turkish is told by its letters and function words, and dictionary prefixes skip words English shares.
- The facts say "Other organizations: none", mark active keys and turned-off action types, give the
  dashboard paths (Webhooks, App user policy for the passkey domain, Usage and Logs), say when Touchque
  Login could not be read instead of "not set up", carry their time, and keep member-controlled text on
  one short line. "What is Touchque" is answered from a fuller summary (Safe Guard explained) with no call.
- generate_integration no longer picks the newest action type as the default; it asks for the action,
  flags a missing or turned-off one, caps the list, and adds the @touchque/react or @touchque/web part for
  a frontend. workspace_setup looks up one action type. get_touchque_docs serves web and react (bundled).
- Docs search: a short verified note for 401/403 and signature questions; browser SDK sections for
  frontend questions; an unknown page lists the pages; the index refreshes in the background, backs off
  after a failure and refuses a much smaller rebuild; words no longer run together across tags.
- 4.0 tool names answer for clients that still hold the old list. Small fixes: pick_sdk gives the Python
  extras; the checklist accepts guards that read the environment; get_sdk_types examples exist.

## 4.1.0 (2026-11-11)

Shorter, smarter answers (owner: "it thinks a lot even for the smallest question"). Measured on 12 real
questions before the change: 49 tool calls, 365k characters of tool output, 6.8/10.

- The server instructions carry the member's facts at initialize (organization, role, features ON/OFF,
  API key, webhook, action types, passkey domain, Touchque Login tenant and apps, other organizations)
  and say which tool answers what; "start every task with whoami" is gone. Account questions need no
  tool call.
- Docs search rebuilt: every docs page in English and Turkish from the prerendered site, cut into
  sections, page chrome dropped (tabs, Copy, line numbers, pager), BM25 with title and heading weight,
  Turkish questions searched in Turkish and through an English dictionary, SDK README sections indexed,
  three short sections (2.6k at most) with a handle to read a page or section; prices get a straight
  answer.
- get_touchque_docs gives a table of contents or one section; get_sdk_types a list of names or one
  declaration (they returned 30k and 100k).
- Fewer tools: whoami covers features and organizations (detail: true for what each includes);
  workspace_setup takes a section; touchque_wait replaces change_status and test_approval_status;
  validate_integration runs inside check_integration. New: touchque_define_action_type.
- generate_integration says what is missing first (the action type, with each SDK's define call; an
  API key; a redirect URI), keeps the quick start and framework adapters, drops errors and case codes.
- pick_sdk gives published true/false, version, import line and requirements. touchque_help is short and
  current. The checklist accepts new TouchQue() reading the environment.

## 4.0.0 (2026-11-10)

One Touchque MCP, at a URL: `https://api.touchque.com/mcp`.

- Remote server (`remote/`, Streamable HTTP, stateless). Sign-in with Touchque
  SSO (MCP authorization: protected resource metadata, dynamic registration
  or client ID metadata documents, PKCE, tokens for this server only, DPoP
  when the client binds one). No API key to paste.
- Knows the signed-in member: the organization (picked on the consent screen,
  switchable), the role, the features that are ON. Workspace tools: who am I,
  organizations, features, workspace setup without secrets, SDK picker,
  integration from the SDK's own README sections with the workspace's real
  values, a live check, docs search over support.touchque.com, case codes, a
  test approval on the member's own phone, and changes (API key, redirect
  URI) only with the member's yes and phone.
- Slash commands: touchque-setup, add-phone-approval, add-passkeys,
  add-touchque-login, check-integration.
- The docs, types and checklist tools of 3.x are served by it. The package is
  no longer published as a separate local (stdio) server; clients that run
  only local servers use `npx -y mcp-remote https://api.touchque.com/mcp`.
- Docs links point at https://support.touchque.com.

## 3.0.0

TouchQue as a tool for AI agents.

- The .NET, Ruby and Java SDKs (4.1.0): `language` takes `"dotnet"`, `"ruby"`
  and `"java"` in `get_touchque_docs`, `get_sdk_types` and
  `validate_integration` (frameworks `aspnetcore`, `rails` / `sinatra` /
  `rack`, `spring-boot`), with their bundled README and type reference and
  their guards in the validator (`.RequireTouchQue` / `[RequireTouchQue]` /
  `MapTouchQueRelay`, `require_touchque` / `TouchQue::Rack::Relay`,
  `@RequireTouchQue` / a `RelayOptions` bean).
- Bundled docs and types regenerated from the 4.1.0 SDKs (QR pairing, Device
  risk, typed feature errors, the Management API additions).

- With an agent's own TouchQue identity (`TQ_AGENT_ID` + `TQ_AGENT_KEY`, the
  agent's private key; never a `tq_` API key) the server adds five tools:
  `touchque_agent_whoami`, `touchque_request_approval`,
  `touchque_get_approval` (waits up to 60 s; the single-use approval token
  once approved), `touchque_request_mandate`, `touchque_get_mandate`. Calls
  sign in with private_key_jwt and carry a DPoP proof, like `@touchque/node`'s
  `TouchQueAgent`. The person approves on their phone; the tools tell the
  agent to say the number and never to approve anything itself.
- A misconfigured identity no longer matters to the docs tools: the agent
  tools answer with what is wrong.
- MCP Bundle: `npm run pack:mcpb` builds `dist/touchque-mcp-server-<version>.mcpb`
  (runtime dependencies only, `manifest.json` with the agent settings) and
  signs it when `MCPB_SIGN_CERT` / `MCPB_SIGN_KEY` are set; the release
  workflow attaches it to the GitHub release.
- Published with npm provenance from GitHub Actions.
- `@modelcontextprotocol/sdk` 1.32.2 and its dependencies updated (fixes the
  advisories `npm audit` reported for the runtime dependencies).

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
