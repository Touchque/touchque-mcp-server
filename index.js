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
// Only applies to the Node docs (the docs site doesn't serve the other
// three languages' bundles under separate paths).
const DOCS_BASE_URL = process.env.DOCS_BASE_URL || null;

// All 4 server SDKs share the same API (start/check/complete, the
// requireTouchQue-equivalent framework adapter, guard tokens) — this map is
// what makes every doc/type/validation tool "language-aware" instead of
// hardcoded to Node. Add a language here (and its bundled/<lang>/ files)
// when a 5th SDK ships.
const LANGUAGES = {
  node: {
    label: "Node.js", package: "@touchque/node", typesFile: "types.ts", typesMime: "text/x-typescript",
    frameworks: ["express", "fastify", "koa", "nextjs", "nestjs", "other"],
  },
  python: {
    label: "Python", package: "touchque-authenticator", typesFile: "types.py", typesMime: "text/x-python",
    frameworks: ["flask", "django", "fastapi", "other"],
  },
  php: {
    label: "PHP", package: "touchque-authenticator/php-sdk", typesFile: "types.php", typesMime: "text/x-php",
    frameworks: ["laravel", "other"],
  },
  go: {
    label: "Go", package: "github.com/Touchque/touchque-go/v3", typesFile: "types.go", typesMime: "text/x-go",
    frameworks: ["net-http", "other"],
  },
};
const DEFAULT_LANGUAGE = "node";
const LANGUAGE_NAMES = Object.keys(LANGUAGES);

function resolveLanguage(language) {
  if (!language) return DEFAULT_LANGUAGE;
  const normalized = String(language).toLowerCase().trim();
  if (LANGUAGES[normalized]) return normalized;
  throw new Error(`Unknown language "${language}" — expected one of: ${LANGUAGE_NAMES.join(", ")}`);
}

// Lets validate_integration infer the language from `framework` alone when
// `language` isn't passed (e.g. framework: "flask" implies Python).
const FRAMEWORK_LANGUAGE = {
  express: "node", fastify: "node", koa: "node", nextjs: "node", nestjs: "node",
  flask: "python", django: "python", fastapi: "python",
  laravel: "php",
  "net-http": "go",
};

// Per-language static-analysis patterns for validate_integration. Every
// language keeps the same 6 checks (import / protection / no legacy
// synchronous verify / no hardcoded secret / env vars / error handling) —
// only the regex and the "guardName" shown in the report differ.
const VALIDATION_PATTERNS = {
  node: {
    guardName: "requireTouchQue/withTouchQue/touchqueRouter",
    import: /require\s*\(\s*['"]@touchque\/node['"]\s*\)|from\s+['"]@touchque\/node['"]/,
    stepUpGuard: /requireTouchQue\s*\(|withTouchQue\s*\(|touchqueRouter\s*\(/,
    legacyGuard: /tq\.protect\(|touchqueMiddleware|tqMiddleware|tq\.middleware/,
    syncVerify: /\.login\.verify\s*\(/,
    hardcodedSecret: /apiSecret\s*[:=]\s*['"][a-zA-Z0-9]{10,}['"]|apiKey\s*[:=]\s*['"]tq_[a-zA-Z0-9]{10,}['"]/,
    envVar: /process\.env\.|env\[/,
    errorHandling: /catch|try\s*{|\.catch\s*\(/,
    offlineChallenge: /\.offline\s*\.\s*challenge\s*\(/,
    offlineLinked: /\brequestId\b/,
  },
  python: {
    guardName: "@require_touchque",
    import: /from\s+touchque(\.\w+)*\s+import|import\s+touchque\b/,
    stepUpGuard: /@require_touchque\s*\(|RequireTouchQue\s*\(/,
    legacyGuard: null,
    syncVerify: /\.login\.verify\s*\(/,
    hardcodedSecret: /api_secret\s*=\s*['"][a-zA-Z0-9]{10,}['"]|api_key\s*=\s*['"]tq_[a-zA-Z0-9]{10,}['"]/,
    envVar: /os\.environ|os\.getenv\s*\(/,
    errorHandling: /try\s*:|except\b/,
    offlineChallenge: /\.offline\s*\.\s*challenge\s*\(/,
    offlineLinked: /\brequest_id\b/,
  },
  php: {
    guardName: "->middleware('touchque:...')",
    // Laravel usage often references the middleware only by its string
    // alias ('touchque:SEND_MONEY') in the route file — the actual `use
    // TouchQue\...` import/registration lives in bootstrap/app.php or a
    // service provider, not necessarily in the same file. Treat the alias
    // itself as evidence of SDK usage too, not just a literal `use` line.
    import: /use\s+TouchQue\\|TouchQue\\\\TouchQue|->middleware\s*\(\s*['"]touchque:|TouchQueMiddleware/,
    stepUpGuard: /->middleware\s*\(\s*['"]touchque:|TouchQueMiddleware/,
    legacyGuard: null,
    syncVerify: /->login->verify\s*\(/,
    hardcodedSecret: /new\s+Config\s*\(\s*['"]tq_[a-zA-Z0-9]{6,}['"]\s*,\s*['"][a-zA-Z0-9]{10,}['"]/,
    envVar: /getenv\s*\(|\$_ENV\[/,
    errorHandling: /try\s*{|catch\s*\(/,
    offlineChallenge: /->offline\s*->\s*challenge\s*\(/,
    offlineLinked: /\$requestId\b|\brequestId\b|\brequest_id\b/,
  },
  go: {
    guardName: "touchque.Require",
    import: /["']github\.com\/Touchque\/touchque-go(?:\/v\d+)?\/touchque["']/,
    stepUpGuard: /touchque\.Require\s*\(/,
    legacyGuard: null,
    syncVerify: /\.Login\.Verify\s*\(/,
    hardcodedSecret: /APIKey:\s*"tq_[a-zA-Z0-9]{6,}"|APISecret:\s*"[a-zA-Z0-9]{10,}"/,
    envVar: /os\.Getenv\s*\(/,
    errorHandling: /if\s+err\s*!=\s*nil/,
    offlineChallenge: /\.Offline\s*\.\s*Challenge\s*\(/,
    offlineLinked: /\bRequestID\b/,
  },
};

const BUNDLED_DOCS = LANGUAGE_NAMES.map((lang) => ({
  uri: `touchque://docs/${lang}/sdk-documentation.md`,
  language: lang,
  filename: `${lang}/sdk-documentation.md`,
  name: `TouchQue ${LANGUAGES[lang].label} SDK — README`,
  mimeType: "text/markdown",
  description: `Install, the step-up model, framework adapters, error handling, security, for ${LANGUAGES[lang].package}.`,
})).concat(LANGUAGE_NAMES.map((lang) => ({
  uri: `touchque://docs/${lang}/types.${LANGUAGES[lang].typesFile.split(".").pop()}`,
  language: lang,
  filename: `${lang}/${LANGUAGES[lang].typesFile}`,
  name: `TouchQue ${LANGUAGES[lang].label} SDK — types/API reference`,
  mimeType: LANGUAGES[lang].typesMime,
  description: `Config, Step/StepState, StartOptions, CompleteExpectations, resource response types, for ${LANGUAGES[lang].package}.`,
})));

async function readDocsFile(bundledFilename, { allowRemote = false } = {}) {
  if (allowRemote && DOCS_BASE_URL) {
    // Only the Node docs (the historical single-language layout) have a
    // remote dev-server equivalent, and only sdk-documentation.md/types.ts
    // at that — never applies to python/php/go filenames.
    const remoteName = bundledFilename.startsWith("node/") ? bundledFilename.slice("node/".length) : null;
    if (remoteName) {
      const url = `${DOCS_BASE_URL}/${remoteName}`;
      const response = await fetch(url).catch(() => null);
      if (response && response.ok) return await response.text();
      // Fall through to the bundled copy rather than failing outright — an
      // explicit override that's temporarily unreachable shouldn't break the
      // tool when a good-enough local answer already exists.
    }
  }
  return fs.readFileSync(path.join(DOCS_DIR, bundledFilename), "utf8");
}

const HELP_TEXT = `TouchQue MCP Server — start here.

This server helps you add TouchQue push-2FA/passkey step-up authentication
to a codebase correctly, using the CURRENT API (requireTouchQue-equivalent
guard / 202 + X-TouchQue-Token step-up — not the old synchronous
.login.verify()). All 4 official server SDKs — Node, Python, PHP, Go —
share this exact same model, just with per-language naming
(requireTouchQue / @require_touchque / ->middleware('touchque:...') /
touchque.Require).

FIRST, if you don't already know: ask which language/framework the user's
backend is in. Every tool below takes an optional "language" argument
("node" | "python" | "php" | "go", defaults to "node") — pass the right
one, don't assume Node.

Call these tools, in this order, for a normal integration:
  1. get_touchque_docs({ language })    — that SDK's README (install + the step-up model)
  2. get_sdk_types({ language })        — that SDK's type/class reference, to check exact method shapes
  3. (write the integration code)
  4. validate_integration({ code, framework, language }) — checks your code against that SDK's current API
  5. ping_touchque_api                  — checks a backend URL is actually reachable

Push + passkey step-up is the default flow. TouchQue ALSO has "Offline
Sign" — a QR code + 7-character code flow for when the user's phone has no
internet (tq.offline.challenge() / tq.offline.verify() in the SDK). If the
user mentions offline approval, kiosks, air-gapped environments, or "what
if the phone has no signal", use that flow, not requireTouchQue.
When an offline QR is the FALLBACK for a push the user already started (the
usual "Verify offline" button next to a waiting screen), link it to that push
with requestId: a phone-side REJECT then kills the QR (no new QR, no code
finishes it), and the matching number is printed under the QR
(challengeCode). requireTouchQue / touchqueRouter / the step-up guard do
this automatically — only hand-written offline routes need to pass it.

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
        description: "Returns the official TouchQue SDK README for the given language (install, the step-up model, framework adapters, error handling, security). Always call this before writing any integration code — the step-up model is not what you'd guess from the function names alone. All 4 server SDKs (Node, Python, PHP, Go) share the same API shape.",
        inputSchema: {
          type: "object",
          properties: {
            language: {
              type: "string",
              description: "Which SDK's docs to return. Defaults to 'node'.",
              enum: LANGUAGE_NAMES,
            },
          },
          required: []
        }
      },
      {
        name: "get_sdk_types",
        description: "Returns the TouchQue SDK's type/class reference for the given language (Config, Step/StepState, StartOptions, CompleteExpectations, resource response types). Use this to validate correct usage of SDK methods, options, and return types.",
        inputSchema: {
          type: "object",
          properties: {
            language: {
              type: "string",
              description: "Which SDK's types to return. Defaults to 'node'.",
              enum: LANGUAGE_NAMES,
            },
          },
          required: []
        }
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
        description: "Performs a static analysis checklist on a code snippet to verify it follows the current step-up model and TouchQue security best practices, for whichever SDK language the code is in. Returns a structured report of passed/failed checks.",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The code snippet to validate (route handler, middleware, or service file)"
            },
            language: {
              type: "string",
              description: "Which SDK the code uses. Defaults to 'node'. If omitted and framework makes it obvious (e.g. 'flask' implies python), that's used instead.",
              enum: LANGUAGE_NAMES,
            },
            framework: {
              type: "string",
              description: "The web framework being used — express/fastify/koa/nextjs/nestjs (Node), flask/django/fastapi (Python), laravel (PHP), net-http (Go), or 'other'.",
              enum: Array.from(new Set(Object.values(LANGUAGES).flatMap((l) => l.frameworks)))
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
      const language = resolveLanguage(args?.language);
      const content = await readDocsFile(`${language}/sdk-documentation.md`, { allowRemote: true });
      return { content: [{ type: "text", text: content }] };
    }

    if (name === "get_sdk_types") {
      const language = resolveLanguage(args?.language);
      const content = await readDocsFile(`${language}/${LANGUAGES[language].typesFile}`, { allowRemote: true });
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
      const language = resolveLanguage(args.language || FRAMEWORK_LANGUAGE[framework]);
      const patterns = VALIDATION_PATTERNS[language];
      const checks = [];

      // Security & correctness checks, against the current step-up API —
      // requireTouchQue/withTouchQue/touchqueRouter (Node), @require_touchque
      // (Python), ->middleware('touchque:...') (PHP), touchque.Require (Go)
      // — never the old per-language synchronous .login.verify() model.
      const hasImport = patterns.import.test(code);
      checks.push({ id: "import", label: `${LANGUAGES[language].package} SDK is imported`, pass: hasImport });

      const hasStepUpGuard = patterns.stepUpGuard.test(code);
      const hasLegacyGuard = patterns.legacyGuard && patterns.legacyGuard.test(code);
      checks.push({
        id: "protection",
        label: hasLegacyGuard && !hasStepUpGuard
          ? `Route protection applied (found an OLD middleware pattern — migrate to ${patterns.guardName})`
          : `Route protection applied (${patterns.guardName})`,
        pass: hasStepUpGuard,
      });

      const hasSynchronousVerify = patterns.syncVerify.test(code);
      checks.push({
        id: "no_synchronous_verify",
        label: "Not using the old synchronous login.verify() inside a route handler (it can't show a matching number/QR before approval — use the step-up guard instead)",
        pass: !hasSynchronousVerify,
      });

      const hasHardcodedSecret = patterns.hardcodedSecret.test(code);
      checks.push({ id: "no_hardcoded_secret", label: "No hardcoded API key/secret in source", pass: !hasHardcodedSecret });

      const hasEnvVar = patterns.envVar.test(code);
      checks.push({ id: "env_vars", label: "Environment variables used for secrets", pass: hasEnvVar });

      const hasErrorHandling = patterns.errorHandling.test(code) || hasStepUpGuard;
      checks.push({
        id: "error_handling",
        label: hasStepUpGuard
          ? `Error handling (${patterns.guardName}'s own 202/403/408/423/429 responses cover the step-up flow)`
          : "Error handling present",
        pass: hasErrorHandling,
      });

      const passed = checks.filter(c => c.pass).length;
      const total = checks.length;
      const score = Math.round((passed / total) * 100);

      const report = checks.map(c =>
        `${c.pass ? "✅" : "❌"} ${c.label}`
      ).join("\n");

      // Advisories are not scored: they point at things that are only wrong in some setups.
      const advisories = [];
      if (patterns.offlineChallenge.test(code) && !patterns.offlineLinked.test(code)) {
        advisories.push(
          "⚠️ This code issues an offline QR but never links it to a push (no requestId). If the QR is the fallback for a push the user already started, pass that push's requestId: then a REJECT on the phone kills the QR and no code can finish that sign-in, and the number-matching number comes back as challengeCode (print it under the QR). Ignore this only for a standalone offline flow (kiosk, no push)."
        );
      }
      const advisoryText = advisories.length ? `\n\n${advisories.join("\n")}` : "";

      return {
        content: [{
          type: "text",
          text: `TouchQue Integration Validation Report\nLanguage: ${LANGUAGES[language].label}\nFramework: ${framework}\nScore: ${score}% (${passed}/${total} checks passed)\n\n${report}${score < 100 ? "\n\n⚠️ Fix the failing checks before deploying to production." : "\n\n✅ All checks passed. Integration looks correct."}${advisoryText}`
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
  → Ask the user which BACKEND LANGUAGE this is (Node / Python / PHP / Go)
    — do not assume Node. All 4 have the exact same step-up model, just
    with different guard names (requireTouchQue / @require_touchque /
    ->middleware('touchque:...') / touchque.Require). Once you know the
    language, call get_touchque_docs({ language }) and
    get_sdk_types({ language }) for THAT language — the JS example below is
    a reference for the shape of the contract, not something to hand-
    translate into another language without checking the real signature.
  → Also ask: framework (Express/Fastify/NestJS/Next.js for Node; Flask/
    Django/FastAPI for Python; Laravel for PHP; net/http for Go), and the
    file(s) where authentication currently lives.
  → Do NOT write any code yet.

STEP 2 — DEPENDENCY CHECK
  → Ask to see the dependency manifest (package.json / requirements.txt or
    pyproject.toml / composer.json / go.mod). Confirm the TouchQue SDK is
    listed (@touchque/node, touchque-authenticator, touchque-authenticator/
    php-sdk, or github.com/Touchque/touchque-go).
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

  → Frontend steps to render: \`waiting\` (show \`step.number\` when present — the number the user must tap on the phone), \`enroll\` (QR), \`passkey_required\`, and \`offline\` (the "no internet on the phone" fallback: show \`step.offline.qrDataUrl\` and, when present, \`step.offline.challengeCode\` UNDER the QR as the number to tap on the phone, then \`controls.submitCode(code)\`). While the QR is on screen \`touchqueFetch\` keeps checking the push: a REJECT on the phone arrives as a final \`rejected\` step (\`reason: 'request_rejected'\`) — the QR is dead, so reset the form and let the user start over; an approval finishes the action without typing a code. Do NOT add your own offline routes next to the guard.
  → Until approved, this answers 202 { touchque: step, token }. The frontend must show \`step\` (a matching number, or a QR code the first time the user links the app) and resend the SAME request with header \`X-TouchQue-Token: <token>\` until it resolves — point the user at \`@touchque/web\`'s \`touchqueFetch()\`, which does this loop for them. Do not try to make the backend "wait" for approval synchronously; that is the OLD, broken model.

  → IF THE BACKEND IS PYTHON/PHP/GO, NOT NODE: the JS above shows the shape
    of the contract (202/token/step/exactly-once), not the syntax. Use the
    real guard for that language instead — @require_touchque('SEND_MONEY',
    details=...) (Python), ->middleware('touchque:SEND_MONEY') (Laravel),
    or touchque.Require(tq, "SEND_MONEY", handler, opts) (Go) — and verify
    the exact option names against get_sdk_types({ language }) rather than
    guessing a translation of the JS option names.

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
    externalUsername: req.session.user.email,   // NOT \`user\` — this call takes externalUsername
    type: 'WITHDRAW',                 // your action type
    details: { Amount: '1,250.00 USD', Recipient: 'Jane Doe' }, // required for critical actions
    clientIp: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.body.requestId,    // ONLY when this QR is the fallback for a push already started — see below
  });
  // ch: { challengeId, qr (text), qrDataUrl (data:image/png;base64,...), expiresInSeconds, totpAvailable,
  //       challengeCode? (number matching: print it UNDER the QR) }
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
   \`tq.offline.verifyTotp({ externalUsername, code, type, clientIp, requestId })\`.

═══════════════════════════════════════════════════
WHEN THE QR FOLLOWS A PUSH (the usual "Verify offline" button)
═══════════════════════════════════════════════════
If the user already started a push (requireTouchQue / tq.start / login.request)
and then taps "Verify offline", pass THAT push's \`requestId\` to
\`offline.challenge()\` and to \`offline.verifyTotp()\`. It links the two into ONE
sign-in:
  • If the user REJECTS the push on the phone, the QR dies: no new QR is issued
    (409 \`request_rejected\`), a code for a QR already on screen is refused
    (\`reason: 'request_rejected'\`), and so is the time-based code. Treat
    \`request_rejected\` as a FINAL "no" — reset your form and start over;
    never offer another factor for that attempt.
  • While the QR is on screen KEEP CHECKING the push (tq.check(requestId), or
    keep re-sending the guarded request). A reject must end the attempt at
    once, and an approval finishes it without typing a code. \`requireTouchQue\`,
    \`touchqueRouter\` and the web SDK's \`touchqueFetch\` already do all of this
    — if the project uses them, do NOT hand-write the offline routes.
  • An EXPIRED push does not block offline mode — that is what it is for.

NUMBER MATCHING ON THE QR
  If the push asked for number matching (or you pass \`requireNumberMatch:
  true\`), \`challenge()\` returns \`challengeCode\`. PRINT IT UNDER THE QR
  (e.g. "On your phone, tap this number: 47"). After scanning, the phone shows
  three numbers — this one and two decoys — and the user taps the match. The
  phone is never told which one is right: a wrong tap produces a code that
  fails \`verify()\`, so treat it like any wrong code (\`invalid_code\`).

Other languages: Python \`tq.offline.challenge(external_username, type, request_id=…)\`
and \`verify_totp(…, request_id=…)\`; PHP \`$tq->offline->challenge($user, $type, $details,
$ip, $ua, $ttl, true, $requestId)\` and \`verifyTotp(…, $requestId)\`; Go
\`touchque.OfflineChallengeOptions{ExternalUsername, Type, RequestID}\` and
\`VerifyTotpFor(…, requestID)\`. Call get_touchque_docs / get_sdk_types with the
language for the exact signatures.

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
✗ Do not build a second, separate offline path next to a push without
  \`requestId\` — it would let a REJECTED sign-in be finished with a QR.
✗ Do not keep showing the QR after the push was rejected; the QR is dead.
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
  9. Offline fallback (if the app offers an offline QR/code: is it LINKED to the push via requestId so a phone-side REJECT kills it, does the page stop showing the QR and reset on request_rejected, and is challengeCode printed under the QR when number matching applies? An offline path that can finish a REJECTED sign-in is a HIGH finding.)

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

5b. OFFLINE QR / CODE REFUSED WITH \`request_rejected\` (409 on challenge, 410 on verify)
   → Not a bug: the user rejected the push on the phone, and a rejected sign-in cannot be finished with an offline QR or time-based code. The page must reset and start a NEW sign-in.
   → If the QR is refused right after a reject and the user expected it to work, that is the security feature working.
   → If offline works AFTER a reject in their app, they are not passing \`requestId\` (or use hand-written routes instead of the guard) — see configure_offline_sign.

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
