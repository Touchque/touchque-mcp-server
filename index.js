#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// This server talks over stdio only (no HTTP/SSE, no port, no server-side
// auth) — it's meant to run as a local child process launched by an MCP
// client (Claude Desktop, Claude Code, Cursor, Windsurf, …), the same way
// `npx -y @touchque/mcp-server` would. See README.md for client config
// examples.
//
// It reads and validates code you paste in, and fetches your own backend's
// health — it never touches a real TouchQue account or holds a secret, so
// there is nothing here that needs gating with an API key.
//
// IMPORTANT — client compatibility: not every MCP client renders every MCP
// primitive. `prompts` (the wizard/audit/troubleshoot instructions below)
// and `resources` (the raw docs/types files) are BOTH inconsistently
// supported across clients — some editors only ever show `tools`. So the
// docs/instructions are deliberately reachable THREE independent ways:
//   1. The server-level `instructions` string (every client that shows
//      anything on connect shows this).
//   2. The `touchque_help` TOOL (tools are the one primitive every MCP
//      client supports — this is the actual "help command" a client that
//      doesn't support prompts/resources should find).
//   3. `resources/list` + `resources/read`, for clients that browse
//      resources instead of/alongside tools.
// Never remove #2 even if #1/#3 seem redundant — it's the fallback of last
// resort for the least-capable client.

const { version: PACKAGE_VERSION } = require("./package.json");

const DOCS_DIR = path.join(__dirname, "bundled");

// Optional override for local development against a docs site you're
// actively editing (e.g. DOCS_BASE_URL=http://localhost:5176/docs). Most
// users should never need to set this — the bundled copies below are
// current as of this package's version and need no network access at all.
const DOCS_BASE_URL = process.env.DOCS_BASE_URL || null;

const BUNDLED_DOCS = [
  {
    uri: "touchque://docs/sdk-documentation.md",
    filename: "sdk-documentation.md",
    name: "TouchQue Node.js SDK — README",
    mimeType: "text/markdown",
    description: "Install, the requireTouchQue step-up model, framework adapters, error handling, security.",
  },
  {
    uri: "touchque://docs/types.ts",
    filename: "types.ts",
    name: "TouchQue Node.js SDK — TypeScript types",
    mimeType: "text/x-typescript",
    description: "Config, Step/StepState, StartOptions, CompleteExpectations, resource response types.",
  },
];

async function readDocsFile(bundledFilename) {
  if (DOCS_BASE_URL) {
    const url = `${DOCS_BASE_URL}/${bundledFilename}`;
    const response = await fetch(url).catch(() => null);
    if (response && response.ok) return await response.text();
    // Fall through to the bundled copy rather than failing outright — an
    // explicit override that's temporarily unreachable shouldn't break the
    // tool when a good-enough local answer already exists.
  }
  return fs.readFileSync(path.join(DOCS_DIR, bundledFilename), "utf8");
}

const HELP_TEXT = `TouchQue MCP Server — start here.

This server helps you add TouchQue push-2FA/passkey step-up authentication
to a codebase correctly, using the CURRENT API (requireTouchQue / 202 +
X-TouchQue-Token step-up — not the old synchronous tq.login.verify()).

Call these tools, in this order, for a normal integration:
  1. get_touchque_docs      — the SDK README (install + the step-up model)
  2. get_sdk_types          — TypeScript types, to check exact method shapes
  3. (write the integration code)
  4. validate_integration   — checks your code against the current API
  5. ping_touchque_api      — checks a backend URL is actually reachable

Push + passkey step-up is the default flow. TouchQue ALSO has "Offline
Sign" — a QR code + 7-character code flow for when the user's phone has no
internet (tq.offline.challenge() / tq.offline.verify() in the SDK). If the
user mentions offline approval, kiosks, air-gapped environments, or "what
if the phone has no signal", use that flow, not requireTouchQue.

BEFORE YOU WRITE CODE: every action type (e.g. "SEND_MONEY") MUST already
exist — either created in the Dashboard, or defined from code with
tq.actions.define('SEND_MONEY', { critical: true }). Skip this and the
first real request 400s with "unknown_action" — this is the most common
first-run failure and it looks like a bug in the integration, not a
missing setup step. Always ask whether the action should be "critical"
(forces number matching) and whether a passkey should be required for it
(Dashboard Security Policy) — don't assume.

WEBHOOKS ARE OPTIONAL, not required. The default flow (requireTouchQue /
start+check+complete) needs no webhook at all — your route polls/retries
with X-TouchQue-Token until it resolves. tq.webhook.verify() exists for a
DIFFERENT use case: a backend with no live frontend polling loop (a batch
job, a cron-triggered approval, a server process with nobody waiting on a
request) that wants an async push instead. Don't set up webhook signature
verification "just in case" — only add it if the user actually has that
kind of backend-only flow; otherwise it's unused code that never fires.

If your client supports MCP prompts, four ready-made instruction sets are
also available: integrate_touchque (step-by-step wizard, push/passkey),
configure_offline_sign (wizard for the QR + 7-character-code offline
flow), audit_touchque_integration (security review), troubleshoot_touchque
(fixing a broken integration). If your client doesn't show prompts, just
call get_touchque_docs and follow it directly — nothing here requires
prompts to work; the Offline Sign flow is documented in there too.

This server is read-only dev tooling: no API key, no account access, no
required network calls (docs/types are bundled, not fetched).`;

const server = new Server({
  name: "touchque-mcp-server",
  version: PACKAGE_VERSION,
}, {
  capabilities: {
    tools: {},
    prompts: {},
    resources: {},
  },
  // MCP-native "help" — many clients (Claude Desktop/Code, and others)
  // surface this on connect without any tool call. Clients that don't show
  // it still have the touchque_help tool below.
  instructions: HELP_TEXT,
});

// ==========================================
// TOOLS
// ==========================================
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "touchque_help",
        description: "START HERE. Explains what this MCP server is for and which tool to call next. Call this first if you're not sure what TouchQue is or how this server works — it works in every MCP client, including ones that don't support prompts or resources.",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "get_touchque_docs",
        description: "Returns the official @touchque/node SDK README (install, the requireTouchQue step-up model, framework adapters, error handling, security). Always call this before writing any integration code — the step-up model is not what you'd guess from the function names alone.",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "get_sdk_types",
        description: "Returns the TouchQue Node.js SDK's TypeScript type definitions (Config, Step/StepState, StartOptions, CompleteExpectations, resource response types). Use this to validate correct usage of SDK methods, options, and return types.",
        inputSchema: { type: "object", properties: {}, required: [] }
      },
      {
        name: "ping_touchque_api",
        description: "Verifies that a TouchQue Backend API instance is reachable and healthy before attempting integration. Returns connection status and response time.",
        inputSchema: {
          type: "object",
          properties: {
            apiUrl: {
              type: "string",
              description: "The full base URL of the TouchQue backend (e.g. https://api.touchque.com or http://localhost:5001)"
            }
          },
          required: ["apiUrl"]
        }
      },
      {
        name: "validate_integration",
        description: "Performs a static analysis checklist on a code snippet to verify it follows the current requireTouchQue step-up model and TouchQue security best practices. Returns a structured report of passed/failed checks.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The code snippet to validate (route handler, middleware, or service file)"
            },
            framework: {
              type: "string",
              description: "The web framework being used (express, fastify, koa, nextjs, nestjs)",
              enum: ["express", "fastify", "koa", "nextjs", "nestjs", "other"]
            }
          },
          required: ["code", "framework"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "touchque_help") {
      return { content: [{ type: "text", text: HELP_TEXT }] };
    }

    if (name === "get_touchque_docs") {
      const content = await readDocsFile("sdk-documentation.md");
      return { content: [{ type: "text", text: content }] };
    }

    if (name === "get_sdk_types") {
      const content = await readDocsFile("types.ts");
      return { content: [{ type: "text", text: content }] };
    }

    if (name === "ping_touchque_api") {
      const apiUrl = args.apiUrl || "http://localhost:5001";
      const start = Date.now();
      const response = await fetch(`${apiUrl}/`).catch(() => null);
      const elapsed = Date.now() - start;
      const isAlive = response && response.ok;

      return {
        content: [{
          type: "text",
          text: isAlive
            ? `✅ TouchQue API is reachable. Response time: ${elapsed}ms. Status: ${response.status}`
            : `❌ TouchQue API is unreachable at ${apiUrl}. Check that the server is running and the URL is correct.`
        }]
      };
    }

    if (name === "validate_integration") {
      const { code, framework } = args;
      const checks = [];

      // Security & correctness checks, against the current step-up API
      // (requireTouchQue / withTouchQue / touchqueRouter — not the old
      // synchronous tq.login.verify()/tq.protect() model).
      const hasImport = /require\s*\(\s*['"]@touchque\/node['"]\s*\)|from\s+['"]@touchque\/node['"]/.test(code);
      checks.push({ id: "import", label: "SDK is imported", pass: hasImport });

      const hasStepUpGuard = /requireTouchQue\s*\(|withTouchQue\s*\(|touchqueRouter\s*\(/.test(code);
      const hasLegacyGuard = /tq\.protect\(|touchqueMiddleware|tqMiddleware|tq\.middleware/.test(code);
      checks.push({
        id: "protection",
        label: hasLegacyGuard && !hasStepUpGuard
          ? "Route protection applied (found the OLD tq.protect()/middleware pattern — migrate to requireTouchQue())"
          : "Route protection applied (requireTouchQue/withTouchQue/touchqueRouter)",
        pass: hasStepUpGuard,
      });

      const hasSynchronousVerify = /\.login\.verify\s*\(/.test(code);
      checks.push({
        id: "no_synchronous_verify",
        label: "Not using the old synchronous login.verify() inside a route handler (it can't show a matching number/QR before approval — use requireTouchQue instead)",
        pass: !hasSynchronousVerify,
      });

      const hasHardcodedSecret = /apiSecret\s*[:=]\s*['"][a-zA-Z0-9]{10,}['"]|apiKey\s*[:=]\s*['"]tq_[a-zA-Z0-9]{10,}['"]/.test(code);
      checks.push({ id: "no_hardcoded_secret", label: "No hardcoded API key/secret in source", pass: !hasHardcodedSecret });

      const hasEnvVar = /process\.env\.|env\[/.test(code);
      checks.push({ id: "env_vars", label: "Environment variables used for secrets", pass: hasEnvVar });

      const hasErrorHandling = /catch|try\s*{|\.catch\s*\(/.test(code) || hasStepUpGuard;
      checks.push({
        id: "error_handling",
        label: hasStepUpGuard
          ? "Error handling (requireTouchQue's own 202/403/408/423/429 responses cover the step-up flow)"
          : "Error handling present",
        pass: hasErrorHandling,
      });

      const passed = checks.filter(c => c.pass).length;
      const total = checks.length;
      const score = Math.round((passed / total) * 100);

      const report = checks.map(c =>
        `${c.pass ? "✅" : "❌"} ${c.label}`
      ).join("\n");

      return {
        content: [{
          type: "text",
          text: `TouchQue Integration Validation Report\nFramework: ${framework}\nScore: ${score}% (${passed}/${total} checks passed)\n\n${report}${score < 100 ? "\n\n⚠️ Fix the failing checks before deploying to production." : "\n\n✅ All checks passed. Integration looks correct."}`
        }]
      };
    }

    throw new Error(`Unknown tool: ${name}`);

  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: `Tool error: ${error.message}` }]
    };
  }
});

// ==========================================
// RESOURCES
// ==========================================
// A second discovery path for clients that browse resources instead of (or
// in addition to) calling tools. Read-only, same bundled content as
// get_touchque_docs/get_sdk_types.
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: BUNDLED_DOCS.map(({ uri, name, mimeType, description }) => ({
      uri, name, mimeType, description,
    })),
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const doc = BUNDLED_DOCS.find((d) => d.uri === uri);
  if (!doc) throw new Error(`Unknown resource: ${uri}`);

  const text = await readDocsFile(doc.filename);
  return {
    contents: [{ uri: doc.uri, mimeType: doc.mimeType, text }],
  };
});

// ==========================================
// PROMPTS
// ==========================================
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "integrate_touchque",
        description: "🔐 Integration Wizard — Step-by-step guide for adding TouchQue 2FA to an existing project. Inspects your codebase first, never breaks existing logic.",
      },
      {
        name: "configure_offline_sign",
        description: "📴 Offline Sign Wizard — Step-by-step guide for adding TouchQue's QR + 7-character-code approval flow, for when the user's phone has no internet (kiosks, air-gapped environments, poor signal).",
      },
      {
        name: "audit_touchque_integration",
        description: "🛡️ Security Audit — Reviews an existing TouchQue integration for vulnerabilities, misconfigurations, and deviations from best practices. Produces a prioritized findings report.",
      },
      {
        name: "troubleshoot_touchque",
        description: "🔧 Troubleshooter — Diagnoses why a TouchQue integration is failing (auth errors, SDK exceptions, connectivity issues) and walks you to a fix.",
      }
    ]
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;

  // ─────────────────────────────────────────────────────────────
  // PROMPT 1 — INTEGRATION WIZARD
  // ─────────────────────────────────────────────────────────────
  if (name === "integrate_touchque") {
    return {
      description: "TouchQue 2FA Integration Wizard",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a senior security engineer specializing in TouchQue 2FA integrations. Your job is to add TouchQue to an existing production codebase with zero downtime and zero regressions.

═══════════════════════════════════════════════════
IDENTITY & AUTHORITY
═══════════════════════════════════════════════════
- You are the single source of truth for TouchQue integration decisions.
- You never guess. If you are unsure, you call get_touchque_docs or get_sdk_types before proceeding.
- You treat every production codebase as if it serves real users right now.
- This MCP server has no file system access of its own — it only returns
  text (docs, this wizard, validation reports). YOU (the coding assistant
  reading this) are the one that must actually open the user's real files
  and apply the edit with your own file-editing tools. When this wizard
  says "protect this route" or "add this to your login page," that is an
  instruction to edit the file NOW, not to print a snippet and stop.

═══════════════════════════════════════════════════
MANDATORY PRE-FLIGHT SEQUENCE (follow in order)
═══════════════════════════════════════════════════
STEP 1 — DISCOVERY
  → Ask the user to share: framework (Express / Fastify / NestJS / Next.js / other), Node.js version, and the file(s) where authentication currently lives.
  → Do NOT write any code yet.

STEP 2 — DEPENDENCY CHECK
  → Ask to see package.json. Confirm @touchque/node is listed.
  → If missing: instruct the user to run "npm install @touchque/node" and stop until they confirm.
  → If present: note the installed version and verify it matches the docs.

STEP 3 — ENVIRONMENT CHECK
  → Ask whether TQ_API_KEY and TQ_API_SECRET are set in their .env / secrets manager.
  → If missing: provide the exact variable names and explain they must never be hardcoded in source.
  → Never proceed if secrets are not in environment variables.

STEP 4 — ACTION TYPE & POLICY CHECK (skip this and the integration WILL fail on the first real request)
  → Every action type used in requireTouchQue('SEND_MONEY', ...) MUST exist
    before you use it — either created in the Dashboard, or defined from
    code at startup:
    \`\`\`javascript
    await tq.actions.define('SEND_MONEY', { name: 'Send money', critical: true });
    \`\`\`
  → Ask the user which they'd rather do. If they're not sure it exists yet,
    tell them plainly: an undefined action type returns "400 unknown_action"
    on the very first request — this is the single most common first-run
    failure, and it looks like a bug in the integration when it is actually
    just a missing setup step.
  → Ask whether this action should be "critical" (forces number matching,
    refuses recovery codes and offline time-based codes — appropriate for
    money movement, not for a low-stakes preference change) and whether a
    passkey should be REQUIRED for it (set in the Dashboard's Security
    Policy page, not from code). Don't guess at "critical" — ask.
  → If the user needs offline/no-internet approval (kiosks, poor signal),
    stop and use the configure_offline_sign prompt instead/in addition —
    it has its own separate Dashboard prerequisite.

STEP 5 — CODEBASE REVIEW
  → Ask the user to paste the auth route / middleware / service file where 2FA will be added.
  → Read it carefully. Identify: existing session/JWT handling, error response format, middleware chain order.
  → Summarize your understanding back to the user before touching anything.

STEP 6 — SURGICAL INTEGRATION
  → Use the 'requireTouchQue' Express middleware to protect routes in one line — it takes the ACTION and options directly, not a client instance.
  → Never rewrite surrounding business logic.
  → Preserve existing error response shapes for YOUR OWN business errors — but understand that requireTouchQue answers 202 (not your normal 200/4xx) while approval is pending; this is expected, not a bug to "fix".
  → Use this exact pattern as your reference for integration:

\`\`\`javascript
const { requireTouchQue } = require('@touchque/node');
// TQ_API_KEY / TQ_API_SECRET are read from the environment automatically.

// Provide a semantic action type like "SEND_MONEY" or "LOGIN" for the AI Risk Engine,
// and (for anything sensitive) the transaction details the user should see and approve.
app.post(
  '/api/transfer',
  requireTouchQue('SEND_MONEY', {
    user: (req) => req.session.user?.email,
    details: (req) => ({ Amount: \`\${req.body.amount} EUR\`, To: req.body.iban }),
  }),
  (req, res) => {
    // Only reached once the user approved on their phone — req.touchque
    // carries { requestId, assurance, approvalProof, ... }.
    res.json({ success: true, assurance: req.touchque.assurance });
  }
);
\`\`\`

  → Until approved, this answers 202 { touchque: step, token }. The frontend must show \`step\` (a matching number, or a QR code the first time the user links the app) and resend the SAME request with header \`X-TouchQue-Token: <token>\` until it resolves — point the user at \`@touchque/web\`'s \`touchqueFetch()\`, which does this loop for them. Do not try to make the backend "wait" for approval synchronously; that is the OLD, broken model.

STEP 7 — VALIDATION
  → After writing code, call the validate_integration tool on the final snippet.
  → Show the validation report to the user.
  → If any check fails, fix it before declaring success.

STEP 8 — HANDOFF
  → Provide a concise test checklist the developer can run manually:
    [ ] First request to the protected route answers 202 with a step (number or enroll QR)
    [ ] Approving on the phone lets the retried request through exactly once
    [ ] Rejecting on the phone returns a clear rejected/expired response, not a 500
    [ ] Existing non-2FA routes are unaffected
    [ ] No secrets (API key/secret, or approval tokens) appear in logs or client-visible responses

═══════════════════════════════════════════════════
HARD CONSTRAINTS — NEVER VIOLATE
═══════════════════════════════════════════════════
✗ Never hardcode API keys, secrets, or URLs in generated code.
✗ Never remove or bypass existing auth middleware.
✗ Never change HTTP status codes that existing clients depend on — but do NOT "fix" the 202 pending-approval response; that is correct.
✗ Never write speculative code without seeing the actual file first.
✗ Never mark the integration complete without running validate_integration.
✗ Never write the OLD synchronous tq.login.verify()-inside-a-handler pattern — it cannot show a matching number before approval and is not what requireTouchQue does.

═══════════════════════════════════════════════════
BEGIN
═══════════════════════════════════════════════════
Start by asking for the framework and pointing the user to Step 1.`
          }
        }
      ]
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PROMPT 2 — OFFLINE SIGN WIZARD
  // ─────────────────────────────────────────────────────────────
  if (name === "configure_offline_sign") {
    return {
      description: "TouchQue Offline Sign Integration Wizard",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are adding TouchQue's "Offline Sign" flow to an existing codebase: approval via a QR code the phone scans WITHOUT internet, which then shows the user a 7-character code they type on the website. This is a DIFFERENT flow from push/passkey step-up (requireTouchQue) — use this prompt only when the user specifically needs approval to work when the phone has no signal/data (kiosks, air-gapped environments, poor connectivity, "what if there's no internet on the phone").

This MCP server has no file system access of its own — YOU must actually
open the user's real backend route file AND their real login/approval
screen file and edit both. If you don't already know which file renders
the login/approval screen, ASK for it by name before writing any code —
do not guess a filename or invent a component that doesn't exist.

═══════════════════════════════════════════════════
PREREQUISITE — DASHBOARD POLICY
═══════════════════════════════════════════════════
→ Offline Sign must be turned on for the integration in the TouchQue
  Dashboard's Security Policy page first ("Offline sign"). For critical
  actions it must also be explicitly allowed there, and \`details\` becomes
  required on every challenge. Tell the user to check this before anything
  else — a correct integration still fails with \`offline_disabled\` if this
  toggle is off.

═══════════════════════════════════════════════════
THE FLOW
═══════════════════════════════════════════════════
1. The user is on your page, ONLINE. Your backend creates a challenge and
   shows its QR:

\`\`\`javascript
const { TouchQue } = require('@touchque/node');
const tq = new TouchQue(); // TQ_API_KEY / TQ_API_SECRET from the environment

app.post('/api/offline-challenge', async (req, res) => {
  const ch = await tq.offline.challenge({
    user: req.session.user.email,
    type: 'WITHDRAW',                 // your action type
    details: { Amount: '1,250.00 USD', Recipient: 'Jane Doe' }, // required for critical actions
    clientIp: req.ip,
    userAgent: req.get('user-agent'),
  });
  // ch: { challengeId, qr (text), qrDataUrl (data:image/png;base64,...), expiresInSeconds, totpAvailable }
  res.json(ch);
});
\`\`\`

2. Render \`qrDataUrl\` directly as an \`<img>\` src — no client-side QR
   library needed. The user's phone scans it OFFLINE, shows the \`details\`
   for confirmation (Face ID/fingerprint), and displays a 7-character code.

3. The user types that code into your page; your backend verifies it:

\`\`\`javascript
app.post('/api/offline-verify', async (req, res) => {
  const result = await tq.offline.verify({
    challengeId: req.body.challengeId,
    code: req.body.code,
  });
  // result: { approved: true } | { approved: false, reason, attemptsLeft }
  // NEVER throws for a wrong/expired/used/locked code — always check .approved.
  res.json(result);
});
\`\`\`

4. Optional, lower-assurance alternative with no QR at all — a rolling
   time-based code (refused for critical actions):
   \`tq.offline.verifyTotp({ user, code, type, clientIp })\`.

═══════════════════════════════════════════════════
THINGS THAT WILL BE WRONG IF YOU SKIP THEM
═══════════════════════════════════════════════════
✗ Do not treat a wrong code as an exception — verify() resolves
  \`{ approved: false, reason }\`, it does not throw.
✗ Do not build \`details\` from anything the browser sent unvalidated — it's
  shown on the phone as what the user is approving (WYSIWYS); build it
  from your own server-side state only.
✗ Do not skip the Dashboard policy prerequisite step — this is the #1
  reason a first attempt returns \`offline_disabled\`.
✗ A code works once; a challenge locks after 5 wrong codes; there is an
  hourly failed-attempt limit per user. Don't build a retry loop that
  ignores \`attemptsLeft\`.
✗ Only TouchQue can verify a code server-side (it's a MAC, not something a
  third party can check) — never try to validate it yourself.

═══════════════════════════════════════════════════
VALIDATION
═══════════════════════════════════════════════════
→ After writing the code, call validate_integration on it too — the same
  "no hardcoded secrets / env vars used / error handling" checks apply
  here as to a push/passkey integration.

Begin by confirming Offline Sign is enabled in the Dashboard, then ask for the framework and the action type this challenge is for.`
          }
        }
      ]
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PROMPT 3 — SECURITY AUDIT
  // ─────────────────────────────────────────────────────────────
  if (name === "audit_touchque_integration") {
    return {
      description: "TouchQue Integration Security Audit",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a security auditor performing a formal review of a TouchQue 2FA integration. You produce findings that an engineering team and their security officer can act on.

═══════════════════════════════════════════════════
AUDIT SCOPE
═══════════════════════════════════════════════════
You will review:
  1. SDK initialization and configuration
  2. Secret management (API keys, environment variables)
  3. Route protection coverage (are all sensitive routes wrapped in requireTouchQue/withTouchQue?)
  4. Step-up handling (does the frontend actually show the 202 step and retry with X-TouchQue-Token, or is the backend trying to block synchronously?)
  5. Approval consumption (is req.touchque's approval trusted for the SAME action/details it was requested for — not just "some approval exists"?)
  6. Fallback behavior (what happens when TouchQue API is unreachable?)
  7. Logging (are approval tokens, API secrets, or user PII accidentally logged?)
  8. Dependency hygiene (@touchque/node version, known CVEs)

═══════════════════════════════════════════════════
AUDIT PROCESS
═══════════════════════════════════════════════════
PHASE 1 — COLLECTION
  → Ask the user to share: the auth-related files, package.json, and their .env variable names (not values).
  → Call get_touchque_docs and get_sdk_types to load the reference baseline.

PHASE 2 — ANALYSIS
  → Compare the implementation against the official SDK docs line by line.
  → Run validate_integration on each relevant code file.
  → For every deviation found, assess: Is this a security risk? A correctness bug? A best-practice gap?

PHASE 3 — REPORT
  → Produce a structured findings report with exactly this format:

  ┌──────────────────────────────────────────────────────┐
  │ TOUCHQUE SECURITY AUDIT REPORT                       │
  │ Date: [today]   Severity scale: CRITICAL > HIGH >    │
  │ MEDIUM > LOW > INFO                                  │
  └──────────────────────────────────────────────────────┘

  For each finding:
  [SEVERITY] Finding Title
  Location: file.js line X
  Description: What is wrong and why it matters.
  Remediation: Exact code change or configuration step to fix it.
  Reference: Link to relevant TouchQue docs section.

  → End with an overall risk rating: PASS / CONDITIONAL PASS / FAIL
  → A FAIL must be resolved before the integration goes to production.

═══════════════════════════════════════════════════
CONSTRAINTS
═══════════════════════════════════════════════════
✗ Do not suggest workarounds that reduce security in exchange for convenience.
✗ Do not mark an integration PASS if any CRITICAL or HIGH findings are open.
✗ Every finding must have a concrete remediation — no vague recommendations.

Begin by asking the user to share the files they want audited.`
          }
        }
      ]
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PROMPT 4 — TROUBLESHOOTER
  // ─────────────────────────────────────────────────────────────
  if (name === "troubleshoot_touchque") {
    return {
      description: "TouchQue Integration Troubleshooter",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are a TouchQue support engineer. Your goal is to diagnose and fix a broken integration as quickly as possible, with minimal disruption to the user's system.

═══════════════════════════════════════════════════
TRIAGE DECISION TREE
═══════════════════════════════════════════════════
When a user reports a problem, work through this tree in order:

1. API CONNECTIVITY
   → Call ping_touchque_api with the user's API URL.
   → If unreachable: diagnose network, firewall, or URL misconfiguration first.
   → If reachable: proceed to Step 2.

2. AUTHENTICATION ERRORS (401 / 403 from TouchQue)
   → Ask: Is TQ_API_KEY (and TQ_API_SECRET) set in the environment? Is it the correct key for this environment (dev vs prod)?
   → Ask them to redact and share the exact error response body.
   → Common causes: wrong key, key not propagated after deploy, IP whitelist mismatch.

3. "unknown_action" (400 from TouchQue) — NOT an SDK bug
   → This means the action type (e.g. "SEND_MONEY") was never defined.
   → Fix: either create it in the Dashboard, or call
     tq.actions.define('SEND_MONEY', { critical: true }) once at startup.
   → This is the single most common first-run failure — check this BEFORE
     digging into SDK internals or network issues.

4. SDK EXCEPTIONS (thrown errors from @touchque/node)
   → Ask for the full stack trace.
   → Call get_sdk_types to verify the method signature they are using.
   → Common causes: wrong argument types, calling requireTouchQue with the OLD (client, action) signature instead of (action, options), SDK version mismatch.

5. PUSH / STEP-UP FAILURES (the route never resolves, or resolves wrong)
   → Ask: Does the first request come back as 202 { touchque, token } at all? If not, the middleware/route wiring is broken, not the phone flow.
   → Ask: Does the frontend re-send the SAME request with header X-TouchQue-Token, or is it trying to "wait" on the first response? The old synchronous model is gone — the frontend MUST retry.
   → Ask: Is the user actually enrolled? A never-linked user gets step.state === 'enroll' with a QR, not an error.
   → Consistent rejects/expires suggest: clock skew on server (NTP sync), a details/referenceId mismatch between the request that got approved and the one being completed.

6. MIDDLEWARE / ROUTE ORDER ISSUES
   → Ask the user to paste their route registration code and middleware chain.
   → Verify requireTouchQue(...) is applied BEFORE the route handler, not after.
   → Verify it is not accidentally applied to public routes.

7. ENVIRONMENT / BUILD ISSUES
   → Ask: Does this fail in all environments or just one?
   → Check: Is the .env file loaded before the SDK initializes? (dotenv must be required first)
   → Check: Does the build system strip environment variables?

═══════════════════════════════════════════════════
COMMUNICATION STANDARDS
═══════════════════════════════════════════════════
- State your hypothesis explicitly: "I believe the issue is X because Y."
- Ask for one piece of evidence at a time. Do not bombard with 10 questions.
- When you identify the root cause, explain it in plain language before showing the fix.
- After applying the fix, give the user a specific test to confirm it is resolved.

═══════════════════════════════════════════════════
CONSTRAINTS
═══════════════════════════════════════════════════
✗ Never suggest disabling 2FA as a workaround.
✗ Never suggest logging approval tokens or API secrets for debugging — use masked logs only.
✗ Never assume the problem is in TouchQue itself without ruling out configuration and environment first.

Begin by asking the user to describe what they expected to happen, what actually happened, and the exact error message or behavior they are seeing.`
          }
        }
      ]
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});

// ==========================================
// STARTUP
// ==========================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`🚀 TouchQue MCP Server v${PACKAGE_VERSION} started successfully (stdio transport).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Server startup error:", error);
    process.exit(1);
  });
}

module.exports = { server, readDocsFile, HELP_TEXT, BUNDLED_DOCS };
