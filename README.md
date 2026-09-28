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

## What it gives an assistant

**Tools:**
- `get_touchque_docs` — the current `@touchque/node` README (install, the
  `requireTouchQue` step-up model, framework adapters, error handling,
  security).
- `get_sdk_types` — the SDK's TypeScript type definitions (`Config`,
  `Step`/`StepState`, `StartOptions`, `CompleteExpectations`, resource
  response types).
- `ping_touchque_api` — checks that a TouchQue backend URL you give it is
  reachable, before the assistant blames the integration code for a network
  problem.
- `validate_integration` — a static-analysis checklist on a pasted route
  handler: is `@touchque/node` actually imported, is the route guarded with
  the current `requireTouchQue`/`withTouchQue`/`touchqueRouter` API (as
  opposed to the old, removed synchronous `tq.login.verify()` pattern), are
  secrets kept out of source and read from the environment, is there error
  handling.

**Prompts** (pre-built instruction sets an assistant can load):
- `integrate_touchque` — a step-by-step wizard for adding TouchQue to an
  existing codebase without breaking anything.
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
      "args": ["-y", "touchque-mcp-server"]
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
      "args": ["-y", "touchque-mcp-server"]
    }
  }
}
```

No API key, no environment variables, no separate server process to run —
`npx` fetches and runs it on demand over stdio, the same way you'd wire up
any other local MCP server.

### Run it directly

```bash
npx -y touchque-mcp-server
```

It talks [MCP](https://modelcontextprotocol.io) over stdio (stdin/stdout) —
you won't see anything if you run it directly in a terminal and start typing;
it's meant to be launched by an MCP-aware client, not used interactively.

## Local development

If you're editing this server (not consuming it), point it at a docs site
you're actively editing instead of the bundled copies:

```bash
DOCS_BASE_URL=http://localhost:5176/docs npx touchque-mcp-server
```

The server tries `DOCS_BASE_URL/sdk-documentation.md` and
`DOCS_BASE_URL/types.ts` first when that variable is set, and falls back to
the bundled copies under [`bundled/`](./bundled) if that fetch fails — so an
unset or unreachable override never breaks the tool. Keep the bundled copies
in sync with `sdks/touchque-node/README.md` and
`sdks/touchque-node/src/{types.ts,steps.ts}` when the SDK's public API
changes.

## Testing

```bash
npm test
```

Tests spawn the actual server over stdio using the official MCP SDK's
`Client`/`StdioClientTransport` — the same path any real MCP client takes —
and check the real tool/prompt list, that the bundled docs/types load without
network access, and that `validate_integration` correctly distinguishes the
current step-up API from the old, removed synchronous one.

## Security

This server is read-only dev tooling: it never touches a real TouchQue
account, never sees an API key, and never calls a TouchQue backend except a
URL you explicitly pass to `ping_touchque_api`. There is intentionally no
authentication on the server itself — it needs none. If that ever changes
(e.g. a future tool that reads real account data), auth must be added before
that tool ships.

## License

MIT © [TouchQue](https://touchque.com)
