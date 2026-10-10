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

// node
const nodeRouter = read("touchque-node", "src", "router.ts");
write("node", "sdk-documentation.md", read("touchque-node", "README.md"));
write("node", "types.ts", [
  "// TouchQue Node.js SDK — bundled type reference for AI assistants.",
  "// Concatenation of touchque-node/src/{types.ts,steps.ts,approvalProof.ts,resources/Login.ts}",
  "// plus the public part of src/router.ts (touchqueRouter), from the SDK source.",
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
].join("\n"));

// python
const pyRelay = read("touchque-python", "touchque", "relay.py");
write("python", "sdk-documentation.md", read("touchque-python", "README.md"));
write("python", "types.py", [
  "# TouchQue Python SDK — bundled type/API reference for AI assistants.",
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
  sep("#", "From touchque/client.py — the TouchQue client class"),
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
  sep("#", "From touchque/contrib/fastapi.py — RequireTouchQue + touchque_relay_router"),
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
  "// TouchQue PHP SDK — bundled type/API reference for AI assistants.",
  "// Concatenation of touchque-php/src/{Config.php,TouchQue.php,Steps.php,ApprovalProof.php,Resources/Login.php,",
  "// Resources/Offline.php,Relay/RelayResponse.php,Relay/RateLimitStore.php,Laravel/TouchQueMiddleware.php,",
  "// Laravel/TouchQueRelay.php} plus the public part of src/Relay/RelayHandler.php.",
  "// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.",
  "",
  stripPhpOpen(read("touchque-php", "src", "Config.php")).trimEnd(),
  "",
  sep("//", "From src/TouchQue.php — the TouchQue client class"),
  stripPhpOpen(read("touchque-php", "src", "TouchQue.php")).trimEnd(),
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
  sep("//", "From src/Laravel/TouchQueMiddleware.php — ->middleware('touchque:ACTION')"),
  stripPhpOpen(read("touchque-php", "src", "Laravel", "TouchQueMiddleware.php")).trimEnd(),
  "",
  sep("//", "From src/Laravel/TouchQueRelay.php — TouchQueRelay::routes($router, 'touchque')"),
  stripPhpOpen(read("touchque-php", "src", "Laravel", "TouchQueRelay.php")).trimEnd(),
].join("\n"));

// go
const goRelay = read("touchque-go", "touchque", "relay.go");
write("go", "sdk-documentation.md", read("touchque-go", "README.md"));
write("go", "types.go", [
  "// TouchQue Go SDK — bundled type/API reference for AI assistants.",
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
