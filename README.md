# Touchque MCP

Touchque's MCP server for developers. Add **one URL** to Claude, Cursor or any
MCP client, sign in once with Touchque, and the AI knows who you are, your
organization, your role and which Touchque features are on for you. It reads
your app's code, picks the right SDK, writes the integration and checks it
against your live workspace.

```
https://api.touchque.com/mcp
```

There is one Touchque MCP: this server. No API key to paste: you sign in with
Touchque SSO in the browser (OAuth 2.1, PKCE). The token is for this server
only and lasts 10 minutes; your AI tool renews it in the background.

## Add it

### Claude Code

```bash
claude mcp add --transport http touchque https://api.touchque.com/mcp
```

Then run `/mcp` in Claude Code, pick **touchque** and **Authenticate**. The
browser opens Touchque's sign-in; after it, pick the organization and allow.

### Claude (claude.ai and the desktop app)

Settings → Connectors → **Add custom connector** → name `Touchque`, URL
`https://api.touchque.com/mcp` → Connect, and sign in.

### Cursor

`~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "touchque": { "url": "https://api.touchque.com/mcp" }
  }
}
```

Cursor shows **Needs login** next to it: click it and sign in.

### VS Code, Windsurf, Grok and others

Any client that speaks Streamable HTTP with MCP authorization: add the URL
`https://api.touchque.com/mcp`. A client that only runs local (stdio) servers
can reach the same server through a bridge:

```json
{ "command": "npx", "args": ["-y", "mcp-remote", "https://api.touchque.com/mcp"] }
```

## Signing in

1. The client finds Touchque SSO from
   `https://api.touchque.com/.well-known/oauth-protected-resource/mcp`
   (RFC 9728) and registers itself (RFC 7591, a public client) or names
   itself with a client ID metadata document.
2. You sign in at sso.touchque.com as usual (password, passkey or phone).
3. The consent screen names the AI tool, lets you pick one of your
   organizations, and lists what it may do:
   - `touchque:read`: your organization, role, features and workspace setup.
     Never a secret.
   - `touchque:write`: changes you ask for (an API key, a redirect URI). Each
     one asks you first and, like the dashboard, your phone.
4. You can end the connection in your Touchque account (AI access), and your
   organization's AI tool rules apply.

## Slash commands

| Command | What it does |
|---|---|
| `/touchque-setup` | Who you are, what is on and set up, which SDK fits this project, what next |
| `/add-phone-approval` | Phone approval (push with number matching) on sign-in or a sensitive action |
| `/add-passkeys` | Passkeys: enrollment and phishing-resistant sign-in or step-up |
| `/add-touchque-login` | Touchque Login: hosted sign-up and sign-in (OpenID Connect) for your customers |
| `/check-integration` | Checks your code against the SDK rules and your live workspace |

In Claude Code they appear as `/mcp__touchque__touchque-setup` and so on. You
can also just ask: "add Touchque phone approval to the transfer endpoint".

The older instructions are still there too: `integrate_touchque`,
`configure_offline_sign`, `audit_touchque_integration`,
`troubleshoot_touchque`.

## Tools

| Tool | |
|---|---|
| `touchque_whoami` | You, the active organization, your role, the features that are ON |
| `touchque_list_organizations`, `touchque_use_organization` | Your organizations; switch the connection to another one |
| `touchque_features` | Every feature with ON or OFF for the organization |
| `touchque_workspace_setup` | API keys (no secrets), webhook, action types, passkey domain, Touchque Login tenant and apps, what is missing |
| `touchque_pick_sdk` | The SDK for the project, whether it is published, install command, env vars |
| `touchque_generate_integration` | The SDK's own README sections for a feature and language, with this workspace's real values. Refuses a feature that is OFF |
| `touchque_check_integration` | Checks code against the live workspace (feature, key, action types, redirect URIs, webhook) and the static checklist |
| `touchque_search_docs` | Searches https://support.touchque.com |
| `touchque_explain_case` | Explains a "Why?" case code |
| `touchque_send_test_approval`, `touchque_test_approval_status` | A test approval on your own phone, only when you ask |
| `touchque_create_api_key`, `touchque_add_redirect_uri`, `touchque_change_status` | Changes, with your yes and your phone (needs `touchque:write`) |
| `get_touchque_docs`, `get_sdk_types`, `validate_integration`, `touchque_help` | The SDK READMEs and types bundled from the SDK sources, and the static checklist |

Every call runs as you, in your active organization, and sees only what the
dashboard shows you.

## Language support

All 7 official server SDKs — **Node, Python, PHP, Go, .NET, Ruby, Java** —
share the exact same step-up model (`start`/`check`/`complete`, a one-line
framework guard), just with per-language naming. Every relevant tool below
takes an optional `language` argument (`"node"` | `"python"` | `"php"` |
`"go"` | `"dotnet"` | `"ruby"` | `"java"`, default `"node"`) — the AI
assistant should ask which language your backend is in and pass it, rather
than assuming Node.

| Language | Package | Guard | Relay router (routes `@touchque/web` calls) |
|---|---|---|---|
| Node | `@touchque/node` | `requireTouchQue('ACTION', opts)` | `touchqueRouter(tq, { getUserId, getLoginUser })` |
| Python | `touchque-authenticator` | `@require_touchque('ACTION', ...)` | `touchque_relay_blueprint` (Flask), `touchque_relay_router` (FastAPI), `touchque_relay_view` / `touchque_relay_urls` (Django), `RelayHandler` |
| PHP | `touchque-authenticator/php-sdk` | `->middleware('touchque:ACTION')` | `TouchQueRelay::routes($router, 'touchque')` (Laravel), `TouchQue\Relay\RelayHandler` |
| Go | `github.com/Touchque/touchque-go/v4` | `touchque.Require(tq, "ACTION", handler, touchque.RequireOptions{User: ...})` | `touchque.NewRelayHandler(tq, touchque.RelayOptions{UserID: ..., LoginUser: ...})` |
| .NET | `TouchQue.AspNetCore` | `.RequireTouchQue("ACTION")`, `[RequireTouchQue("ACTION")]` | `app.MapTouchQueRelay("/touchque", new RelayOptions<HttpContext> { GetUserId, GetLoginUser })` |
| Ruby | `touchque` | `require_touchque "ACTION"` (Rails), `TouchQue::Guard.run` | `TouchQue::Rack::Relay.new(get_user_id:, get_login_user:)` |
| Java | `com.touchque:touchque-spring-boot-starter` | `@RequireTouchQue("ACTION")` (Spring Boot), `Guard.run` | a `RelayOptions<HttpServletRequest>` bean, or `new RelayHandler<>(tq, options)` |

The docs, types, prompts and validator cover the SDK 3.2.0 API: the relay
routers above, device-proof verification (`verifyApprovalProof` /
`verify_approval_proof` / `ApprovalProof::verify` /
`touchque.VerifyApprovalProof`, with the device key pinned), fraud reports
(`reportFraud` / `report_fraud` / `ReportFraud`) and Go's required
`RequireOptions.User` (3.1.1), plus the 3.3.0 changes: only a trusted
end-user address goes to the risk engine (Next.js `ip` / `trustedProxyHops`,
Go `RequireOptions.IP`), the `PASSKEY_ENROLL` approval before adding a
passkey, and relay polls outside the push rate limit. They are current for
SDK 4.0.0: action types under `tq.actionTypes` (Python `action_types`, PHP
`actionTypes`, Go `ActionTypes`) now that `tq.actions` is TouchQue Actions,
the Go module path `/v4`, `context` for Actions, `onChallenge` for the
blocking `verify()`, "Why?" case codes, silent sign-ins, Never Locked Out
recovery and the Vishing Shield.

## How it works

```
AI tool ──(Bearer token, aud = api.touchque.com/mcp)──▶ Touchque MCP (remote/server.js)
                                                         │ exchanges the token, with its own secret,
                                                         ▼ at sso.touchque.com/sso/mcp/touchque/exchange
                                                       a 5-minute dashboard token for your organization
                                                         │ (act: touchque-mcp; a short list of routes)
                                                         ▼
                                                       dashboard.touchque.com/v1 (your workspace)
```

- The authorization server is Touchque SSO's MCP issuer
  (`https://sso.touchque.com/mcp`, touchque-sso-backend `utils/mcp/`).
  Touchque's own MCP server is built in there next to organizations' own MCP
  servers. Its connections show on the member's AI access page.
- The member's token never goes further than this server. The SSO checks the
  membership, role and features again on every exchange.
- The dashboard backend lets these tokens read a short list of routes that
  never show a secret, and make three kinds of change with `touchque:write`.
  Each change still asks for the role and the phone in the controller.
- Stateless Streamable HTTP: no sessions to lose on a restart.

## Running it

```bash
npm install
TOUCHQUE_MCP_SECRET=… npm start      # 127.0.0.1:5010/mcp
```

| Variable | Default (production) | |
|---|---|---|
| `TOUCHQUE_MCP_RESOURCE` | `https://api.touchque.com/mcp` | This server's URL: tokens are issued for exactly it |
| `TOUCHQUE_SSO_URL` | `https://sso.touchque.com` | The SSO (issuer `<sso>/mcp`, JWKS, exchange) |
| `TOUCHQUE_DASHBOARD_API` | `https://dashboard.touchque.com` | The dashboard backend (`/v1`) |
| `TOUCHQUE_MCP_SECRET` | (required) | 32+ characters, the same value as the SSO's `TOUCHQUE_MCP_SECRET` |
| `PORT`, `HOST` | `5010`, `127.0.0.1` | |

Outside production the defaults are the local stack (`localhost:5002`,
`:5003`, resource `http://localhost:5010/mcp`; set `MCP_ALLOW_LOCAL_CLIENTS=true`
on the SSO).

`index.js` holds the SDK docs, types, checklist and older instructions, which
the server serves. `node index.js` still runs them over stdio for development
and the tests. Refresh the bundles with `node scripts/sync-bundled.js` and the
feature catalog with `npm run sync:features`.

## Testing

```bash
npm test
```

`index.test.js` drives the docs tools over stdio with the MCP SDK's client.
`remote/remote.test.js` covers the token checks (audience, issuer, expiry,
DPoP), the resource metadata, the slash commands, the SDK sections and the
feature gating. The whole path (registration, consent with the organization
picker, token, refresh, exchange, and this server answering `whoami`) runs
against a real SSO in touchque-sso-backend
`tests/integration/touchqueMcp.test.js`.

## License

MIT © [Touchque](https://touchque.com)
