// Unit tests of the remote server's pieces that need no Touchque account. The
// whole sign-in → token → tools path runs against a real SSO in
// touchque-sso-backend tests/integration/touchqueMcp.test.js.

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const http = require("http");
const { sectionsFor, languageFromFiles, SDKS } = require("./sdks");
const { parse } = require("./docsSearch");
const { listPrompts, getPrompt } = require("./prompts");
const { actionTypesIn, featureRows, TOOLS, callTool } = require("./tools");
const { createVerifier, challenge, thumbprint } = require("./auth");
const { loadConfig } = require("./config");
const { createApp } = require("./server");

test("every SDK README gives the sections each feature needs", () => {
  for (const lang of Object.keys(SDKS)) {
    const phone = sectionsFor(lang, "phone_approval");
    assert.match(phone, /## Install/, `${lang}: install`);
    assert.match(sectionsFor(lang, "touchque_login"), /TouchQue Login/i, `${lang}: Touchque Login`);
    assert.match(sectionsFor(lang, "webhooks"), /## Webhooks/, `${lang}: webhooks`);
    assert.match(sectionsFor(lang, "passkeys"), /passkey/i, `${lang}: passkeys`);
  }
});

test("the language comes from the project's manifest files", () => {
  assert.equal(languageFromFiles(["/app/package.json"]), "node");
  assert.equal(languageFromFiles(["go.mod"]), "go");
  assert.equal(languageFromFiles(["src/Api.csproj"]), "dotnet");
  assert.equal(languageFromFiles(["pyproject.toml"]), "python");
  assert.equal(languageFromFiles(["README.md"]), null);
});

test("the docs text splits into pages with their addresses", () => {
  const pages = parse("# Touchque\n\nintro\n\n# Webhooks · Touchque Docs\n\nSource: https://support.touchque.com/callback\n\nSigned with HMAC.\n\n# FAQ · Touchque Docs\n\nSource: https://support.touchque.com/faq\n\nAnswers.");
  assert.deepEqual(pages.map((p) => [p.title, p.url]), [["Webhooks", "https://support.touchque.com/callback"], ["FAQ", "https://support.touchque.com/faq"]]);
});

test("the five slash commands are there and each starts with who the person is", () => {
  const names = listPrompts().map((p) => p.name);
  for (const n of ["touchque-setup", "add-phone-approval", "add-passkeys", "add-touchque-login", "check-integration"]) {
    assert.ok(names.includes(n), n);
    assert.match(getPrompt(n, {}).messages[0].content.text, /touchque_whoami/);
  }
  assert.equal(getPrompt("nope", {}), null);
});

test("action types are read from code in every SDK's style", () => {
  const code = `requireTouchQue('SEND_MONEY'); @require_touchque("CHANGE_EMAIL") Route::post()->middleware('touchque:DELETE_ACCOUNT'); touchque.Require("PAYOUT", opts)`;
  assert.deepEqual(actionTypesIn(code).sort(), ["CHANGE_EMAIL", "DELETE_ACCOUNT", "PAYOUT", "SEND_MONEY"]);
});

test("features: base ones are always on; the platform switch wins over the plan", () => {
  const rows = featureRows({ features: ["ciam", "mobile_sdk"], platformOff: ["mobile_sdk"] });
  const on = (id) => rows.find((f) => f.id === id).on;
  assert.equal(on("core_2fa"), true);
  assert.equal(on("ciam"), true);
  assert.equal(on("mobile_sdk"), false);
  assert.equal(on("workforce_sso"), false);
});

test("a feature that is OFF gets no integration code", async () => {
  const ws = { context: async () => ({ organization: { name: "Acme", role: "member" }, features: [], platformOff: [], organizations: [] }) };
  const r = await callTool("touchque_generate_integration", { feature: "touchque_login", language: "node" }, ws, {}, loadConfig({}));
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /OFF for Acme/);
});

test("a read-only connection cannot change the workspace", async () => {
  const ws = { canWrite: false, context: async () => ({}) };
  const r = await callTool("touchque_create_api_key", { name: "x", confirm: true }, ws, {}, loadConfig({}));
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /may only read/);
});

test("every tool says whether it only reads", () => {
  for (const t of TOOLS) assert.equal(typeof t.annotations.readOnlyHint, "boolean", t.name);
});

// A tiny issuer: its JWKS and tokens signed with its key.
function issuer() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
  const srv = http.createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  const sign = (payload, header = {}) => {
    const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "at+jwt", kid: "k1", ...header })).toString("base64url");
    const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${h}.${p}.${crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url")}`;
  };
  return { srv, sign };
}

test("tokens: only this server's audience, issuer, type and an unexpired one; DPoP when bound", async () => {
  const iss = issuer();
  await new Promise((r) => iss.srv.listen(0, r));
  const config = loadConfig({ TOUCHQUE_MCP_RESOURCE: "https://api.example.com/mcp", TOUCHQUE_MCP_ISSUER: "https://sso.example.com/mcp", TOUCHQUE_JWKS_URI: `http://localhost:${iss.srv.address().port}/jwks` });
  const verify = createVerifier(config);
  const now = Math.floor(Date.now() / 1000);
  const good = { iss: config.issuer, aud: config.resource, sub: "u1", gid: "g1", type: "mcp", scope: "touchque:read", iat: now, exp: now + 600 };
  const req = (token, extra = {}) => ({ method: "POST", headers: { authorization: `Bearer ${token}`, ...extra } });
  try {
    const ok = await verify(req(iss.sign(good)));
    assert.deepEqual(ok.scopes, ["touchque:read"]);
    for (const bad of [{ aud: "https://other.example.com/mcp" }, { iss: "https://evil.example.com/mcp" }, { type: "sso" }, { exp: now - 60 }]) {
      await assert.rejects(verify(req(iss.sign({ ...good, ...bad }))), /not valid|expired|Not a Touchque/);
    }
    await assert.rejects(verify({ headers: {} }), /Sign in/);
    // A DPoP-bound token needs a proof from the bound key, for this request and token.
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pub = publicKey.export({ format: "jwk" });
    const bound = iss.sign({ ...good, cnf: { jkt: thumbprint(pub) } });
    await assert.rejects(verify(req(bound)), /DPoP/);
    const proof = (over = {}) => {
      const h = Buffer.from(JSON.stringify({ typ: "dpop+jwt", alg: "ES256", jwk: pub })).toString("base64url");
      const p = Buffer.from(JSON.stringify({ htm: "POST", htu: config.resource, iat: now, jti: crypto.randomUUID(), ath: crypto.createHash("sha256").update(bound).digest("base64url"), ...over })).toString("base64url");
      return `${h}.${p}.${crypto.sign("SHA256", Buffer.from(`${h}.${p}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
    };
    assert.ok(await verify(req(bound, { dpop: proof() })));
    await assert.rejects(verify(req(bound, { dpop: proof({ htu: "https://api.example.com/other" }) })), /another request/);
    const once = proof();
    await verify(req(bound, { dpop: once }));
    await assert.rejects(verify(req(bound, { dpop: once })), /used already/);
    assert.match(challenge(config), /resource_metadata="https:\/\/api\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/);
  } finally {
    iss.srv.close();
  }
});

test("the server needs its exchange secret, publishes its resource metadata and asks to sign in", async () => {
  assert.throws(() => createApp(loadConfig({})), /TOUCHQUE_MCP_SECRET/);
  const app = createApp(loadConfig({ TOUCHQUE_MCP_SECRET: "s".repeat(40), TOUCHQUE_MCP_RESOURCE: "https://api.example.com/mcp", TOUCHQUE_SSO_URL: "https://sso.example.com" }));
  const srv = app.listen(0);
  const base = `http://localhost:${srv.address().port}`;
  try {
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    assert.deepEqual(prm.authorization_servers, ["https://sso.example.com/mcp"]);
    assert.equal(prm.resource, "https://api.example.com/mcp");
    const anon = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(anon.status, 401);
    assert.match(anon.headers.get("www-authenticate"), /^Bearer resource_metadata=/);
  } finally {
    srv.close();
  }
});

test("the checklist takes the 4.x (TouchQue) and the 5.0 (Touchque) names alike", async () => {
  const { handlers } = require("../index.js");
  const run = async (code, framework, language) => (await handlers.callTool({ params: { name: "validate_integration", arguments: { code, framework, language } } })).content[0].text;
  const node5 = "const { Touchque, requireTouchque } = require('@touchque/node');\nconst tq = new Touchque({ apiKey: process.env.TQ_API_KEY, apiSecret: process.env.TQ_API_SECRET });\napp.post('/pay', requireTouchque('SEND_MONEY', { tq }), h);";
  assert.match(await run(node5, "express"), /Score: 100%/);
  const node4 = node5.replace(/Touchque/g, "TouchQue");
  assert.match(await run(node4, "express"), /Score: 100%/);
  const dotnet5 = "using Touchque.AspNetCore;\nbuilder.Services.AddTouchque();\napp.MapPost(\"/pay\", h).RequireTouchque(\"SEND_MONEY\");\ntry { } catch (Exception e) { }";
  assert.match(await run(dotnet5, "aspnetcore", "dotnet"), /✅ Route protection applied/);
  const php5 = "use Touchque\\Touchque;\nRoute::post('/pay', $h)->middleware('touchque:SEND_MONEY'); getenv('TQ_API_KEY'); try { } catch (\\Exception $e) { }";
  assert.match(await run(php5, "laravel", "php"), /✅ Route protection applied/);
  const go5 = 'import "github.com/Touchque/touchque-go/v5/touchque"\nmux.Handle("/pay", touchque.Require(tq, "SEND_MONEY", h, touchque.RequireOptions{User: u}))\nos.Getenv("TQ_API_KEY")\nif err != nil {}';
  const goReport = await run(go5, "net-http", "go");
  assert.match(goReport, /✅ Route protection applied/);
  assert.doesNotMatch(goReport, /the current SDK is/);
  assert.deepEqual(actionTypesIn("requireTouchque('PAYOUT'); [RequireTouchque(\"REFUND\")]").sort(), ["PAYOUT", "REFUND"]);
});

// ── 4.1: shorter, smarter answers ──────────────────────────────────────────
const docsSearch = require("./docsSearch");
const tools41 = require("./tools");

test("a docs page becomes clean sections: no tabs, Copy, line numbers or pager", () => {
  const html = `<html><body><main><nav class="docs-breadcrumb">Docs / API</nav><div class="docs-hero"><h1>Callback / webhook</h1></div>
<p>Set the Callback URL under Developers &rarr; Webhooks.</p>
<div class="docs-params-title">Callback payload</div><table><tr><th>Field</th><th>Type</th></tr><tr><td>status</td><td>string</td></tr></table>
<div class="docs-code-block"><div class="docs-code-header"><div class="docs-code-tabs"><button class="docs-code-tab active">JavaScript</button><button class="docs-code-tab">PHP</button></div><div class="docs-code-actions"><button class="docs-copy-btn">Copy</button><button class="docs-try-btn">Try it</button></div></div>
<div class="docs-code-body"><div class="docs-code-lines"><span>1</span><span>2</span></div><pre><code>tq.webhook.verify({ rawBody, signature });
res.json({ ok: true });</code></pre></div></div>
<div class="docs-pager"><a class="docs-pager-link">Next</a></div></main></body></html>`;
  const t = docsSearch.htmlToText(html);
  assert.doesNotMatch(t, /JavaScript|PHP|Copy|Try it|Next|Docs \/ API/);
  assert.match(t, /tq\.webhook\.verify\(\{ rawBody, signature \}\);\nres\.json/);
  assert.match(t, /Developers → Webhooks/);
  assert.deepEqual(docsSearch.splitSections(t).map((s) => s.heading), ["Callback / webhook", "Callback payload"]);
});

test("search: Turkish questions find the right section and are answered in Turkish; prices get a straight answer", async () => {
  const page = (url, lang, title, secs) => ({ url, lang, title, sections: [{ heading: title, text: secs[0] }, ...secs.slice(1).map(([h, x]) => ({ heading: h, text: x }))] });
  const pages = [
    page("https://d.test/offline-sign", "en", "Offline sign", ["When the phone has no internet, show a QR; the phone shows a 7-character code.", ["Offline time-based code", "A TOTP code as a fallback."]]),
    page("https://d.test/offline-sign?lang=tr", "tr", "Çevrimdışı onay", ["Telefonda internet yoksa bir QR gösterin; telefon 7 karakterlik bir kod üretir.", ["Zaman tabanlı kod", "Yedek olarak TOTP kodu."]]),
    page("https://d.test/callback", "en", "Callback / webhook", ["Set the Callback URL under Developers → Webhooks.", ["Verify the signature", "Check the x-signature header with your API secret (HMAC-SHA256)."]]),
    page("https://d.test/callback?lang=tr", "tr", "Callback / webhook", ["Callback URL'yi Developers → Webhooks altında girin.", ["İmzayı doğrulayın", "x-signature başlığını API secret ile kontrol edin (HMAC-SHA256)."]]),
    page("https://d.test/sdk-setup", "en", "Setup", ["Install the SDK and set your keys.", ["Where the SDK plugs in", "Your backend calls the API."]]),
    page("https://d.test/sdk-setup?lang=tr", "tr", "Kurulum", ["SDK'yı kurun ve anahtarlarınızı tanımlayın.", ["SDK nereye bağlanır", "Backend'iniz API'yi çağırır."]]),
  ];
  docsSearch._setIndex(docsSearch.indexFromPages(pages), "https://d.test");
  const top = async (q) => (await docsSearch.search("https://d.test", q)).hits[0];
  const off = await top("Kullanıcının telefonunda internet yoksa ne olur?");
  assert.equal(off.title, "Çevrimdışı onay");
  assert.equal(off.lang, "tr");
  assert.equal((await top("Webhook nasıl kurulur?")).title, "Callback / webhook");
  const sig = await top("webhook imzasını nasıl doğrularım");
  assert.equal(sig.section, "İmzayı doğrulayın");
  assert.equal((await top("how do I verify the webhook signature")).section, "Verify the signature");
  const price = await docsSearch.search("https://d.test", "Fiyatlar ne kadar?");
  assert.match(price.note, /does not publish prices/);
  const p = await docsSearch.page("https://d.test", "/callback", { section: "verify" });
  assert.match(p.text, /x-signature/);
});

test("SDK docs and types come a part at a time", () => {
  assert.match(tools41.readmeToc("node"), /- Install \(/);
  assert.match(tools41.readmeSection("node", "webhooks"), /^## Webhooks/);
  assert.ok(tools41.typeNames("node").includes("TouchQueConfig"));
  const block = tools41.typeBlock("node", "LoginRequestOptions");
  assert.ok(block && block.length < 8200 && /\{[\s\S]*\}/.test(block));
  for (const lang of ["python", "go", "php"]) assert.ok(tools41.typeNames(lang).length > 5, lang);
});

test("the snapshot answers account questions in a few lines, and says what an owner may do", () => {
  const ctx = { user: { email: "dev@example.com" }, organization: { id: "o1", name: "Acme", slug: "acme", role: "owner" }, organizations: [{ id: "o1", name: "Acme", role: "owner" }, { id: "o2", name: "Globex", role: "member" }], features: ["ciam"], platformOff: ["mobile_sdk"] };
  const setup = {
    apiKeys: { keys: [{ keyId: "tq_1", name: "Main", status: "ACTIVE", mine: true, lastUsed: "never" }] }, webhook: { url: null }, actionTypes: [],
    passkey: { rpId: null }, login: { on: true, slug: "acme", issuer: "https://acme.login.example.com", apps: [{ name: "Web", clientId: "c1", appType: "spa", redirectUris: [] }] },
  };
  const t = tools41.snapshotText(ctx, setup, { canWrite: true });
  assert.match(t, /Role: owner/);
  assert.match(t, /tq_1 "Main" \(theirs\), last used never/);
  assert.match(t, /Action types: none yet/);
  assert.match(t, /Mobile SDK \(not available on Touchque yet\)/);
  assert.match(t, /As the owner they can turn one on/);
  assert.match(t, /no redirect URI/);
  assert.match(t, /Globex \(member\)/);
  assert.ok(t.length < 1800, `snapshot is ${t.length} characters`);
  const many = tools41.snapshotText(ctx, { ...setup, actionTypes: Array.from({ length: 53 }, (_, i) => ({ type: `TYPE_${i}` })) }, { canWrite: true });
  assert.match(many, /Action types: 53, e\.g\. TYPE_0/);
  assert.doesNotMatch(many, /TYPE_20/);
});

test("the action-type recipe is each SDK's real call", () => {
  assert.equal(tools41.DEFINE_ACTION.node("SEND_MONEY", "Send money"), "await tq.actionTypes.define('SEND_MONEY', { name: 'Send money', critical: true });");
  assert.match(tools41.DEFINE_ACTION.go("SEND_MONEY", "Send money"), /touchque\.DefineOptions\{Name: "Send money", Critical: &critical\}/);
  assert.match(tools41.DEFINE_ACTION.python("X", "x"), /^client\.action_types\.define\("X", name="x", critical=True\)$/);
});

test("instructions: routing plus the member's facts at initialize; the routing alone when they are slow", async () => {
  const { instructionsFor, ROUTING } = require("./server");
  assert.ok(ROUTING.length < 2600, `routing is ${ROUTING.length}`);
  assert.doesNotMatch(ROUTING, /Start every Touchque task/);
  const slow = { claims: { gid: "g" }, canWrite: false, context: () => new Promise(() => {}), tryDash: async () => ({ data: null }) };
  const t = await instructionsFor(slow, { timeoutMs: 50 });
  assert.match(t, /could not be read just now/);
  const ok = { claims: { gid: "g2" }, canWrite: true, context: async () => ({ user: { email: "a@b.c" }, organization: { id: "o", name: "Acme", role: "admin" }, organizations: [{ id: "o", name: "Acme", role: "admin" }], features: [], platformOff: [] }), tryDash: async () => ({ data: null, error: { code: "x", message: "x" } }) };
  assert.match(await instructionsFor(ok), /Organization: Acme\. Role: admin/);
});

test("the Node checklist accepts new TouchQue() reading the environment itself", async () => {
  const { handlers } = require("../index.js");
  const code = "const { TouchQue, requireTouchQue } = require('@touchque/node');\nconst tq = new TouchQue();\napp.post('/pay', requireTouchQue('SEND_MONEY', { tq }), h);";
  const r = (await handlers.callTool({ params: { name: "validate_integration", arguments: { code, framework: "express" } } })).content[0].text;
  assert.match(r, /✅ Environment variables used for secrets/);
});
