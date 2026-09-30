# TouchQue MCP Server

An [MCP](https://modelcontextprotocol.io) server that gives AI coding
assistants (Claude, Cursor, …) accurate, up-to-date TouchQue SDK
documentation, TypeScript types, and an integration validator — so they stop
guessing at the API and stop generating the old, broken synchronous
integration pattern.

It's a small, local, **read-only** tool: it doesn't hold an API key, doesn't
call your TouchQue account, and doesn't need network access at all for its
docs/types tools (they're bundled with the package). The only network calls
it makes are ones you explicitly ask for (`ping_touchque_api`, pointed at a
URL you pass in).

## What this server does NOT do

**This server has no file system access of its own.** It cannot open,
read, or edit your project's files, and it has no idea what's in
"my login page" or "the file I'm working on" — it only returns text (docs,
wizard instructions, a validation report on code YOU paste in).

The actual file editing — adding `requireTouchQue` to a route, wiring the
Offline Sign QR/code into your login screen — is done by **the coding
assistant you're using** (Claude Code, Cursor, Windsurf, …), using *its
own* file tools, guided by what this server returns. So "does it edit my
login screen when I say 'set it up'?" depends on your assistant actually
being in an agentic/edit mode with file access — this server's job is only
to make sure it edits it *correctly* (current API, correct prerequisites)
once it does. The wizard prompts say this explicitly and instruct the
assistant to ask for exact file paths rather than guess.

## Language support

All 4 official server SDKs — **Node, Python, PHP, Go** — share the exact
same step-up model (`start`/`check`/`complete`, a one-line framework guard),
just with per-language naming. Every relevant tool below takes an optional
`language` argument (`"node"` | `"python"` | `"php"` | `"go"`, default
`"node"`) — the AI assistant should ask which language your backend is in
and pass it, rather than assuming Node.

| Language | Package | Guard |
|---|---|---|
| Node | `@touchque/node` | `requireTouchQue('ACTION', opts)` |
| Python | `touchque-authenticator` | `@require_touchque('ACTION', ...)` |
| PHP | `touchque-authenticator/php-sdk` | `->middleware('touchque:ACTION')` |
| Go | `github.com/Touchque/touchque-go` | `touchque.Require(tq, "ACTION", handler, opts)` |

## What it gives an assistant

Not every MCP client renders every MCP primitive — some editors only ever
show **tools**, some show tools + prompts, few show resources. So the same
content is reachable three independent ways, and none of them require the
others:

1. **Server `instructions`** (MCP-native "help" text, sent on connect —
   shown automatically by clients that support it, no call needed).
2. **The `touchque_help` tool** — works in literally every MCP client,
   since tools are the one primitive everyone implements. If your editor
   doesn't show a help command or can't find the docs, look for this tool.
3. **`resources/list` + `resources/read`** — for clients that browse
   resources instead of (or alongside) tools.

**Tools:**
- `touchque_help` — **start here.** Explains what this server is for and
  which tool to call next. This is the fallback of last resort — call it if
  nothing else here is obvious.
- `get_touchque_docs({ language })` — that language's README (install, the
  step-up model, framework adapters, error handling, security).
- `get_sdk_types({ language })` — that language's type/class reference
  (`Config`, `Step`/`StepState`, `StartOptions`, `CompleteExpectations`,
  resource response types).
- `ping_touchque_api` — checks that a TouchQue backend URL you give it is
  reachable, before the assistant blames the integration code for a network
  problem.
- `validate_integration({ code, framework, language })` — a static-analysis
  checklist on a pasted route handler, for whichever language it's in: is
  the SDK actually imported, is the route guarded with the current step-up
  API (as opposed to the old, removed synchronous `.login.verify()`
  pattern), are secrets kept out of source and read from the environment,
  is there error handling.

**Resources** (for clients that browse resources, e.g. as an alternative to
tools):
- `touchque://docs/<language>/sdk-documentation.md` — same content as `get_touchque_docs({ language })`.
- `touchque://docs/<language>/types.{ts,py,php,go}` — same content as `get_sdk_types({ language })`.

(8 resources total — one README + one types file per language.)

**Prompts** (pre-built instruction sets an assistant can load — support for
this varies by client; if your client doesn't show these, use the tools
above directly instead):
- `integrate_touchque` — a step-by-step wizard for adding TouchQue's
  default push/passkey step-up to an existing codebase without breaking
  anything.
- `configure_offline_sign` — a separate wizard for TouchQue's "Offline
  Sign" flow (QR + 7-character code, for when the phone has no internet —
  kiosks, air-gapped environments, poor signal). Distinct from
  `integrate_touchque`; use this one when offline approval is the ask.
- `audit_touchque_integration` — a formal security-review checklist for an
  existing integration.
- `troubleshoot_touchque` — a triage decision tree for a broken integration.

## Install

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`, or `.mcp.json` for
Claude Code):

```json
{
  "mcpServers": {
    "touchque": {
      "command": "npx",
      "args": ["-y", "@touchque/mcp-server"]
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` (or the project's `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "touchque": {
      "command": "npx",
      "args": ["-y", "@touchque/mcp-server"]
    }
  }
}
```

### Windsurf

`~/.codeium/windsurf/mcp_config.json` (same shape as Cursor's):

```json
{
  "mcpServers": {
    "touchque": {
      "command": "npx",
      "args": ["-y", "@touchque/mcp-server"]
    }
  }
}
```

Windsurf doesn't currently render MCP prompts — use the `touchque_help` and
`get_touchque_docs` tools directly there (see "What it gives an assistant"
above).

No API key, no environment variables, no separate server process to run —
`npx` fetches and runs it on demand over stdio, the same way you'd wire up
any other local MCP server.

### Run it directly

```bash
npx -y @touchque/mcp-server
```

It talks [MCP](https://modelcontextprotocol.io) over stdio (stdin/stdout) —
you won't see anything if you run it directly in a terminal and start typing;
it's meant to be launched by an MCP-aware client, not used interactively.

## Local development

If you're editing this server (not consuming it), point the **Node** docs
at a docs site you're actively editing instead of the bundled copy
(`DOCS_BASE_URL` only applies to Node — Python/PHP/Go always read their
bundled copy, since there's no equivalent local dev server for them):

```bash
DOCS_BASE_URL=http://localhost:5176/docs npx @touchque/mcp-server
```

The server tries `DOCS_BASE_URL/sdk-documentation.md` and
`DOCS_BASE_URL/types.ts` first when that variable is set, and falls back to
the bundled copy under [`bundled/node/`](./bundled/node) if that fetch
fails — so an unset or unreachable override never breaks the tool.

Keep every language's bundled copy in sync with its SDK source whenever the
step-up API (or an SDK README) changes. Each bundle is a straight
concatenation of the listed files; regenerate them all with one command
(it reads the SDK monorepo next to this repo, or pass its path):

```bash
node scripts/sync-bundled.js            # default: ../sdks
node scripts/sync-bundled.js /path/to/sdks
```

| `bundled/<lang>/` | Source |
|---|---|
| `node/` | `sdks/touchque-node/README.md` + `src/{types.ts,steps.ts}` |
| `python/` | `sdks/touchque-python/README.md` + `touchque/{config.py,client.py,steps.py,resources/offline.py}` |
| `php/` | `sdks/touchque-php/README.md` + `src/{Config.php,TouchQue.php,Steps.php,Resources/Offline.php}` |
| `go/` | `sdks/touchque-go/README.md` + `touchque/{config.go,types.go,client.go,steps.go,offline.go}` |

## Testing

```bash
npm test
```

Tests spawn the actual server over stdio using the official MCP SDK's
`Client`/`StdioClientTransport` — the same path any real MCP client takes —
and check the real tool/prompt/resource lists, the server `instructions`
field, that the bundled docs/types load without network access, and that
`validate_integration` correctly distinguishes the current step-up API from
the old, removed synchronous one.

## Security

This server is read-only dev tooling: it never touches a real TouchQue
account, never sees an API key, and never calls a TouchQue backend except a
URL you explicitly pass to `ping_touchque_api`. There is intentionally no
authentication on the server itself — it needs none. If that ever changes
(e.g. a future tool that reads real account data), auth must be added before
that tool ships.

## License

MIT © [TouchQue](https://touchque.com)
