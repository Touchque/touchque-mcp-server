// The Touchque SDKs as a developer picks one: which are published, how to
// install them, and the parts of each SDK's own README (bundled/<lang>/, made
// by scripts/sync-bundled.js from the SDK sources) a feature needs. Code the
// AI writes follows those READMEs, never a guess.

const fs = require("fs");
const path = require("path");

const BUNDLED = path.join(__dirname, "..", "bundled");

// What is on the registries, 2026-11-12: 5.1.0 for Node, Python, Go, Ruby, PHP and Java (sdks 8be2753), @touchque/web
// 2.1.0; .NET not on NuGet. The bundled READMEs and types are that release (sdks 8be2753).
// guard: the 5.1 guard (no throw without keys: 500 misconfigured; an option for the app's own error shape; one QR per
// enrollment). When PHP / Java 5.1 are published: set published + guard here and re-sync their bundles.
// guard: what the integration material says about the step-up guard, per SDK. v51: the 5.1 guard (its adapter never
// throws without keys and answers 500 misconfigured; an option for the app's own error shape; one QR per enrollment).
// adapter / errorBody: the adapter and its error-shape option; inHandler: the guard inside the handler (after the
// route's own checks), where the adapter's protections do not apply; tests: how the person's tests reach the guard.
// Checked against the SDK sources (sdks 8be2753 for 5.1, 14ccd7d for 5.0) on 2026-11-12.
const SDKS = {
  node: {
    label: "Node.js", package: "@touchque/node", import: "const { Touchque, requireTouchque } = require('@touchque/node');", published: "5.1.0", install: "npm install @touchque/node@^5.1.0", registry: "npm", manifests: ["package.json"],
    guard: {
      v51: true, adapter: "requireTouchque / withTouchque", errorBody: "errorBody",
      inHandler: "runGuard(tq, input) needs a real client: get it per request with getDefaultClient() in a try/catch (a TouchqueConfigError means the keys are missing or unusable: no TQ_API_KEY/TQ_API_SECRET, a key that does not start with tq_, or a plaintext non-localhost TQ_API_URL; answer 401 without a signed-in user, else 500 misconfigured, in the project's shape), never new Touchque() at module scope (it throws without keys, so the app would not start). errorBody is an adapter option only: with runGuard, send a 202 result.body unchanged ({ touchque, token }: the page needs the token); only for status 400 or more put result.body in the project's shape yourself, keeping its touchque in an object body (or setting X-Touchque-State and, when the step has a reason, X-Touchque-Reason). Send Cache-Control: no-store on every non-approved answer, and Retry-After from touchque.retryAfter on 423/429.",
      tests: "the package has no public fake: give the adapter client: new Touchque({ apiKey: 'tq_test', apiSecret: 'test', baseUrl: 'http://localhost:<port>' }) with a small local stub of the Touchque endpoints the test needs, or test the 500 misconfigured / 401 answers with TQ_API_KEY unset. getDefaultClient() keeps the first client it builds for the whole process",
    },
  },
  php: {
    label: "PHP", package: "touchque-authenticator/php-sdk", import: "use Touchque\\Touchque;", published: "5.1.0",
    install: "composer require \"touchque-authenticator/php-sdk:^5.1\"",
    registry: "Packagist", manifests: ["composer.json"],
    guard: {
      v51: true, adapter: "the Laravel middleware 'touchque:ACTION'", errorBody: "'errorBody' (bind new TouchqueMiddleware(null, ['errorBody' => fn (array $r) => ...]))",
      inHandler: "Guard::run($tq, ...) needs a Touchque client: build it per request in a try/catch (new Touchque() throws TouchqueConfigException when a key is missing) and on that exception use $result = $user ? Guard::misconfigured() : Guard::unauthenticated(). Send a 202 $result['body'] unchanged (it carries the token the page polls with); for status >= 400 send Guard::errorBody($result, $errorBody) for the project's shape (only for >= 400; it throws what your callable throws, and JsonException for a result it cannot encode: fall back to $result['body']), or $result['body'] as it is; always with Guard::headers($result).",
      tests: "the package has no fake: inject new Touchque(new Config('tq_test', 'test-secret', 'http://localhost:<port>')) (positional apiKey, apiSecret, baseUrl: named arguments need PHP 8) against a small local stub of the Touchque endpoints the test needs (the key must start with tq_; without apiKey/apiSecret it reads TQ_API_KEY/TQ_API_SECRET and throws when they are missing), or test the 500 misconfigured / 401 answers with the keys unset",
    },
  },
  go: {
    label: "Go", package: "github.com/Touchque/touchque-go/v5", import: "import \"github.com/Touchque/touchque-go/v5/touchque\"", published: "5.1.0", install: "go get github.com/Touchque/touchque-go/v5 (needs go 1.26: in a project below that it raises the go directive in go.mod; tell the person)", registry: "Go modules", manifests: ["go.mod"],
    guard: {
      v51: true, adapter: "Require (with a nil client it builds one from the environment)", errorBody: "RequireOptions.ErrorBody",
      inHandler: "touchque.RunGuard(ctx, client, in) answers 500 misconfigured for a nil client (401 first when there is no user): keep the client from touchque.New() at startup, nil on error (log it, never log.Fatal). RunGuard has no ErrorBody (it is a Require option only): send a 202's res.Body unchanged (it carries the token the page polls with); for a refusal (res.Status >= 400) write res.Body in the project's shape yourself, keeping res.Body.Touchque as \"touchque\". Always set Cache-Control: no-store, Retry-After on 423/429 (res.Body.Touchque.RetryAfter), and X-Touchque-State (plus X-Touchque-Reason) on status >= 400.",
      tests: "pass a client from touchque.New(&touchque.Config{APIKey: \"tq_test\", APISecret: \"test-secret\", BaseURL: srv.URL}) (APIKey must start with tq_, or New returns an error) where srv is an httptest.Server stub of the Touchque endpoints the test needs; or, with a signed-in user, test the 500 misconfigured answer with a nil client (no user answers 401)",
    },
  },
  python: {
    label: "Python", package: "touchque-authenticator", import: "from touchque import Touchque  # Flask/Django: from touchque.contrib.flask import require_touchque; FastAPI: RequireTouchque", published: "5.1.0", install: "<the project's python, e.g. .venv/bin/python> -m pip install \"touchque-authenticator>=5.1.0\" (into the project's own environment; record the same floor in its requirements)", extras: "pip install \"touchque-authenticator[flask]>=5.1.0\" (or [django], [fastapi]) for a framework adapter", registry: "PyPI", manifests: ["requirements.txt", "pyproject.toml", "Pipfile", "setup.py"],
    guard: {
      v51: true, adapter: "require_touchque / RequireTouchque", errorBody: "error_body=",
      inHandler: "run_guard(None, ...) uses the default client and answers 500 misconfigured (401 without a user) when keys are missing. error_body= is not a run_guard option: send a 202 result['body'] unchanged (it carries the token the page polls with); for status >= 400 send touchque.guard.guard_response_body(result, error_body, encode=json.dumps) as the body, or shape result['body'] yourself keeping its touchque; always with guard_response_headers(result).",
      extra: "FastAPI: the documented { touchque, token } body that @touchque/web reads needs install_touchque_exception_handler(app); it registers the app's HTTPException handler, so if the app has one, send the guard's answers through it instead.",
      tests: "touchque.testing.FakeTouchque (README: Testing your routes)",
    },
  },
  dotnet: {
    label: ".NET", package: "Touchque.AspNetCore", published: null, install: null, registry: "not listed on NuGet yet", manifests: [".csproj", ".sln", "Program.cs"],
    guard: {
      v51: true, adapter: "RequireTouchque / [RequireTouchque]", errorBody: "ErrorBody",
      inHandler: "with Guard.RunAsync in the handler, do not take TouchqueClient as a handler parameter or constructor dependency (resolving it throws TouchqueConfigException without keys); resolve it per request: try { tq = http.RequestServices.GetRequiredService<TouchqueClient>(); } catch (TouchqueConfigException) { result = Guard.WithoutClient(input); }. ErrorBody is an adapter option: send a 202 body unchanged (it carries the token the page polls with); shape only refusals (status >= 400) yourself from GuardRefusal.From(result), and send result.RefusalHeaders.",
      tests: "register a TouchqueClient in the test host built with new TouchqueOptions { ApiKey = \"tq_test_key\", ApiSecret = \"test-secret\", BaseUrl = \"http://127.0.0.1:<stub port>\" } (the key must start with tq_; plain http only for localhost/127.0.0.1/::1), pointing at a local stub of the Touchque endpoints the test needs",
    },
  },
  ruby: {
    label: "Ruby", package: "touchque", import: "require \"touchque\"  # Rails: require_touchque \"ACTION\"", published: "5.1.0", install: "bundle add touchque --version \"~> 5.1\" (Gemfile: gem \"touchque\", \"~> 5.1\")", registry: "RubyGems", manifests: ["Gemfile"],
    guard: {
      v51: true, adapter: "require_touchque (Rails)", errorBody: "error_body:",
      inHandler: "Touchque::Guard.run(client, ...) needs a client: take client = Touchque::Guard.default_client (nil without keys, logged once) and when it is nil answer Touchque::Guard.unauthenticated (no user) or Touchque::Guard.misconfigured; never pass Touchque.client (it raises ConfigError without keys). For the project's shape, only when result[:status] >= 400: render json: Touchque::Guard.error_body(result, callable), status: result[:status] (it returns JSON text), with Touchque::Guard.headers(result); send a 202 as result[:body] unchanged (it carries the token the page polls with). The SDK logs nothing until Touchque.logger is set (e.g. Rails.logger).",
      tests: "no published fake: set Touchque.client = Touchque::Client.new(api_key: \"tq_test\", api_secret: \"test-secret\", base_url: \"http://127.0.0.1:<port>\") pointed at a small local stub of the Touchque endpoints (the key must start with tq_; plain http only on localhost, 127.0.0.1 or ::1), or pass that client to Touchque::Guard.run; reset it with Touchque.client = nil and restore ENV afterwards",
    },
  },
  java: {
    label: "Java", package: "com.touchque:touchque-spring-boot-starter", import: "import com.touchque.TouchqueClient;  // Spring Boot: @RequireTouchque", published: "5.1.0",
    install: "Gradle: implementation(\"com.touchque:touchque-spring-boot-starter:5.1.0\") (without Spring: com.touchque:touchque-java:5.1.0); Maven: the same coordinates in a <dependency>. Needs Java 17+; the starter needs Spring Boot 3 (jakarta.servlet)",
    registry: "Maven Central", manifests: ["pom.xml", "build.gradle", "build.gradle.kts"],
    guard: {
      v51: true, adapter: "@RequireTouchque (Spring Boot starter)", errorBody: "TouchqueErrorBody bean (or errorBody on one action's TouchqueGuardOptions)",
      inHandler: "Guard.run(tq, new Guard.Input(user, action)...) needs a client: inject it as ObjectProvider<TouchqueClient>; never a plain TouchqueClient field or constructor parameter (that builds it at startup, and the app does not start without TQ keys), and never @Lazy TouchqueClient (TouchqueClient is a final class: Spring cannot build the lazy proxy, and the app does not start at all); call getObject() inside the handler in a try/catch (BeanCreationException: r = Guard.withoutClient(input), which answers 500 misconfigured, 401 without a signed-in user). Send a 202 r.body() unchanged (it carries the token the page polls with); for a refusal (r.status() >= 400) build the project's shape from Guard.Refusal.of(r), keeping r.body()'s touchque, or send r.body() as it is. Always Cache-Control: no-store, Retry-After from r.retryAfter() on 423/429, and r.refusalHeaders().",
      extra: "The relay routes and the webhook endpoint still need the keys when the app starts: leave them off unless the person asks (rule 7).",
      tests: "a new TouchqueClient(new TouchqueOptions().apiKey(\"tq_test\").apiSecret(\"test-secret\").baseUrl(\"http://localhost:\" + port)) pointing at a local stub of the Touchque endpoints the test needs, as a @Bean in the test context (the key must start with tq_; without them it reads TQ_API_KEY/TQ_API_SECRET and throws when they are missing), or test the 500 misconfigured / 401 answers with @SpringBootTest(properties = {\"touchque.api-key=\", \"touchque.api-secret=\"}): an empty value counts as missing, while leaving them out falls back to TQ_API_KEY / TQ_API_SECRET, which a Java test cannot unset",
    },
  },
};

const FRONTEND = [
  { package: "@touchque/web", published: "2.1.0", install: "npm install @touchque/web", what: "Drives the step-up loop (the matching number, the first-time QR) and passkey ceremonies in the browser." },
  { package: "@touchque/react", published: "2.0.0", install: "npm install @touchque/react @touchque/web@^2.1.0", what: "Hooks and components on top of @touchque/web." },
];

/** The language a project's manifest files point at, or null. */
function languageFromFiles(files = []) {
  const names = files.map((f) => path.basename(String(f)).toLowerCase());
  for (const [lang, sdk] of Object.entries(SDKS)) {
    if (sdk.manifests.some((m) => names.some((n) => (m.startsWith(".") ? n.endsWith(m) : n === m.toLowerCase())))) return lang;
  }
  return null;
}

// Which README sections a feature needs, most important first (headings matched case-insensitively). A plain
// regex matches a "## " section; { sub: regex } matches a "### " part of any section, for a part that one SDK keeps
// in a long section (Node's "Framework adapters") and another in its quick start.
const GUARD_PARTS = { sub: /^(your own error shape|refusals in your|no api key|without (api keys|an api key)|refusal headers)/ };
const FEATURE_SECTIONS = {
  phone_approval: [/^install/, /^setup/, /^quick start/, /^action types/, /^guard inside your handler/, GUARD_PARTS, /^refusal headers/, /^testing your routes/, /^framework adapters/, /^relay/, /^the three primitives/],
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
  return out.filter((s) => s.title).map((s) => ({ title: s.title, text: s.lines.join("\n").trim(), subs: subsections(s.lines) }));
}

/** The "### " parts of a section's lines: [{ title, text }]. */
function subsections(lines) {
  const out = [];
  let current = null;
  let fenced = false;
  for (const line of lines) {
    if (line.startsWith("```")) fenced = !fenced;
    if (!fenced && /^#{2,3} /.test(line)) {
      if (current) out.push(current);
      current = /^### /.test(line) ? { title: line.slice(4).trim(), lines: [] } : null;
    }
    if (current) current.lines.push(line);
  }
  if (current) out.push(current);
  return out.map((x) => ({ title: x.title, text: x.lines.join("\n").trim() }));
}

/**
 * The README sections of a language a feature needs, as markdown, most important first. A section that does not fit
 * in maxChars is named at the end instead of being cut in the middle; a "### " part already given is not repeated.
 */
function sectionsFor(language, feature, maxChars = 24000, framework = null) {
  let wanted = FEATURE_SECTIONS[feature] || FEATURE_SECTIONS.phone_approval;
  const all = sections(readme(language));
  // A framework other than the quick start's (Next.js next to "Quick start (Express)"): its adapter section comes
  // right after the quick start.
  const quick = all.find((x) => /^quick start/i.test(x.title));
  const fw = String(framework || "").toLowerCase().replace(/\.?js$/, "").trim();
  if (fw && quick && !quick.title.toLowerCase().includes(fw) && wanted.some((w) => String(w) === String(/^framework adapters/))) {
    const i = wanted.findIndex((w) => String(w) === String(/^quick start/));
    wanted = [...wanted.slice(0, i + 1), /^framework adapters/, ...wanted.slice(i + 1).filter((w) => String(w) !== String(/^framework adapters/))];
  }
  const done = new Set();
  const parts = [];
  const left = [];
  let size = 0;
  const add = (key, title, body) => {
    if (done.has(key)) return;
    done.add(key);
    if (size + body.length > maxChars) { left.push(title); return; }
    parts.push(body);
    size += body.length + 2;
  };
  for (const w of wanted) {
    for (const sec of all) {
      if (w instanceof RegExp) {
        if (!w.test(sec.title.toLowerCase()) || done.has(sec.title)) continue;
        const subs = sec.subs.filter((sub) => !done.has(`${sec.title}/${sub.title}`));
        let body = sec.text;
        for (const sub of sec.subs) if (!subs.includes(sub)) body = body.replace(sub.text, `(### ${sub.title}: above)`);
        if (size + body.length <= maxChars || !subs.length) { add(sec.title, sec.title, body); continue; }
        // Too long as a whole: its lead and each "### " part that still fits, the rest named.
        done.add(sec.title);
        const lead = sec.text.slice(0, sec.text.indexOf(sec.subs[0].text)).trim();
        const before = parts.length;
        if (size + lead.length <= maxChars) { parts.push(lead); size += lead.length + 2; }
        for (const sub of subs) add(`${sec.title}/${sub.title}`, `${sec.title} → ${sub.title}`, sub.text);
        if (parts.length === before) { left.splice(left.length - subs.length, subs.length); left.push(sec.title); }
      } else if (!done.has(sec.title)) {
        for (const sub of sec.subs) if (w.sub.test(sub.title.toLowerCase())) add(`${sec.title}/${sub.title}`, sub.title, sub.text);
      }
    }
  }
  const more = left.length ? `\n\nAlso in this README, not shown here (get_touchque_docs with language "${language}" and section): ${left.map((t) => `"${t}"`).join(", ")}.` : "";
  return parts.join("\n\n").trim() + more;
}

module.exports = { SDKS, FRONTEND, FEATURE_SECTIONS, languageFromFiles, sectionsFor, sections, readme };
