# touchque (Ruby)

The official Ruby server SDK for [TouchQue](https://touchque.com): push approvals with number
matching, passkeys, silent sign-ins, offline codes, verified webhooks, TouchQue Actions, AI agent
approvals, TouchQue Login (hosted sign-in and the Management API) and the server side of the
Mobile SDK. Rails integration included (a Railtie and controller concerns), plus a Rack relay for
Sinatra and any Rack app.

Ruby 3.1+, no runtime dependencies beyond the standard library (`net/http`, `openssl`, `json`).

📘 Full docs: **[authenticator.touchque.com/docs](https://authenticator.touchque.com/docs)**

## Install

```ruby
# Gemfile
gem "touchque"
```

## Setup

Get an API key and secret from your [TouchQue dashboard](https://authenticator.touchque.com):

```bash
export TQ_API_KEY=tq_auth_your_key
export TQ_API_SECRET=your_api_secret
```

The secret signs every request: it belongs on your server only, never in a browser or an app.

```ruby
tq = TouchQue.client                                             # from the environment, shared
tq = TouchQue::Client.new(api_key: "tq_...", api_secret: "...")   # explicit
```

In Rails the Railtie reads `config.touchque` (or `credentials.touchque`, then the environment):

```ruby
# config/application.rb
config.touchque.api_key = Rails.application.credentials.dig(:touchque, :api_key)
config.touchque.api_secret = Rails.application.credentials.dig(:touchque, :api_secret)
```

## Quick start (Rails)

One line per protected action:

```ruby
class TransfersController < ApplicationController
  include TouchQue::Rails::Guard
  require_touchque "SEND_MONEY", only: :create,
                   details: -> { { "Amount" => params.require(:amount), "To" => params.require(:to) } }

  def create
    touchque_approval   # only reached once the user approved on their phone
  end
end
```

Until the user approves on their phone the action answers
**`202 {"touchque": step, "token": "..."}`**. Your page shows `step` in its own design (the
matching number, or a QR code the first time the user links the app) and sends the same request
again with header `X-TouchQue-Token: <token>`; [`@touchque/web`](https://www.npmjs.com/package/@touchque/web)
does this loop for you. Once approved the action runs **once**. Refusals answer 403 (rejected,
blocked), 408 (expired), 423 (frozen) or 429 (rate limited) with `Retry-After`.

The approving user is `current_user`'s email (else id, else username). For your login action
(nobody is signed in yet) pass `user: -> { session[:password_verified_user] }`.

**The end user's address.** The risk checks (Tor, location, impossible travel) and the location
shown on the phone use `request.remote_ip`: configure `config.action_dispatch.trusted_proxies`
behind a load balancer.

## The three primitives (any framework)

```ruby
step = tq.start("SEND_MONEY", "jane@acme.com", details: { "Amount" => "250 EUR" })
# step["state"]: waiting (show step["number"]) | enroll (show step["enroll"]["qrCodeDataUrl"]) | passkey_required | blocked | frozen | rate_limited
now = tq.check(step["requestId"])
approval = tq.complete(step["requestId"], "jane@acme.com", "SEND_MONEY", details: { "Amount" => "250 EUR" })
# uses the approval once, and only for this user, action and amount
```

`TouchQue::Guard.run(tq, user, action, token:, offline:, code:, ...)` is the whole two-phase
contract for Sinatra, Hanami or plain Rack.

## Waiting in one call

```ruby
result = tq.login.verify("jane@acme.com", type: "LOGIN", client_ip: request.remote_ip, user_agent: request.user_agent) do |c|
  # Number matching: show the number now; the phone asks for it.
  notify("Pick #{c["challengeCode"]} on your phone") if c["challengeCode"]
end
```

`verify` raises `TouchQue::RejectedError`, `TouchQue::TimeoutError` or
`TouchQue::PasskeyRequiredError` (`reason` "policy": approve with a passkey; "step_up": the user
tapped Approve during a call and the request now waits for a passkey).

## Relay routes for `@touchque/web`

```ruby
# config/routes.rb
mount TouchQue::Rack::Relay.new(
  get_user_id: ->(req) { req.session["user_email"] },
  # The user who already passed your password step. Binds /login and the offline routes to them.
  get_login_user: ->(req) { req.session["password_verified_user"] },
  on_authenticated: ->(req, response, info) { req.session["user_email"] = info["externalUsername"] },
  silent_sign_in: true   # a known browser with nothing new skips the push
) => "/touchque"
```

Routes: `POST /login`, `/enroll/start`, `GET /enroll/status`, `/offline/challenge|verify|totp`,
`/passkey/authenticate/options|verify`, `/passkey/login/options|verify`,
`/passkey/register/options|verify`, `GET /passkey/credentials`, `DELETE /passkey/credentials/:id`.
Pre-auth routes are rate limited (20 per IP, 5 per username a minute; pass `rate_limit: { store: }`
for Redis across processes). The offline routes stay off until `get_login_user` is set. Adding a
passkey for a user with a linked phone waits for the phone first.

## Webhooks

```ruby
class TouchqueWebhooksController < ActionController::API
  include TouchQue::Rails::Webhook
  verify_touchque_webhook

  def create
    EndSession.call(touchque_webhook["requestId"]) if touchque_webhook["event"] == TouchQue::Resources::Webhook::EVENT_APPROVAL_REVOKED
    head :ok
  end
end
```

The signature (your API secret over the canonical JSON), the signed timestamp (5 minutes) and the
`jti` are checked first: a bad one answers 401, a replay 200 without running your action again.
`TouchQue.replay_cache` is in-process by default; with several Puma workers or hosts set one over
Redis (`check_and_set(jti, ttl_seconds)` with `SET NX EX`). Anywhere else:
`tq.webhook.verify(raw_body, signature_header, replay_cache: cache)`.

## Silent sign-ins

```ruby
risk = tq.risk.check(user, browser_proof: request.headers["X-TouchQue-Browser"], client_ip: request.remote_ip)
sign_in(user) if risk["prompt"] == false   # a known browser, nothing new: no push
```

Fails closed: only an answer of exactly `prompt: false` skips the phone. `tq.risk.browsers(user)`
lists a user's known browsers; `forget_browsers(user)` forgets them (after a password reset).

## Passkeys, offline codes, recovery, help desk

- `tq.webauthn`: registration, second factor and passwordless sign-in options/verify, list and delete passkeys.
- `tq.offline`: QR challenge and typed codes with the phone offline; `totp_verifiers` +
  `TouchQue::Resources::Offline.match_totp_verifier` check time-based codes while TouchQue is unreachable.
- `tq.recovery` (Never Locked Out): vouchers, `start` (show `bindUri` as a QR), `status`, `veto`.
- `tq.assist` (help desk): `open`, `verify` (a 2-digit code the agent reads to the person), `spend`, `unfreeze`, `end`.
- `TouchQue::ApprovalProof.verify(proof, request_id:, type:, details:, expected_public_key:)`: the
  phone's own signature over what it showed ("what you see is what you sign").

## TouchQue Actions

```ruby
tq.actions.deploy("night-alert", trigger: "approval.decided",
                  template: { id: "alert", params: { channel: "slack", when: { countries: ["TR"] } } })
replay = tq.actions.dry_run(trigger: "login.request", code: code, limit: 500)
```

Plus `test`, `rollback`, `logs`, `metrics`, `templates`, `secrets`. Action code is JavaScript run
by TouchQue in a sandbox, whatever language your server is in. Action types:
`tq.action_types.define("SEND_MONEY", name: "Send money", critical: true)`.

## AI agents

Your server registers agents (public key only) and checks their approvals; the agent signs in with its own key:

```ruby
keys = TouchQue::AgentKeys.generate                   # where the agent runs; "ES256" or "EdDSA"
agent = tq.agents.create("Invoice bot", ["PAY_INVOICE"], public_key: keys["publicJwk"])

# The agent (TQ_AGENT_ID, TQ_AGENT_KEY): private_key_jwt + DPoP, never your API key.
bot = TouchQue::Agent.new
approved = bot.require_approval("ayse@acme.com", "PAY_INVOICE", [payment]) { |s| say "Type #{s["challengeCode"]} on your phone" }

# Your server, right before it pays:
tq.agents.redeem_approval(approved["approvalToken"], user: "ayse@acme.com", authorization_details: payment)
```

Also: mandates (`request_mandate`), the token vault (`tq.agents.vault`, `bot.get_connection_token`),
policies, blocks, the kill switch, offline token checks (`verify_approval_token`).
`TouchQue::OrgAgent` is an organization's agent on TouchQue SSO (DPoP tokens for one app, token
exchange, CIBA, the token vault, shared accounts; GitHub Actions and Kubernetes tokens instead of
a stored key). `TouchQue::McpAuth` protects an MCP server whose authorization server is TouchQue SSO.

### Cross App Access (ID-JAG) and A2A agent cards

An organization's identity provider (TouchQue SSO) can let one of its apps reach another service for a member with no consent screen (Cross App Access, ID-JAG, an open IETF draft): the app trades the member's ID token for an ID-JAG, then the ID-JAG for an access token at the other service. If you run an authorization server, the verifier checks an ID-JAG (issuer, single audience, your client, expiry, `typ`) and uses it once. Before your agent trusts another agent's A2A card, check its signatures (A2A 1.0 §8.4: JWS over the RFC 8785 canonical card); keys named by `jku` are only fetched from the card's own host or hosts you trust.

```ruby
jag = TouchQue::CrossAppAccess.request_id_jag(issuer: "https://sso.touchque.com", client_id: client_id, client_secret: secret,
                                              id_token: id_token, audience: "https://auth.files.example")
tokens = TouchQue::CrossAppAccess.redeem_id_jag(token_endpoint: "https://auth.files.example/token", client_id: "acme",
                                                client_secret: files_secret, assertion: jag["assertion"])

# Your own authorization server (jwt-bearer grant):
claims = TouchQue::IdJagVerifier.new(issuer: "https://sso.touchque.com", audience: "https://auth.files.example")
                                .verify(params[:assertion], client_id: authenticated_client_id)

TouchQue::AgentCard.verify(card_json, card_url: "https://agent.example/.well-known/agent-card.json")
```

## TouchQue Login (hosted sign-in)

```ruby
# config/application.rb
config.touchque.login = { domain: "acme.login.touchque.com", client_id: "...", client_secret: "...",
                          scope: "openid profile email offline_access" }

# config/routes.rb
TouchQue::Rails.login_routes(self)        # GET /login, /callback, /logout

class AccountController < ApplicationController
  include TouchQue::Rails::HostedLogin
  before_action :require_touchque_sign_in
  def show = render(json: touchque_session["user"])
end
```

The session lives in encrypted cookies (AES-256-GCM, split when large, no session store needed;
keyed from `config.touchque.session_secret` or `secret_key_base`) and is refreshed before the
access token expires. `TouchQue::HostedLogin` is the OpenID Connect client underneath (PKCE, ID
and access token checks, refresh, token exchange, CIBA, the token vault, client credentials,
logout); your API checks access tokens with `verify_access_token(token, audience:, required_scopes:)`.
`login.my_account(access_token)` is the customer's own account API. The Management API is
`tq.identity` (users, roles, organizations, apps, connections, imports and exports, attack
protection, email and SMS providers).

## Mobile SDK (your own app approves)

```ruby
e = tq.mobile.create_enrollment(user_id)                          # the app spends e["enrollmentToken"]
push = TouchQue::Resources::Mobile.push_from_webhook(event)        # a MOBILE_PUSH webhook → APNs payload / FCM data
```

Or give TouchQue your APNs key / FCM service account (`update_settings(apns:, fcm:)`) and it pushes for you.

## Pairing a browser by QR code

Your page shows a QR code, the person scans it with the TouchQue app, and the phone that scanned is the one asked to approve, with number matching. Your page sends the thumbprint of its browser key (`@touchque/web` `browserKey.thumbprint()`); the nonce in the QR never leaves your server (TouchQue keeps its hash).

```ruby
p = tq.qr_pairings.create(key_thumbprint, client_ip: request.remote_ip, user_agent: request.user_agent)
# show p["uri"] (touchque://pair-browser?...) as a QR code; poll:
now = tq.qr_pairings.get(p["pairingId"])            # waiting -> scanned -> confirmed
tq.login.request(now["externalUsername"], qr_pairing: p["pairingId"]) if now["state"] == "confirmed"
# or: tq.qr_pairings.refuse(p["pairingId"], reason: "device_not_approved", message: "Ask IT to approve this computer.")
```

`get` says `scanned` / `confirmed` once a phone holding one of your users' accounts read it (with `proximity`: same network, same country), `reported` when the person said someone told them to scan it (their 2FA freezes). `refuse` tells the phone why your own checks said no.

## Errors, case codes and retries

| Error | When |
| --- | --- |
| `TouchQue::APIError` | TouchQue answered with an error: `status`, `code` (`device_not_linked`, `already_used`...), `case_code`, `retry_after`, `data` |
| `TouchQue::NetworkError` | the request never reached TouchQue (safe to retry) |
| `TouchQue::RejectedError`, `TimeoutError`, `PasskeyRequiredError` | `verify` outcomes |
| `TouchQue::WebhookSignatureError`, `WebhookReplayError` | webhooks |
| `TouchQue::ApprovalError`, `ApprovalMismatchError` | agent approvals |
| `TouchQue::ConfigError` | a missing key, an unknown action type, a wrong argument |

A feature your organization cannot use here raises a `TouchQue::FeatureError` (still an `APIError`, status 403) with `feature` (`device_risk`, `ai_agents`…) and `feature_reason`: `FeatureNotInPlanError`, `FeatureReadOnlyError` or `FeatureOffError` — not in its plan (an owner or admin adds it in the TouchQue dashboard), being turned off (reads work for 14 days, changes are refused) or switched off on this TouchQue deployment.

**"Why?" case codes.** Refusals and pushes carry a 6-character case code (`K7P-2QX`): show it
("Tell your support team: K7P-2QX"); your team opens the whole decision by it in the dashboard.

**Retries.** Every request is signed with a one-time nonce, so the SDK never replays one. Retry
`TouchQue::NetworkError` at the call site; on 429 / 423 wait `retry_after` seconds. The client
never follows redirects and refuses plain `http://` except for localhost.

## Development

```bash
bundle install
bundle exec rake test   # needs Node.js: the tests run against sdks/testing/fake-touchque-api.mjs and sdks/fixtures
gem build touchque.gemspec
```

## License

MIT
