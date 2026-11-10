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

// The docs tools of index.js this server offers too (ping_touchque_api would
// let anyone make this server fetch any address: left out).
const CORE_TOOLS = new Set(["touchque_help", "get_touchque_docs", "get_sdk_types", "validate_integration"]);

const INSTRUCTIONS = `Touchque MCP: you are connected as a signed-in Touchque member.
Start every Touchque task with touchque_whoami (who they are, the organization, their role, the features that are ON).
Only build integrations for features that are ON. Read the person's code before changing it, follow the SDK README sections from touchque_generate_integration or get_touchque_docs, and finish with touchque_check_integration.
Workspace changes (an API key, a redirect URI) only when the person asks: call without confirm, ask, then confirm: true; tell them the number their phone shows.
Slash commands: touchque-setup, add-phone-approval, add-passkeys, add-touchque-login, check-integration.`;

function buildServer(auth, config) {
  const ws = createWorkspace(config, auth);
  const server = new Server(
    { name: "touchque", title: "Touchque", version: core.PACKAGE_VERSION, websiteUrl: config.docsUrl },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const base = (await core.handlers.listTools()).tools.filter((t) => CORE_TOOLS.has(t.name));
    return { tools: [...tools.TOOLS, ...base] };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (CORE_TOOLS.has(name)) return core.handlers.callTool(request);
    const result = await tools.callTool(name, args, ws, core.handlers, config);
    if (result) return result;
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const base = (await core.handlers.listPrompts()).prompts;
    return { prompts: [...prompts.listPrompts(), ...base] };
  });
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const mine = prompts.getPrompt(request.params.name, request.params.arguments);
    return mine || core.handlers.getPrompt(request);
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
    const server = buildServer(auth, config);
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
    console.error(`Touchque MCP ${core.PACKAGE_VERSION} on http://${config.host}:${config.port}${new URL(config.resource).pathname} (resource ${config.resource}, issuer ${config.issuer})`);
  });
}

module.exports = { createApp, buildServer };
