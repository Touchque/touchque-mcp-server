// Search over the public Touchque docs (https://support.touchque.com), in
// English and Turkish, and over the bundled SDK READMEs.
//
// The docs site prerenders every page in both languages (sitemap.xml lists
// /<section> and /<section>?lang=tr). Each page is cut into sections at its
// headings; the page chrome (language tabs, Copy and Try it buttons, code line
// numbers, the table of contents, the pager) is dropped. Sections are ranked
// with BM25: words that are everywhere ("touchque", "api") count little,
// titles and headings count more, exact identifiers (SEND_MONEY,
// x-signature) count most. A Turkish question is also searched with English
// words (a small dictionary), and Turkish pages win for it. Answers are
// short: the best three sections, cut at a paragraph, with a handle to read
// a whole page or section. Fetched once an hour; if the site cannot be read,
// /llms-full.txt (English, pages only) stands in.

const { sections: readmeSections, readme } = require("./sdks");

const TTL_MS = 3600 * 1000;
const RESULT_CHARS = 2600;
const HIT_CHARS = 900;
const PAGE_CHARS = 8000;
let cache = { index: null, until: 0, base: null, loading: null };

// ── HTML → sections ────────────────────────────────────────────────────────

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rarr: "→", larr: "←", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e.toLowerCase()] ?? m;
});

// Elements whose whole subtree is page chrome, by class.
const NOISE = /\b(docs-code-header|docs-code-tabs|docs-code-actions|docs-copy-btn|docs-code-lines|docs-try-btn|docs-toc-nav|docs-toc-item|docs-breadcrumb|docs-pager|docs-main-right|docs-right-card|alert-icon)\b/;
const HEADING = /\b(docs-hero-title|docs-guide-h2|docs-section-title|docs-params-title|docs-faq-q)\b/;
const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "path", "circle", "rect", "line", "polyline", "source"]);

/** The page's <main> as text with "\n## " before every heading; code kept in fences. */
function htmlToText(html) {
  const m = /<main[^>]*>([\s\S]*)<\/main>/i.exec(html);
  const src = m ? m[1] : html;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)/g;
  let out = "";
  let skip = 0; // depth inside a noise element
  const stack = []; // { tag, noise, heading, pre }
  let pre = 0;
  for (let t = re.exec(src); t; t = re.exec(src)) {
    if (t[5] !== undefined) {
      if (!skip) out += pre ? decode(t[5]) : decode(t[5]).replace(/\s+/g, " ");
      continue;
    }
    const closing = t[1] === "/";
    const tag = t[2].toLowerCase();
    const attrs = t[3] || "";
    if (tag === "script" || tag === "style") {
      if (!closing) {
        const end = src.indexOf(`</${tag}`, re.lastIndex);
        re.lastIndex = end < 0 ? src.length : end;
      }
      continue;
    }
    if (VOID.has(tag) || t[4] === "/") {
      if (!skip && tag === "br") out += "\n";
      continue;
    }
    if (!closing) {
      const cls = (/class="([^"]*)"/.exec(attrs) || [])[1] || "";
      const noise = NOISE.test(cls) || tag === "button" || tag === "svg" || tag === "nav";
      const heading = HEADING.test(cls) || /^h[1-4]$/.test(tag);
      stack.push({ tag, noise, heading });
      if (noise) skip += 1;
      if (skip) continue;
      if (heading) out += "\n\n## ";
      else if (tag === "pre") { out += "\n```\n"; pre += 1; }
      else if (tag === "tr") out += "\n| ";
      else if (tag === "td" || tag === "th") out += " ";
      else if (tag === "li") out += "\n- ";
      else if (["p", "div", "table", "ul", "ol", "section"].includes(tag)) out += "\n";
      continue;
    }
    // closing: pop to the matching tag
    let idx = stack.length - 1;
    while (idx >= 0 && stack[idx].tag !== tag) idx -= 1;
    if (idx < 0) continue;
    const popped = stack.splice(idx);
    const wasSkipping = skip > 0;
    for (const p of popped) if (p.noise) skip -= 1;
    if (wasSkipping && skip >= 0 && popped.some((p) => p.noise)) continue;
    if (skip) continue;
    const el = popped[0];
    if (el.heading) out += "\n";
    else if (tag === "pre") { out += "\n```\n"; pre = Math.max(0, pre - 1); }
    else if (tag === "td" || tag === "th") out += " |";
    else if (["p", "div", "table", "ul", "ol", "section"].includes(tag)) out += "\n";
  }
  return out
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .filter((l) => !/^\s*(\d{1,3}|Copy|Try it|Kopyala|Dene|Next|Previous|Sonraki|Önceki)\s*$/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "## " text → [{ heading, text }] (the part before the first heading is the intro). */
function splitSections(text) {
  const out = [];
  let cur = { heading: "", lines: [] };
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    if (!fenced && line.startsWith("## ")) {
      if (cur.heading || cur.lines.join("").trim()) out.push(cur);
      cur = { heading: line.slice(3).trim(), lines: [] };
      continue;
    }
    cur.lines.push(line);
  }
  out.push(cur);
  return out.map((s) => ({ heading: s.heading, text: s.lines.join("\n").trim() })).filter((s) => s.text || s.heading);
}

// ── Words ──────────────────────────────────────────────────────────────────

const fold = (s) => String(s).replace(/İ/g, "i").replace(/I/g, "i").toLowerCase()
  .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u");

const STOP = new Set(fold(`a an and are as at be by can do does for from has have how i if in into is it its me my of on or our so that the their them then there these this to use used uses using was we what when where which who why will with you your
acaba ama ancak bana ben benim bir biri bu bunu bunun da daha de diye en gibi hangi her icin ile ise kadar ki mi mu mı mü ne neden nasil nedir nerede o olan olarak olur sen senin siz sizin su ve veya ya yani yok var kac kac`).split(/\s+/));

// Turkish → English, so a Turkish question also finds the English words.
const SYNONYMS = {
  nedir: "overview introduction what", tanit: "overview introduction", anlat: "overview introduction",
  fiyat: "pricing price", ucret: "pricing price", ucretli: "pricing price", plan: "plan pricing", odeme: "billing payment", fatura: "billing invoice",
  internet: "offline network", cevrimdisi: "offline", baglanti: "connection offline network",
  imza: "signature hmac", imzala: "signature sign", gecersiz: "invalid", hata: "error", hatasi: "error",
  islem: "action", turu: "type", tur: "type", tanimla: "define create", tanim: "define",
  anahtar: "key api", gizli: "secret", sir: "secret",
  kurulum: "setup install", kur: "install setup", yukle: "install", ekle: "add integrate",
  telefon: "phone device", onay: "approval approve", onayla: "approve", reddet: "reject",
  kullanici: "user", giris: "login sign-in", cikis: "logout", sifre: "password", parola: "password",
  kayit: "register sign-up enroll", bagla: "link pair enroll", eslestir: "pair match",
  sayi: "number matching", eslesme: "matching", kod: "code", karekod: "qr", qr: "qr",
  gecis: "passkey", anahtarsiz: "passwordless", kimlik: "identity",
  bildirim: "push notification", geri: "callback", cagri: "callback webhook",
  yeni: "new", kayip: "lost", calindi: "lost stolen", kurtar: "recovery",
  musteri: "customer", calisan: "employee workforce", organizasyon: "organization", rol: "role",
  surum: "version", yayinda: "published release", destek: "support", sorun: "troubleshooting problem",
  zaman: "timeout expired", sure: "timeout expires", dolmus: "expired", asim: "timeout",
  guvenlik: "security", risk: "risk", cihaz: "device", tarayici: "browser",
  ajan: "agent", yapay: "ai", zeka: "ai",
};

/** A crude stem: long words are cut to 6 letters, so tanımlarım ~ tanımlayın, signatures ~ signature. */
const stem = (w) => (w.length > 6 ? w.slice(0, 6) : w);

function tokens(text) {
  const out = [];
  for (const raw of String(text).split(/[^A-Za-z0-9_\-ğüşöçıİĞÜŞÖÇ.]+/)) {
    const w = raw.replace(/^[.\-]+|[.\-]+$/g, "");
    if (!w || w.length < 2) continue;
    const f = fold(w);
    if (STOP.has(f)) continue;
    const ident = /[A-Z].*[_]|^[A-Z0-9_]{3,}$|^x-[a-z-]+$|[a-z][A-Z]/.test(w);
    out.push({ t: stem(f), ident, full: f });
  }
  return out;
}

/** The English words for a Turkish word: exact, then the longest dictionary word it starts with. */
function synonymsOf(x) {
  if (SYNONYMS[x.full]) return SYNONYMS[x.full];
  if (SYNONYMS[x.t]) return SYNONYMS[x.t];
  let best = null;
  for (const k of Object.keys(SYNONYMS)) if (k.length >= 3 && x.full.startsWith(k) && (!best || k.length > best.length)) best = k;
  return best ? SYNONYMS[best] : null;
}

const looksTurkish = (q) => /[ğüşöçıİĞÜŞÖÇ]/.test(q) || tokens(q).some((x) => synonymsOf(x)) || /\b(nasil|nedir|neden|hangi|mi|mu|ne|var mi)\b/.test(fold(q));

// ── Index ──────────────────────────────────────────────────────────────────

function addDoc(index, doc) {
  const tf = new Map();
  const bump = (list, w) => { for (const x of list) tf.set(x.t, (tf.get(x.t) || 0) + w); };
  bump(tokens(`${doc.title} ${String(doc.slug || "").replace(/^sdk:/, "sdk ").replace(/[/-]/g, " ")}`), 3);
  bump(tokens(doc.heading), 2);
  const body = tokens(doc.text);
  bump(body, 1);
  doc.tf = tf;
  doc.len = Math.max(40, body.length + 1);
  doc.titleSet = new Set([...tokens(`${doc.title} ${String(doc.slug || "").replace(/[/:-]/g, " ")}`), ...tokens(doc.heading)].map((x) => x.t));
  index.docs.push(doc);
  const L = doc.lang === "tr" ? "tr" : "en";
  index.df[L] = index.df[L] || new Map();
  index.n[L] = (index.n[L] || 0) + 1;
  for (const t of tf.keys()) index.df[L].set(t, (index.df[L].get(t) || 0) + 1);
}

function finish(index) {
  for (const L of ["en", "tr"]) {
    const docs = index.docs.filter((d) => (d.lang === "tr" ? "tr" : "en") === L);
    index.avg[L] = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  }
  return index;
}

const slugOf = (url) => {
  const u = new URL(url);
  return u.pathname.replace(/\/+$/, "") || "/";
};

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "touchque-mcp-remote" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res.text();
}

/** Every docs page (en + tr) as sections, from the prerendered HTML. */
async function sitePages(docsUrl) {
  const xml = await fetchText(`${docsUrl}/sitemap.xml`);
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => u.startsWith(docsUrl));
  const pages = [];
  for (let i = 0; i < urls.length; i += 6) {
    const batch = await Promise.all(urls.slice(i, i + 6).map(async (url) => {
      try {
        const text = htmlToText(await fetchText(url));
        const secs = splitSections(text);
        const title = (secs.find((s) => s.heading) || {}).heading || slugOf(url);
        return { url, slug: slugOf(url), lang: /[?&]lang=tr\b/.test(url) ? "tr" : "en", title, sections: secs };
      } catch {
        return null;
      }
    }));
    pages.push(...batch.filter(Boolean));
  }
  if (pages.length < 5) throw new Error("too few docs pages");
  return pages;
}

/** Fallback: /llms-full.txt, one section per page. */
async function llmsPages(docsUrl) {
  const text = await fetchText(`${docsUrl}/llms-full.txt`);
  return parseLlms(text).map((p) => ({ ...p, slug: slugOf(p.url), lang: "en", sections: [{ heading: p.title, text: p.text }] }));
}

function parseLlms(text) {
  const pages = [];
  for (const block of text.split(/\n(?=# [^\n]+\n\nSource: )/)) {
    const m = /^# ([^\n]+)\n\nSource: (\S+)/.exec(block);
    if (!m) continue;
    const body = block.slice(m[0].length).split("\n").filter((l) => !/^\s*(\d{1,3}|Copy|Try it)\s*$/.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    pages.push({ title: m[1].replace(/\s*·\s*Touchque Docs\s*$/, "").trim(), url: m[2], text: body });
  }
  return pages;
}

const SDK_LANGS = { node: "Node.js", python: "Python", php: "PHP", go: "Go", dotnet: ".NET", ruby: "Ruby", java: "Java" };

async function buildIndex(docsUrl) {
  let pages;
  try {
    pages = await sitePages(docsUrl);
  } catch {
    pages = await llmsPages(docsUrl);
  }
  const index = { docs: [], df: {}, n: {}, avg: {}, pages };
  for (const p of pages) {
    p.sections.forEach((s, i) => {
      if (!s.text && !s.heading) return;
      addDoc(index, { kind: "docs", url: p.url, slug: p.slug, lang: p.lang, title: p.title.replace(/\s*·\s*Touchque Docs\s*$/, ""), heading: s.heading === p.title ? "" : s.heading, text: s.text, pos: i });
    });
  }
  for (const [lang, label] of Object.entries(SDK_LANGS)) {
    try {
      for (const s of readmeSections(readme(lang))) {
        addDoc(index, { kind: "sdk", sdk: lang, url: `sdk:${lang}`, slug: `sdk:${lang}`, lang: "en", title: `SDK README (${label})`, heading: s.title, text: s.text.replace(/^## [^\n]*\n/, "") });
      }
    } catch { /* a missing bundle is skipped */ }
  }
  return finish(index);
}

async function indexOf(docsUrl) {
  if (cache.index && cache.until > Date.now() && cache.base === docsUrl) return cache.index;
  if (cache.loading && cache.base === docsUrl) return cache.loading;
  cache.base = docsUrl;
  cache.loading = buildIndex(docsUrl)
    .then((index) => {
      cache = { index, until: Date.now() + TTL_MS, base: docsUrl, loading: null };
      return index;
    })
    .catch((err) => {
      cache.loading = null;
      if (cache.index) return cache.index; // keep serving the last good index
      throw err;
    });
  return cache.loading;
}

// ── Search ─────────────────────────────────────────────────────────────────

const PRICE = /\b(fiyat|ucret|price|pricing|cost|plan(lar)?|abonelik|subscription|billing|fatura|odeme)/;

// Product and technical words: in a Turkish question they carry the meaning.
// "How do I set it up" words say what the person wants to do, not what about: they count little.
const INTENT = /^(kur|kuru|kurul|kurulu|kurulur|kurulum|ekle|eklen|eklene|ekleni|eklerim|ekleme|yukle|yap|yapar|yapil|olustu|ayarla|tanimla|kullan|setup|install|add|adding|create|configure|config|set|make|use|using|enable)/;

const TECH = /^(webhook|callback|passkey|webauthn|api|sdk|hmac|signature|oauth|oidc|openid|saml|scim|sso|login|radius|vpn|qr|push|token|jwt|dpop|mcp|redirect|tenant|express|next|nextjs|react|python|php|go|java|ruby|dotnet|node|laravel|django|flask|fastapi|spring|rails|curl|json|http|https|\d{3})$/;

/**
 * The question's words for each language: { tr, en }. The Turkish pages are
 * searched with the question's own words; the English pages with its English
 * and technical words plus the dictionary's English for its Turkish words.
 */
function queryTerms(q) {
  const base = tokens(q);
  const turkish = looksTurkish(q);
  const tr = new Map();
  const en = new Map();
  const put = (m, t, w) => m.set(t, Math.max(m.get(t) || 0, w));
  for (const x of base) {
    const intent = INTENT.test(x.full);
    const w = x.ident ? 3 : TECH.test(x.full) ? 1.5 : intent ? 0.3 : 1;
    put(tr, x.t, w);
    const syn = turkish ? synonymsOf(x) : null;
    if (syn) for (const y of tokens(syn)) put(en, y.t, intent || INTENT.test(y.full) ? 0.3 : 0.9);
    else put(en, x.t, w);
  }
  return { tr, en };
}

function score(index, doc, terms) {
  const k1 = 1.2;
  const b = 0.75;
  const L = doc.lang === "tr" ? "tr" : "en";
  const N = index.n[L] || 1;
  const dfs = index.df[L] || new Map();
  let s = 0;
  let hits = 0;
  let inTitle = 0;
  let weight = 0;
  for (const [t, w] of terms) {
    weight += w;
    const f = doc.tf.get(t);
    if (!f) continue;
    hits += 1;
    const df = dfs.get(t) || 0;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    s += w * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * doc.len) / (index.avg[L] || 1))));
    if (doc.titleSet.has(t)) inTitle += w;
  }
  if (!hits) return 0;
  // Sections that match more of the question's words, and in their title or heading, win.
  return s * (1 + 0.15 * (hits - 1)) * (1 + (weight ? inTitle / weight : 0));
}

/** At most `max` characters, cut at a paragraph (or line) boundary. */
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  let at = cut.lastIndexOf("\n\n");
  if (at < max * 0.4) at = cut.lastIndexOf("\n");
  if (at < max * 0.4) at = cut.lastIndexOf(". ") + 1;
  let out = cut.slice(0, at > 0 ? at : max).trimEnd();
  if ((out.match(/```/g) || []).length % 2) out += "\n```";
  return `${out}\n…`;
}

const handleOf = (d) => (d.kind === "sdk"
  ? `get_touchque_docs { language: "${d.sdk}", section: "${d.heading}" }`
  : `touchque_search_docs { page: "${d.slug}"${d.heading ? `, section: "${d.heading}"` : ""}${d.lang === "tr" ? ', lang: "tr"' : ""} }`);

/**
 * The best sections for a question: [{ title, section, url, lang, text, more }]
 * plus `note` (pricing) and `nearest` (titles, when nothing matched).
 */
async function search(docsUrl, query, { limit = 3, lang = null, sdk = null } = {}) {
  const index = await indexOf(docsUrl);
  const terms = queryTerms(query);
  const turkish = lang ? lang === "tr" : looksTurkish(query);
  const wantSdk = sdk || Object.keys(SDK_LANGS).find((l) => new RegExp(`\\b${l === "dotnet" ? "(\\.net|dotnet|c#)" : l === "node" ? "(node|express|nextjs|next\\.js|javascript|typescript)" : l}\\b`, "i").test(query)) || "node";
  const note = PRICE.test(fold(query)) ? "Touchque does not publish prices or plans in its docs. For a quote, ask Touchque through the support chat on https://support.touchque.com or your Touchque contact; an organization's features are in its dashboard (Organization → Features)." : null;
  // A section's score is the better of its English and its Turkish version; it is shown in the question's language.
  const best = new Map(); // key → { s, en, tr }
  for (const d of index.docs) {
    if (d.kind === "sdk" && d.sdk !== wantSdk) continue;
    const key = d.kind === "sdk" ? `${d.url}#${d.heading}` : `${d.slug}#${d.pos}`;
    const cur = best.get(key) || { s: 0 };
    cur[d.lang === "tr" ? "tr" : "en"] = d;
    const s = score(index, d, d.lang === "tr" ? terms.tr : terms.en) * (d.kind === "sdk" ? 0.8 : 1);
    if (s > cur.s) cur.s = s;
    best.set(key, cur);
  }
  const hits = [...best.values()].filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit)
    .map((x) => (turkish ? x.tr || x.en : x.en || x.tr));
  const per = Math.max(500, Math.min(HIT_CHARS, Math.floor(RESULT_CHARS / Math.max(1, hits.length))));
  const out = hits.map((d) => ({
    title: d.title, section: d.heading || null, url: d.kind === "sdk" ? null : d.url, lang: d.lang, kind: d.kind,
    text: clip(d.text, per), more: handleOf(d),
  }));
  let nearest = null;
  if (!out.length) {
    const titles = [...new Set(index.pages.filter((p) => p.lang === (turkish ? "tr" : "en")).map((p) => `${p.title} (${p.url})`))];
    nearest = titles.slice(0, 8);
  }
  return { hits: out, note, nearest, turkish };
}

/** One page (or one of its sections), cleaned: { title, url, text } or null. */
async function page(docsUrl, slug, { section = null, lang = "en" } = {}) {
  const index = await indexOf(docsUrl);
  const want = String(slug || "").replace(/^https?:\/\/[^/]+/, "").replace(/\?.*$/, "").replace(/\/+$/, "") || "/";
  const pages = index.pages.filter((p) => p.slug === want || p.slug === `/${want.replace(/^\//, "")}`);
  const p = pages.find((x) => x.lang === lang) || pages[0];
  if (!p) return null;
  let secs = p.sections;
  if (section) {
    const f = fold(section);
    const i = secs.findIndex((s) => fold(s.heading).includes(f));
    if (i >= 0) secs = secs.slice(i, i + 1);
  }
  const text = secs.map((s) => (s.heading && s.heading !== p.title ? `## ${s.heading}\n${s.text}` : s.text)).join("\n\n");
  return { title: p.title, url: p.url, text: clip(text, PAGE_CHARS) };
}

/** For tests: build an index from given pages without the network. */
function indexFromPages(pages) {
  for (const p of pages) p.slug = p.slug || slugOf(p.url);
  const index = { docs: [], df: {}, n: {}, avg: {}, pages };
  for (const p of pages) p.sections.forEach((s, i) => addDoc(index, { kind: "docs", url: p.url, slug: slugOf(p.url), lang: p.lang, title: p.title, heading: s.heading === p.title ? "" : s.heading, text: s.text, pos: i }));
  return finish(index);
}

function _setIndex(index, base) {
  cache = { index, until: Date.now() + TTL_MS, base, loading: null };
}

module.exports = { search, page, htmlToText, splitSections, parseLlms, tokens, fold, looksTurkish, indexFromPages, _setIndex, clip };
// Legacy name kept for callers of 4.0.0.
module.exports.searchDocs = async (docsUrl, query, { limit = 3 } = {}) => (await search(docsUrl, query, { limit })).hits.map((h) => ({ title: h.title, url: h.url, excerpt: h.text }));
module.exports.parse = parseLlms;
