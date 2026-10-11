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
          mux.Handle("/transfer", touchque.Require(tq, "SEND_MONEY", transferHandler, touchque.RequireOptions{User: sessionUser}))
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

// ── SDK 3.2.0: relay routers, device proof, Go User/UserID, fraud reports ─────────────────────────

const validate = async (client, code, framework, language) =>
  (await client.callTool({ name: "validate_integration", arguments: { code, framework, ...(language ? { language } : {}) } })).content[0].text;

test("validate_integration accepts the relay router as the guard in Python, PHP and Go (not only Node's touchqueRouter)", async () => {
  await withClient(async (client) => {
    const cases = [
      {
        framework: "flask",
        code: `
          import os
          from touchque.contrib.flask import touchque_relay_blueprint
          app.register_blueprint(touchque_relay_blueprint(
              tq, get_user_id=lambda req: session.get('user'),
              get_login_user=lambda req: session.get('password_ok'),
          ), url_prefix='/touchque')
          key = os.environ["TQ_API_KEY"]`,
      },
      {
        framework: "fastapi",
        code: `
          import os
          from touchque.contrib.fastapi import touchque_relay_router
          app.include_router(touchque_relay_router(tq, get_user_id=uid, get_login_user=login_user), prefix='/touchque')
          key = os.getenv("TQ_API_KEY")`,
      },
      {
        framework: "django",
        code: `
          import os
          from touchque.contrib.django import touchque_relay_urls
          urlpatterns = [path('touchque/', include(touchque_relay_urls(get_user_id=uid, get_login_user=login_user)))]
          key = os.environ["TQ_API_KEY"]`,
      },
      {
        framework: "other",
        language: "python",
        code: `
          import os
          from touchque import RelayHandler
          relay = RelayHandler(tq, get_user_id=uid, get_login_user=login_user)
          key = os.environ["TQ_API_KEY"]`,
      },
      {
        framework: "laravel",
        code: `<?php
          use TouchQue\\Laravel\\TouchQueRelay;
          TouchQueRelay::routes(app('router'), 'touchque');
          $key = getenv('TQ_API_KEY');`,
      },
      {
        framework: "other",
        language: "php",
        code: `<?php
          use TouchQue\\Relay\\RelayHandler;
          $relay = new RelayHandler($tq, ['getUserId' => fn ($r) => $_SESSION['user'] ?? null]);
          $key = getenv('TQ_API_KEY');`,
      },
      {
        framework: "net-http",
        code: `package main
          import (
            "os"
            "github.com/Touchque/touchque-go/v3/touchque"
          )
          func main() {
            _ = os.Getenv("TQ_API_KEY")
            mux.Handle("/touchque/", http.StripPrefix("/touchque", touchque.NewRelayHandler(tq, touchque.RelayOptions{
              UserID:    func(r *http.Request) string { return sessionUser(r) },
              LoginUser: func(r *http.Request) string { return passwordVerifiedUser(r) },
            })))
          }`,
      },
    ];
    for (const { framework, language, code } of cases) {
      const text = await validate(client, code, framework, language);
      assert.match(text, /✅ Route protection applied/, `${framework}/${language || ""} relay should count as the guard:\n${text}`);
      assert.match(text, /Score: 100%/, `${framework}/${language || ""} should score 100%:\n${text}`);
    }
  });
});

test("validate_integration warns (unscored) about device-proof verification without a pinned key, in all 4 languages", async () => {
  await withClient(async (client) => {
    const cases = {
      node: {
        framework: "express",
        unpinned: "const ok = verifyApprovalProof(event.approvalProof, { requestId, type: 'WITHDRAW', details, allowUnpinnedKey: true });",
        pinned: "const ok = verifyApprovalProof(event.approvalProof, { requestId, type: 'WITHDRAW', details, expectedPublicKey: user.touchqueDeviceKey });",
        name: /allowUnpinnedKey: true/,
      },
      python: {
        framework: "flask",
        unpinned: "ok = verify_approval_proof(event['approvalProof'], request_id=rid, type='WITHDRAW', allow_unpinned_key=True)",
        pinned: "ok = verify_approval_proof(event['approvalProof'], request_id=rid, type='WITHDRAW', expected_public_key=user.touchque_device_key)",
        name: /allow_unpinned_key=True/,
      },
      php: {
        framework: "laravel",
        unpinned: "$ok = ApprovalProof::verify($event['approvalProof'] ?? null, ['requestId' => $rid, 'type' => 'WITHDRAW', 'allowUnpinnedKey' => true]);",
        pinned: "$ok = ApprovalProof::verify($event['approvalProof'] ?? null, ['requestId' => $rid, 'type' => 'WITHDRAW', 'expectedPublicKey' => $user->touchque_device_key]);",
        name: /'allowUnpinnedKey' => true/,
      },
      go: {
        framework: "net-http",
        unpinned: `ok := touchque.VerifyApprovalProof(event["approvalProof"], touchque.VerifyApprovalProofOptions{RequestID: id, Type: "WITHDRAW", AllowUnpinnedKey: true})`,
        pinned: `ok := touchque.VerifyApprovalProof(event["approvalProof"], touchque.VerifyApprovalProofOptions{RequestID: id, Type: "WITHDRAW", ExpectedPublicKey: user.TouchQueDeviceKey})`,
        name: /AllowUnpinnedKey: true/,
      },
    };
    for (const [language, { framework, unpinned, pinned, name }] of Object.entries(cases)) {
      const warned = await validate(client, unpinned, framework, language);
      assert.match(warned, /WITHOUT a pinned key/, `${language} unpinned proof should warn:\n${warned}`);
      assert.match(warned, /trust on first use/);
      assert.match(warned, name, `${language} warning should name the real option`);
      const quiet = await validate(client, pinned, framework, language);
      assert.doesNotMatch(quiet, /WITHOUT a pinned key/, `${language} pinned proof should not warn`);
      assert.doesNotMatch(quiet, /never verifies the device proof/, `${language} verified proof should not get the hint`);
    }
  });
});

test("validate_integration fails the Go check when RequireOptions has no User or RelayOptions has no UserID", async () => {
  await withClient(async (client) => {
    const wrap = (body) => `package main
import (
  "os"
  "github.com/Touchque/touchque-go/v3/touchque"
)
func main() {
  _ = os.Getenv("TQ_API_KEY")
  ${body}
  if err := serve(); err != nil { panic(err) }
}`;
    const missingUser = await validate(client, wrap(`mux.Handle("/t", touchque.Require(tq, "SEND_MONEY", h, touchque.RequireOptions{
    Details: func(r *http.Request) []touchque.LoginDetail { return nil },
  }))`), "net-http");
    assert.match(missingUser, /❌ touchque\.RequireOptions sets User[^\n]*RequireOptions\{…\} has no User /);
    assert.match(missingUser, /X-Touchque-User/);
    assert.doesNotMatch(missingUser, /Score: 100%/);

    const missingUserID = await validate(client, wrap(`mux.Handle("/touchque/", touchque.NewRelayHandler(tq, touchque.RelayOptions{
    LoginUser: func(r *http.Request) string { return passwordVerifiedUser(r) },
  }))`), "net-http");
    assert.match(missingUserID, /❌ [^\n]*RelayOptions\{…\} has no UserID/);

    // A User: inside a nested func body is not the literal's own field.
    const nestedOnly = await validate(client, wrap(`h := touchque.Require(tq, "X", next, touchque.RequireOptions{
    Details: func(r *http.Request) []touchque.LoginDetail { x := T{User: "a"}; _ = x; return nil },
  })`), "net-http");
    assert.match(nestedOnly, /❌ [^\n]*RequireOptions\{…\} has no User /);
  });
});

test("validate_integration does not flag Go options that set User / UserID (no false positives)", async () => {
  await withClient(async (client) => {
    const code = `package main
import (
  "os"
  "github.com/Touchque/touchque-go/v3/touchque"
)
func main() {
  _ = os.Getenv("TQ_API_KEY")
  mux.Handle("/transfer", touchque.Require(tq, "SEND_MONEY", transferHandler, touchque.RequireOptions{
    User: func(r *http.Request) string { return sessionUser(r) },
    Details: func(r *http.Request) []touchque.LoginDetail {
      return []touchque.LoginDetail{{Label: "Amount", Value: amount(r)}}
    },
  }))
  mux.Handle("/touchque/", http.StripPrefix("/touchque", touchque.NewRelayHandler(tq, touchque.RelayOptions{UserID: sessionUser})))
  opts := touchque.RequireOptions{}
  opts.User = sessionUser
  mux.Handle("/other", touchque.Require(tq, "OTHER", h, opts))
  if err := serve(); err != nil { panic(err) }
}`;
    const text = await validate(client, code, "net-http");
    assert.match(text, /✅ touchque\.RequireOptions sets User and touchque\.RelayOptions sets UserID/);
    assert.match(text, /Score: 100% \(7\/7/);
  });
});

test("validate_integration only runs the Go User/UserID check for Go", async () => {
  await withClient(async (client) => {
    const text = await validate(client, "const { requireTouchQue } = require('@touchque/node');", "express");
    assert.doesNotMatch(text, /RequireOptions sets User/);
    assert.match(text, /\(\d\/6 checks passed\)/);
  });
});

test("validate_integration hints (unscored) at verifying the device proof when approved requests are handled without it", async () => {
  await withClient(async (client) => {
    const cases = {
      node: { framework: "express", code: "if (event.event === 'login.confirmed') { await ship(event.requestId); }", verify: /verifyApprovalProof/ },
      python: { framework: "flask", code: "if step['state'] == 'approved':\n    ship(step['id'])", verify: /verify_approval_proof/ },
      php: { framework: "laravel", code: "if ($status['status'] === 'CONFIRMED') { ship($requestId); }", verify: /ApprovalProof::verify/ },
      go: { framework: "net-http", code: "if step.State == touchque.StepApproved { ship(step.ID) }", verify: /touchque\.VerifyApprovalProof/ },
    };
    for (const [language, { framework, code, verify }] of Object.entries(cases)) {
      const text = await validate(client, code, framework, language);
      assert.match(text, /ℹ️ This code acts on an approved\/confirmed request but never verifies the device proof/, `${language}:\n${text}`);
      assert.match(text, verify, `${language} hint should name the real function`);
    }
    // Plain guard usage with no explicit approved handling stays quiet.
    const guardOnly = await validate(client, "const { requireTouchQue } = require('@touchque/node'); app.post('/x', requireTouchQue('X'), h);", "express");
    assert.doesNotMatch(guardOnly, /never verifies the device proof/);
  });
});

test("integrate_touchque and audit prompts cover relay routers in all 4 languages, pinned device proofs and reportFraud", async () => {
  await withClient(async (client) => {
    for (const name of ["integrate_touchque", "audit_touchque_integration"]) {
      const text = (await client.getPrompt({ name })).messages[0].content.text;
      for (const re of [
        /touchqueRouter/, /touchque_relay_blueprint/, /touchque_relay_router/, /touchque_relay_urls/,
        /TouchQueRelay::routes/, /TouchQue\\Relay\\RelayHandler/, /touchque\.NewRelayHandler/,
        /verifyApprovalProof/, /verify_approval_proof/, /ApprovalProof::verify/, /touchque\.VerifyApprovalProof/,
        /expectedPublicKey/, /reportFraud/, /report_fraud/, /ReportFraud/, /account_takeover/,
      ]) {
        assert.match(text, re, `${name} lacks ${re}`);
      }
    }
  });
});

test("touchque_help mentions the 3.2.0 features", async () => {
  await withClient(async (client) => {
    const text = (await client.callTool({ name: "touchque_help", arguments: {} })).content[0].text;
    assert.match(text, /3\.2\.0/);
    assert.match(text, /NewRelayHandler/);
    assert.match(text, /verifyApprovalProof/);
    assert.match(text, /reportFraud/);
    assert.match(text, /RequireOptions\.User/);
  });
});

test("server reports the package version", async () => {
  await withClient(async (client) => {
    assert.equal(client.getServerVersion().version, require("./package.json").version);
    assert.equal(require("./package.json").version, "2.3.0");
  });
});

test("bundled types expose the 3.2.0 public API in all 4 languages", async () => {
  await withClient(async (client) => {
    const expectations = {
      node: [/export function verifyApprovalProof/, /export interface TouchQueRouterOptions/, /export function touchqueRouter/, /reportFraud\(/],
      python: [/def verify_approval_proof/, /class RelayHandler/, /def touchque_relay_blueprint/, /def touchque_relay_router/, /def touchque_relay_urls/, /def report_fraud/],
      php: [/class ApprovalProof/, /class RelayHandler/, /class TouchQueRelay/, /public static function routes/, /function reportFraud/],
      go: [/func VerifyApprovalProof/, /type RelayOptions struct/, /func NewRelayHandler/, /type RequireOptions struct/, /func \(\w+ \*\w+\) ReportFraud/],
    };
    for (const [language, res] of Object.entries(expectations)) {
      const types = (await client.callTool({ name: "get_sdk_types", arguments: { language } })).content[0].text;
      for (const re of res) assert.match(types, re, `${language} types lack ${re}`);
    }
  });
});

test("touchque_help mentions the 3.3.0 changes", async () => {
  await withClient(async (client) => {
    const text = (await client.callTool({ name: "touchque_help", arguments: {} })).content[0].text;
    assert.match(text, /3\.3\.0/);
    assert.match(text, /trustedProxyHops/);
    assert.match(text, /RequireOptions\.IP/);
    assert.match(text, /PASSKEY_ENROLL/);
  });
});

test("validate_integration warns (unscored) about the leftmost X-Forwarded-For hop in every language", async () => {
  await withClient(async (client) => {
    const snippets = {
      node: "const ip = req.headers['x-forwarded-for'].split(',')[0];",
      python: "ip = request.headers.get('X-Forwarded-For', '').split(',')[0].strip()",
      php: "$ip = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0];",
      go: 'ip := strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]',
    };
    for (const [language, line] of Object.entries(snippets)) {
      const text = (await client.callTool({ name: "validate_integration", arguments: { code: line, language } })).content[0].text;
      assert.match(text, /LEFTMOST X-Forwarded-For/, language);
    }
    const rightmost = (await client.callTool({
      name: "validate_integration",
      arguments: { code: "const hops = req.headers['x-forwarded-for'].split(','); const ip = hops[hops.length - 1];", language: "node" },
    })).content[0].text;
    assert.doesNotMatch(rightmost, /LEFTMOST X-Forwarded-For/);
  });
});

test("validate_integration hints (unscored) when Next.js withTouchQue sends no end-user address", async () => {
  await withClient(async (client) => {
    const route = (opts) => `
      import { withTouchQue${opts ? ", ipFromVercel" : ""} } from '@touchque/node';
      export const POST = withTouchQue('SEND_MONEY', { user: getUser${opts} })(async (req) => {
        try { return Response.json({ ok: true }); } catch (e) { return new Response(null, { status: 500 }); }
      });`;
    const bare = (await client.callTool({ name: "validate_integration", arguments: { code: route(""), framework: "nextjs" } })).content[0].text;
    assert.match(bare, /sends no end-user address/);
    const withIp = (await client.callTool({ name: "validate_integration", arguments: { code: route(", ip: ipFromVercel"), framework: "nextjs" } })).content[0].text;
    assert.doesNotMatch(withIp, /sends no end-user address/);
    const hops = (await client.callTool({ name: "validate_integration", arguments: { code: route(", trustedProxyHops: 1"), framework: "nextjs" } })).content[0].text;
    assert.doesNotMatch(hops, /sends no end-user address/);
  });
});
