#!/usr/bin/env node
// Regenerates bundled/<lang>/ from the SDK sources so the docs and types an AI assistant reads are exactly what
// the released SDKs ship. Run it whenever an SDK's public API or README changes:
//
//   node scripts/sync-bundled.js [path/to/sdks]      (default: ../sdks, the monorepo layout)
//
// Each bundle is a verbatim concatenation of the listed source files (see README "Local development").

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

// node
write("node", "sdk-documentation.md", read("touchque-node", "README.md"));
write("node", "types.ts", [
  "// TouchQue Node.js SDK — bundled type reference for AI assistants.",
  "// Concatenation of touchque-node/src/types.ts + touchque-node/src/steps.ts",
  "// from the SDK source. Regenerate with `node scripts/sync-bundled.js` whenever",
  "// the SDK's public API changes (see touchque-mcp-server/README.md).",
  "",
  read("touchque-node", "src", "types.ts").trimEnd(),
  "",
  sep("//", "From src/steps.ts — the headless step-up flow (start/check/complete)"),
  read("touchque-node", "src", "steps.ts").trimEnd(),
].join("\n"));

// python
write("python", "sdk-documentation.md", read("touchque-python", "README.md"));
write("python", "types.py", [
  "# TouchQue Python SDK — bundled type/API reference for AI assistants.",
  "# Concatenation of touchque-python/touchque/{config.py,client.py,steps.py,resources/offline.py}.",
  "# Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.",
  "",
  read("touchque-python", "touchque", "config.py").trimEnd(),
  "",
  sep("#", "From touchque/client.py — the TouchQue client class"),
  read("touchque-python", "touchque", "client.py").trimEnd(),
  "",
  sep("#", "From touchque/steps.py — the headless step-up flow"),
  read("touchque-python", "touchque", "steps.py").trimEnd(),
  "",
  sep("#", "From touchque/resources/offline.py — Offline Sign (QR + code)"),
  read("touchque-python", "touchque", "resources", "offline.py").trimEnd(),
].join("\n"));

// php
write("php", "sdk-documentation.md", read("touchque-php", "README.md"));
write("php", "types.php", [
  "<?php",
  "// TouchQue PHP SDK — bundled type/API reference for AI assistants.",
  "// Concatenation of touchque-php/src/{Config.php,TouchQue.php,Steps.php,Resources/Offline.php}.",
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
  sep("//", "From src/Resources/Offline.php — Offline Sign (QR + code)"),
  stripPhpOpen(read("touchque-php", "src", "Resources", "Offline.php")).trimEnd(),
].join("\n"));

// go
write("go", "sdk-documentation.md", read("touchque-go", "README.md"));
write("go", "types.go", [
  "// TouchQue Go SDK — bundled type/API reference for AI assistants.",
  "// Concatenation of touchque-go/touchque/{config.go,types.go,client.go,steps.go,offline.go}.",
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
].join("\n"));
