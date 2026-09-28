// Integration tests: spawn index.js exactly like a real MCP client would
// (stdio transport) and drive it with the official SDK's Client class —
// this is the same path Claude Desktop/Cursor/Claude Code use, so a pass
// here means `npx touchque-mcp-server` actually works, not just that the
// internal functions don't throw.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

async function withClient(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, "index.js")],
  });
  const client = new Client({ name: "touchque-mcp-server-tests", version: "1.0.0" });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

test("lists exactly the 5 real tools, including the touchque_help fallback", async () => {
  await withClient(async (client) => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "get_sdk_types",
      "get_touchque_docs",
      "ping_touchque_api",
      "touchque_help",
      "validate_integration",
    ]);
  });
});

test("touchque_help works with no arguments and explains the server, for clients with no prompts/resources support", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "touchque_help", arguments: {} });
    const text = result.content[0].text;
    assert.match(text, /get_touchque_docs/);
    assert.match(text, /validate_integration/);
  });
});

test("server advertises MCP-native instructions on connect (works even without any tool call)", async () => {
  await withClient(async (client) => {
    const serverInstructions = client.getInstructions();
    assert.match(serverInstructions, /TouchQue MCP Server/);
    assert.match(serverInstructions, /get_touchque_docs/);
  });
});

test("lists the bundled docs as MCP resources and can read them", async () => {
  await withClient(async (client) => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    assert.deepEqual(uris, [
      "touchque://docs/sdk-documentation.md",
      "touchque://docs/types.ts",
    ]);

    const read = await client.readResource({ uri: "touchque://docs/sdk-documentation.md" });
    assert.match(read.contents[0].text, /requireTouchQue/);
  });
});

test("lists exactly the 3 real prompts", async () => {
  await withClient(async (client) => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    assert.deepEqual(names, [
      "audit_touchque_integration",
      "integrate_touchque",
      "troubleshoot_touchque",
    ]);
  });
});

test("get_touchque_docs returns the bundled README with no network access", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "get_touchque_docs", arguments: {} });
    const text = result.content[0].text;
    assert.match(text, /@touchque\/node/);
    assert.match(text, /requireTouchQue/);
  });
});

test("get_sdk_types returns the bundled type definitions", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "get_sdk_types", arguments: {} });
    const text = result.content[0].text;
    assert.match(text, /export interface Step/);
    assert.match(text, /export interface StartOptions/);
  });
});

test("integrate_touchque prompt teaches the current step-up API, not the old synchronous one", async () => {
  await withClient(async (client) => {
    const result = await client.getPrompt({ name: "integrate_touchque" });
    const text = result.messages[0].content.text;
    assert.match(text, /requireTouchQue\('SEND_MONEY'/);
    assert.doesNotMatch(text, /requireTouchQue\(tq, 'SEND_MONEY'\)/);
  });
});

test("validate_integration scores a current-API snippet as fully passing", async () => {
  await withClient(async (client) => {
    const goodCode = `
      const { requireTouchQue } = require('@touchque/node');
      app.post('/api/transfer',
        requireTouchQue('SEND_MONEY', { user: (req) => req.session.user?.email }),
        (req, res) => {
          try {
            res.json({ ok: true, apiKey: process.env.TQ_API_KEY });
          } catch (e) {
            res.status(500).json({ error: 'failed' });
          }
        }
      );
    `;
    const result = await client.callTool({
      name: "validate_integration",
      arguments: { code: goodCode, framework: "express" },
    });
    const text = result.content[0].text;
    assert.match(text, /Score: 100%/);
  });
});

test("validate_integration flags the old synchronous login.verify() pattern and hardcoded secrets", async () => {
  await withClient(async (client) => {
    const badCode = `
      const tq = new TouchQue({ apiKey: 'tq_liveSuperSecretKey123', apiSecret: 'sk_hardcoded_abcdefghijk' });
      app.post('/api/transfer', async (req, res) => {
        await tq.login.verify({ externalUsername: req.body.user, type: 'SEND_MONEY' });
        res.json({ ok: true });
      });
    `;
    const result = await client.callTool({
      name: "validate_integration",
      arguments: { code: badCode, framework: "express" },
    });
    const text = result.content[0].text;
    assert.match(text, /❌ .*synchronous login\.verify/);
    assert.match(text, /❌ No hardcoded API key\/secret/);
    assert.doesNotMatch(text, /Score: 100%/);
  });
});

test("ping_touchque_api reports unreachable for a bogus URL", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({
      name: "ping_touchque_api",
      arguments: { apiUrl: "http://127.0.0.1:1" }, // port 1 — nothing listens here
    });
    assert.match(result.content[0].text, /unreachable/);
  });
});
