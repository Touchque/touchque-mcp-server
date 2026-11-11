// The tools of the remote Touchque MCP server. Each call runs as the signed-in
// member, in their active organization, and sees only what the dashboard
// shows them (never a secret it does not show). Reading is the default; a
// change needs the touchque:write permission, the member's go-ahead (confirm:
// true after they said yes) and, like in the dashboard, their phone.
//
// Answers are short on purpose: an AI assistant reads every character. The
// member's own facts (organization, role, features, keys, Touchque Login)
// come once, in the server instructions (snapshotText), so most small
// questions need no tool at all; the docs come a section at a time.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { SDKS, FRONTEND, languageFromFiles, sectionsFor, sections: readmeSections, readme } = require("./sdks");
const docs = require("./docsSearch");
const { WorkspaceError } = require("./workspace");

const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "bundled", "features.json"), "utf8"));
const BUNDLED = path.join(__dirname, "..", "bundled");

// What a developer adds, the feature it needs and its docs page.
const INTEGRATIONS = {
  phone_approval: { feature: "core_2fa", label: "Phone approval (push with number matching)", docs: "/add-2fa" },
  passkeys: { feature: "core_2fa", label: "Passkeys (phishing-resistant sign-in and step-up)", docs: "/phishing-resistance" },
  touchque_login: { feature: "ciam", label: "Touchque Login (hosted sign-up and sign-in for your customers)", docs: "/touchque-login" },
  webhooks: { feature: "core_2fa", label: "Webhooks (every approval result at one URL)", docs: "/callback" },
  offline: { feature: "core_2fa", label: "Offline sign (QR + a 7-character code)", docs: "/offline-sign" },
  silent_sign_ins: { feature: "core_2fa", label: "Silent sign-ins (no prompt when nothing is new)", docs: "/silent-sign-ins" },
  ai_agents: { feature: "ai_agents", label: "AI agents (an identity per agent; a person approves on the phone)", docs: "/agents" },
};
const INTEGRATION_NAMES = Object.keys(INTEGRATIONS);
const LANGS = Object.keys(SDKS);

// Defining an action type, per SDK (4.x, from each SDK's ActionTypes resource).
const DEFINE_ACTION = {
  node: (t, n) => `await tq.actionTypes.define('${t}', { name: '${n}', critical: true });`,
  python: (t, n) => `client.action_types.define("${t}", name="${n}", critical=True)`,
  php: (t, n) => `$tq->actionTypes->define('${t}', '${n}', null, true);`,
  go: (t, n) => `critical := true\n_, err := client.ActionTypes.Define("${t}", touchque.DefineOptions{Name: "${n}", Critical: &critical})`,
  dotnet: (t, n) => `await tq.ActionTypes.DefineAsync("${t}", name: "${n}", critical: true);`,
  ruby: (t, n) => `client.action_types.define("${t}", name: "${n}", critical: true)`,
  java: (t, n) => `tq.actionTypes().define("${t}", "${n}", true);`,
};
const exampleName = (t) => t.toLowerCase().split(/[_.:-]+/).map((w, i) => (i ? w : w[0].toUpperCase() + w.slice(1))).join(" ");

const text = (t) => ({ content: [{ type: "text", text: t }] });
const fail = (t) => ({ isError: true, content: [{ type: "text", text: t }] });
const json = (v) => JSON.stringify(v, null, 1);
const cap = (s, n) => (s.length > n ? `${s.slice(0, n)}\n… (cut at ${n} characters; ask for a narrower section)` : s);

const STR = { type: "string" };
const TOOLS = [
  {
    name: "touchque_whoami",
    description: "The signed-in person's Touchque facts: organization, role, every feature ON/OFF, API key, webhook, action types, Touchque Login tenant and apps, other organizations. Usually already in the server instructions: call it only if they are missing or out of date. detail: true adds what each feature includes.",
    inputSchema: { type: "object", properties: { detail: { type: "boolean" } } },
    annotations: { readOnlyHint: true, title: "My Touchque account" },
  },
  {
    name: "touchque_use_organization",
    description: "Switch this connection to another of the person's organizations (id, slug or name). Later calls work there.",
    inputSchema: { type: "object", properties: { organization: STR }, required: ["organization"] },
    annotations: { readOnlyHint: true, title: "Switch organization" },
  },
  {
    name: "touchque_workspace_setup",
    description: "The organization's setup in detail, never a secret: API keys, webhook, action types, passkey domain, Touchque Login tenant and apps with redirect URIs. section narrows it.",
    inputSchema: { type: "object", properties: { section: { type: "string", enum: ["apiKeys", "webhook", "actionTypes", "passkey", "login"] } } },
    annotations: { readOnlyHint: true, title: "Workspace setup" },
  },
  {
    name: "touchque_search_docs",
    description: "Search the Touchque docs (support.touchque.com, English and Turkish) and SDK READMEs; returns the best 3 sections, short, each with a handle to read more. page (and section) returns one docs page, e.g. page: \"/callback\".",
    inputSchema: { type: "object", properties: { query: STR, page: STR, section: STR, lang: { type: "string", enum: ["en", "tr"] }, language: { type: "string", enum: LANGS, description: "SDK README to search (default: node, or the one the query names)" } } },
    annotations: { readOnlyHint: true, openWorldHint: true, title: "Search Touchque docs" },
  },
  {
    name: "touchque_pick_sdk",
    description: "Which Touchque SDK fits a project, whether it is published, the install command, import line and requirements. Pass language, or the project's manifest file names.",
    inputSchema: { type: "object", properties: { language: { type: "string", enum: LANGS }, files: { type: "array", items: STR } } },
    annotations: { readOnlyHint: true, title: "Pick an SDK" },
  },
  {
    name: "touchque_generate_integration",
    description: "What to write for one feature in one language: the SDK's own README sections (the real API), this workspace's values, what is missing first (e.g. the action type), and the steps. Refuses a feature that is OFF. Then edit the files yourself and run touchque_check_integration.",
    inputSchema: {
      type: "object",
      properties: { feature: { type: "string", enum: INTEGRATION_NAMES }, language: { type: "string", enum: LANGS }, framework: STR, action: { type: "string", description: "The action type to protect, e.g. SEND_MONEY" } },
      required: ["feature", "language"],
    },
    annotations: { readOnlyHint: true, title: "Generate integration" },
  },
  {
    name: "touchque_check_integration",
    description: "Checks integration code against the live workspace (feature on, active key, action types exist, redirect URIs registered, webhook set) and the SDK's rules (static checklist when framework is given).",
    inputSchema: { type: "object", properties: { code: STR, language: { type: "string", enum: LANGS }, framework: STR, redirectUris: { type: "array", items: STR }, clientId: STR } },
    annotations: { readOnlyHint: true, title: "Check integration" },
  },
  {
    name: "touchque_explain_case",
    description: "Explains a Touchque case code (like K7P-2QX) from a refused sign-in or approval: what was decided and why.",
    inputSchema: { type: "object", properties: { code: STR }, required: ["code"] },
    annotations: { readOnlyHint: true, title: "Explain a case code" },
  },
  {
    name: "touchque_define_action_type",
    description: "Creates an action type (e.g. SEND_MONEY) in the organization: owners and admins, needs touchque:write. Without confirm it only says what will happen; ask the person, then confirm: true.",
    inputSchema: { type: "object", properties: { type: { type: "string", description: "Letters, digits and _ . : - (max 64), e.g. SEND_MONEY" }, name: { type: "string", description: "Shown on the phone, e.g. Send money" }, critical: { type: "boolean" }, confirm: { type: "boolean" } }, required: ["type"] },
    annotations: { readOnlyHint: false, destructiveHint: false, title: "Define action type" },
  },
  {
    name: "touchque_create_api_key",
    description: "Creates an API key (owners and admins; refused when the person already has an active key: rotate that in the dashboard). Needs touchque:write. Without confirm it only asks; then confirm: true. The phone approves it (tell the person the number), then touchque_wait. The secret shows once: write it to the server's .env, never into the chat.",
    inputSchema: { type: "object", properties: { name: STR, expiresInDays: { type: "integer", minimum: 1, maximum: 730 }, confirm: { type: "boolean" } }, required: ["name"] },
    annotations: { readOnlyHint: false, destructiveHint: false, title: "Create API key" },
  },
  {
    name: "touchque_add_redirect_uri",
    description: "Adds a redirect URI to a Touchque Login app (needs touchque:write and Touchque Login ON). Without confirm it only asks; then confirm: true; the phone may approve it, then touchque_wait.",
    inputSchema: { type: "object", properties: { clientId: STR, redirectUri: STR, confirm: { type: "boolean" } }, required: ["clientId", "redirectUri"] },
    annotations: { readOnlyHint: false, destructiveHint: false, title: "Add redirect URI" },
  },
  {
    name: "touchque_send_test_approval",
    description: "Sends a test approval to the person's OWN Touchque app, only when they ask. Without confirm it only asks; then confirm: true; tell them the number, then touchque_wait.",
    inputSchema: { type: "object", properties: { confirm: { type: "boolean" } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, title: "Test approval on my phone" },
  },
  {
    name: "touchque_wait",
    description: "The result of something waiting for the person's phone: a change (create_api_key, add_redirect_uri) or a test approval. Waits up to 25 s.",
    inputSchema: { type: "object", properties: { id: STR }, required: ["id"] },
    annotations: { readOnlyHint: true, title: "Wait for the phone" },
  },
  {
    name: "get_touchque_docs",
    description: "An SDK's README: without section, its table of contents; with section (part of a heading, e.g. \"Webhooks\", \"Quick start\"), those sections.",
    inputSchema: { type: "object", properties: { language: { type: "string", enum: LANGS }, section: STR }, required: ["language"] },
    annotations: { readOnlyHint: true, title: "SDK README" },
  },
  {
    name: "get_sdk_types",
    description: "An SDK's type reference: without symbol, the list of names; with symbol (e.g. RequireOptions, ActionTypes), that declaration.",
    inputSchema: { type: "object", properties: { language: { type: "string", enum: LANGS }, symbol: STR }, required: ["language"] },
    annotations: { readOnlyHint: true, title: "SDK types" },
  },
  {
    name: "touchque_help",
    description: "What Touchque is and which tool answers what. Only needed when the server instructions are not shown.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, title: "Touchque help" },
  },
];

// ── Facts of the member's organization ─────────────────────────────────────

function featureRows(ctx) {
  const on = new Set(ctx.features || []);
  const off = new Set(ctx.platformOff || []);
  return CATALOG.features.map((f) => ({
    id: f.id, name: f.name, on: !off.has(f.id) && (f.base || on.has(f.id)), kind: f.kind, group: f.group, description: f.description, includes: f.includes || [],
    unavailable: off.has(f.id),
  }));
}
const isOn = (ctx, id) => featureRows(ctx).some((f) => f.id === id && f.on);

// The setup, read once a minute per connection and organization (initialize and whoami share it).
const setups = new Map(); // `${gid}:${orgId}` → { value, until }

async function workspaceSetup(ws, ctx, { fresh = false } = {}) {
  const key = `${ws.claims.gid}:${ctx.organization.id}`;
  const hit = setups.get(key);
  if (!fresh && hit && hit.until > Date.now()) return hit.value;
  const [keys, webhook, types, passkey, tenant] = await Promise.all([
    ws.tryDash("/v1/credentials"), ws.tryDash("/v1/webhook"), ws.tryDash("/v1/action-types"), ws.tryDash("/v1/passkey-domain"),
    isOn(ctx, "ciam") ? ws.tryDash("/v1/identity/tenant") : Promise.resolve({ data: null, error: { code: "feature_off" } }),
  ]);
  const apps = tenant.data ? await ws.tryDash("/v1/identity/clients") : null;
  const out = {
    organization: ctx.organization,
    apiKeys: keys.data ? {
      youMayManage: keys.data.viewer?.canManage ?? null,
      youHaveAnActiveKey: keys.data.viewer?.hasActiveKey ?? null,
      keys: (keys.data.credentials || []).map((k) => ({
        name: k.name, keyId: k.keyId, status: k.status, createdBy: k.createdBy?.email || null, mine: k.isMine,
        lastUsed: k.lastUsedAt || "never", expiresAt: k.expiresAt || "never", requiresRotation: k.requiresRotation, creatorStillMember: k.creatorIsMember,
      })),
      note: "A secret is shown only when the key is made. Lost it? Rotate the key in the dashboard (Developers → API keys); each person has one active key per organization.",
    } : { error: keys.error },
    webhook: webhook.data ? { url: webhook.data.callbackUrl || null, allowedDomain: webhook.data.allowedCallbackDomain || null, recentDeliveries: (webhook.data.recentDeliveries || []).slice(0, 5).map((d) => ({ statusCode: d.statusCode, at: d.createdAt, note: d.note })) } : { error: webhook.error },
    actionTypes: types.data ? (types.data.actionTypes || []).map((t) => ({ type: t.type || t.key || t.name, name: t.name || t.displayName, critical: t.critical, active: t.active ?? t.isActive ?? null })) : { error: types.error },
    passkey: passkey.data ? { rpId: passkey.data.rpId || null, origins: passkey.data.origins || [], configured: Boolean(passkey.data.configured) } : { error: passkey.error },
    login: !isOn(ctx, "ciam") ? { on: false } : tenant.data ? {
      on: true, slug: tenant.data.slug, issuer: tenant.data.issuer, discovery: `${tenant.data.issuer}/.well-known/openid-configuration`, enabled: tenant.data.enabled, signUpEnabled: tenant.data.signUpEnabled,
      apps: apps && apps.data ? (apps.data.clients || []).map((c) => ({ clientId: c.clientId, name: c.name, appType: c.appType, tokenAuthMethod: c.tokenAuthMethod, redirectUris: c.redirectUris || [], logoutUris: c.logoutUris || [], webOrigins: c.webOrigins || [], enabled: c.enabled })) : { error: apps && apps.error },
    } : { on: true, tenant: null, note: tenant.error?.code === "not_enabled" ? "Touchque Login is ON but not set up: dashboard → Touchque Login" : tenant.error },
  };
  const missing = [];
  if (out.apiKeys.keys && !out.apiKeys.keys.some((k) => k.status === "ACTIVE")) missing.push("No active API key (touchque_create_api_key, owners and admins).");
  if (out.webhook && !out.webhook.error && !out.webhook.url) missing.push("No webhook URL (optional; set it in the dashboard → Developers → Webhooks).");
  if (Array.isArray(out.actionTypes) && !out.actionTypes.length) missing.push("No action types yet (touchque_define_action_type, the dashboard, or the SDK at startup).");
  if (out.login.on && !out.login.slug) missing.push("Touchque Login is ON but has no tenant yet.");
  if (Array.isArray(out.login.apps)) {
    if (!out.login.apps.length) missing.push("Touchque Login has no app yet (dashboard → Touchque Login → Applications).");
    for (const a of out.login.apps) if (!a.redirectUris.length) missing.push(`Touchque Login app "${a.name}" has no redirect URI (touchque_add_redirect_uri).`);
  }
  out.missing = missing;
  setups.set(key, { value: out, until: Date.now() + 60000 });
  if (setups.size > 5000) setups.clear();
  return out;
}

/** The member's facts in a few lines: the server instructions and whoami. */
function snapshotText(ctx, setup, ws, { detail = false } = {}) {
  const rows = featureRows(ctx);
  const owner = ctx.organization.role === "owner";
  const lines = [
    `Signed in: ${ctx.user.name ? `${ctx.user.name} <${ctx.user.email}>` : ctx.user.email}. Organization: ${ctx.organization.name}${ctx.organization.slug ? ` (${ctx.organization.slug})` : ""}. Role: ${ctx.organization.role}${owner ? " (may turn features on, manage keys and members)" : ctx.organization.role === "admin" ? " (may manage keys and action types)" : ""}.`,
  ];
  if (detail) {
    for (const f of rows) lines.push(`- ${f.name}: ${f.on ? "ON" : f.unavailable ? "OFF (not available on Touchque yet)" : "OFF"}. ${f.description}${f.includes.length ? ` Includes: ${f.includes.join("; ")}.` : ""}`);
  } else {
    lines.push(`Features ON: ${rows.filter((f) => f.on).map((f) => f.name).join(", ") || "none"}.`);
    const off = rows.filter((f) => !f.on);
    if (off.length) lines.push(`Features OFF: ${off.map((f) => `${f.name}${f.unavailable ? " (not available on Touchque yet)" : ""}`).join(", ")}.${off.some((f) => !f.unavailable) ? ` ${owner ? "As the owner they can" : "An owner can"} turn one on in the dashboard → Organization → Features.` : ""}`);
  }
  if (setup) {
    const keys = setup.apiKeys.keys || [];
    const active = keys.filter((k) => k.status === "ACTIVE");
    if (setup.apiKeys.error) lines.push("API keys: could not be read.");
    else lines.push(`API keys: ${active.length ? active.map((k) => `${k.keyId} "${k.name}"${k.mine ? " (theirs)" : ` (by ${k.createdBy})`}, last used ${k.lastUsed}`).join("; ") : "no active key"}. The secret is shown only when a key is made; a lost one is rotated in the dashboard (Developers → API keys); one active key per person per organization.`);
    if (!setup.webhook.error) lines.push(`Webhook: ${setup.webhook.url || "not set"}.`);
    if (Array.isArray(setup.actionTypes)) {
      const names = setup.actionTypes.map((t) => t.type);
      lines.push(`Action types: ${!names.length ? "none yet (requireTouchQue('X') fails until X is defined)" : names.length <= 12 ? names.join(", ") : `${names.length}, e.g. ${names.slice(0, 10).join(", ")} (all: touchque_workspace_setup section actionTypes)`}.`);
    }
    if (setup.passkey && !setup.passkey.error) lines.push(`Passkey domain: ${setup.passkey.rpId || "not set (passkeys use Touchque's domain)"}.`);
    if (setup.login.on && setup.login.slug) {
      const apps = Array.isArray(setup.login.apps) ? setup.login.apps : [];
      lines.push(`Touchque Login: tenant ${setup.login.slug}, issuer ${setup.login.issuer}; apps: ${apps.length ? apps.map((a) => `"${a.name}" ${a.clientId} (${a.appType}, ${a.redirectUris.length ? `redirect ${a.redirectUris.join(" ")}` : "no redirect URI"})`).join("; ") : "none"}.`);
    } else if (setup.login.on) lines.push("Touchque Login: ON, not set up yet.");
  }
  const others = ctx.organizations.filter((o) => o.id !== ctx.organization.id);
  if (others.length) lines.push(`Other organizations: ${others.map((o) => `${o.name} (${o.role})`).join(", ")} (touchque_use_organization switches).`);
  lines.push(`This connection may ${ws.canWrite ? "read, and make changes the person confirms (each also asks their phone)" : "only read (reconnect and allow touchque:write to make changes)"}.`);
  return lines.join("\n");
}

// ── SDK docs and types, a part at a time ───────────────────────────────────

function readmeToc(language) {
  const secs = readmeSections(readme(language));
  return `${SDKS[language].package} README, sections (ask with section: "<part of a heading>"):\n${secs.map((s) => `- ${s.title} (${s.text.length} ch)`).join("\n")}`;
}

function readmeSection(language, section) {
  const want = docs.fold(section);
  const picked = readmeSections(readme(language)).filter((s) => docs.fold(s.title).includes(want));
  if (!picked.length) return null;
  return cap(picked.map((s) => s.text).join("\n\n"), 10000);
}

const DECL = (sym) => new RegExp(`^\\s*(?:export\\s+)?(?:public\\s+|final\\s+|abstract\\s+|static\\s+|sealed\\s+|partial\\s+|async\\s+|declare\\s+|default\\s+)*(?:interface|class|type|enum|struct|record|function|def|module|const|func(?:\\s*\\([^)]*\\))?)\\s+${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
const NAME_LINE = /^\s*(?:export\s+)?(?:public\s+|final\s+|abstract\s+|static\s+|sealed\s+|partial\s+|declare\s+|default\s+)*(?:interface|class|type|enum|struct|record|function|def|module|func(?:\s*\([^)]*\))?)\s+([A-Za-z_][A-Za-z0-9_]*)/;

function typesFile(language) {
  const file = { node: "types.ts", python: "types.py", php: "types.php", go: "types.go", dotnet: "types.cs", ruby: "types.rb", java: "types.java" }[language];
  return fs.readFileSync(path.join(BUNDLED, language, file), "utf8");
}

function typeNames(language) {
  const names = new Set();
  for (const line of typesFile(language).split("\n")) {
    const m = NAME_LINE.exec(line);
    if (m && /^[A-Z]/.test(m[1])) names.add(m[1]);
  }
  return [...names];
}

/** The declaration of a symbol: braces counted, or (Python/Ruby) until the indentation comes back. */
function typeBlock(language, symbol) {
  const lines = typesFile(language).split("\n");
  const re = DECL(symbol);
  const out = [];
  for (let i = 0; i < lines.length && out.length < 3; i += 1) {
    if (!re.test(lines[i])) continue;
    // Doc comments right above.
    let start = i;
    while (start > 0 && /^\s*(\/\/|\*|\/\*\*|#|\*\/|""")/.test(lines[start - 1])) start -= 1;
    const block = [];
    if (language === "python" || language === "ruby") {
      const indent = lines[i].match(/^\s*/)[0].length;
      block.push(...lines.slice(start, i + 1));
      for (let j = i + 1; j < lines.length; j += 1) {
        const l = lines[j];
        if (l.trim() && l.match(/^\s*/)[0].length <= indent && !(language === "ruby" && /^\s*end\b/.test(l))) break;
        block.push(l);
        if (language === "ruby" && /^\s*end\b/.test(l) && l.match(/^\s*/)[0].length === indent) break;
      }
    } else {
      let depth = 0;
      let opened = false;
      for (let j = start; j < lines.length; j += 1) {
        const l = lines[j];
        block.push(l);
        if (j >= i) {
          for (const ch of l.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "")) {
            if (ch === "{") { depth += 1; opened = true; }
            if (ch === "}") depth -= 1;
          }
          if ((opened && depth <= 0) || (!opened && /;\s*$/.test(l))) break;
        }
      }
    }
    out.push(block.join("\n"));
    i += block.length;
  }
  return out.length ? cap(out.join("\n\n"), 8000) : null;
}

// ── The answers ────────────────────────────────────────────────────────────

const HELP = `Touchque is an identity platform with two halves.
- Workforce (a company's own people): Workforce SSO for work apps, Directory & lifecycle, VPN & servers (RADIUS), Shared accounts, Device trust, Threat protection, AI agents & MCP.
- Customer & developer identity (a company's own app and customers): the 2FA API (phone approval with number matching, passkeys, offline sign; SDKs for Node, PHP, Go, Python), Touchque Login (hosted sign-up and sign-in for the company's customers, OpenID Connect; not employee SSO), Device risk, Safe Guard, Mobile SDK.
Which tool:
- The person's own facts (organization, role, features, keys, webhook, action types, Login tenant and apps): the server instructions already say; touchque_whoami if they are missing.
- How-to or concept: touchque_search_docs (one call; Turkish questions work).
- SDK published or how to install: touchque_pick_sdk.
- Writing an integration: touchque_generate_integration, then touchque_check_integration.
- A refused sign-in with a case code: touchque_explain_case.
- Changes (action type, API key, redirect URI, test approval): only when asked; without confirm first, then confirm: true.
Not in this server: prices, plans and billing (ask Touchque on support.touchque.com), usage numbers and request logs (dashboard), the .NET, Ruby and Java SDKs (not released yet).`;

const changes = new Map(); // id → { gid, promise, label, startedAt }

function describeError(err) {
  if (err instanceof WorkspaceError) {
    const hints = {
      not_for_ai_tools: "Touchque's MCP may not do this; use the dashboard.",
      admin_mfa_required: "Turn on two-step sign-in in the Touchque account first (it guards changes like this).",
      step_up_rejected: "The phone said no; nothing changed.",
      active_key_exists: "The person already has an active key: rotate or revoke it in the dashboard (Developers → API keys).",
      feature_not_in_plan: "This feature is OFF for the organization: an owner turns it on in the dashboard (Organization → Features).",
      not_a_member: "Switch with touchque_use_organization to one of the person's organizations.",
      invalid_token: "The Touchque connection ended: sign in again (reconnect the MCP server).",
      org_blocked: "The organization blocked this AI tool.",
      org_not_approved: "The organization has not approved this AI tool yet: an owner or admin can.",
      forbidden: "The person's role may not do this (owners and admins can).",
    };
    return `Touchque answered ${err.status} ${err.code}: ${err.message}${hints[err.code] ? `\n${hints[err.code]}` : ""}`;
  }
  return `Error: ${err.message}`;
}

// Names the code uses for action types, in every SDK's style (4.x and 5.0 spelling).
function actionTypesIn(code) {
  const found = new Set();
  const res = [
    /requireTouch[Qq]ue\(\s*['"`]([A-Z0-9_]{2,64})['"`]/g, /require_touchque\(?\s*['"]([A-Z0-9_]{2,64})['"]/g, /RequireTouch[Qq]ue\(\s*"([A-Z0-9_]{2,64})"/g,
    /touchque:([A-Z0-9_]{2,64})/g, /touchque\.Require\([^,]*,\s*"([A-Z0-9_]{2,64})"/g, /touchque\.Require\(\s*"([A-Z0-9_]{2,64})"/g,
    /\btype\s*[:=]\s*['"`]([A-Z][A-Z0-9_]{1,63})['"`]/g, /actionType\s*[:=(]\s*['"`]([A-Z][A-Z0-9_]{1,63})['"`]/g,
  ];
  for (const re of res) for (const m of code.matchAll(re)) found.add(m[1]);
  return [...found];
}
const urlsIn = (code) => [...new Set((code.match(/https?:\/\/[^\s'"`<>)]+/g) || []).map((u) => u.replace(/[.,;]+$/, "")))];

async function checkIntegration(ws, args, core) {
  const ctx = await ws.context();
  const setup = await workspaceSetup(ws, ctx);
  const code = typeof args.code === "string" ? args.code : "";
  const lines = [];
  const mark = (ok, label) => lines.push(`${ok ? "✅" : "❌"} ${label}`);
  const info = (label) => lines.push(`ℹ️ ${label}`);
  const language = args.language && SDKS[args.language] ? args.language : "node";

  const activeKeys = (setup.apiKeys.keys || []).filter((k) => k.status === "ACTIVE");
  if (setup.apiKeys.error) info(`API keys could not be read: ${setup.apiKeys.error.message}`);
  else mark(activeKeys.length > 0, activeKeys.length ? `Active API key: ${activeKeys.map((k) => `${k.keyId}${k.creatorStillMember === false ? " (its creator left: refused)" : ""}${k.requiresRotation ? " (needs rotation)" : ""}`).join(", ")}` : "No active API key in this organization");

  const usesLogin = /touchque[\s_-]?login|\.login\.touchque\.com|Touch[Qq]ueLogin|ciam|openid|oidc|authorization_code/i.test(code) || (args.redirectUris || []).length > 0 || args.clientId;
  if (usesLogin) {
    if (!isOn(ctx, "ciam")) mark(false, "The code uses Touchque Login, which is OFF for this organization");
    else if (!setup.login.slug) mark(false, "Touchque Login has no tenant yet (dashboard → Touchque Login)");
    else {
      mark(true, `Touchque Login tenant ${setup.login.slug}, issuer ${setup.login.issuer}`);
      const apps = Array.isArray(setup.login.apps) ? setup.login.apps : [];
      const app = args.clientId ? apps.find((a) => a.clientId === args.clientId) : apps.find((a) => code.includes(a.clientId));
      if (args.clientId && !app) mark(false, `No Touchque Login app with client ID ${args.clientId} here`);
      const uris = [...new Set([...(args.redirectUris || []), ...urlsIn(code).filter((u) => /callback|redirect|auth/i.test(u) && !/touchque\.com/.test(u))])];
      const registered = new Set(apps.flatMap((a) => (app ? (a === app ? a.redirectUris : []) : a.redirectUris) || []));
      for (const u of uris) mark(registered.has(u), registered.has(u) ? `Redirect URI registered: ${u}` : `Redirect URI NOT registered${app ? ` on ${app.name}` : ""}: ${u} (touchque_add_redirect_uri)`);
      if (!uris.length) info("No redirect URI found in the code: pass redirectUris to check them.");
      if (/\.login\.touchque\.com/.test(code) && !code.includes(setup.login.issuer)) mark(false, `The code names a Touchque Login address other than this tenant's issuer (${setup.login.issuer})`);
    }
  }

  const types = code ? actionTypesIn(code) : [];
  if (types.length && Array.isArray(setup.actionTypes)) {
    const known = new Set(setup.actionTypes.map((t) => t.type));
    const definesInCode = /actionTypes\.define|action_types\.define|ActionTypes\.Define|actionTypes\(\)\.define|->actionTypes->define/i.test(code);
    for (const t of types) {
      const ok = known.has(t);
      mark(ok || definesInCode, ok ? `Action type ${t} exists` : definesInCode ? `Action type ${t} is not in the workspace yet, but the code defines it at startup` : `Action type ${t} does not exist yet: define it (touchque_define_action_type, the dashboard, or at startup: ${DEFINE_ACTION[language](t, exampleName(t))})`);
    }
  }
  if (/webhook|callback/i.test(code) && /signature|X-Touch[Qq]ue-Signature|x-signature|verifyWebhook|webhooks?\.verify|construct/i.test(code)) {
    mark(Boolean(setup.webhook.url), setup.webhook.url ? `Webhook URL set: ${setup.webhook.url}` : "The code handles Touchque webhooks, but no webhook URL is set (dashboard → Developers → Webhooks)");
  }
  if (/passkey|webauthn/i.test(code)) info(setup.passkey.rpId ? `Passkey domain: ${setup.passkey.rpId}` : "No passkey domain of your own (passkeys use Touchque's domain; set yours in the dashboard → Passkey domain)");

  let staticReport = "";
  if (code && args.framework) {
    try {
      const r = await core.callTool({ params: { name: "validate_integration", arguments: { code, framework: args.framework, language: args.language } } });
      staticReport = `\n\n${r.content[0].text}`;
    } catch (err) {
      staticReport = `\n\n(static checklist failed: ${err.message})`;
    }
  } else if (code) info("Pass framework to also run the SDK's static checklist.");
  return `Live check (${ctx.organization.name})\n${lines.join("\n")}${staticReport}`;
}

async function startChange(ws, label, method, pathname, body) {
  const id = crypto.randomBytes(9).toString("base64url");
  const promise = ws.dash(method, pathname, body, { timeoutMs: 60000 }).then((data) => ({ ok: true, data }), (err) => ({ ok: false, err }));
  changes.set(id, { gid: ws.claims.gid, promise, label, startedAt: Date.now() });
  for (const [k, v] of changes) if (Date.now() - v.startedAt > 300000) changes.delete(k);
  const quick = await Promise.race([promise, new Promise((r) => setTimeout(() => r(null), 1500))]);
  if (quick) {
    changes.delete(id);
    return { id, done: quick };
  }
  let pending = null;
  for (let i = 0; i < 6 && !pending; i += 1) {
    const r = await ws.tryDash("/v1/step-up/pending");
    pending = r.data && r.data.pending;
    if (!pending) {
      const late = await Promise.race([promise, new Promise((res) => setTimeout(() => res(null), 700))]);
      if (late) {
        changes.delete(id);
        return { id, done: late };
      }
    }
  }
  return { id, pending };
}

function changeResult(label, outcome, ws) {
  if (!outcome.ok) return fail(`${label}: not done.\n${describeError(outcome.err)}`);
  setups.clear(); // the setup changed
  const d = outcome.data || {};
  if (d.secret) {
    return text(`${label}: done.\nTQ_API_KEY=${d.credential?.keyId}\nTQ_API_SECRET=${d.secret}\nShown only now: write both into the project's server-side .env (check .env is in .gitignore). Do not repeat the secret in the chat; if it is lost, rotate the key in the dashboard.`);
  }
  void ws;
  return text(`${label}: done.`);
}

const waitingText = (label, r) => `${label}: waiting for the phone.${r.pending?.challengeCode ? ` Tell the person: "On your phone, pick ${r.pending.challengeCode}."` : " Tell the person to approve it in the Touchque app."} Then call touchque_wait with id ${r.id} (the phone has about 30 seconds).`;

async function call(name, args, ws, core, config) {
  if (name === "touchque_help") return text(HELP);

  if (name === "touchque_whoami") {
    const ctx = await ws.context();
    const setup = await workspaceSetup(ws, ctx, { fresh: true }).catch(() => null);
    return text(snapshotText(ctx, setup, ws, { detail: Boolean(args.detail) }));
  }

  if (name === "touchque_use_organization") {
    const want = String(args.organization || "").trim().toLowerCase();
    const ctx = await ws.context();
    const org = ctx.organizations.find((o) => o.id === args.organization || (o.slug && o.slug.toLowerCase() === want) || o.name.toLowerCase() === want);
    if (!org) return fail(`No organization "${args.organization}"; the person's: ${ctx.organizations.map((o) => o.name).join(", ")}`);
    const next = await ws.useOrganization(org.id);
    const setup = await workspaceSetup(ws, next).catch(() => null);
    return text(`Now working in ${next.organization.name}. Use these facts from now on (they replace the ones in the instructions):\n${snapshotText(next, setup, ws)}`);
  }

  if (name === "touchque_workspace_setup") {
    const ctx = await ws.context();
    const setup = await workspaceSetup(ws, ctx, { fresh: true });
    const part = args.section && setup[args.section];
    return text(json(part ? { organization: ctx.organization.name, [args.section]: part, missing: setup.missing } : setup));
  }

  if (name === "touchque_search_docs") {
    if (args.page) {
      const p = await docs.page(config.docsUrl, args.page, { section: args.section || null, lang: args.lang || "en" });
      if (!p) return fail(`No docs page "${args.page}". Search with query instead.`);
      return text(`# ${p.title}\n${p.url}\n\n${p.text}`);
    }
    const q = String(args.query || "").trim();
    if (!q) return fail("Give query (what to look for) or page (e.g. \"/callback\").");
    const r = await docs.search(config.docsUrl, q, { lang: args.lang || null, sdk: args.language || null });
    const parts = [];
    if (r.note) parts.push(r.note);
    for (const h of r.hits) parts.push(`## ${h.title}${h.section ? ` — ${h.section}` : ""}\n${h.url || `(${h.title})`}\n${h.text}\nMore: ${h.more}`);
    if (!r.hits.length && !r.note) parts.push(`Nothing in the docs matches "${q}". Pages: ${(r.nearest || []).join("; ")}`);
    return text(parts.join("\n\n"));
  }

  if (name === "touchque_pick_sdk") {
    const language = args.language || languageFromFiles(args.files || []);
    const describe = (lang) => {
      const s = SDKS[lang];
      const req = readmeSection(lang, "Requirements");
      return {
        language: lang, label: s.label, package: s.package, published: Boolean(s.published), version: s.published || null, registry: s.registry,
        install: s.install || "Not released yet: use a published SDK if the stack allows, or the REST API (support.touchque.com/authentication).",
        ...(s.import && { import: s.import }),
        ...(req && { requirements: req.replace(/^## [^\n]*\n/, "").trim().slice(0, 400) }),
        env: "TQ_API_KEY=tq_… and TQ_API_SECRET=… in the server's .env",
      };
    };
    const out = language ? describe(language) : { note: "Language not known: pass language or the manifest file names.", sdks: LANGS.map((l) => ({ language: l, published: Boolean(SDKS[l].published), version: SDKS[l].published || null })) };
    return text(json({ ...out, frontend: FRONTEND.map((f) => `${f.install} (${f.published}): ${f.what}`) }));
  }

  if (name === "touchque_generate_integration") {
    const spec = INTEGRATIONS[args.feature];
    if (!spec) return fail(`Unknown feature: ${args.feature}. One of ${INTEGRATION_NAMES.join(", ")}`);
    if (!SDKS[args.language]) return fail(`Unknown language: ${args.language}`);
    const ctx = await ws.context();
    if (!isOn(ctx, spec.feature)) {
      const f = CATALOG.features.find((x) => x.id === spec.feature);
      return fail(`${spec.label} needs ${f ? f.name : spec.feature}, which is OFF for ${ctx.organization.name}: do not write this integration. ${ctx.organization.role === "owner" ? "The person is the owner and can" : "An owner can"} turn it on in the dashboard → Organization → Features.`);
    }
    const setup = await workspaceSetup(ws, ctx);
    const sdk = SDKS[args.language];
    const types = Array.isArray(setup.actionTypes) ? setup.actionTypes.map((t) => t.type) : [];
    const before = [];
    if (!sdk.published) before.push(`The ${sdk.label} SDK is not released yet: say so; prefer a released SDK (Node, PHP, Go, Python) if the stack allows.`);
    if (!(setup.apiKeys.keys || []).some((k) => k.status === "ACTIVE")) before.push("No active API key: touchque_create_api_key (owners and admins), then TQ_API_KEY / TQ_API_SECRET in .env.");
    if (["phone_approval", "passkeys", "offline", "silent_sign_ins"].includes(args.feature)) {
      const action = args.action || (types[0] || "SEND_MONEY");
      if (!types.includes(action)) before.push(`Action type ${action} does not exist yet; the guard refuses an unknown one. Create it once: touchque_define_action_type (with the person's yes), the dashboard (Developers → Action types), or at startup:\n  ${DEFINE_ACTION[args.language](action, exampleName(action))}`);
    }
    if (args.feature === "touchque_login" && Array.isArray(setup.login.apps)) {
      const empty = setup.login.apps.filter((a) => !a.redirectUris.length);
      if (empty.length) before.push(`Register the app's redirect URI (touchque_add_redirect_uri) on ${empty.map((a) => `"${a.name}"`).join(", ")}.`);
    }
    const facts = {
      install: sdk.install || null,
      apiKey: (setup.apiKeys.keys || []).find((k) => k.status === "ACTIVE" && k.mine)?.keyId || null,
      actionTypes: types,
      ...(args.feature === "webhooks" && { webhook: setup.webhook.url || "not set" }),
      ...(args.feature === "touchque_login" && { login: setup.login }),
      ...(args.feature === "passkeys" && { passkeyDomain: setup.passkey.rpId || "not set" }),
    };
    const frontend = ["phone_approval", "passkeys", "offline"].includes(args.feature)
      ? "\nFrontend: the guarded route answers 202 with a step until the phone approves; show its number (or the first-time QR) and retry with the step's token. @touchque/web (npm install @touchque/web) or @touchque/react does this loop; see the README's relay section."
      : "";
    const sectionsText = cap(sectionsFor(args.language, args.feature), 9000);
    return text(`# ${spec.label}, ${sdk.label}${args.framework ? ` (${args.framework})` : ""}\n${before.length ? `\nBefore this works:\n${before.map((b) => `- ${b}`).join("\n")}\n` : ""}\nWorkspace: ${json(facts)}\n\nSteps: read the person's code (sign-in, the action, the framework); install; keys in .env; guard the route as the README shows (keep the current sign-in working); then touchque_check_integration.${frontend}\nDocs: ${config.docsUrl}${spec.docs}\n\n## From the ${sdk.package} README\n${sectionsText}`);
  }

  if (name === "touchque_check_integration") return text(await checkIntegration(ws, args, core));

  if (name === "touchque_explain_case") {
    const c = String(args.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{3}-?[A-Z0-9]{3}$/.test(c)) return fail("A case code looks like K7P-2QX");
    const code = c.includes("-") ? c : `${c.slice(0, 3)}-${c.slice(3)}`;
    return text(json(await ws.dash("GET", `/v1/cases/${encodeURIComponent(code)}`)));
  }

  if (name === "get_touchque_docs") {
    if (!SDKS[args.language]) return fail(`Unknown language: ${args.language}`);
    if (!args.section) return text(readmeToc(args.language));
    const t = readmeSection(args.language, String(args.section));
    return t ? text(t) : fail(`No section matching "${args.section}". ${readmeToc(args.language)}`);
  }

  if (name === "get_sdk_types") {
    if (!SDKS[args.language]) return fail(`Unknown language: ${args.language}`);
    if (!args.symbol) return text(`${SDKS[args.language].package} types (ask with symbol: "<name>"):\n${typeNames(args.language).join(", ")}`);
    const t = typeBlock(args.language, String(args.symbol));
    return t ? text(t) : fail(`No declaration "${args.symbol}". Names: ${typeNames(args.language).join(", ")}`);
  }

  if (name === "touchque_wait") {
    const id = String(args.id || "");
    const c = changes.get(id);
    if (c) {
      if (c.gid !== ws.claims.gid) return fail("No such change waiting.");
      const outcome = await Promise.race([c.promise, new Promise((r) => setTimeout(() => r(null), 25000))]);
      if (!outcome) return text(`${c.label}: still waiting for the phone. Call touchque_wait again.`);
      changes.delete(id);
      return changeResult(c.label, outcome, ws);
    }
    const r = await ws.postSso("/sso/mcp/touchque/test-approval/status", { requestId: id });
    const words = { PENDING: "still waiting for the phone (call touchque_wait again)", CONFIRMED: "approved on the phone ✅", REJECTED: "rejected on the phone", EXPIRED: "expired without an answer" };
    return text(`Test approval: ${words[r.status] || r.status}.`);
  }

  if (name === "touchque_send_test_approval") {
    const ctx = await ws.context();
    if (!args.confirm) return text(`This sends a test approval to the Touchque app of ${ctx.user.email}. Ask the person; if yes, call again with confirm: true.`);
    const r = await ws.postSso("/sso/mcp/touchque/test-approval", {});
    return text(`Sent to ${r.email}'s Touchque app.${r.challengeCode ? ` Tell the person: "On your phone, pick ${r.challengeCode}."` : ""} Then touchque_wait with id ${r.requestId}.`);
  }

  if (["touchque_create_api_key", "touchque_add_redirect_uri", "touchque_define_action_type"].includes(name)) {
    if (!ws.canWrite) return fail("This connection may only read. To make changes, reconnect Touchque's MCP and allow “touchque:write”.");
    const ctx = await ws.context();
    if (name === "touchque_define_action_type") {
      const type = String(args.type || "").trim();
      if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(type)) return fail("type: letters, digits and _ . : - only, up to 64, e.g. SEND_MONEY");
      const nm = String(args.name || exampleName(type)).slice(0, 255);
      const critical = args.critical !== false;
      const label = `Define action type ${type} ("${nm}"${critical ? ", critical" : ""}) in ${ctx.organization.name}`;
      if (!args.confirm) return text(`${label}. Owners and admins only. Ask the person; if yes, call again with confirm: true.`);
      try {
        await ws.dash("POST", "/v1/action-types", { type, name: nm, critical });
        setups.clear();
        return text(`${label}: done. requireTouchQue('${type}') (or the language's guard) works now.`);
      } catch (err) {
        if (err instanceof WorkspaceError && err.status === 409) return text(`${type} already exists in ${ctx.organization.name}.`);
        return fail(`${label}: not done.\n${describeError(err)}`);
      }
    }
    if (name === "touchque_create_api_key") {
      const label = `Create API key "${String(args.name).slice(0, 60)}" in ${ctx.organization.name}`;
      const setup = await workspaceSetup(ws, ctx).catch(() => null);
      if (setup && setup.apiKeys.youHaveAnActiveKey) return fail(`The person already has an active key here (${(setup.apiKeys.keys || []).filter((k) => k.mine && k.status === "ACTIVE").map((k) => k.keyId).join(", ")}). One active key per person: rotate or revoke it in the dashboard (Developers → API keys).`);
      if (!args.confirm) return text(`${label}. Owners and admins only; Touchque asks ${ctx.user.email}'s phone, as the dashboard does. Ask the person; if yes, call again with confirm: true.`);
      const r = await startChange(ws, label, "POST", "/v1/credentials", { name: String(args.name).slice(0, 60), ...(args.expiresInDays && { expiresInDays: args.expiresInDays }) });
      return r.done ? changeResult(label, r.done, ws) : text(waitingText(label, r));
    }
    if (!isOn(ctx, "ciam")) return fail(`Touchque Login is OFF for ${ctx.organization.name}.`);
    let uri;
    try {
      uri = new URL(String(args.redirectUri));
    } catch {
      return fail("redirectUri must be an absolute URL");
    }
    const app = await ws.dash("GET", `/v1/identity/clients/${encodeURIComponent(args.clientId)}`);
    const current = app.redirectUris || [];
    if (current.includes(uri.toString()) || current.includes(String(args.redirectUri))) return text(`${args.redirectUri} is already a redirect URI of ${app.name}.`);
    const label = `Add redirect URI ${args.redirectUri} to the Touchque Login app ${app.name} in ${ctx.organization.name}`;
    if (!args.confirm) return text(`${label}. Ask the person; if yes, call again with confirm: true.`);
    const r = await startChange(ws, label, "PATCH", `/v1/identity/clients/${encodeURIComponent(args.clientId)}`, { redirectUris: [...current, String(args.redirectUri)] });
    return r.done ? changeResult(label, r.done, ws) : text(waitingText(label, r));
  }

  return null;
}

async function callTool(name, args, ws, core, config) {
  try {
    return await call(name, args || {}, ws, core, config);
  } catch (err) {
    return fail(describeError(err));
  }
}

module.exports = { TOOLS, HELP, callTool, INTEGRATIONS, featureRows, actionTypesIn, snapshotText, workspaceSetup, typeBlock, typeNames, readmeToc, readmeSection, DEFINE_ACTION };
