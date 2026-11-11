// agent.js — Touchque as a tool for an AI agent: the agent asks a person to
// approve an action on their Touchque phone, checks the answer, asks for a
// mandate (a series of approved requests), and reads who it is. It works only
// with the agent's own identity (TQ_AGENT_ID + TQ_AGENT_KEY, the agent's
// private key; never a workspace's tq_ API key): every call is signed in with
// private_key_jwt and carries a DPoP proof, like @touchque/node's
// TouchqueAgent. Nothing here can approve anything: approving happens on the
// person's phone, with the number this conversation shows.

const crypto = require("crypto");
const fs = require("fs");

const AGENT_ID = /^agt_[a-z2-9]{20}$/;
const ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const TIMEOUT_MS = 10000;

const b64url = (buf) => Buffer.from(buf).toString("base64url");

class AgentError extends Error {
  constructor(status, data) {
    super(data.error_description || data.error || data.message || `Touchque answered ${status}`);
    this.status = status;
    this.code = data.code || data.error || null;
    this.caseCode = typeof data.caseCode === "string" ? data.caseCode : null;
    this.reason = typeof data.reason === "string" ? data.reason : null;
  }
}

/** The key from the environment: a JWK (JSON), a PEM, or a file holding either. */
function keyFrom(value) {
  let raw = String(value || "").trim();
  if (raw && !raw.startsWith("{") && !raw.startsWith("-----") && fs.existsSync(raw)) raw = fs.readFileSync(raw, "utf8").trim();
  if (raw.startsWith("{")) {
    const jwk = JSON.parse(raw);
    if (!jwk.d) throw new Error("TQ_AGENT_KEY is a public key: the agent needs its private key");
    return { key: crypto.createPrivateKey({ key: jwk, format: "jwk" }), kid: jwk.kid || null };
  }
  return { key: crypto.createPrivateKey(raw), kid: null };
}

function thumbprint(jwk) {
  const members = jwk.kty === "EC" ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y } : { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
  return b64url(crypto.createHash("sha256").update(JSON.stringify(members)).digest());
}

class Agent {
  constructor(env = process.env) {
    const agentId = env.TQ_AGENT_ID || "";
    if (!AGENT_ID.test(agentId)) throw new Error("TQ_AGENT_ID must be the agent's agt_… id");
    if (!env.TQ_AGENT_KEY) throw new Error("TQ_AGENT_KEY must be the agent's private key (JWK, PEM or a file path)");
    const { key, kid } = keyFrom(env.TQ_AGENT_KEY);
    const type = key.asymmetricKeyType;
    if (type !== "ec" && type !== "ed25519") throw new Error("The agent key must be EC P-256 or Ed25519");
    this.agentId = agentId;
    this.key = key;
    this.alg = type === "ed25519" ? "EdDSA" : "ES256";
    const pub = crypto.createPublicKey(key).export({ format: "jwk" });
    this.publicJwk = type === "ec" ? { kty: "EC", crv: "P-256", x: pub.x, y: pub.y } : { kty: "OKP", crv: "Ed25519", x: pub.x };
    this.kid = kid || thumbprint(this.publicJwk);
    this.baseUrl = (env.TQ_API_URL || "https://api.touchque.com").replace(/\/+$/, "");
    const url = new URL(this.baseUrl);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) throw new Error(`Refusing a plaintext TQ_API_URL for "${url.hostname}": use https://`);
    this.token = null;
  }

  sign(header, payload) {
    const input = `${b64url(JSON.stringify({ ...header, alg: this.alg }))}.${b64url(JSON.stringify(payload))}`;
    const sig = this.alg === "ES256"
      ? crypto.sign("sha256", Buffer.from(input), { key: this.key, dsaEncoding: "ieee-p1363" })
      : crypto.sign(null, Buffer.from(input), this.key);
    return `${input}.${b64url(sig)}`;
  }

  dpop(method, url, accessToken) {
    return this.sign({ typ: "dpop+jwt", jwk: this.publicJwk }, {
      htm: method, htu: url, iat: Math.floor(Date.now() / 1000), jti: crypto.randomUUID(),
      ...(accessToken && { ath: b64url(crypto.createHash("sha256").update(accessToken).digest()) }),
    });
  }

  async fetchJson(url, init) {
    const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text.slice(0, 200) }; }
    return { status: res.status, data };
  }

  async accessToken() {
    if (this.token && this.token.expiresAt - Date.now() > 60000) return this.token.value;
    const url = `${this.baseUrl}/agents/token`;
    const now = Math.floor(Date.now() / 1000);
    const assertion = this.sign({ typ: "JWT", kid: this.kid }, { iss: this.agentId, sub: this.agentId, aud: url, iat: now, exp: now + 60, jti: crypto.randomUUID() });
    const { status, data } = await this.fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", DPoP: this.dpop("POST", url) },
      body: new URLSearchParams({ grant_type: "client_credentials", client_assertion_type: ASSERTION_TYPE, client_assertion: assertion }).toString(),
    });
    if (status !== 200) throw new AgentError(status, data);
    this.token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 600) * 1000 };
    return this.token.value;
  }

  async request(method, path, body, retried = false) {
    const token = await this.accessToken();
    const url = `${this.baseUrl}${path}`;
    const { status, data } = await this.fetchJson(url, {
      method,
      headers: { Authorization: `DPoP ${token}`, DPoP: this.dpop(method, url.split("?")[0], token), ...(body !== undefined && { "Content-Type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (status === 401 && !retried && data.code === "invalid_token") {
      this.token = null;
      return this.request(method, path, body, true);
    }
    if (status < 200 || status >= 300) throw new AgentError(status, data);
    return data;
  }

  me() { return this.request("GET", "/agents/me"); }
  requestApproval(p) { return this.request("POST", "/agents/approvals", p); }
  getApproval(id) { return this.request("GET", `/agents/approvals/${encodeURIComponent(id)}`); }
  requestMandate(p) { return this.request("POST", "/agents/mandates", p); }
  getMandate(id) { return this.request("GET", `/agents/mandates/${encodeURIComponent(id)}`); }
}

/** The agent from the environment, or null when TQ_AGENT_ID / TQ_AGENT_KEY are not set (docs-only mode). */
function agentFromEnv(env = process.env) {
  // An MCP bundle host passes empty (or, for a field left unset, sometimes the unfilled) user settings.
  const set = (v) => typeof v === "string" && v.trim() !== "" && !v.startsWith("${user_config.");
  if (!set(env.TQ_AGENT_ID) && !set(env.TQ_AGENT_KEY)) return null;
  return new Agent({ ...env, ...(!set(env.TQ_API_URL) && { TQ_API_URL: "" }) });
}

const ENDED = new Set(["rejected", "blocked", "revoked", "expired", "stale", "redeemed"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls an approval for up to waitSeconds (0: once). */
async function approvalAfter(agent, approvalId, waitSeconds) {
  const end = Date.now() + Math.max(0, Math.min(60, Number(waitSeconds) || 0)) * 1000;
  for (;;) {
    const s = await agent.getApproval(approvalId);
    if ((s.status === "approved" && s.approvalToken) || ENDED.has(s.status) || Date.now() + 2000 > end) return s;
    await sleep(2000);
  }
}

/** What the tools answer: what happened, and what to tell the person, never anything to act on silently. */
function describeApproval(s) {
  const lines = [`Approval ${s.approvalId}: ${s.status}.`];
  if (s.challengeCode) lines.push(`Tell the person: "Type ${s.challengeCode} in the Touchque app on your phone to approve." Never type or approve it yourself.`);
  if (s.status === "awaiting_second") lines.push(`A second person approves too${s.secondApprover ? ` (${s.secondApprover})` : ""}${s.secondChallengeCode ? `; their number is ${s.secondChallengeCode}` : ""}.`);
  if (s.status === "provisional") lines.push("It was approved during a phone call: it counts only once the person confirms it on the phone.");
  if (s.status === "pending") lines.push("Not answered yet: call touchque_get_approval again (waitSeconds up to 60).");
  if (s.status === "approved" && s.approvalToken) lines.push("Approved. Pass approvalToken to the service that executes the action: it is used once, for exactly what was approved.");
  if (ENDED.has(s.status)) lines.push(`Ended (${s.status}${s.reason ? `: ${s.reason}` : ""}). Do not retry the same request without the person asking for it.`);
  if (s.caseCode) lines.push(`Case code: ${s.caseCode}.`);
  return lines.join("\n");
}

module.exports = { Agent, AgentError, agentFromEnv, approvalAfter, describeApproval, keyFrom, thumbprint };
