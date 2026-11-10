// Settings of the remote (Streamable HTTP) Touchque MCP server, from the environment.

const trim = (v) => String(v || "").trim().replace(/\/+$/, "");

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const resource = trim(env.TOUCHQUE_MCP_RESOURCE) || (production ? "https://api.touchque.com/mcp" : "http://localhost:5010/mcp");
  const sso = trim(env.TOUCHQUE_SSO_URL) || (production ? "https://sso.touchque.com" : "http://localhost:5002");
  const config = {
    port: Number(env.PORT || 5010),
    host: env.HOST || "127.0.0.1",
    resource,
    // The authorization server: Touchque SSO's MCP issuer (touchque-sso-backend utils/mcp/oauth.js).
    sso,
    issuer: trim(env.TOUCHQUE_MCP_ISSUER) || `${sso}/mcp`,
    jwksUri: trim(env.TOUCHQUE_JWKS_URI) || `${sso}/.well-known/jwks.json`,
    // The dashboard backend (/v1): the member's workspace, read with an exchanged token.
    dashboardApi: trim(env.TOUCHQUE_DASHBOARD_API) || (production ? "https://dashboard.touchque.com" : "http://localhost:5003"),
    docsUrl: trim(env.TOUCHQUE_DOCS_URL) || "https://support.touchque.com",
    dashboardUrl: trim(env.TOUCHQUE_DASHBOARD_URL) || "https://dashboard.touchque.com",
    // Shared with the SSO (TOUCHQUE_MCP_SECRET there): only this server may exchange members' tokens.
    secret: env.TOUCHQUE_MCP_SECRET || "",
    production,
  };
  config.resourceMetadataUrl = `${new URL(resource).origin}/.well-known/oauth-protected-resource${new URL(resource).pathname}`;
  return config;
}

module.exports = { loadConfig };
