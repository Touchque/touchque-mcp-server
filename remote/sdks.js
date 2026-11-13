// The Touchque SDKs as a developer picks one: which are published, how to
// install them, and the parts of each SDK's own README (bundled/<lang>/, made
// by scripts/sync-bundled.js from the SDK sources) a feature needs. Code the
// AI writes follows those READMEs, never a guess.

const fs = require("fs");
const path = require("path");

const BUNDLED = path.join(__dirname, "..", "bundled");

// What is on the registries, 2026-11-13: 5.2.0 for every server SDK (npm, PyPI, Go modules, Packagist, RubyGems,
// Maven Central, NuGet), @touchque/web 2.2.0, @touchque/react 2.1.0. The bundled READMEs and types are that release
// (sdks 7dbba7d).
// guard: what the integration material says about the step-up guard, per SDK. v51: the 5.1+ guard (its adapter never
// throws without keys and answers 500 misconfigured; an option for the app's own error shape; one QR per
// enrollment). v52: the 5.2 guard (a null client is the default client also inside the handler, a response helper,
// waiting polls repeat expiresAt, enrollment_off). adapter / errorBody: the adapter and its error-shape option;
// inHandler: the guard inside the handler (after the route's own checks); tests: how the person's tests reach it.
// Checked against the SDK sources (sdks 7dbba7d) on 2026-11-13.
const SDKS = {
  node: {
    label: "Node.js", package: "@touchque/node", import: "const { Touchque, requireTouchque } = require('@touchque/node');", published: "5.2.0", install: "npm install @touchque/node@^5.2.0", registry: "npm", manifests: ["package.json"],
    guard: {
      v51: true, v52: true, adapter: "Express: requireTouchque(action, { user, details, errorBody }) before the handler; Next.js / Fetch handlers: withTouchque(action, handler, { user, details, errorBody }), user required, the handler gets { touchque } in its second argument", errorBody: "errorBody",
      inHandler: "runGuard(null, input) per request (null: the default client, built from TQ_API_KEY / TQ_API_SECRET on a request and kept; never new Touchque() at module scope, which throws without keys) and, when result.approved is not set, const { status, headers, body } = await guardResponse(result, { errorBody }) sent as it is.",
      tests: "FakeTouchque from @touchque/node/testing (README: Testing your routes)",
    },
  },
  php: {
    label: "PHP", package: "touchque-authenticator/php-sdk", import: "use Touchque\\Touchque;", published: "5.2.0",
    install: "composer require \"touchque-authenticator/php-sdk:^5.2\"",
    registry: "Packagist", manifests: ["composer.json"],
    guard: {
      v51: true, v52: true, adapter: "the Laravel middleware 'touchque:ACTION'", errorBody: "'errorBody' (bind new TouchqueMiddleware(null, ['errorBody' => fn (array $r) => ...]))",
      inHandler: "Guard::run(null, ...) (null: Guard::defaultClient(), your setDefaultClient client, else your Laravel binding, else built from TQ_API_KEY / TQ_API_SECRET on a request) and, when $result['approved'] is not set, $answer = Guard::response($result, $errorBody) sent with $answer['status'], $answer['headers'] and $answer['body'].",
      tests: "the package has no fake. Build a client pointed at a small local stub of the Touchque endpoints the test needs: new Touchque(new Config('tq_test', 'test-secret', 'http://localhost:<port>')) (positional Config arguments: named arguments need PHP 8; the key must start with tq_). For a route behind the middleware, bind it in the test's container: $this->app->instance(Touchque::class, $client) (the middleware takes its client from Laravel's container and never reads Guard::setDefaultClient()). For Guard::run(null, ...) in a handler the same binding works, or Guard::setDefaultClient($client), which wins over a binding, then Guard::setDefaultClient(null). Or test the 500 misconfigured / 401 answers with no client bound and the keys unset (putenv('TQ_API_KEY'); putenv('TQ_API_SECRET'); for Guard::run(null, ...) call Guard::setDefaultClient(null) first: it also forgets a client already built from the environment)",
    },
  },
  go: {
    label: "Go", package: "github.com/Touchque/touchque-go/v5", import: "import \"github.com/Touchque/touchque-go/v5/touchque\"", published: "5.2.0", install: "go get github.com/Touchque/touchque-go/v5@v5.2.0 (needs go 1.26: in a project below that it raises the go directive in go.mod; tell the person)", registry: "Go modules", manifests: ["go.mod"],
    guard: {
      v51: true, v52: true, adapter: "Require (with a nil client it uses the default client from the environment)", errorBody: "RequireOptions.ErrorBody",
      inHandler: "touchque.RunGuard(ctx, nil, in) (nil: the default client, shared with Require(nil, ...), built from TQ_API_KEY / TQ_API_SECRET on the first request) and, when res.Approved is nil, touchque.WriteGuardResult(w, res, errorBody) (nil for the default body).",
      tests: "the module has no fake. The no-keys path needs no stub: t.Setenv(\"TQ_API_KEY\", \"\"), t.Setenv(\"TQ_API_SECRET\", \"\") and touchque.SetDefaultClient(nil); the route then answers 500 misconfigured (401 with no signed-in user). For the approval path: touchque.SetDefaultClient with a client from touchque.New(&touchque.Config{APIKey: \"tq_test\", APISecret: \"test-secret\", BaseURL: srv.URL}) (APIKey must start with tq_, or New returns an error; an http:// BaseURL works only on localhost, which httptest gives), where srv answers POST /login/request with {\"requestId\", \"challengeCode\", \"expiresAt\"} (the guard answers 202 waiting), GET /login/status/{requestId} with {\"status\": \"PENDING\" | \"CONFIRMED\" | \"REJECTED\" | \"EXPIRED\"}, and POST /login/{requestId}/consume with {\"consumed\": true, \"requestId\", \"externalUsername\", \"type\", \"details\", \"referenceId\"} matching the guard's user, action, details and reference (a mismatch answers 500 misconfigured; a path the stub leaves out answers 503). Send each poll with the previous answer's token in X-Touchque-Token, and call touchque.SetDefaultClient(nil) afterwards (or pass that client to Require / RunGuard)",
    },
  },
  python: {
    label: "Python", package: "touchque-authenticator", import: "from touchque import Touchque  # Flask/Django: from touchque.contrib.flask import require_touchque; FastAPI: RequireTouchque", published: "5.2.0", install: "<the project's python, e.g. .venv/bin/python> -m pip install \"touchque-authenticator>=5.2.0\" (into the project's own environment; record the same floor in its requirements)", extras: "pip install \"touchque-authenticator[flask]>=5.2.0\" (or [django], [fastapi]) for a framework adapter", registry: "PyPI", manifests: ["requirements.txt", "pyproject.toml", "Pipfile", "setup.py"],
    guard: {
      v51: true, v52: true, adapter: "require_touchque / RequireTouchque", errorBody: "error_body=",
      inHandler: "run_guard(None, ...) (None: the default client, built from TQ_API_KEY / TQ_API_SECRET on the first request) and, when 'approved' is not in the result, status, headers, body = guard_response(result, error_body) from the framework's module (touchque.contrib.flask / .django; FastAPI: run run_guard in a worker thread and await touchque.contrib.fastapi.guard_response).",
      extra: "FastAPI: install_touchque_exception_handler(app) is required for the RequireTouchque adapter whenever a page reads its answers (@touchque/web or a plain page): without it FastAPI sends the step as {\"detail\": {\"touchque\": ..., \"token\": ...}} and refusals under \"detail\" too (README: Quick start).",
      tests: "touchque.testing.FakeTouchque (README: Testing your routes)",
    },
  },
  dotnet: {
    label: ".NET", package: "Touchque.AspNetCore", import: "using Touchque; using Touchque.AspNetCore;", published: "5.2.0", install: "dotnet add package Touchque.AspNetCore (ASP.NET Core; workers and consoles: dotnet add package Touchque)", registry: "NuGet", url: "https://www.nuget.org/packages/Touchque.AspNetCore", manifests: [".csproj", ".sln", "Program.cs"],
    guard: {
      v51: true, v52: true, adapter: "RequireTouchque / [RequireTouchque]", errorBody: "ErrorBody",
      inHandler: "resolve the client per request in a try/catch: try { r = await Guard.RunAsync(http.RequestServices.GetRequiredService<TouchqueClient>(), input, http.RequestAborted); } catch (TouchqueConfigException) { r = Guard.WithoutClient(input); } (declare GuardResult r; before the try; never take TouchqueClient as a handler parameter or a constructor parameter of a controller or service: it is resolved before your code runs and throws TouchqueConfigException without keys, and in a controller constructor it breaks every action of that controller; with keys only in the environment, Guard.RunAsync(null, input)). When r.Approved is null: return r.ToResult(errorBody) from a minimal API handler (or a controller action returning IResult); in a controller action returning IActionResult, await r.WriteAsync(HttpContext, errorBody); return new EmptyResult();.",
      tests: "the package has no fake. Point the client the route uses at a local stub of the Touchque endpoints the test needs (the key must start with tq_; plain http only for localhost). RequireTouchque, [RequireTouchque] and a handler that resolves TouchqueClient from RequestServices use the client AddTouchque registers: in the test host (ConfigureTestServices) set services.Configure<TouchqueOptions>(o => { o.ApiKey = \"tq_test_key\"; o.ApiSecret = \"test-secret\"; o.BaseUrl = \"http://127.0.0.1:<stub port>\"; }), or register services.AddSingleton(new TouchqueClient(new TouchqueOptions { ApiKey = \"tq_test_key\", ApiSecret = \"test-secret\", BaseUrl = \"http://127.0.0.1:<stub port>\" })). Guard.SetDefaultClient(that client) affects only Guard.RunAsync(null, input); then call Guard.SetDefaultClient(null) afterwards",
    },
  },
  ruby: {
    label: "Ruby", package: "touchque", import: "require \"touchque\"  # Rails: require_touchque \"ACTION\"", published: "5.2.0", install: "bundle add touchque --version \"~> 5.2\" (Gemfile: gem \"touchque\", \"~> 5.2\")", registry: "RubyGems", manifests: ["Gemfile"],
    guard: {
      v51: true, v52: true, adapter: "require_touchque (Rails)", errorBody: "error_body:",
      inHandler: "Touchque::Guard.run(nil, ...) (nil: Touchque::Guard.default_client, built on a request; never pass Touchque.client, which raises without keys) and, when result[:approved] is not set, status, headers, body = Touchque::Guard.response(result, error_body: ...) (Rails: response.headers.merge!(headers); render json: body, status: status; Rack: [status, headers, [body]]).",
      tests: "Touchque::Testing::FakeTouchque (require \"touchque/testing\"; README: Testing your routes)",
    },
  },
  java: {
    label: "Java", package: "com.touchque:touchque-spring-boot-starter", import: "import com.touchque.TouchqueClient;  // Spring Boot: @RequireTouchque", published: "5.2.0",
    install: "Gradle: implementation(\"com.touchque:touchque-spring-boot-starter:5.2.0\") (without Spring: com.touchque:touchque-java:5.2.0); Maven: the same coordinates in a <dependency>. Needs Java 17+; the starter needs Spring Boot 3 (jakarta.servlet)",
    registry: "Maven Central", manifests: ["pom.xml", "build.gradle", "build.gradle.kts"],
    guard: {
      v51: true, v52: true, adapter: "@RequireTouchque (Spring Boot starter)", errorBody: "TouchqueErrorBody bean (or errorBody on one action's TouchqueGuardOptions)",
      inHandler: "with the starter, inject ObjectProvider<TouchqueClient> and per request try { r = Guard.run(touchque.getObject(), input); } catch (BeansException e) { r = Guard.withoutClient(input); } (never a plain TouchqueClient field or constructor parameter: built at startup, the app does not start without keys; never @Lazy TouchqueClient: a final class, no proxy, no startup); without the starter Guard.run(null, input). When r.approved() is null send Guard.response(r, errorBody, objectMapper, logger): its status(), headers() and body().",
      extra: "The relay routes and the webhook endpoint still need the keys when the app starts: leave them off unless the person asks (rule 7).",
      tests: "the SDK has no fake: build new TouchqueClient(new TouchqueOptions().apiKey(\"tq_test\").apiSecret(\"test-secret\").baseUrl(\"http://localhost:\" + port)) against a local stub of the Touchque endpoints the test needs (the key must start with tq_). With the starter (@RequireTouchque or ObjectProvider<TouchqueClient>) declare it as a @Bean TouchqueClient in a @TestConfiguration: it replaces the starter's bean, and Guard.setDefaultClient has no effect there. Without the starter (Guard.run(null, input)) use Guard.setDefaultClient(client), then Guard.setDefaultClient(null); test the 500 misconfigured / 401 answers with @SpringBootTest(properties = {\"touchque.api-key=\", \"touchque.api-secret=\"}) (an empty value counts as missing; a Java test cannot unset TQ_API_KEY)",
    },
  },
};

const FRONTEND = [
  { package: "@touchque/web", published: "2.2.0", install: "npm install @touchque/web", what: "Drives the step-up loop (the matching number, the first-time QR) and passkey ceremonies in the browser." },
  { package: "@touchque/react", published: "2.1.0", install: "npm install @touchque/react@^2.1.0 @touchque/web@^2.2.0", what: "Hooks and components on top of @touchque/web." },
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
