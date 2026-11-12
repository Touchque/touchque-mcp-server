#!/usr/bin/env node
// Regenerates bundled/<lang>/ from the SDK sources so the docs and types an AI assistant reads are exactly what
// the released SDKs ship. Run it whenever an SDK's public API or README changes:
//
//   node scripts/sync-bundled.js [path/to/sdks]      (default: ../sdks, the monorepo layout)
//
// Each bundle is a concatenation of the listed source files (see README "Local development"). Small files go in
// verbatim. The relay routers are large and mostly private route handlers, so only their public part (module docs,
// options type, constructor/entry point) is bundled — see excerpt() below. That keeps every get_sdk_types answer
// well inside the tool-output limits of MCP clients. The script fails loudly when a file or a cut marker is
// missing, so an SDK refactor can never silently produce a stale or truncated bundle.

const fs = require("fs");
const path = require("path");

const SDKS = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "sdks"));
const OUT = path.join(__dirname, "..", "bundled");

const read = (...p) => {
  const file = path.join(SDKS, ...p);
  if (!fs.existsSync(file)) throw new Error(`missing SDK source: ${file}`);
  return fs.readFileSync(file, "utf8");
};
const sep = (c, label) => {
  const line = `${c} ${"─".repeat(61)}`;
  return `${line}\n${c} ${label}\n${line}\n`;
};
const write = (lang, name, text) => {
  fs.mkdirSync(path.join(OUT, lang), { recursive: true });
  fs.writeFileSync(path.join(OUT, lang, name), text.endsWith("\n") ? text : `${text}\n`);
  console.log(`bundled/${lang}/${name}  ${text.split("\n").length} lines`);
};
const stripPhpOpen = (s) => s.replace(/^<\?php\r?\n/, "");

// Returns the part of `text` from the line matching `from` (or the start, when null) up to, not including, the
// line matching `to`. Both are line-anchored regexes; a missing marker throws instead of bundling the wrong slice.
const excerpt = (label, text, from, to) => {
  const start = from ? text.search(from) : 0;
  if (start < 0) throw new Error(`${label}: start marker ${from} not found — update scripts/sync-bundled.js`);
  const end = text.slice(start).search(to);
  if (end < 0) throw new Error(`${label}: end marker ${to} not found — update scripts/sync-bundled.js`);
  return text.slice(start, start + end).trimEnd();
};
// Turns `export function f(...): T {` lines into bodiless declarations, for excerpts that cut the body away.
const signature = (label, text, re) => {
  const m = text.match(re);
  if (!m) throw new Error(`${label}: signature ${re} not found — update scripts/sync-bundled.js`);
  return `${m[0].replace(/\s*\{\s*$/, "")};  // implementation omitted`;
};

// A function's declaration without its body, also when its parameters span several lines: `export function f(\n a,\n): T {`
// becomes `export function f(a): T;`. Doc comments right above are kept.
const fnSignature = (label, text, name) => {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => new RegExp(`^export\\s+(?:async\\s+)?function\\s+${name}\\b`).test(l));
  if (i < 0) throw new Error(`${label}: function ${name} not found — update scripts/sync-bundled.js`);
  let start = i;
  while (start > 0 && /^\s*(\/\*\*|\*|\*\/|\/\/)/.test(lines[start - 1])) start -= 1;
  let end = i;
  while (end < lines.length && !/\{\s*$/.test(lines[end])) end += 1;
  if (end >= lines.length) throw new Error(`${label}: body of ${name} not found — update scripts/sync-bundled.js`);
  const decl = lines.slice(i, end + 1).map((l) => l.trim()).join(" ").replace(/\(\s+/g, "(").replace(/,\s*\)/g, ")").replace(/\s*\{\s*$/, "");
  return [...lines.slice(start, i), `${decl};  // implementation omitted`].join("\n");
};
// A class with its public fields and method signatures only (private members and bodies cut away).
const classPublic = (label, text, name) => {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => new RegExp(`^export\\s+class\\s+${name}\\b.*\\{\\s*$`).test(l));
  if (i < 0) throw new Error(`${label}: class ${name} not found — update scripts/sync-bundled.js`);
  const end = lines.findIndex((l, j) => j > i && /^\}/.test(l));
  if (end < 0) throw new Error(`${label}: end of class ${name} not found — update scripts/sync-bundled.js`);
  const out = [lines[i]];
  let doc = [];
  for (const l of lines.slice(i + 1, end)) {
    if (/^ {2}(\/\*\*|\/\/)/.test(l) || (doc.length && /^ {3}\*/.test(l))) { doc.push(l); continue; }
    const member = /^ {2}\S/.test(l);
    if (member && /^ {2}(private|protected)\b/.test(l)) { doc = []; continue; }
    if (member && /^ {2}(public\s+)?(readonly\s+)?\w+\??\s*:[^(]*;\s*$/.test(l)) { out.push(...doc, l); doc = []; continue; }
    if (member && /^ {2}(?:public\s+)?(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(?:constructor|\w+)\s*\(/.test(l)) {
      if (!/\{\s*$/.test(l)) throw new Error(`${label}: ${name} member spans lines: ${l.trim()} — update scripts/sync-bundled.js`);
      out.push(...doc, l.replace(/\s*\{\s*$/, ";"));
    }
    if (member) doc = [];
  }
  return [...out, "}"].join("\n");
};

// node
const nodeRouter = read("touchque-node", "src", "router.ts");
const nodeGuard = read("touchque-node", "src", "guard.ts");
const nodeExpress = read("touchque-node", "src", "middleware", "express.ts");
const nodeHosted = read("touchque-node", "src", "hostedLogin.ts");
write("node", "sdk-documentation.md", read("touchque-node", "README.md"));
write("node", "types.ts", [
  "// Touchque Node.js SDK — bundled type reference for AI assistants.",
  "// Concatenation of touchque-node/src/{types.ts,steps.ts,approvalProof.ts,resources/Login.ts}",
  "// plus the public parts of src/guard.ts (runGuard), src/middleware/express.ts (requireTouchque),",
  "// src/hostedLogin.ts (HostedLogin, Touchque Login) and src/router.ts (touchqueRouter), from the SDK source.",
  "// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API",
  "// changes (see touchque-mcp-server/README.md).",
  "",
  read("touchque-node", "src", "types.ts").trimEnd(),
  "",
  sep("//", "From src/steps.ts — the headless step-up flow (start/check/complete)"),
  read("touchque-node", "src", "steps.ts").trimEnd(),
  "",
  sep("//", "From src/approvalProof.ts — verifyApprovalProof (device proof, pin the key)"),
  read("touchque-node", "src", "approvalProof.ts").trimEnd(),
  "",
  sep("//", "From src/resources/Login.ts — tq.login (request/status/verify/reportFraud)"),
  read("touchque-node", "src", "resources", "Login.ts").trimEnd(),
  "",
  sep("//", "From src/router.ts — touchqueRouter, the relay routes @touchque/web calls (public part)"),
  excerpt("node router.ts", nodeRouter, null, /^\/\*\* Same status-code mapping/m),
  "",
  signature("node router.ts", nodeRouter, /^export function touchqueRouter\([^\n]*\{$/m),
  "",
  sep("//", "From src/guard.ts — runGuard, the framework-agnostic guard (run it inside a handler, after its own checks)"),
  excerpt("node guard.ts", nodeGuard, /^export const GUARD_HEADERS/m, /^export async function runGuard\(/m),
  "",
  ["runGuard", "silentInputFromHeaders", "isStatusPoll", "guardInputFromHeaders"].map((f) => fnSignature("node guard.ts", nodeGuard, f)).join("\n\n"),
  "",
  sep("//", "From src/middleware/express.ts — requireTouchque and its options (public part)"),
  excerpt("node express.ts", nodeExpress, /^export interface TouchqueMiddlewareOptions/m, /^export function requireTouchque\(\s*$/m),
  "",
  sep("//", "From src/hostedLogin.ts — HostedLogin, Touchque Login (OpenID Connect) for the app's customers (public part)"),
  excerpt("node hostedLogin.ts", nodeHosted, /^export class HostedLoginError/m, /^export class HostedLogin \{/m),
  "",
  classPublic("node hostedLogin.ts", nodeHosted, "HostedLogin"),
].join("\n"));

// python
const pyRelay = read("touchque-python", "touchque", "relay.py");
write("python", "sdk-documentation.md", read("touchque-python", "README.md"));
write("python", "types.py", [
  "# Touchque Python SDK — bundled type/API reference for AI assistants.",
  "# Concatenation of touchque-python/touchque/{__init__.py,config.py,client.py,steps.py,approval_proof.py,",
  "# resources/login.py,resources/offline.py,contrib/flask.py,contrib/fastapi.py,contrib/django.py}",
  "# plus the public part of touchque/relay.py (RelayHandler).",
  "# Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.",
  "",
  sep("#", "From touchque/__init__.py — everything importable from `touchque`"),
  read("touchque-python", "touchque", "__init__.py").trimEnd(),
  "",
  sep("#", "From touchque/config.py"),
  read("touchque-python", "touchque", "config.py").trimEnd(),
  "",
  sep("#", "From touchque/client.py — the Touchque client class"),
  read("touchque-python", "touchque", "client.py").trimEnd(),
  "",
  sep("#", "From touchque/steps.py — the headless step-up flow"),
  read("touchque-python", "touchque", "steps.py").trimEnd(),
  "",
  sep("#", 'From touchque/approval_proof.py — verify_approval_proof (pip install "touchque-authenticator[proof]")'),
  read("touchque-python", "touchque", "approval_proof.py").trimEnd(),
  "",
  sep("#", "From touchque/resources/login.py — tq.login (request/status/verify/report_fraud)"),
  read("touchque-python", "touchque", "resources", "login.py").trimEnd(),
  "",
  sep("#", "From touchque/resources/offline.py — Offline Sign (QR + code)"),
  read("touchque-python", "touchque", "resources", "offline.py").trimEnd(),
  "",
  sep("#", "From touchque/relay.py — RelayHandler, the relay routes @touchque/web calls (public part)"),
  excerpt("python relay.py", pyRelay, null, /^class _Done\b/m),
  "",
  excerpt("python relay.py", pyRelay, /^class RelayHandler\b/m, /^def _norm_path\b/m),
  "",
  "# ... private route handlers omitted",
  "",
  sep("#", "From touchque/contrib/flask.py — @require_touchque + touchque_relay_blueprint"),
  read("touchque-python", "touchque", "contrib", "flask.py").trimEnd(),
  "",
  sep("#", "From touchque/contrib/fastapi.py — RequireTouchque + touchque_relay_router"),
  read("touchque-python", "touchque", "contrib", "fastapi.py").trimEnd(),
  "",
  sep("#", "From touchque/contrib/django.py — @require_touchque + touchque_relay_view / touchque_relay_urls"),
  read("touchque-python", "touchque", "contrib", "django.py").trimEnd(),
].join("\n"));

// php
const phpRelay = stripPhpOpen(read("touchque-php", "src", "Relay", "RelayHandler.php"));
write("php", "sdk-documentation.md", read("touchque-php", "README.md"));
write("php", "types.php", [
  "<?php",
  "// Touchque PHP SDK — bundled type/API reference for AI assistants.",
  "// Concatenation of touchque-php/src/{Config.php,Touchque.php,Steps.php,ApprovalProof.php,Resources/Login.php,",
  "// Resources/Offline.php,Relay/RelayResponse.php,Relay/RateLimitStore.php,Laravel/TouchqueMiddleware.php,",
  "// Laravel/TouchqueRelay.php} plus the public part of src/Relay/RelayHandler.php.",
  "// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.",
  "",
  stripPhpOpen(read("touchque-php", "src", "Config.php")).trimEnd(),
  "",
  sep("//", "From src/Touchque.php — the Touchque client class"),
  stripPhpOpen(read("touchque-php", "src", "Touchque.php")).trimEnd(),
  "",
  sep("//", "From src/Steps.php — the headless step-up flow"),
  stripPhpOpen(read("touchque-php", "src", "Steps.php")).trimEnd(),
  "",
  sep("//", "From src/ApprovalProof.php — ApprovalProof::verify (device proof, pin the key)"),
  stripPhpOpen(read("touchque-php", "src", "ApprovalProof.php")).trimEnd(),
  "",
  sep("//", "From src/Resources/Login.php — $tq->login (request/status/verify/reportFraud)"),
  stripPhpOpen(read("touchque-php", "src", "Resources", "Login.php")).trimEnd(),
  "",
  sep("//", "From src/Resources/Offline.php — Offline Sign (QR + code)"),
  stripPhpOpen(read("touchque-php", "src", "Resources", "Offline.php")).trimEnd(),
  "",
  sep("//", "From src/Relay/RelayHandler.php — the relay routes @touchque/web calls (public part)"),
  excerpt("php RelayHandler.php", phpRelay, null, /^ {4}\/\/ ── Classic push 2FA: enrollment/m),
  "",
  "    // ... private route handlers omitted",
  "}",
  "",
  sep("//", "From src/Relay/RelayResponse.php"),
  stripPhpOpen(read("touchque-php", "src", "Relay", "RelayResponse.php")).trimEnd(),
  "",
  sep("//", "From src/Relay/RateLimitStore.php — implement over APCu/Redis under PHP-FPM"),
  stripPhpOpen(read("touchque-php", "src", "Relay", "RateLimitStore.php")).trimEnd(),
  "",
  sep("//", "From src/Laravel/TouchqueMiddleware.php — ->middleware('touchque:ACTION')"),
  stripPhpOpen(read("touchque-php", "src", "Laravel", "TouchqueMiddleware.php")).trimEnd(),
  "",
  sep("//", "From src/Laravel/TouchqueRelay.php — TouchqueRelay::routes($router, 'touchque')"),
  stripPhpOpen(read("touchque-php", "src", "Laravel", "TouchqueRelay.php")).trimEnd(),
].join("\n"));

// go
const goRelay = read("touchque-go", "touchque", "relay.go");
write("go", "sdk-documentation.md", read("touchque-go", "README.md"));
write("go", "types.go", [
  "// Touchque Go SDK — bundled type/API reference for AI assistants.",
  "// Concatenation of touchque-go/touchque/{config.go,types.go,client.go,steps.go,offline.go,login.go,",
  "// http_middleware.go,approval_proof.go} plus the public part of relay.go (NewRelayHandler).",
  "// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.",
  "",
  read("touchque-go", "touchque", "config.go").trimEnd(),
  "",
  read("touchque-go", "touchque", "types.go").trimEnd(),
  "",
  sep("//", "From touchque/client.go"),
  read("touchque-go", "touchque", "client.go").trimEnd(),
  "",
  sep("//", "From touchque/steps.go — the headless step-up flow"),
  read("touchque-go", "touchque", "steps.go").trimEnd(),
  "",
  sep("//", "From touchque/offline.go — Offline Sign (QR + code)"),
  read("touchque-go", "touchque", "offline.go").trimEnd(),
  "",
  sep("//", "From touchque/login.go — tq.Login (Request/Status/Verify/ReportFraud)"),
  read("touchque-go", "touchque", "login.go").trimEnd(),
  "",
  sep("//", "From touchque/http_middleware.go — touchque.Require (RequireOptions.User is REQUIRED)"),
  read("touchque-go", "touchque", "http_middleware.go").trimEnd(),
  "",
  sep("//", "From touchque/approval_proof.go — VerifyApprovalProof (device proof, pin the key)"),
  read("touchque-go", "touchque", "approval_proof.go").trimEnd(),
  "",
  sep("//", "From touchque/relay.go — NewRelayHandler, the relay routes @touchque/web calls (public part)"),
  excerpt("go relay.go", goRelay, null, /^type relayHandler struct/m),
  "",
  "// ... private route handlers omitted",
].join("\n"));

// dotnet
const csRelay = read("touchque-dotnet", "src", "Touchque", "Relay", "RelayHandler.cs");
write("dotnet", "sdk-documentation.md", read("touchque-dotnet", "README.md"));
write("dotnet", "types.cs", [
  "// Touchque .NET SDK — bundled type/API reference for AI assistants.",
  "// Concatenation of touchque-dotnet/src/Touchque/{TouchqueOptions.cs,TouchqueClient.cs,Flow/Steps.cs,Flow/Guard.cs,",
  "// Crypto/ApprovalProof.cs,Resources/Login.cs} plus the public part of Relay/RelayHandler.cs, and",
  "// src/Touchque.AspNetCore/{ServiceCollectionExtensions.cs,RequireTouchque.cs,TouchqueRelayEndpoints.cs}.",
  "// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.",
  "",
  read("touchque-dotnet", "src", "Touchque", "TouchqueOptions.cs").trimEnd(),
  "",
  sep("//", "From TouchqueClient.cs — the client (StartAsync/CheckAsync/CompleteAsync and the resources)"),
  read("touchque-dotnet", "src", "Touchque", "TouchqueClient.cs").trimEnd(),
  "",
  sep("//", "From Flow/Steps.cs — the headless step-up flow and the Step record"),
  read("touchque-dotnet", "src", "Touchque", "Flow", "Steps.cs").trimEnd(),
  "",
  sep("//", "From Flow/Guard.cs — Guard.RunAsync, the two-phase contract for any framework"),
  read("touchque-dotnet", "src", "Touchque", "Flow", "Guard.cs").trimEnd(),
  "",
  sep("//", "From Crypto/ApprovalProof.cs — ApprovalProof.Verify (device proof, pin the key)"),
  read("touchque-dotnet", "src", "Touchque", "Crypto", "ApprovalProof.cs").trimEnd(),
  "",
  sep("//", "From Resources/Login.cs — tq.Login (RequestAsync/StatusAsync/VerifyAsync/ReportFraudAsync)"),
  read("touchque-dotnet", "src", "Touchque", "Resources", "Login.cs").trimEnd(),
  "",
  sep("//", "From Relay/RelayHandler.cs — the relay routes @touchque/web calls (public part)"),
  excerpt("dotnet RelayHandler.cs", csRelay, null, /^ {4}\/\/ ── push 2FA: enrollment/m),
  "",
  "    // ... private route handlers omitted",
  "}",
  "",
  sep("//", "From Touchque.AspNetCore/ServiceCollectionExtensions.cs — services.AddTouchque()"),
  read("touchque-dotnet", "src", "Touchque.AspNetCore", "ServiceCollectionExtensions.cs").trimEnd(),
  "",
  sep("//", "From Touchque.AspNetCore/RequireTouchque.cs — .RequireTouchque(\"ACTION\") / [RequireTouchque(\"ACTION\")]"),
  read("touchque-dotnet", "src", "Touchque.AspNetCore", "RequireTouchque.cs").trimEnd(),
  "",
  sep("//", "From Touchque.AspNetCore/TouchqueRelayEndpoints.cs — app.MapTouchqueRelay(\"/touchque\", options)"),
  read("touchque-dotnet", "src", "Touchque.AspNetCore", "TouchqueRelayEndpoints.cs").trimEnd(),
].join("\n"));

// ruby
const rbRelay = read("touchque-ruby", "lib", "touchque", "relay.rb");
write("ruby", "sdk-documentation.md", read("touchque-ruby", "README.md"));
write("ruby", "types.rb", [
  "# Touchque Ruby SDK — bundled type/API reference for AI assistants.",
  "# Concatenation of touchque-ruby/lib/touchque/{client.rb,errors.rb,flow.rb,approvals.rb,resources/login.rb,",
  "# rails/guard.rb,rack/relay.rb} plus the public part of relay.rb (RelayHandler).",
  "# Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.",
  "",
  read("touchque-ruby", "lib", "touchque", "client.rb").trimEnd(),
  "",
  sep("#", "From lib/touchque/errors.rb — the exceptions"),
  read("touchque-ruby", "lib", "touchque", "errors.rb").trimEnd(),
  "",
  sep("#", "From lib/touchque/flow.rb — the headless step-up flow and Touchque::Guard.run"),
  read("touchque-ruby", "lib", "touchque", "flow.rb").trimEnd(),
  "",
  sep("#", "From lib/touchque/approvals.rb — details digest, Touchque::ApprovalProof.verify (pin the key)"),
  read("touchque-ruby", "lib", "touchque", "approvals.rb").trimEnd(),
  "",
  sep("#", "From lib/touchque/resources/login.rb — tq.login (request/status/verify/report_fraud) and tq.offline"),
  read("touchque-ruby", "lib", "touchque", "resources", "login.rb").trimEnd(),
  "",
  sep("#", "From lib/touchque/rails/guard.rb — require_touchque \"ACTION\" in a Rails controller"),
  read("touchque-ruby", "lib", "touchque", "rails", "guard.rb").trimEnd(),
  "",
  sep("#", "From lib/touchque/relay.rb — the relay routes @touchque/web calls (public part)"),
  excerpt("ruby relay.rb", rbRelay, null, /^ {4}private$/m),
  "",
  "    # ... private route handlers omitted",
  "  end",
  "end",
  "",
  sep("#", "From lib/touchque/rack/relay.rb — mount Touchque::Rack::Relay.new(...) => \"/touchque\""),
  read("touchque-ruby", "lib", "touchque", "rack", "relay.rb").trimEnd(),
].join("\n"));

// java
const J = ["touchque-java", "touchque-java", "src", "main", "java", "com", "touchque"];
const S = ["touchque-java", "touchque-spring-boot-starter", "src", "main", "java", "com", "touchque", "spring"];
const javaGuard = read(...J, "flow", "Guard.java");
const javaRelay = read(...J, "relay", "RelayHandler.java");
const noImports = (s) => s.replace(/^package [^\n]*\n+/, "").replace(/^(import [^\n]*\n)+\n*/m, "");
write("java", "sdk-documentation.md", read("touchque-java", "README.md"));
write("java", "types.java", [
  "// Touchque Java SDK and Spring Boot starter — bundled type/API reference for AI assistants.",
  "// Concatenation of touchque-java/src/main/java/com/touchque/{TouchqueOptions,TouchqueClient,flow/Step,",
  "// flow/StartOptions,flow/CompleteExpectations,flow/Approval,crypto/ApprovalProof,resources/Login,",
  "// resources/LoginRequestOptions,relay/RelayOptions}.java, the public parts of flow/Guard.java and",
  "// relay/RelayHandler.java, and the starter's com/touchque/spring/{RequireTouchque,TouchqueGuardOptions,",
  "// TouchqueWebhookListener,TouchqueSpring}.java (package and import lines left out).",
  "// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.",
  "",
  sep("//", "package com.touchque — TouchqueOptions"),
  noImports(read(...J, "TouchqueOptions.java")).trimEnd(),
  "",
  sep("//", "package com.touchque — TouchqueClient (start/check/complete/protect and the resources)"),
  noImports(read(...J, "TouchqueClient.java")).trimEnd(),
  "",
  sep("//", "package com.touchque.flow — Step, StartOptions, CompleteExpectations, Approval"),
  noImports(read(...J, "flow", "Step.java")).trimEnd(),
  "",
  noImports(read(...J, "flow", "StartOptions.java")).trimEnd(),
  "",
  noImports(read(...J, "flow", "CompleteExpectations.java")).trimEnd(),
  "",
  noImports(read(...J, "flow", "Approval.java")).trimEnd(),
  "",
  sep("//", "package com.touchque.flow — Guard.run, the two-phase contract for any framework (public part)"),
  excerpt("java Guard.java", noImports(javaGuard), null, /^ {4}private static boolean bound/m),
  "",
  signature("java Guard.java", javaGuard, /^ {4}public static Result run\([^\n]*\{$/m),
  "    // ... private helpers omitted",
  "}",
  "",
  sep("//", "package com.touchque.crypto — ApprovalProof.verify (device proof, pin the key)"),
  noImports(read(...J, "crypto", "ApprovalProof.java")).trimEnd(),
  "",
  sep("//", "package com.touchque.resources — tq.login() (request/status/verify/reportFraud) and its options"),
  noImports(read(...J, "resources", "Login.java")).trimEnd(),
  "",
  noImports(read(...J, "resources", "LoginRequestOptions.java")).trimEnd(),
  "",
  sep("//", "package com.touchque.relay — RelayOptions and RelayHandler, the relay routes @touchque/web calls (public part)"),
  noImports(read(...J, "relay", "RelayOptions.java")).trimEnd(),
  "",
  excerpt("java RelayHandler.java", noImports(javaRelay), null, /^ {4}\/\/ ── push 2FA: enrollment/m),
  "",
  "    // ... private route handlers omitted",
  "}",
  "",
  sep("//", "package com.touchque.spring (touchque-spring-boot-starter) — @RequireTouchque and its options"),
  noImports(read(...S, "RequireTouchque.java")).trimEnd(),
  "",
  noImports(read(...S, "TouchqueGuardOptions.java")).trimEnd(),
  "",
  sep("//", "package com.touchque.spring — verified webhooks and request helpers"),
  noImports(read(...S, "TouchqueWebhookListener.java")).trimEnd(),
  "",
  noImports(read(...S, "TouchqueSpring.java")).trimEnd(),
].join("\n"));

// The browser SDKs (remote server: get_touchque_docs language "web" / "react", and the docs search).
write("web", "sdk-documentation.md", read("touchque-web", "README.md"));
write("react", "sdk-documentation.md", read("touchque-react", "README.md"));
