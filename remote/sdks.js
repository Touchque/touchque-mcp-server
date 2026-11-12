// The Touchque SDKs as a developer picks one: which are published, how to
// install them, and the parts of each SDK's own README (bundled/<lang>/, made
// by scripts/sync-bundled.js from the SDK sources) a feature needs. Code the
// AI writes follows those READMEs, never a guess.

const fs = require("fs");
const path = require("path");

const BUNDLED = path.join(__dirname, "..", "bundled");

// What is on the registries, 2026-11-11: 5.0.0 (sdks 14ccd7d; every name spelled Touchque; Java on Maven Central, PHP on Packagist, Ruby on RubyGems; .NET not on NuGet yet). The bundled
// READMEs and types are that release.
const SDKS = {
  node: { label: "Node.js", package: "@touchque/node", import: "const { Touchque, requireTouchque } = require('@touchque/node');", published: "5.0.0", install: "npm install @touchque/node", registry: "npm", manifests: ["package.json"] },
  php: {
    label: "PHP", package: "touchque-authenticator/php-sdk", import: "use Touchque\\Touchque;", published: "5.0.0",
    install: "composer require touchque-authenticator/php-sdk",
    registry: "Packagist", manifests: ["composer.json"],
  },
  go: { label: "Go", package: "github.com/Touchque/touchque-go/v5", import: "import \"github.com/Touchque/touchque-go/v5/touchque\"", published: "5.0.0", install: "go get github.com/Touchque/touchque-go/v5", registry: "Go modules", manifests: ["go.mod"] },
  python: { label: "Python", package: "touchque-authenticator", import: "from touchque import Touchque  # Flask/Django: from touchque.contrib.flask import require_touchque; FastAPI: RequireTouchque", published: "5.0.0", install: "pip install touchque-authenticator", extras: "pip install \"touchque-authenticator[flask]\" (or [django], [fastapi]) for a framework adapter", registry: "PyPI", manifests: ["requirements.txt", "pyproject.toml", "Pipfile", "setup.py"] },
  dotnet: { label: ".NET", package: "Touchque.AspNetCore", published: null, install: null, registry: "not listed on NuGet yet", manifests: [".csproj", ".sln", "Program.cs"] },
  ruby: { label: "Ruby", package: "touchque", import: "require \"touchque\"  # Rails: require_touchque \"ACTION\"", published: "5.0.0", install: "bundle add touchque (Gemfile: gem \"touchque\", \"~> 5.0\")", registry: "RubyGems", manifests: ["Gemfile"] },
  java: {
    label: "Java", package: "com.touchque:touchque-spring-boot-starter", import: "import com.touchque.TouchqueClient;  // Spring Boot: @RequireTouchque", published: "5.0.0",
    install: "Gradle: implementation(\"com.touchque:touchque-spring-boot-starter:5.0.0\") (without Spring: com.touchque:touchque-java:5.0.0); Maven: the same coordinates in a <dependency>",
    registry: "Maven Central", manifests: ["pom.xml", "build.gradle", "build.gradle.kts"],
  },
};

const FRONTEND = [
  { package: "@touchque/web", published: "2.0.0", install: "npm install @touchque/web", what: "Drives the step-up loop (the matching number, the first-time QR) and passkey ceremonies in the browser." },
  { package: "@touchque/react", published: "2.0.0", install: "npm install @touchque/react @touchque/web", what: "Hooks and components on top of @touchque/web." },
];

/** The language a project's manifest files point at, or null. */
function languageFromFiles(files = []) {
  const names = files.map((f) => path.basename(String(f)).toLowerCase());
  for (const [lang, sdk] of Object.entries(SDKS)) {
    if (sdk.manifests.some((m) => names.some((n) => (m.startsWith(".") ? n.endsWith(m) : n === m.toLowerCase())))) return lang;
  }
  return null;
}

// Which README sections a feature needs (headings matched case-insensitively).
const FEATURE_SECTIONS = {
  phone_approval: [/^install/, /^setup/, /^quick start/, /^action types/, /^framework adapters/, /^relay/],
  passkeys: [/^install/, /^setup/, /^passkeys/, /^relay/],
  touchque_login: [/^install/, /^setup/, /^touchque login/],
  webhooks: [/^setup/, /^webhooks/],
  offline: [/^offline/, /^passkeys, offline/],
  silent_sign_ins: [/^silent sign-ins/],
  ai_agents: [/^ai agents/],
};

function readme(language) {
  return fs.readFileSync(path.join(BUNDLED, language, "sdk-documentation.md"), "utf8");
}

/** The README split at its "## " headings: [{ title, text }]. */
function sections(text) {
  const out = [];
  let current = { title: "", lines: [] };
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    if (!fenced && /^## /.test(line)) {
      out.push(current);
      current = { title: line.slice(3).trim(), lines: [] };
    }
    current.lines.push(line);
  }
  out.push(current);
  return out.filter((s) => s.title).map((s) => ({ title: s.title, text: s.lines.join("\n").trim() }));
}

/** The README sections of a language a feature needs, as markdown (capped). */
function sectionsFor(language, feature, maxChars = 24000) {
  const wanted = FEATURE_SECTIONS[feature] || FEATURE_SECTIONS.phone_approval;
  const picked = sections(readme(language)).filter((s) => wanted.some((re) => re.test(s.title.toLowerCase())));
  let out = "";
  for (const s of picked) {
    if (out.length + s.text.length > maxChars) {
      out += `\n\n## ${s.title}\n(cut for length: call get_touchque_docs with language "${language}" for the whole README)`;
      continue;
    }
    out += `\n\n${s.text}`;
  }
  return out.trim();
}

module.exports = { SDKS, FRONTEND, FEATURE_SECTIONS, languageFromFiles, sectionsFor, sections, readme };
