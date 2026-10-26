#!/usr/bin/env node
// Builds dist/touchque-mcp-server-<version>.mcpb (an MCP Bundle for one-click
// install in Claude Desktop and other hosts): the server's files and only its
// runtime dependencies, packed by the official mcpb CLI. With MCPB_SIGN_CERT
// and MCPB_SIGN_KEY (PEM paths; MCPB_SIGN_INTERMEDIATE optional) the bundle is
// signed and the signature checked. Run: npm run pack:mcpb
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");
const { version } = require(path.join(root, "package.json"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.version !== version) throw new Error(`manifest.json says ${manifest.version}, package.json ${version}: keep them the same`);

const mcpb = path.join(root, "node_modules", "@anthropic-ai", "mcpb", "dist", "cli", "cli.js");
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const build = fs.mkdtempSync(path.join(os.tmpdir(), "touchque-mcpb-"));
try {
  for (const f of ["index.js", "agent.js", "manifest.json", "package.json", "package-lock.json", "README.md", "LICENSE"]) {
    if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(build, f));
  }
  fs.cpSync(path.join(root, "bundled"), path.join(build, "bundled"), { recursive: true });
  run("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], build);
  const out = path.join(root, "dist", `touchque-mcp-server-${version}.mcpb`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  run(process.execPath, [mcpb, "pack", build, out]);
  if (process.env.MCPB_SIGN_CERT && process.env.MCPB_SIGN_KEY) {
    run(process.execPath, [mcpb, "sign", out, "--cert", process.env.MCPB_SIGN_CERT, "--key", process.env.MCPB_SIGN_KEY,
      ...(process.env.MCPB_SIGN_INTERMEDIATE ? ["--intermediate", ...process.env.MCPB_SIGN_INTERMEDIATE.split(",")] : [])]);
    run(process.execPath, [mcpb, "verify", out]);
  } else {
    console.log("Not signed: set MCPB_SIGN_CERT and MCPB_SIGN_KEY to sign the bundle.");
  }
  console.log(out);
} finally {
  fs.rmSync(build, { recursive: true, force: true });
}
