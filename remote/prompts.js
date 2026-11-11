// Slash commands (MCP prompts) of the remote Touchque MCP server. Each one is a
// short brief for the coding assistant: find out who the person is and what
// is ON for their organization first, then read their code, then change it,
// then check it against the live workspace. Never build a feature that is OFF.

const LANG_ARG = { name: "language", description: "Backend language (node, python, php, go, dotnet, ruby, java); found from the project when left out", required: false };

const PROMPTS = [
  { name: "touchque-setup", title: "Set up Touchque", description: "Start here: who you are in Touchque, what is on for your organization, what is set up, and the next step for this project.", arguments: [] },
  { name: "add-phone-approval", title: "Add phone approval", description: "Add Touchque phone approval (push with number matching) to this app's sign-in or a sensitive action.", arguments: [LANG_ARG, { name: "action", description: "What to protect, e.g. sign-in or SEND_MONEY", required: false }] },
  { name: "add-passkeys", title: "Add passkeys", description: "Add Touchque passkeys (phishing-resistant sign-in and step-up) to this app.", arguments: [LANG_ARG] },
  { name: "add-touchque-login", title: "Add Touchque Login", description: "Add Touchque Login (hosted sign-up and sign-in for your customers, OpenID Connect) to this app.", arguments: [LANG_ARG] },
  { name: "check-integration", title: "Check integration", description: "Check this app's Touchque integration against your live workspace and the SDK's rules.", arguments: [] },
];

const COMMON = `Rules for this task:
- The person's organization, role, features, keys and Touchque Login apps are in the server instructions; use them (touchque_whoami only if they are missing). If the person means another organization, touchque_use_organization.
- Only build features that are ON. If one is OFF, stop and say an owner can turn it on in the dashboard (Organization → Features); do not write code for it.
- Read the person's code yourself before changing anything: the dependency file, the framework, where sign-in and the sensitive actions live. Keep their existing sign-in working.
- Follow the SDK's own README sections (touchque_generate_integration; get_touchque_docs with a section; get_sdk_types with a symbol). Never invent an SDK function or option.
- Secrets go in the server's .env only (TQ_API_KEY, TQ_API_SECRET), never in source or the browser, and never repeated in the chat.
- Changes to the workspace (an action type, an API key, a redirect URI) only when the person agrees: call the tool without confirm, ask them, then with confirm: true; tell them the number their phone asks for, and touchque_wait.
- Finish with touchque_check_integration on the code you wrote, and fix what it reports.`;

function brief(name, args = {}) {
  const lang = args.language ? `The backend language is ${args.language}.` : "Find the backend language from the project (touchque_pick_sdk with the manifest file names).";
  if (name === "touchque-setup") {
    return `Set up Touchque for this project.

1. From the facts in the server instructions, say in two or three lines who the person is, the organization, their role, which features are ON and what is set up or missing (touchque_workspace_setup only for more detail).
2. Look at this project's files and call touchque_pick_sdk with the manifest names: say which SDK fits, whether it is published, and how to install it.
3. Suggest the next step that fits the project and the ON features: /add-phone-approval, /add-passkeys or /add-touchque-login. Ask which one the person wants; do not start changing files yet.

${COMMON}`;
  }
  if (name === "add-phone-approval") {
    return `Add Touchque phone approval to this app${args.action ? ` for: ${args.action}` : ""}. ${lang}

1. Read the app's code: find the sign-in flow and the sensitive actions; ask which ones to protect if it is not clear.
2. touchque_generate_integration with feature "phone_approval", the language, the framework and the action. Follow its steps and README sections: protect the route with the step-up guard (requireTouchQue or the language's equivalent) so it answers 202 with the step until the phone approves, and show the matching number (and the first-time QR) in the app's own frontend (@touchque/web or @touchque/react).
3. If the action type does not exist yet, offer touchque_define_action_type (or define it at startup with the SDK). If there is no active API key and the person wants one, touchque_create_api_key (it asks their phone).
4. touchque_check_integration with the code and framework; fix what fails.
5. Offer touchque_send_test_approval so the person sees an approval on their own phone (only if they want it).

${COMMON}`;
  }
  if (name === "add-passkeys") {
    return `Add Touchque passkeys to this app. ${lang}

1. Read the app's sign-in and account-settings code (the passkey domain is in the server instructions).
2. touchque_generate_integration with feature "passkeys": add enrollment in the account settings and passkey sign-in or step-up, with the relay routes the SDK documents and @touchque/web in the browser.
3. touchque_check_integration with the code and framework; fix what fails.

${COMMON}`;
  }
  if (name === "add-touchque-login") {
    return `Add Touchque Login (hosted sign-in for the app's customers, OpenID Connect) to this app. ${lang}

1. Touchque Login must be ON (server instructions). If it is OFF, stop and say how to turn it on. The tenant (issuer) and its apps are there too; if there is no tenant or no app, tell the person to create them in the dashboard (Touchque Login) and stop.
2. Read the app's code: its current sign-in, its routes and its base URL. Pick the Touchque Login app to use (ask if there are several).
3. touchque_generate_integration with feature "touchque_login": sign-in redirect, callback with the authorization code and PKCE, the session, sign-out, with the tenant's issuer and the app's client ID. The client secret (for a confidential app) goes in the .env.
4. Every redirect URI the code uses must be registered on the app: touchque_add_redirect_uri for a missing one (ask the person first).
5. touchque_check_integration with the code, framework, clientId and redirectUris; fix what fails.

${COMMON}`;
  }
  if (name === "check-integration") {
    return `Check this app's Touchque integration.

1. Find the Touchque code in the project (search for touchque / TouchQue / TQ_API_KEY and the SDK package) and the framework.
2. touchque_check_integration with that code, the language and the framework (and the Touchque Login client ID and redirect URIs if the app uses it).
3. Report: what is right, what is wrong in the code, what is missing in the workspace, each with the fix. Offer to fix the code; workspace changes only with the person's yes.

${COMMON}`;
  }
  return null;
}

function listPrompts() {
  return PROMPTS;
}

function getPrompt(name, args) {
  const text = brief(name, args || {});
  if (!text) return null;
  const p = PROMPTS.find((x) => x.name === name);
  return { description: p.description, messages: [{ role: "user", content: { type: "text", text } }] };
}

module.exports = { PROMPTS, listPrompts, getPrompt };
