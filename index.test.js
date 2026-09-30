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

test("lists the bundled docs as MCP resources for all 4 languages and can read them", async () => {
  await withClient(async (client) => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    assert.deepEqual(uris, [
      "touchque://docs/go/sdk-documentation.md",
      "touchque://docs/go/types.go",
      "touchque://docs/node/sdk-documentation.md",
      "touchque://docs/node/types.ts",
      "touchque://docs/php/sdk-documentation.md",
      "touchque://docs/php/types.php",
      "touchque://docs/python/sdk-documentation.md",
      "touchque://docs/python/types.py",
    ]);

    const read = await client.readResource({ uri: "touchque://docs/node/sdk-documentation.md" });
    assert.match(read.contents[0].text, /requireTouchQue/);
  });
});

test("lists exactly the 4 real prompts", async () => {
  await withClient(async (client) => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    assert.deepEqual(names, [
      "audit_touchque_integration",
      "configure_offline_sign",
      "integrate_touchque",
      "troubleshoot_touchque",
    ]);
  });
});

test("configure_offline_sign prompt teaches the real tq.offline.challenge()/verify() API", async () => {
  await withClient(async (client) => {
    const result = await client.getPrompt({ name: "configure_offline_sign" });
    const text = result.messages[0].content.text;
    assert.match(text, /tq\.offline\.challenge/);
    assert.match(text, /tq\.offline\.verify\(/);
    assert.match(text, /qrDataUrl/);
  });
});

test("touchque_help mentions Offline Sign as a distinct flow from push/passkey", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "touchque_help", arguments: {} });
    assert.match(result.content[0].text, /Offline Sign/);
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

test("get_touchque_docs and get_sdk_types support all 4 languages via the language argument", async () => {
  await withClient(async (client) => {
    const expected = {
      python: { docs: /touchque-authenticator/, types: /class TouchQue/ },
      php: { docs: /touchque-authenticator\/php-sdk/, types: /class TouchQue/ },
      go: { docs: /touchque-go/, types: /package touchque/ },
    };
    for (const [language, { docs, types }] of Object.entries(expected)) {
      const docsResult = await client.callTool({ name: "get_touchque_docs", arguments: { language } });
      assert.match(docsResult.content[0].text, docs, `get_touchque_docs(${language})`);

      const typesResult = await client.callTool({ name: "get_sdk_types", arguments: { language } });
      assert.match(typesResult.content[0].text, types, `get_sdk_types(${language})`);
    }
  });
});

test("get_touchque_docs rejects an unknown language instead of silently falling back to Node", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "get_touchque_docs", arguments: { language: "ruby" } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unknown language/);
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

test("integrate_touchque prompt requires defining the action type first (unknown_action) and clarifies webhooks are optional", async () => {
  await withClient(async (client) => {
    const result = await client.getPrompt({ name: "integrate_touchque" });
    const text = result.messages[0].content.text;
    assert.match(text, /tq\.actions\.define\(/);
    assert.match(text, /unknown_action/);
  });
});

test("integrate_touchque and configure_offline_sign both tell the assistant it must actually edit real files itself", async () => {
  await withClient(async (client) => {
    const wizard = await client.getPrompt({ name: "integrate_touchque" });
    const offline = await client.getPrompt({ name: "configure_offline_sign" });
    for (const text of [wizard.messages[0].content.text, offline.messages[0].content.text]) {
      assert.match(text, /no file system access of its own/);
    }
  });
});

test("touchque_help explains action types must be pre-defined and that webhooks are optional", async () => {
  await withClient(async (client) => {
    const result = await client.callTool({ name: "touchque_help", arguments: {} });
    const text = result.content[0].text;
    assert.match(text, /unknown_action/);
    assert.match(text, /WEBHOOKS ARE OPTIONAL/);
  });
});

test("troubleshoot_touchque covers unknown_action as its own triage branch", async () => {
  await withClient(async (client) => {
    const result = await client.getPrompt({ name: "troubleshoot_touchque" });
    assert.match(result.messages[0].content.text, /unknown_action/);
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

test("validate_integration recognizes the correct guard per language (Python/PHP/Go), not just Node", async () => {
  await withClient(async (client) => {
    const cases = [
      {
        framework: "flask",
        code: `
          from touchque.contrib.flask import require_touchque
          @app.post("/transfer")
          @require_touchque("SEND_MONEY")
          def transfer():
              try:
                  return jsonify(ok=True, key=os.environ["TQ_API_KEY"])
              except Exception:
                  return jsonify(ok=False), 500
        `,
      },
      {
        framework: "laravel",
        code: `
          Route::post('/transfer', [TransferController::class, 'store'])
              ->middleware('touchque:SEND_MONEY');
          // in the controller:
          try {
              $key = getenv('TQ_API_KEY');
          } catch (\\Exception $e) {}
        `,
      },
      {
        framework: "net-http",
        code: `
          import "github.com/Touchque/touchque-go/touchque"
          mux.Handle("/transfer", touchque.Require(tq, "SEND_MONEY", transferHandler, touchque.RequireOptions{}))
          func transferHandler(w http.ResponseWriter, r *http.Request) {
              key := os.Getenv("TQ_API_KEY")
              if err != nil {
                  return
              }
          }
        `,
      },
    ];

    for (const { framework, code } of cases) {
      const result = await client.callTool({ name: "validate_integration", arguments: { code, framework } });
      const text = result.content[0].text;
      assert.match(text, /Score: 100%/, `${framework} should score 100%:\n${text}`);
    }
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

// ── Offline QR linked to its push (reject kills the QR) + number matching ─────────────────────────

test("configure_offline_sign teaches linking the QR to its push (requestId), request_rejected as a final no, and the number under the QR", async () => {
  await withClient(async (client) => {
    const text = (await client.getPrompt({ name: "configure_offline_sign" })).messages[0].content.text;
    assert.match(text, /requestId/);
    assert.match(text, /request_rejected/);
    assert.match(text, /challengeCode/);
    assert.match(text, /UNDER THE QR/);
    // The real option name: externalUsername (the old prompt said `user`, which this call does not take).
    assert.match(text, /externalUsername: req\.session\.user\.email/);
    assert.doesNotMatch(text, /^\s*user: req\.session\.user\.email/m);
    // Other languages are pointed at with their real parameter names.
    assert.match(text, /request_id/);
    assert.match(text, /RequestID/);
  });
});

test("integrate_touchque, audit and troubleshoot prompts know about the reject-linked offline QR", async () => {
  await withClient(async (client) => {
    const integrate = (await client.getPrompt({ name: "integrate_touchque" })).messages[0].content.text;
    assert.match(integrate, /step\.offline\.challengeCode/);
    assert.match(integrate, /request_rejected/);
    const audit = (await client.getPrompt({ name: "audit_touchque_integration" })).messages[0].content.text;
    assert.match(audit, /Offline fallback/);
    assert.match(audit, /REJECT/);
    const troubleshoot = (await client.getPrompt({ name: "troubleshoot_touchque" })).messages[0].content.text;
    assert.match(troubleshoot, /request_rejected/);
  });
});

test("touchque_help explains linking an offline QR to its push", async () => {
  await withClient(async (client) => {
    const text = (await client.callTool({ name: "touchque_help", arguments: {} })).content[0].text;
    assert.match(text, /requestId/);
    assert.match(text, /challengeCode/);
  });
});

test("bundled docs and types carry requestId / challengeCode for the offline QR in all 4 languages", async () => {
  await withClient(async (client) => {
    const expectations = {
      node: /requestId\?: string[\s\S]*challengeCode\?: string/,
      python: /request_id[\s\S]*challengeCode/,
      php: /requestId[\s\S]*challengeCode/,
      go: /RequestID[\s\S]*ChallengeCode/,
    };
    for (const [language, re] of Object.entries(expectations)) {
      const types = (await client.callTool({ name: "get_sdk_types", arguments: { language } })).content[0].text;
      assert.match(types, re, `${language} types lack the offline requestId/challengeCode`);
      const docs = (await client.callTool({ name: "get_touchque_docs", arguments: { language } })).content[0].text;
      assert.match(docs, /request_rejected/, `${language} docs lack the request_rejected behaviour`);
    }
  });
});

test("bundled offline examples use the real signatures (externalUsername / external_username / OfflineChallengeOptions{ExternalUsername})", async () => {
  await withClient(async (client) => {
    const node = (await client.callTool({ name: "get_touchque_docs", arguments: { language: "node" } })).content[0].text;
    assert.match(node, /tq\.offline\.challenge\(\{\s*externalUsername:/);
    const py = (await client.callTool({ name: "get_touchque_docs", arguments: { language: "python" } })).content[0].text;
    assert.match(py, /offline\.challenge\(external_username=/);
    const go = (await client.callTool({ name: "get_touchque_docs", arguments: { language: "go" } })).content[0].text;
    assert.match(go, /OfflineChallengeOptions\{\s*ExternalUsername:/);
    assert.doesNotMatch(go, /Offline\.Challenge\(ctx,/);
  });
});

test("validate_integration warns (unscored) when an offline QR is issued without a requestId, and stays quiet when it is linked", async () => {
  await withClient(async (client) => {
    const base = (offlineCall) => `
      const { TouchQue } = require('@touchque/node');
      const tq = new TouchQue({ apiKey: process.env.TQ_API_KEY, apiSecret: process.env.TQ_API_SECRET });
      app.post('/offline', async (req, res) => {
        try { res.json(await ${offlineCall}); } catch (e) { res.status(500).end(); }
      });
      app.post('/x', requireTouchQue('SEND_MONEY', { user: (r) => r.session.user }), (q, r) => r.json({ ok: 1 }));`;
    const unlinked = (await client.callTool({
      name: "validate_integration",
      arguments: { code: base("tq.offline.challenge({ externalUsername: 'a@b.c', type: 'LOGIN' })"), framework: "express" },
    })).content[0].text;
    assert.match(unlinked, /never links it to a push/);
    assert.match(unlinked, /Score: 100%/); // advisory only — not scored

    const linked = (await client.callTool({
      name: "validate_integration",
      arguments: { code: base("tq.offline.challenge({ externalUsername: 'a@b.c', type: 'LOGIN', requestId: req.body.requestId })"), framework: "express" },
    })).content[0].text;
    assert.doesNotMatch(linked, /never links it to a push/);
  });
});

test("validate_integration recognizes the versioned Go module path (…/touchque-go/v3/touchque)", async () => {
  await withClient(async (client) => {
    const code = `package main
import (
  "os"
  "github.com/Touchque/touchque-go/v3/touchque"
)
func main() {
  _ = os.Getenv("TQ_API_KEY")
  h := touchque.Require(tq, "SEND_MONEY", handler, opts)
  if err := serve(h); err != nil { panic(err) }
}`;
    const text = (await client.callTool({ name: "validate_integration", arguments: { code, framework: "net-http", language: "go" } })).content[0].text;
    assert.match(text, /✅ github\.com\/Touchque\/touchque-go\/v3 SDK is imported/);
  });
});
