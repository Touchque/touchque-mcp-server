#!/usr/bin/env node
// Copies Touchque's feature catalog (touchque-sso-backend/shared/features.json, the one the SSO and the
// dashboard read) to bundled/features.json, which touchque_features and the feature checks read.
//
//   node scripts/sync-features.js [path/to/features.json]   (default: ../touchque-sso-backend/shared/features.json)

const fs = require("fs");
const path = require("path");

const from = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "touchque-sso-backend", "shared", "features.json"));
const to = path.join(__dirname, "..", "bundled", "features.json");
const catalog = JSON.parse(fs.readFileSync(from, "utf8"));
if (!Array.isArray(catalog.features) || !catalog.features.length) throw new Error(`${from} has no features`);
fs.writeFileSync(to, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`bundled/features.json  ${catalog.features.length} features (catalog v${catalog.version})`);
