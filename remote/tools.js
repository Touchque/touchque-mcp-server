// The workspace tools of the remote Touchque MCP server. Each call runs as the
// signed-in member, in their active organization, and sees only what the
// dashboard shows them (never a secret it does not show). Reading is the
// default; a change needs the touchque:write permission, the member's go-ahead
// (confirm: true after they said yes) and, like in the dashboard, their phone.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { SDKS, FRONTEND, languageFromFiles, sectionsFor } = require("./sdks");
const { searchDocs } = require("./docsSearch");
const { WorkspaceError } = require("./workspace");

const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "bundled", "features.json"), "utf8"));

// What a developer adds, the feature it needs and the README sections it reads.
const INTEGRATIONS = {
  phone_approval: { feature: "core_2fa", label: "Phone approval (push 2FA with number matching)", docs: "/add-2fa" },
  passkeys: { feature: "core_2fa", label: "Passkeys (phishing-resistant sign-in and step-up)", docs: "/phishing-resistance" },
  touchque_login: { feature: "ciam", label: "Touchque Login (hosted sign-up and sign-in for your customers)", docs: "/touchque-login" },
  webhooks: { feature: "core_2fa", label: "Webhooks (every approval result at one URL)", docs: "/callback" },
  offline: { feature: "core_2fa", label: "Offline sign (QR + a 7-character code)", docs: "/offline-sign" },
  silent_sign_ins: { feature: "core_2fa", label: "Silent sign-ins (no prompt when nothing is new)", docs: "/silent-sign-ins" },
  ai_agents: { feature: "ai_agents", label: "AI agents (an identity per agent; a person approves on the phone)", docs: "/agents" },
};
const INTEGRATION_NAMES = Object.keys(INTEGRATIONS);
const LANGS = Object.keys(SDKS);

const text = (t) => ({ content: [{ type: "text", text: t }] });
const fail = (t) => ({ isError: true, content: [{ type: "text", text: t }] });
const json = (v) => JSON.stringify(v, null, 2);

const TOOLS = [
  {
    name: "touchque_whoami",
    description: "Who is signed in to Touchque through this connection: the person, the active organization (workspace), their role there, which Touchque features are ON for it, and what this connection may do (read, or read and change). Call this first in every Touchque task.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, title: "Who am I in Touchque" },
  },
  {
    name: "touchque_list_organizations",
    description: "The Touchque organizations the signed-in person belongs to, with their role in each, and which one is active for this connection.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, title: "My organizations" },
  },
  {
    name: "touchque_use_organization",
    description: "Switch this connection to another of the person's organizations (by id, slug or exact name). Every later call works in that organization.",
    inputSchema: { type: "object", properties: { organization: { type: "string", description: "The organization's id, slug or name" } }, required: ["organization"] },
    annotations: { readOnlyHint: true, title: "Switch organization" },
  },
  {
    name: "touchque_features",
    description: "Every Touchque feature with whether it is ON for the active organization, what it does and what it includes. Only build integrations for features that are ON; for one that is OFF, tell the person an owner can turn it on in the dashboard (Organization → Features).",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, title: "Enabled features" },
  },
  {
    name: "touchque_workspace_setup",
    description: "The active organization's Touchque setup, without any secret: API keys (names, key IDs, status, who made them), the webhook URL, action types, the passkey domain, and Touchque Login (tenant slug, issuer, apps and their redirect URIs) when it is on. Ends with what is still missing.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, title: "Workspace setup" },
  },
  {
    name: "touchque_pick_sdk",
    description: "Which Touchque SDK fits a project, whether it is published, how to install it, the environment variables, and the browser packages. Pass the language if you know it, or the names of the project's manifest files (package.json, go.mod, composer.json, requirements.txt, Gemfile, pom.xml, *.csproj…).",
    inputSchema: {
      type: "object",
      properties: {
        language: { type: "string", enum: LANGS, description: "The backend language, when known" },
        files: { type: "array", items: { type: "string" }, description: "Manifest file names found in the project" },
      },
    },
    annotations: { readOnlyHint: true, title: "Pick an SDK" },
  },
  {
    name: "touchque_generate_integration",
    description: "Everything needed to write a Touchque integration into the person's app, for one feature and language: the SDK's own README sections for it (the published API, never guessed), this workspace's real values (action types, the Touchque Login issuer and apps, the webhook) and a step list. Refuses a feature that is OFF for the organization. Then edit the person's files yourself and run touchque_check_integration.",
    inputSchema: {
      type: "object",
      properties: {
        feature: { type: "string", enum: INTEGRATION_NAMES },
        language: { type: "string", enum: LANGS },
        framework: { type: "string", description: "express, fastify, nextjs, nestjs, laravel, net-http, flask, django, fastapi, aspnetcore, rails, spring-boot or other" },
      },
      required: ["feature", "language"],
    },
    annotations: { readOnlyHint: true, title: "Generate integration" },
  },
  {
    name: "touchque_check_integration",
    description: "Checks an integration against the person's LIVE workspace: the feature is on, an active API key exists, the action types the code uses exist, the redirect URIs the code uses are registered on the Touchque Login app, a webhook is set when the code handles one. With code, also runs the static checklist (validate_integration). Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The integration code (route handlers, config) to check" },
        language: { type: "string", enum: LANGS },
        framework: { type: "string" },
        redirectUris: { type: "array", items: { type: "string" }, description: "Touchque Login redirect URIs the app uses, if not in the code" },
        clientId: { type: "string", description: "The Touchque Login app's client ID, if known" },
      },
    },
    annotations: { readOnlyHint: true, title: "Check integration" },
  },
  {
    name: "touchque_search_docs",
    description: "Searches the Touchque docs (https://support.touchque.com) and returns the best pages with their addresses and the matching passages.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    annotations: { readOnlyHint: true, openWorldHint: true, title: "Search Touchque docs" },
  },
  {
    name: "touchque_explain_case",
    description: "Explains a Touchque “Why?” case code (like K7P-2QX) from the active organization: what was decided, why, and what to do. Use it when a sign-in or approval was refused.",
    inputSchema: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    annotations: { readOnlyHint: true, title: "Explain a case code" },
  },
  {
    name: "touchque_send_test_approval",
    description: "Sends a test approval to the signed-in person's OWN Touchque app, so they can see a real number-matching approval. Only when the person explicitly asks for it: call once without confirm to get the question, ask them, then call with confirm: true. Then tell them the number and check with touchque_test_approval_status.",
    inputSchema: { type: "object", properties: { confirm: { type: "boolean" } } },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true, title: "Test approval on my phone" },
  },
  {
    name: "touchque_test_approval_status",
    description: "The answer to a test approval sent with touchque_send_test_approval (pending, approved or rejected).",
    inputSchema: { type: "object", properties: { requestId: { type: "string" } }, required: ["requestId"] },
    annotations: { readOnlyHint: true, title: "Test approval status" },
  },
  {
    name: "touchque_create_api_key",
    description: "Creates an API key in the active organization (owners and admins; one active key per person per organization). Needs the touchque:write permission. Call without confirm first: it says what will happen; ask the person, then call with confirm: true. The dashboard's phone approval applies: tell the person the number this returns, then call touchque_change_status. The secret is shown once: write it straight into the project's .env (TQ_API_SECRET, never committed) and do not repeat it in the chat.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "A name for the key, e.g. the app or environment" }, expiresInDays: { type: "integer", minimum: 1, maximum: 730 }, confirm: { type: "boolean" } },
      required: ["name"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, title: "Create API key" },
  },
  {
    name: "touchque_add_redirect_uri",
    description: "Adds a redirect URI to one of the organization's Touchque Login apps (needs touchque:write and Touchque Login ON). Call without confirm first, ask the person, then call with confirm: true; a security-relevant change may ask their phone, then call touchque_change_status.",
    inputSchema: {
      type: "object",
      properties: { clientId: { type: "string" }, redirectUri: { type: "string" }, confirm: { type: "boolean" } },
      required: ["clientId", "redirectUri"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, title: "Add redirect URI" },
  },
  {
    name: "touchque_change_status",
    description: "Waits for and returns the result of a change that is waiting for the person's phone (from touchque_create_api_key or touchque_add_redirect_uri).",
    inputSchema: { type: "object", properties: { changeId: { type: "string" } }, required: ["changeId"] },
    annotations: { readOnlyHint: true, title: "Change status" },
  },
];

// Changes waiting for the phone: changeId → { gid, promise, label, startedAt }.
const changes = new Map();

function describeError(err) {
  if (err instanceof WorkspaceError) {
    const hints = {
      not_for_ai_tools: "Touchque's MCP may not do this; use the dashboard.",
      admin_mfa_required: "Turn on two-step sign-in in the Touchque account first (it guards changes like this).",
      step_up_rejected: "The phone said no; nothing was changed.",
      active_key_exists: "Rotate or revoke the existing key in the dashboard (Developers → API keys) first.",
      feature_not_in_plan: "This feature is not ON for the organization: an owner can turn it on in the dashboard (Organization → Features).",
      not_a_member: "Switch with touchque_use_organization to an organization the person belongs to.",
      invalid_token: "The Touchque connection ended: sign in again (reconnect the MCP server).",
      org_blocked: "The organization blocked this AI tool.",
      org_not_approved: "The organization has not approved this AI tool yet: an owner or admin can approve it.",
    };
    return `Touchque answered ${err.status} ${err.code}: ${err.message}${hints[err.code] ? `\n${hints[err.code]}` : ""}`;
  }
  return `Error: ${err.message}`;
}

function featureRows(ctx) {
  const on = new Set(ctx.features || []);
  const off = new Set(ctx.platformOff || []);
  return CATALOG.features.map((f) => ({
    id: f.id, name: f.name, on: f.base || (on.has(f.id) && !off.has(f.id)), kind: f.kind, group: f.group, description: f.description, includes: f.includes || [],
    ...(off.has(f.id) && { note: "not available on Touchque yet" }),
  }));
}
const isOn = (ctx, id) => featureRows(ctx).some((f) => f.id === id && f.on);

function whoText(ctx, ws) {
  const rows = featureRows(ctx);
  return [
    `Signed in as ${ctx.user.name ? `${ctx.user.name} <${ctx.user.email}>` : ctx.user.email}.`,
    `Active organization: ${ctx.organization.name}${ctx.organization.slug ? ` (${ctx.organization.slug})` : ""}, role: ${ctx.organization.role}.`,
    `Features ON: ${rows.filter((f) => f.on).map((f) => f.name).join(", ") || "none"}.`,
    `Features OFF: ${rows.filter((f) => !f.on).map((f) => f.name).join(", ") || "none"}.`,
    `This connection may ${ws.canWrite ? "read the workspace and make changes you confirm (each one also asks your phone, as in the dashboard)" : "read the workspace only (reconnect and allow touchque:write to make changes)"}.`,
    ctx.organizations.length > 1 ? `Other organizations: ${ctx.organizations.filter((o) => o.id !== ctx.organization.id).map((o) => `${o.name} (${o.role})`).join(", ")}. Switch with touchque_use_organization.` : "",
  ].filter(Boolean).join("\n");
}

async function workspaceSetup(ws, ctx) {
  const [keys, webhook, types, passkey, tenant] = await Promise.all([
    ws.tryDash("/v1/credentials"), ws.tryDash("/v1/webhook"), ws.tryDash("/v1/action-types"), ws.tryDash("/v1/passkey-domain"),
    isOn(ctx, "ciam") ? ws.tryDash("/v1/identity/tenant") : Promise.resolve({ data: null, error: { code: "feature_off" } }),
  ]);
  let apps = null;
  if (tenant.data) apps = await ws.tryDash("/v1/identity/clients");
  const out = {
    organization: ctx.organization,
    apiKeys: keys.data ? {
      youMayManage: keys.data.viewer?.canManage ?? null,
      youHaveAnActiveKey: keys.data.viewer?.hasActiveKey ?? null,
      keys: (keys.data.credentials || []).map((k) => ({ name: k.name, keyId: k.keyId, status: k.status, createdBy: k.createdBy?.email || null, mine: k.isMine, lastUsedAt: k.lastUsedAt, expiresAt: k.expiresAt, requiresRotation: k.requiresRotation, creatorStillMember: k.creatorIsMember })),
    } : { error: keys.error },
    webhook: webhook.data ? { url: webhook.data.callbackUrl, allowedDomain: webhook.data.allowedCallbackDomain, recentDeliveries: (webhook.data.recentDeliveries || []).slice(0, 5).map((d) => ({ statusCode: d.statusCode, at: d.createdAt, note: d.note })) } : { error: webhook.error },
    actionTypes: types.data ? (types.data.actionTypes || []).map((t) => ({ type: t.type || t.key || t.name, name: t.name || t.displayName, critical: t.critical, enabled: t.enabled ?? t.isActive ?? null })) : { error: types.error },
    passkeyDomain: passkey.data || { error: passkey.error },
    touchqueLogin: !isOn(ctx, "ciam") ? { on: false } : tenant.data ? {
      on: true, slug: tenant.data.slug, issuer: tenant.data.issuer, domain: tenant.data.domain, enabled: tenant.data.enabled, signUpEnabled: tenant.data.signUpEnabled,
      apps: apps && apps.data ? (apps.data.clients || []).map((c) => ({ clientId: c.clientId, name: c.name, appType: c.appType, tokenAuthMethod: c.tokenAuthMethod, redirectUris: c.redirectUris, logoutUris: c.logoutUris, webOrigins: c.webOrigins, enabled: c.enabled })) : { error: apps && apps.error },
    } : { on: true, tenant: null, note: tenant.error?.code === "not_enabled" ? "Touchque Login is ON but not set up yet: Developers → Touchque Login in the dashboard" : tenant.error },
  };
  const missing = [];
  if (out.apiKeys.keys && !out.apiKeys.keys.some((k) => k.status === "ACTIVE")) missing.push("No active API key: create one (touchque_create_api_key, owners and admins) and put TQ_API_KEY / TQ_API_SECRET in the server's .env.");
  if (out.webhook && !out.webhook.error && !out.webhook.url) missing.push("No webhook URL (optional: only if the app wants every result pushed to it).");
  if (Array.isArray(out.actionTypes) && !out.actionTypes.length) missing.push("No action types yet: define them in the dashboard or from code at startup (tq.actionTypes.define).");
  if (out.touchqueLogin.on && !out.touchqueLogin.slug) missing.push("Touchque Login is ON but has no tenant yet.");
  if (out.touchqueLogin.apps && Array.isArray(out.touchqueLogin.apps) && !out.touchqueLogin.apps.length) missing.push("Touchque Login has no app yet: add one in the dashboard (Touchque Login → Applications).");
  out.missing = missing;
  return out;
}

// Names the code uses for action types: requireTouchQue('X'), @require_touchque("X"), touchque:X, Require("X"), type: 'X'.
function actionTypesIn(code) {
  const found = new Set();
  const res = [
    /requireTouch[Qq]ue\(\s*['"`]([A-Z0-9_]{2,64})['"`]/g, /require_touchque\(\s*['"]([A-Z0-9_]{2,64})['"]/g, /RequireTouch[Qq]ue\(\s*"([A-Z0-9_]{2,64})"/g,
    /touchque:([A-Z0-9_]{2,64})/g, /touchque\.Require\(\s*"([A-Z0-9_]{2,64})"/g, /\btype\s*[:=]\s*['"`]([A-Z][A-Z0-9_]{1,63})['"`]/g, /actionType\s*[:=(]\s*['"`]([A-Z][A-Z0-9_]{1,63})['"`]/g,
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

  mark(true, `Workspace: ${ctx.organization.name} (your role: ${ctx.organization.role})`);
  const activeKeys = (setup.apiKeys.keys || []).filter((k) => k.status === "ACTIVE");
  if (setup.apiKeys.error) info(`API keys could not be read: ${setup.apiKeys.error.message}`);
  else mark(activeKeys.length > 0, activeKeys.length ? `Active API key${activeKeys.length > 1 ? "s" : ""}: ${activeKeys.map((k) => `${k.name || "unnamed"} (${k.keyId})${k.creatorStillMember === false ? " — its creator left the organization, so it is refused" : ""}${k.requiresRotation ? " — needs rotation" : ""}`).join(", ")}` : "No active API key in this organization");

  const usesLogin = /touchque[\s_-]?login|\.login\.touchque\.com|TouchQueLogin|ciam|openid|oidc|authorization_code/i.test(code) || (args.redirectUris || []).length > 0 || args.clientId;
  if (usesLogin) {
    if (!isOn(ctx, "ciam")) mark(false, "The code uses Touchque Login, which is OFF for this organization (an owner turns it on in Organization → Features)");
    else if (!setup.touchqueLogin.slug) mark(false, "Touchque Login has no tenant yet (dashboard → Touchque Login)");
    else {
      mark(true, `Touchque Login tenant ${setup.touchqueLogin.slug}, issuer ${setup.touchqueLogin.issuer}`);
      const apps = Array.isArray(setup.touchqueLogin.apps) ? setup.touchqueLogin.apps : [];
      const app = args.clientId ? apps.find((a) => a.clientId === args.clientId) : apps.find((a) => code.includes(a.clientId));
      if (args.clientId && !app) mark(false, `No Touchque Login app with client ID ${args.clientId} in this organization`);
      const uris = [...new Set([...(args.redirectUris || []), ...urlsIn(code).filter((u) => /callback|redirect|auth/i.test(u) && !/touchque\.com/.test(u))])];
      const registered = new Set(apps.flatMap((a) => (app ? (a === app ? a.redirectUris : []) : a.redirectUris) || []));
      for (const u of uris) mark(registered.has(u), registered.has(u) ? `Redirect URI registered: ${u}` : `Redirect URI NOT registered${app ? ` on ${app.name}` : ""}: ${u} (add it with touchque_add_redirect_uri or in the dashboard)`);
      if (!uris.length) info("No redirect URI found in the code: pass redirectUris to check them.");
      if (/\.login\.touchque\.com/.test(code) && !code.includes(setup.touchqueLogin.issuer)) mark(false, `The code names a Touchque Login address other than this tenant's issuer (${setup.touchqueLogin.issuer})`);
    }
  }

  const types = code ? actionTypesIn(code) : [];
  if (types.length && Array.isArray(setup.actionTypes)) {
    const known = new Set(setup.actionTypes.map((t) => t.type));
    const definesInCode = /actionTypes\.define|action_types\.define|ActionTypes\.Define|ActionTypes\(\)\.define|action_types\(\)\.define/i.test(code);
    for (const t of types) {
      const ok = known.has(t);
      mark(ok || definesInCode, ok ? `Action type ${t} exists in the workspace` : definesInCode ? `Action type ${t} is not in the workspace yet, but the code defines action types at startup` : `Action type ${t} does not exist in the workspace: define it (dashboard → Action types, or tq.actionTypes.define at startup)`);
    }
  }
  if (/webhook|callback/i.test(code) && /signature|X-TouchQue-Signature|verifyWebhook|webhooks\.verify|construct/i.test(code)) {
    mark(Boolean(setup.webhook.url), setup.webhook.url ? `Webhook URL set: ${setup.webhook.url}` : "The code handles Touchque webhooks, but no webhook URL is set (dashboard → Webhooks)");
  }
  if (/passkey|webauthn/i.test(code)) {
    info(setup.passkeyDomain && setup.passkeyDomain.domain ? `Passkey domain: ${setup.passkeyDomain.domain}` : "No passkey domain of your own set (passkeys then live on Touchque's domain; set yours in the dashboard → Passkey domain)");
  }

  let staticReport = "";
  if (code && args.framework) {
    try {
      const r = await core.callTool({ params: { name: "validate_integration", arguments: { code, framework: args.framework, language: args.language } } });
      staticReport = `\n\n${r.content[0].text}`;
    } catch (err) {
      staticReport = `\n\n(static checklist failed: ${err.message})`;
    }
  } else if (code) {
    info("Pass framework too to run the static checklist (validate_integration).");
  }
  return `Touchque live check for ${ctx.organization.name}\n\n${lines.join("\n")}${staticReport}`;
}

async function startChange(ws, label, method, pathname, body) {
  const id = crypto.randomBytes(9).toString("base64url");
  const promise = ws.dash(method, pathname, body, { timeoutMs: 60000 }).then((data) => ({ ok: true, data }), (err) => ({ ok: false, err }));
  changes.set(id, { gid: ws.claims.gid, promise, label, startedAt: Date.now() });
  for (const [k, v] of changes) if (Date.now() - v.startedAt > 300000) changes.delete(k);
  // Done at once (no phone asked), or the phone's number to tell the person.
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

function changeResult(label, outcome) {
  if (!outcome.ok) return fail(`${label}: not done.\n${describeError(outcome.err)}`);
  const d = outcome.data || {};
  if (d.secret) {
    return text(`${label}: done.\nkeyId (TQ_API_KEY): ${d.credential?.keyId}\nsecret (TQ_API_SECRET, shown only now): ${d.secret}\n\nWrite both straight into the project's server-side .env (make sure .env is in .gitignore). Do not repeat the secret in the chat; if it is lost, rotate the key in the dashboard.`);
  }
  return text(`${label}: done.\n${json(d)}`);
}

async function call(name, args, ws, core, config) {
  if (name === "touchque_whoami") return text(whoText(await ws.context(), ws));

  if (name === "touchque_list_organizations") {
    const ctx = await ws.context();
    return text(json({ active: ctx.organization.id, organizations: ctx.organizations.map((o) => ({ ...o, active: o.id === ctx.organization.id })) }));
  }

  if (name === "touchque_use_organization") {
    const want = String(args.organization || "").trim().toLowerCase();
    const ctx = await ws.context();
    const org = ctx.organizations.find((o) => o.id === args.organization || (o.slug && o.slug.toLowerCase() === want) || o.name.toLowerCase() === want);
    if (!org) return fail(`No organization "${args.organization}" among: ${ctx.organizations.map((o) => o.name).join(", ")}`);
    const next = await ws.useOrganization(org.id);
    return text(`Now working in ${next.organization.name} (role: ${next.organization.role}).\n\n${whoText(next, ws)}`);
  }

  if (name === "touchque_features") {
    const ctx = await ws.context();
    return text(`Features of ${ctx.organization.name}:\n${json(featureRows(ctx))}\n\nA feature that is OFF: an owner turns it on in ${config.dashboardUrl} → Organization → Features.`);
  }

  if (name === "touchque_workspace_setup") {
    const ctx = await ws.context();
    return text(json(await workspaceSetup(ws, ctx)));
  }

  if (name === "touchque_pick_sdk") {
    const language = args.language || languageFromFiles(args.files || []);
    const describe = (lang) => {
      const s = SDKS[lang];
      return {
        language: lang, label: s.label, package: s.package, published: s.published ? `yes, ${s.published}` : `no (${s.registry})`,
        install: s.install || `Not published yet. Use it from source (https://github.com/Touchque) or call the REST API (${config.docsUrl}/authentication); or pick a published SDK if the stack allows.`,
        env: ["TQ_API_KEY=tq_… (the key ID)", "TQ_API_SECRET=… (server-side only)"],
      };
    };
    const out = language ? describe(language) : { note: "Language not known: pass language or the project's manifest file names.", sdks: LANGS.map(describe) };
    return text(json({ ...out, frontend: FRONTEND, docs: `${config.docsUrl}/sdk-intro` }));
  }

  if (name === "touchque_generate_integration") {
    const spec = INTEGRATIONS[args.feature];
    if (!spec) return fail(`Unknown feature: ${args.feature}. One of ${INTEGRATION_NAMES.join(", ")}`);
    if (!SDKS[args.language]) return fail(`Unknown language: ${args.language}`);
    const ctx = await ws.context();
    if (!isOn(ctx, spec.feature)) {
      const f = CATALOG.features.find((x) => x.id === spec.feature);
      return fail(`${spec.label} needs ${f ? f.name : spec.feature}, which is OFF for ${ctx.organization.name}. Do not write this integration. An owner can turn it on in ${config.dashboardUrl} → Organization → Features${ctx.organization.role === "owner" ? " (you are an owner)" : ""}.`);
    }
    const setup = await workspaceSetup(ws, ctx);
    const sdk = SDKS[args.language];
    const facts = {
      organization: ctx.organization.name,
      sdk: { package: sdk.package, published: sdk.published || `not yet (${sdk.registry})`, install: sdk.install },
      env: { TQ_API_KEY: (setup.apiKeys.keys || []).find((k) => k.status === "ACTIVE" && k.mine)?.keyId || "(no active key of yours: touchque_create_api_key)", TQ_API_SECRET: "(server-side .env only)" },
      actionTypes: Array.isArray(setup.actionTypes) ? setup.actionTypes : [],
      ...(args.feature === "webhooks" && { webhook: setup.webhook }),
      ...(args.feature === "touchque_login" && { touchqueLogin: setup.touchqueLogin }),
      ...(args.feature === "passkeys" && { passkeyDomain: setup.passkeyDomain }),
    };
    const steps = [
      "Read the person's code first: where sign-in and the protected actions live, the framework, the dependency file.",
      sdk.install ? `Install: ${sdk.install}` : `The ${sdk.label} SDK is not published yet: tell the person, and use it from source or a published SDK's language if possible.`,
      "Put TQ_API_KEY and TQ_API_SECRET in the server's .env (never in source, never in the browser).",
      ...(args.feature === "touchque_login"
        ? ["Use the tenant's issuer and an app's client ID from the facts below; register every redirect URI the app uses (touchque_add_redirect_uri)."]
        : ["Use action type names that exist in the workspace (facts below), or define them at startup with the SDK."]),
      "Edit the files yourself, following the SDK sections below exactly; keep the existing sign-in working.",
      "Then run touchque_check_integration with the code and framework.",
    ];
    const sections = sectionsFor(args.language, args.feature);
    return text(`# ${spec.label} — ${sdk.label}${args.framework ? ` (${args.framework})` : ""}\n\n## Steps\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n## This workspace\n${json(facts)}\n\n## Docs\n${config.docsUrl}${spec.docs}\n\n## From the ${sdk.package} README\n\n${sections}`);
  }

  if (name === "touchque_check_integration") return text(await checkIntegration(ws, args, core));

  if (name === "touchque_search_docs") {
    const hits = await searchDocs(config.docsUrl, args.query || "");
    if (!hits.length) return text(`Nothing found for "${args.query}". The docs: ${config.docsUrl}`);
    return text(hits.map((h) => `## ${h.title}\n${h.url}\n\n${h.excerpt}`).join("\n\n---\n\n"));
  }

  if (name === "touchque_explain_case") {
    const code = String(args.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) return fail("A case code looks like K7P-2QX");
    return text(json(await ws.dash("GET", `/v1/cases/${encodeURIComponent(code)}`)));
  }

  if (name === "touchque_send_test_approval") {
    const ctx = await ws.context();
    if (!args.confirm) return text(`This sends a test approval to the Touchque app linked to ${ctx.user.email}. Ask the person whether to send it now; if they say yes, call touchque_send_test_approval again with confirm: true.`);
    const r = await ws.postSso("/sso/mcp/touchque/test-approval", {});
    return text(`Sent to ${r.email}'s Touchque app.${r.challengeCode ? ` Tell the person: "On your phone, pick ${r.challengeCode}."` : ""} Then call touchque_test_approval_status with requestId ${r.requestId}.`);
  }

  if (name === "touchque_test_approval_status") {
    const r = await ws.postSso("/sso/mcp/touchque/test-approval/status", { requestId: String(args.requestId || "") });
    const words = { PENDING: "still waiting for the phone", CONFIRMED: "approved on the phone ✅", REJECTED: "rejected on the phone", EXPIRED: "expired without an answer" };
    return text(`Test approval: ${words[r.status] || r.status}.`);
  }

  if (name === "touchque_create_api_key" || name === "touchque_add_redirect_uri") {
    if (!ws.canWrite) return fail("This connection may only read. To make changes, reconnect Touchque's MCP and allow “touchque:write” on the consent screen.");
    const ctx = await ws.context();
    if (name === "touchque_create_api_key") {
      const label = `Create API key "${String(args.name).slice(0, 60)}" in ${ctx.organization.name}`;
      if (!args.confirm) return text(`${label}. Owners and admins only; one active key per person per organization. Touchque will ask ${ctx.user.email}'s phone, as the dashboard does. Ask the person to confirm; then call again with confirm: true.`);
      const r = await startChange(ws, label, "POST", "/v1/credentials", { name: String(args.name).slice(0, 60), ...(args.expiresInDays && { expiresInDays: args.expiresInDays }) });
      if (r.done) return changeResult(label, r.done);
      return text(`${label}: waiting for the phone.${r.pending?.challengeCode ? ` Tell the person: "On your phone, pick ${r.pending.challengeCode}."` : " Tell the person to approve it in the Touchque app."} Then call touchque_change_status with changeId ${r.id} (the phone has about 30 seconds).`);
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
    if (!args.confirm) return text(`${label}. After it, Touchque Login sends sign-ins of this app back to that address. Ask the person to confirm; then call again with confirm: true.`);
    const r = await startChange(ws, label, "PATCH", `/v1/identity/clients/${encodeURIComponent(args.clientId)}`, { redirectUris: [...current, String(args.redirectUri)] });
    if (r.done) return changeResult(label, r.done);
    return text(`${label}: waiting for the phone.${r.pending?.challengeCode ? ` Tell the person: "On your phone, pick ${r.pending.challengeCode}."` : ""} Then call touchque_change_status with changeId ${r.id}.`);
  }

  if (name === "touchque_change_status") {
    const c = changes.get(String(args.changeId || ""));
    if (!c || c.gid !== ws.claims.gid) return fail("No such change waiting (it may have finished and been reported already).");
    const outcome = await Promise.race([c.promise, new Promise((r) => setTimeout(() => r(null), 25000))]);
    if (!outcome) return text(`${c.label}: still waiting for the phone. Call touchque_change_status again.`);
    changes.delete(String(args.changeId));
    return changeResult(c.label, outcome);
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

module.exports = { TOOLS, callTool, INTEGRATIONS, featureRows, actionTypesIn };
