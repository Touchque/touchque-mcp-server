// Touchque's MCP server: https://api.touchque.com/mcp (Streamable HTTP, MCP
// authorization 2025-06+). Add it to Claude, Cursor or any MCP client by its
// URL and sign in once with Touchque: the client finds Touchque SSO through
// the protected resource metadata below, registers itself (or names itself
// with a client ID metadata document), and gets a 10-minute token for exactly
// this server (PKCE, audience-bound), refreshed in the background.
//
// The tools: the signed-in person's workspace (remote/tools.js), the SDK docs,
// types and static checks (index.js handlers, shared with the old stdio
// server), and the slash commands (remote/prompts.js).
//
// Stateless: every POST builds a server for that request, so a restart or a
// second instance loses nothing. The active organization of a connection is
// kept per grant (remote/workspace.js).

const express = require("express");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const {
  ListToolsRequestSchema, CallToolRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema,
  ListResourcesRequestSchema, ReadResourceRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const core = require("../index.js");
const { loadConfig } = require("./config");
const { createVerifier, challenge } = require("./auth");
const { createWorkspace } = require("./workspace");
const tools = require("./tools");
const prompts = require("./prompts");

// What every answer should follow. The member's own facts are added below it
// at initialize (instructionsFor), so a question about them needs no tool.
const ROUTING = `Touchque MCP. Answer in the person's language, in a few lines; do not narrate tool calls.
- Their account (organization, role, features, API key, webhook, action types, passkey domain, Touchque Login tenant and apps, other organizations): use the facts below; no tool call. They are as of the time shown: after a change, an organization switch or a long pause, touchque_whoami.
- What is Touchque or a feature in general: answer from the summary below; no tool call.
- How-to or concept: one touchque_search_docs call (Turkish questions work). An SDK detail: get_touchque_docs with a section, get_sdk_types with a symbol.
- Is an SDK published, how to install: touchque_pick_sdk.
- Write an integration: read their code, touchque_generate_integration, edit the files, then touchque_check_integration. Only for features that are ON.
- Changes (action type, API key, redirect URI, test approval): only when the person asks. Call without confirm (it explains and gives a confirmToken), ask them, and only on their yes call again with confirm: true and that confirmToken. An API key also asks their phone: tell them the number, then touchque_wait.
- If your client loads tools on demand, load the Touchque tools you need in one search.
- Not in this server: prices, plans, billing (Touchque does not publish them; ask Touchque on support.touchque.com), usage numbers and logs (dashboard → Overview → Usage, Logs), changing the webhook URL (dashboard → Developers → Webhooks), .NET, Ruby and Java SDKs (not released).
Touchque, two halves: Workforce, for a company's own people (SSO for work apps, directory and lifecycle, VPN/server sign-in over RADIUS, shared accounts, device trust, threat protection, AI agents and MCP) and Customer & developer identity, for the company's own app and customers (2FA API: phone approval with number matching, passkeys, offline sign; Touchque Login: hosted sign-up and sign-in for the company's customers, not employee SSO; Device risk: recognises browsers on sign-in pages; Safe Guard: Safe multisig wallet transactions run only after approvals signed on the approvers' phones; Mobile SDK: the company's own app approves).
Slash commands: touchque-setup, add-phone-approval, add-passkeys, add-touchque-login, check-integration.`;

/** The instructions with the member's facts, or the routing alone when they cannot be read in time. */
async function instructionsFor(ws, { timeoutMs = 2500 } = {}) {
  const facts = (async () => {
    const ctx = await ws.context();
    const setup = await tools.workspaceSetup(ws, ctx).catch(() => null);
    return tools.snapshotText(ctx, setup, ws);
  })();
  const snapshot = await Promise.race([facts.catch(() => null), new Promise((r) => setTimeout(() => r(null), timeoutMs))]);
  const asOf = new Date().toISOString().slice(0, 16).replace("T", " ");
  return snapshot ? `${ROUTING}\n\nThe person's Touchque facts (as of ${asOf} UTC):\n${snapshot}` : `${ROUTING}\n\n(The person's facts could not be read just now: call touchque_whoami.)`;
}

function buildServer(auth, config, instructions = ROUTING) {
  const ws = createWorkspace(config, auth);
  const server = new Server(
    { name: "touchque", title: "Touchque", version: core.PACKAGE_VERSION, websiteUrl: config.docsUrl },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await tools.callTool(name, args, ws, core.handlers, config);
    if (result) return result;
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: prompts.listPrompts() }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const mine = prompts.getPrompt(request.params.name, request.params.arguments);
    if (!mine) throw new Error(`Unknown prompt: ${request.params.name}`);
    return mine;
  });
  server.setRequestHandler(ListResourcesRequestSchema, core.handlers.listResources);
  server.setRequestHandler(ReadResourceRequestSchema, core.handlers.readResource);
  return server;
}

function createApp(config = loadConfig()) {
  if (!config.secret || config.secret.length < 32) throw new Error("TOUCHQUE_MCP_SECRET (32+ characters, the same as the SSO's) is required");
  const verify = createVerifier(config);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");

  // Browser-based MCP clients (an inspector) call with a bearer token, never cookies.
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id, dpop");
    res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.set("Access-Control-Expose-Headers", "mcp-session-id, www-authenticate");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  });

  // Protected resource metadata (RFC 9728): where to sign in for this server.
  const prm = (req, res) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json({
      resource: config.resource,
      authorization_servers: [config.issuer],
      scopes_supported: ["touchque:read", "touchque:write", "offline_access"],
      bearer_methods_supported: ["header"],
      resource_name: "Touchque",
      resource_documentation: `${config.docsUrl}/mcp`,
      dpop_signing_alg_values_supported: ["ES256", "EdDSA"],
    });
  };
  const mcpPath = new URL(config.resource).pathname;
  app.get(`/.well-known/oauth-protected-resource${mcpPath}`, prm);
  app.get("/.well-known/oauth-protected-resource", prm);

  app.get("/mcp-health", (req, res) => res.json({ status: "ok", version: core.PACKAGE_VERSION }));

  const unauthorized = (res, err) => {
    res.set("WWW-Authenticate", challenge(config, err));
    res.set("Cache-Control", "no-store");
    return res.status(err.status || 401).json({ error: err.code, error_description: err.message });
  };

  app.post(mcpPath, express.json({ limit: "2mb" }), async (req, res) => {
    let auth;
    try {
      auth = await verify(req);
    } catch (err) {
      return unauthorized(res, err);
    }
    const isInit = (m) => m && m.method === "initialize";
    const initializing = Array.isArray(req.body) ? req.body.some(isInit) : isInit(req.body);
    const instructions = initializing ? await instructionsFor(createWorkspace(config, auth)) : ROUTING;
    const server = buildServer(auth, config, instructions);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("MCP request failed:", err.message);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });

  // Stateless: no server-sent stream to open and no session to end.
  const notAllowed = async (req, res) => {
    try {
      await verify(req);
    } catch (err) {
      return unauthorized(res, err);
    }
    res.set("Allow", "POST");
    return res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  };
  app.get(mcpPath, notAllowed);
  app.delete(mcpPath, notAllowed);

  return app;
}

if (require.main === module) {
  const config = loadConfig();
  createApp(config).listen(config.port, config.host, () => {
    // Build the docs index now, so the first question does not wait for it.
    require("./docsSearch").search(config.docsUrl, "touchque").catch((err) => console.error("docs index:", err.message));
    console.error(`Touchque MCP ${core.PACKAGE_VERSION} on http://${config.host}:${config.port}${new URL(config.resource).pathname} (resource ${config.resource}, issuer ${config.issuer})`);
  });
}

module.exports = { createApp, buildServer, instructionsFor, ROUTING };
