// Bearer tokens for the remote Touchque MCP server: RS256 JWTs from Touchque
// SSO's MCP issuer (touchque-sso-backend utils/mcp/oauth.js), for exactly this
// server (aud = the resource, RFC 8707), type "mcp". A token bound to a DPoP
// key (cnf.jkt) needs a DPoP proof for this request (RFC 9449). Verified with
// node:crypto only.

const crypto = require("crypto");

class AuthError extends Error {
  constructor(code, message, status = 401) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const b64json = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

function decode(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new AuthError("invalid_token", "Not a JWT");
  try {
    return { header: b64json(parts[0]), payload: b64json(parts[1]), data: Buffer.from(`${parts[0]}.${parts[1]}`), sig: Buffer.from(parts[2], "base64url") };
  } catch {
    throw new AuthError("invalid_token", "Not a JWT");
  }
}

function verifySig(alg, key, data, sig) {
  if (alg === "RS256") return crypto.verify("RSA-SHA256", data, key, sig);
  if (alg === "ES256") return crypto.verify("SHA256", data, { key, dsaEncoding: "ieee-p1363" }, sig);
  if (alg === "EdDSA") return crypto.verify(null, data, key, sig);
  return false;
}

/** RFC 7638 thumbprint of a public EC or OKP key. */
function thumbprint(jwk) {
  const members = jwk.kty === "EC" ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y } : { crv: jwk.crv, kty: jwk.kty, x: jwk.x };
  return crypto.createHash("sha256").update(JSON.stringify(members)).digest("base64url");
}

function createVerifier(config) {
  let keys = new Map(); // kid → KeyObject
  let fetchedAt = 0;
  const seenProofs = new Map(); // DPoP jti → expiry

  async function keyFor(kid) {
    const fresh = Date.now() - fetchedAt < 600000;
    if (keys.has(kid) && fresh) return keys.get(kid);
    if (Date.now() - fetchedAt < 30000 && keys.size) return keys.get(kid) || null; // an unknown kid refetches at most every 30 s
    const res = await fetch(config.jwksUri, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new AuthError("invalid_token", "The signing keys could not be read", 503);
    const body = await res.json();
    const next = new Map();
    for (const jwk of body.keys || []) {
      if (jwk.kty !== "RSA" || !jwk.kid) continue;
      try {
        next.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: "jwk" }));
      } catch { /* not a usable key */ }
    }
    keys = next;
    fetchedAt = Date.now();
    return keys.get(kid) || null;
  }

  function verifyDpop(req, token, jkt) {
    const proof = req.headers.dpop;
    if (typeof proof !== "string" || !proof) throw new AuthError("invalid_token", "This token is bound to a DPoP key: send a DPoP proof");
    const { header, payload, data, sig } = decode(proof);
    if (header.typ !== "dpop+jwt" || !header.jwk || !["ES256", "EdDSA"].includes(header.alg) || header.jwk.d) throw new AuthError("invalid_dpop_proof", "Bad DPoP proof header");
    if (thumbprint(header.jwk) !== jkt) throw new AuthError("invalid_dpop_proof", "The DPoP key is not the token's");
    let key;
    try {
      key = crypto.createPublicKey({ key: header.jwk, format: "jwk" });
    } catch {
      throw new AuthError("invalid_dpop_proof", "Bad DPoP key");
    }
    if (!verifySig(header.alg, key, data, sig)) throw new AuthError("invalid_dpop_proof", "Bad DPoP signature");
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.iat !== "number" || Math.abs(now - payload.iat) > 60) throw new AuthError("invalid_dpop_proof", "The DPoP proof is too old");
    if (payload.htm !== req.method || String(payload.htu || "").split("?")[0].replace(/\/+$/, "") !== config.resource) throw new AuthError("invalid_dpop_proof", "The DPoP proof is for another request");
    if (payload.ath !== crypto.createHash("sha256").update(token).digest("base64url")) throw new AuthError("invalid_dpop_proof", "The DPoP proof is for another token");
    const ms = Date.now();
    for (const [k, until] of seenProofs) if (until < ms) seenProofs.delete(k);
    if (!payload.jti || seenProofs.has(payload.jti)) throw new AuthError("invalid_dpop_proof", "This DPoP proof was used already");
    seenProofs.set(payload.jti, ms + 120000);
  }

  /** The request's token, verified: { token, claims, scopes }; throws AuthError. */
  return async function verify(req) {
    const m = /^(Bearer|DPoP)\s+([A-Za-z0-9._~+/=-]+)$/i.exec(req.headers.authorization || "");
    if (!m) throw new AuthError("missing_token", "Sign in with Touchque to use this server");
    const token = m[2];
    const { header, payload: claims, data, sig } = decode(token);
    if (header.alg !== "RS256" || !header.kid) throw new AuthError("invalid_token", "The access token is not valid for this server");
    const key = await keyFor(header.kid);
    if (!key || !verifySig("RS256", key, data, sig)) throw new AuthError("invalid_token", "The access token is not valid for this server");
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp + 5 < now) throw new AuthError("invalid_token", "The access token expired");
    if (typeof claims.nbf === "number" && claims.nbf - 5 > now) throw new AuthError("invalid_token", "The access token is not valid yet");
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== config.issuer || !aud.includes(config.resource)) throw new AuthError("invalid_token", "The access token is not valid for this server");
    if (claims.type !== "mcp" || !claims.sub || !claims.gid) throw new AuthError("invalid_token", "Not a Touchque MCP access token");
    if (claims.cnf && claims.cnf.jkt) verifyDpop(req, token, claims.cnf.jkt);
    const scopes = String(claims.scope || "").split(" ").filter(Boolean);
    return { token, claims, scopes };
  };
}

/** The WWW-Authenticate header that sends an MCP client to sign in (RFC 9728 §5.1). */
function challenge(config, err) {
  const parts = [`resource_metadata="${config.resourceMetadataUrl}"`, `scope="touchque:read touchque:write"`];
  if (err && err.code !== "missing_token") parts.unshift(`error="${err.code === "invalid_dpop_proof" ? "invalid_dpop_proof" : "invalid_token"}"`, `error_description="${String(err.message).replace(/"/g, "'")}"`);
  return `Bearer ${parts.join(", ")}`;
}

module.exports = { createVerifier, challenge, AuthError, thumbprint };
