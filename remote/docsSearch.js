// Search over the public Touchque docs (https://support.touchque.com): the
// site publishes every page as plain text in /llms-full.txt, one page per
// "# Title · Touchque Docs" block with its "Source: <url>". Fetched once an
// hour; ranked by how often the query's words appear, titles counting more.

const TTL_MS = 3600 * 1000;
let cache = { pages: null, until: 0, base: null };

function parse(text) {
  const pages = [];
  const blocks = text.split(/\n(?=# [^\n]+\n\nSource: )/);
  for (const block of blocks) {
    const m = /^# ([^\n]+)\n\nSource: (\S+)/.exec(block);
    if (!m) continue;
    pages.push({ title: m[1].replace(/\s*·\s*Touchque Docs\s*$/, "").trim(), url: m[2], text: block.slice(m[0].length).trim() });
  }
  return pages;
}

async function pagesOf(docsUrl) {
  if (cache.pages && cache.until > Date.now() && cache.base === docsUrl) return cache.pages;
  const res = await fetch(`${docsUrl}/llms-full.txt`, { headers: { "user-agent": "touchque-mcp-remote" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`The docs answered ${res.status}`);
  const pages = parse(await res.text());
  cache = { pages, until: Date.now() + TTL_MS, base: docsUrl };
  return pages;
}

const words = (q) => [...new Set(String(q).toLowerCase().split(/[^a-z0-9ğüşöçıİ_.-]+/i).filter((w) => w.length > 1))];

function count(hay, w) {
  let n = 0;
  let i = hay.indexOf(w);
  while (i !== -1 && n < 50) {
    n += 1;
    i = hay.indexOf(w, i + w.length);
  }
  return n;
}

/** The best paragraphs of a page for these words. */
function excerpt(text, ws, maxChars) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 20);
  const scored = paras.map((p, i) => ({ p, i, s: ws.reduce((a, w) => a + count(p.toLowerCase(), w), 0) })).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  const keep = scored.slice(0, 4).sort((a, b) => a.i - b.i).map((x) => x.p);
  const out = keep.join("\n\n");
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}

async function searchDocs(docsUrl, query, { limit = 5, maxChars = 1800 } = {}) {
  const ws = words(query);
  if (!ws.length) return [];
  const pages = await pagesOf(docsUrl);
  return pages
    .map((p) => {
      const title = p.title.toLowerCase();
      const body = p.text.toLowerCase();
      const score = ws.reduce((a, w) => a + count(title, w) * 8 + Math.min(count(body, w), 20), 0) + (ws.every((w) => body.includes(w)) ? 10 : 0);
      return { ...p, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p) => ({ title: p.title, url: p.url, excerpt: excerpt(p.text, ws, maxChars) }));
}

module.exports = { searchDocs, parse };
