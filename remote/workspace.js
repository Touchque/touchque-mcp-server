// The member's Touchque workspace, read for the remote MCP server.
//
// The member's MCP access token is never sent on (no token passthrough): the
// server trades it at the SSO (POST /sso/mcp/touchque/exchange, with this
// server's own secret) for a 5-minute dashboard token for one of the member's
// organizations, which the dashboard backend accepts on a short list of
// routes only (touchque-dashboard-backend middleware/authenticateToken.js).
// The SSO checks the membership, the role and the features again each time.

class WorkspaceError extends Error {
  constructor(status, code, message, body) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// One connection (an AI tool's grant, `gid`) → the organization it works in now.
const activeOrg = new Map(); // gid → { orgId, until }
const ACTIVE_TTL_MS = 12 * 3600 * 1000;
// Exchanged contexts, per access token (jti) and organization.
const contexts = new Map(); // `${jti}:${orgId}` → { value, until }

function remember(map, key, value, ttlMs) {
  if (map.size > 20000) {
    const now = Date.now();
    for (const [k, v] of map) if (v.until < now) map.delete(k);
    if (map.size > 20000) map.clear();
  }
  map.set(key, { ...value, until: Date.now() + ttlMs });
}

function createWorkspace(config, auth) {
  const { claims, token, scopes } = auth;
  const orgOf = () => {
    const hit = activeOrg.get(claims.gid);
    return hit && hit.until > Date.now() ? hit.orgId : claims.org_id;
  };

  async function postSso(path, body) {
    const res = await fetch(`${config.sso}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-touchque-mcp-secret": config.secret, "user-agent": "touchque-mcp-remote" },
      body: JSON.stringify({ subject_token: token, ...body }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new WorkspaceError(res.status, data.error || "sso_error", data.error_description || data.message || `The SSO answered ${res.status}`, data);
    return data;
  }

  /** { dashboard_token, user, organization, organizations, features, platformOff, scope } for the active (or given) organization. */
  async function context(orgId = orgOf()) {
    const key = `${claims.jti}:${orgId || "-"}`;
    const hit = contexts.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const value = await postSso("/sso/mcp/touchque/exchange", orgId ? { organization_id: orgId } : {});
    remember(contexts, key, { value }, Math.max(30, (value.expires_in || 300) - 60) * 1000);
    return value;
  }

  /** Makes another of the member's organizations the active one for this connection. */
  async function useOrganization(orgId) {
    const ctx = await context(orgId);
    remember(activeOrg, claims.gid, { orgId: ctx.organization.id }, ACTIVE_TTL_MS);
    return ctx;
  }

  /** A dashboard API call (/v1/…) as the member, in the active organization. */
  async function dash(method, path, body, { timeoutMs = 20000 } = {}) {
    const ctx = await context();
    const res = await fetch(`${config.dashboardApi}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${ctx.dashboard_token}`,
        "user-agent": "touchque-mcp-remote",
        ...(body !== undefined && { "content-type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 300) };
    }
    if (!res.ok) {
      const message = (data && (data.message || data.error_description || (typeof data.error === "string" && data.error))) || `HTTP ${res.status}`;
      throw new WorkspaceError(res.status, (data && typeof data.error === "string" && data.error) || `http_${res.status}`, message, data);
    }
    return data;
  }

  /** A dashboard read that may be refused (no such feature, no tenant): null with the reason instead of throwing. */
  async function tryDash(path) {
    try {
      return { data: await dash("GET", path) };
    } catch (err) {
      if (err instanceof WorkspaceError) return { data: null, error: { status: err.status, code: err.code, message: err.message } };
      throw err;
    }
  }

  return {
    claims, scopes, canWrite: scopes.includes("touchque:write"),
    context, useOrganization, dash, tryDash, postSso, activeOrgId: orgOf,
  };
}

module.exports = { createWorkspace, WorkspaceError };
