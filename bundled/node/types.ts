// Touchque Node.js SDK — bundled type reference for AI assistants.
// Concatenation of touchque-node/src/{types.ts,steps.ts,approvalProof.ts,resources/Login.ts}
// plus the public part of src/router.ts (touchqueRouter), from the SDK source.
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API
// changes (see touchque-mcp-server/README.md).

// src/types.ts
// All TypeScript types and interfaces for the Touchque Node.js SDK

import type { SafeTxTarget, SafeDisplayRow } from './safeGuard';

export interface TouchqueConfig {
  /** Your Touchque API key (starts with `tq_`) */
  apiKey: string;
  /** Your Touchque API secret */
  apiSecret: string;
  /**
   * Optional base URL override (default: https://api.touchque.com, or the
   * TQ_API_URL environment variable). Must be `https://` unless it
   * points at localhost — the SDK refuses plaintext `http://` to any other
   * host so the API key / signature are never sent in the clear.
   */
  baseUrl?: string;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /**
   * Where the SDK reports its own problems: a misconfigured guard, an
   * onChallenge callback that threw, a relay mounted without getLoginUser.
   * Default: nothing is logged. Pass `console`, or your logger (pino,
   * winston: anything with `warn` and `error`). Messages carry an error's
   * class, code and message, never a request, token or user's data.
   */
  logger?: TouchqueLogger;
  /** `true`: log to `console` when no `logger` is given (local development). */
  debug?: boolean;
}

/** What the SDK logs through: `console`, or any logger with `warn` and `error`. */
export interface TouchqueLogger {
  warn(message: string): void;
  error(message: string): void;
}

// ─── Auth Resource ───────────────────────────────────────────────

export interface GenerateSecretOptions {
  /** The user's unique identifier in YOUR system (email, userId, etc.) */
  externalUsername: string;
}

export interface GenerateSecretResponse {
  /** New setup secret — show to user once (e.g. as QR code) */
  secret: string;
  externalUsername: string;
  /** ISO string of when this secret expires if not used */
  expiresAt: string;
  ttlMs: number;
  /**
   * A ready-to-render `data:image/png;base64,...` QR code encoding `secret`
   * for the Touchque mobile app to scan. Show this directly in an `<img>`
   * src — no client-side QR generation needed.
   */
  qrCodeDataUrl: string;
  /**
   * 10 one-time recovery codes to be shown to the user.
   * If the user loses their device, they can use one of these codes to bypass 2FA.
   */
  recoveryCodes: string[];
}

export interface UnlinkSecretOptions {
  externalUsername: string;
}

export interface UnlinkSecretResponse {
  success: boolean;
  externalUsername: string;
  message: string;
}

export interface ValidateSecretOptions {
  secret: string;
}

export interface ValidateSecretResponse {
  valid: boolean;
  externalUsername?: string;
  integrationId?: string;
  integration?: {
    companyName: string;
    icon: string;
    color: string;
  };
  message?: string;
  reason?: string;
  usedAt?: string;
  expiredAt?: string;
}
export interface ResetSecretOptions {
  externalUsername: string;
}

export interface ResetSecretResponse {
  /** New setup secret — show to user once */
  secret: string;
  externalUsername: string;
  expiresAt?: string;
  /** See GenerateSecretResponse.qrCodeDataUrl. */
  qrCodeDataUrl?: string;
  recoveryCodes?: string[];
}

/**
 * What the Touchque app last reported about the phone it runs on, for device trust.
 * Self-reported by the app; `signed` says the phone's hardware approval key signed the latest report.
 *
 * `state`: `compromised` (jailbroken/rooted or tampered), `unknown` (no report, or one older than
 * 14 days), `at_risk` (no screen lock, approval keys destroyed, no hardware key, debugger or developer
 * mode), otherwise `healthy`. `issues` lists the reasons behind the state.
 */
export interface DevicePosture {
  platform: 'ios' | 'android' | null;
  /** Hardware model, e.g. `iPhone15,3` or `Pixel 8`. */
  model?: string | null;
  /** e.g. `18.1` or `15`. */
  osVersion: string | null;
  /** Android security patch level (`YYYY-MM-DD`); null on iOS. */
  securityPatch?: string | null;
  appVersion: string | null;
  /** A passcode, PIN, pattern or password is set. */
  screenLock: boolean | null;
  biometrics?: 'face' | 'touch' | 'fingerprint' | 'iris' | 'none' | null;
  /** Jailbroken or rooted, by the app's checks. */
  jailbroken: boolean;
  /** Jailbroken/rooted or tampered; sticky until the phone reports clean for a cool-down. */
  compromised: boolean;
  /** Approvals are signed by a Secure Enclave / Keystore key that still works. */
  hardwareKey: boolean;
  /** How the hardware key was proven genuine; null when it was not attested. */
  attestation: 'apple-appattest' | 'android-key' | null;
  /** The latest report was signed by the phone's hardware key. */
  signed: boolean;
  /** ISO date-time of the latest report. */
  reportedAt: string | null;
  lastSeenAt: string | null;
  linkedAt?: string | null;
  state: 'healthy' | 'at_risk' | 'compromised' | 'unknown';
  issues: DevicePostureIssue[];
}

export type DevicePostureIssue =
  | 'jailbroken'
  | 'tampered'
  | 'integrity_failed'
  | 'no_report'
  | 'stale_report'
  | 'no_screen_lock'
  | 'keys_lost'
  | 'no_hardware_key'
  | 'debugger'
  | 'developer_mode';

export interface GetUserResponse {
  externalUsername: string;
  /** Set once the mobile app has linked (scanned) the secret. */
  deviceId: string | null;
  /** true once the secret has been linked to a device via /auth/secret/link. */
  used: boolean;
  frozen: boolean;
  createdAt: string;
  expireAt: string | null;
  /** The linked phone's posture, or null before a phone is linked. See {@link DevicePosture}. */
  device: DevicePosture | null;
}

// ─── Offline Sign ────────────────────────────────────────────────

export interface OfflineChallengeOptions {
  /** User identifier in YOUR system */
  externalUsername: string;
  /** The action being approved (an Action Type slug/id from your Dashboard) */
  type: string;
  /**
   * What the user is approving, shown on the phone (see LoginRequestOptions.details).
   * REQUIRED for critical action types.
   */
  details?: LoginRequestDetails;
  /** End user's IP / User-Agent: shown to the user as "where the request came from". */
  clientIp?: string;
  userAgent?: string;
  /** Seconds the challenge stays valid (30–300, default 120). */
  ttlSeconds?: number;
  /** Set false to skip the ready-made QR image (`qrDataUrl` is then null). */
  includeQrImage?: boolean;
  /**
   * The push request (`requestId` from `login.request` / `tq.start`) this QR is a fallback for.
   * Touchque then treats them as ONE sign-in: once the phone REJECTS the push the QR is dead
   * (no new QR is issued, a code for the old one is refused), and if the push asked for number
   * matching the QR asks for the same number. Always pass it when the QR follows a push.
   */
  requestId?: string;
  /** Ask for number matching on a standalone QR (implied when `requestId` points at a push that has one). */
  requireNumberMatch?: boolean;
}

export interface OfflineChallengeResponse {
  challengeId: string;
  /** QR text (`TQ2.…`, encrypted for the user's phone; nothing in it is readable) — draw it as a QR code if you don't use `qrDataUrl`. */
  qr: string;
  /** `data:image/png;base64,…` ready for `<img src>`; null when `includeQrImage: false`. */
  qrDataUrl: string | null;
  expiresAt: string;
  expiresInSeconds: number;
  /** True when the workspace allows the time-based code fallback (no camera). */
  totpAvailable: boolean;
  /**
   * Number matching: print this number under the QR. The phone shows three numbers (this one and
   * two decoys) after scanning and the user taps the one that matches the page. Absent when the
   * QR needs no number matching.
   */
  challengeCode?: string;
}

export interface OfflineVerifyOptions {
  challengeId: string;
  /** The 7 characters shown on the phone; dashes/spaces/case are ignored. */
  code: string;
}

export interface OfflineTotpVerifyOptions {
  externalUsername: string;
  code: string;
  /** The action the code is for; critical actions are refused. */
  type?: string;
  clientIp?: string;
  /** The push request this sign-in belongs to: a code is refused once the phone rejected it. */
  requestId?: string;
}

export interface OfflineTotpVerifiersOptions {
  /** Up to 1,000 users; users x steps at most 24,000 a call. */
  externalUsernames: string[];
  /** First 30-second step (default: the current one). */
  fromStep?: number;
  /** How many steps, 1-480 (default 480: 4 hours). */
  steps?: number;
}

export interface OfflineTotpVerifierUser {
  externalUsername: string;
  /** This user's first step (later than asked when earlier steps were used). */
  fromStep: number;
  /** Base64, 16 bytes. */
  salt: string;
  /** Base64: kdf.length bytes per digest, two per step from fromStep (the anchored and the unanchored code). */
  digests: string;
}

export interface OfflineTotpVerifiersResult {
  stepSeconds: number;
  fromStep: number;
  steps: number;
  notAfterStep: number;
  kdf: { name: 'pbkdf2-sha256'; iterations: number; length: number };
  /** Only users who can use time-based codes now. */
  users: OfflineTotpVerifierUser[];
}

export interface OfflineVerifyResult {
  approved: boolean;
  /** When not approved: invalid_code | locked | expired | used | unknown_challenge | request_rejected | too_many_failures | frozen | … */
  reason?: string;
  /** Wrong codes left before the challenge locks (only with reason `invalid_code`). */
  attemptsLeft?: number;
  challengeId?: string;
  externalUsername?: string;
  type?: string;
}

// ─── Login Resource ──────────────────────────────────────────────

export type LoginType = 'LOGIN' | 'DISABLE_2FA' | string;

/** Label → value pairs, or an explicit ordered list of `{ label, value }`. */
export type LoginRequestDetails =
  | Record<string, string | number>
  | Array<{ label: string; value: string | number }>;

export interface LoginRequestOptions {
  /** User identifier in YOUR system */
  externalUsername: string;
  /**
   * The type of action requiring 2FA confirmation.
   * Built-in types: 'LOGIN', 'DISABLE_2FA'
   * Custom types can be created/configured in your Touchque Dashboard.
   */
  type: LoginType;
  /** Optional reference (e.g. your internal transaction ID) */
  referenceId?: string;
  
  /** The IP address of the user initiating the request. Touchque will resolve this to a City/Country. */
  clientIp?: string;
  /**
   * The User-Agent string of the user's browser/device. Shown on the approval
   * screen as the requesting browser and device (e.g. "Chrome · macOS").
   */
  userAgent?: string;
  /**
   * Transaction context shown on the approval screen, so the user sees what
   * they are approving — e.g. `{ Amount: '1,250.00 USD', Recipient: 'Jane Doe' }`.
   * Keys and values are displayed as-is, in the order given.
   *
   * Limits (the request is rejected with a 400 otherwise — never truncated):
   * at most 8 entries, labels up to 40 characters, values up to 120
   * characters, strings or numbers only, no control characters.
   *
   * Always set this from your server-side state, never from browser input.
   */
  details?: LoginRequestDetails;
  /** Require the user to authenticate with FaceID / TouchID on their device to approve this request. */
  requireBiometric?: boolean;
  /**
   * Force Number Matching (anti-push-bombing).
   * When true, the user must type a matching code shown on their screen to approve.
   * The backend also auto-enables this if MFA fatigue is detected (2+ failed requests in 10 min).
   */
  requireNumberMatch?: boolean;
  /**
   * Digits of the matching number when one is shown: `3` for 100–999.
   * The longer of this and your workspace policy wins: a request can
   * lengthen the number, never shorten it.
   */
  challengeDigits?: 2 | 3;
  /**
   * How long the push waits for the person, in seconds: 30 (default) to 300.
   * Longer suits a request the person has to read first, such as an AI agent
   * asking on their behalf.
   */
  expiresIn?: number;
  /**
   * A browser pairing by QR code (`tq.qrPairings`): the pairing id, scanned and
   * confirmed on the phone. Only the phone that scanned it is asked, once, with
   * number matching, for the user it scanned for. Not with `reply`.
   */
  qrPairing?: string;
  /**
   * Ask the person to type something back on the phone: today `kind: 'code'`, a sign-in code
   * another service sent them. `key` is a one-time P-256 public key (`newCodeReplyKey()`); the
   * phone encrypts what was typed to it and `login.status().reply.ct` hands back only the
   * ciphertext: open it with `openCodeReply`. Such a request lives 5 minutes. Not with `qrPairing`.
   */
  reply?: LoginReplyRequest;
  /**
   * Silent sign-ins: the browser's device-bound key proof, exactly as the
   * browser sent it (`X-Touchque-Browser` header, made by `@touchque/web`).
   * When the user approves this request on the phone (or with a passkey),
   * Touchque remembers the browser, so a later `risk.check` can let the same
   * browser in without asking. Pass it through untouched; an invalid proof
   * only means "a browser Touchque does not know".
   */
  browserProof?: string;
  /**
   * The end user's page check from \`@touchque/web\` (\`startClientSignals().encode()\`),
   * passed through untouched: a browser driven by software (automation, an
   * AI browser agent) is never silent and asks with number matching, or is
   * refused where the workspace blocks it (403 \`automated_client\`).
   */
  clientSignals?: string;
  /**
   * The page's device report from \`@touchque/web\` (\`deviceRisk.collect({ purpose })\`),
   * passed through untouched. Used only when your workspace turned Device risk
   * on: its signals only ever ask for more (never silent, number matching or a
   * passkey), and a device your admin marked "step up always" asks at once.
   * Collect it only on sign-in, sign-up, password-reset and approval pages,
   * and name it in your privacy notice.
   */
  deviceRisk?: string;
  /**
   * The page's identification from \`@touchque/web\` (\`deviceRisk.identify()\`'s
   * requestId): preferred over \`deviceRisk\`. Usable for this account only.
   */
  deviceRiskRequestId?: string;
  /**
   * For your Touchque Actions only (`event.context`): roles, plan, amount…
   * Any JSON object up to 4 KB. Never shown on the phone.
   */
  context?: Record<string, unknown>;
  /**
   * When the user's sign-in security last changed in YOUR system (a password
   * reset, a new email…). Touchque adds what it saw itself (the phone linked,
   * moved or recovered, passkeys added or removed) and gives access rules and
   * Actions the minutes since each: `minutesSince.mfaChange`, `.deviceChange`,
   * `.passwordChange`, `.emailChange`, `.phoneChange`, `.anyChange`.
   * Example rule: refuse `PAYOUT_CHANGE` within 24 hours of a 2FA change.
   */
  securityChanges?: SecurityChanges;
  /**
   * Where the action sends money or value. The phone shows it in full, first
   * and in groups of four, with a warning above it when it looks like one the
   * user used before but is not the same. Do not repeat it in `details`.
   */
  destination?: Destination;
  /** Language of the rows Touchque adds (the destination and its warning). Default `'tr'`. */
  locale?: 'tr' | 'en';
}

export type SecurityChangeKind = 'password' | 'mfa' | 'device' | 'email' | 'phone';

/** When each kind last changed: an ISO 8601 time, epoch milliseconds or a Date. */
export type SecurityChanges = Partial<Record<SecurityChangeKind, string | number | Date>>;

export type DestinationKind = 'iban' | 'account' | 'wallet' | 'address' | 'payee';

export interface Destination {
  kind: DestinationKind;
  /** The IBAN, account number, wallet address, delivery address or payee name. An IBAN must pass its check digits. */
  value: string;
  /** Destinations of this kind the user already uses in your system (saved payees, addresses); at most 50. */
  known?: string[];
}

export interface DestinationLookalike {
  field: string;
  reason: 'same_start_and_end' | 'confusable' | 'near_miss' | 'mixed_script';
  /** The known destination it resembles, masked (`TR33…1326`). */
  similarTo?: string;
}

/** What Touchque made of the request's `destination` (also shown on the phone). */
export interface DestinationCheck {
  /** The user approved it before, or it is in `known`. */
  known: boolean;
  /** Earlier destinations it looks like without being the same; empty when none. */
  lookalike: DestinationLookalike[];
}

export interface LoginRequestResponse {
  requestId: string;
  /** Challenge code for number matching UI (if enabled for this integration) */
  challengeCode?: string;
  /**
   * "Why?" case code of this decision (`K7P-2QX`). Show it to the user ("Tell
   * your support team: K7P-2QX"); your team opens the whole decision (each
   * check, the rule that matched, what would have let it through) by this code
   * in the dashboard (Logs → Look up a case).
   */
  caseCode?: string;
  /** Why number matching or a passkey is needed (a fixed list, never a score); absent for a plain push. */
  reasons?: RiskReason[];
  message: string;
  expiresAt: string;
  /**
   * Present only when this integration has behavioral biometrics enabled
   * (TenantPolicy.behavioralBiometricsEnabled). Pass this down to your
   * frontend along with `requestId` to initialize the behavioral widget in
   * `@touchque/web` (`tq.behavioral.attach(...)`), scoped to your 2FA
   * challenge UI. Single-purpose and short-lived — do not reuse across requests.
   */
  telemetryToken?: string;
  /**
   * The workspace policy requires a phishing-resistant factor for this action:
   * no push was sent. Approve it with a passkey in the browser
   * (`@touchque/web` `passkeys.approveLogin({ requestId })`).
   */
  requiresPasskey?: boolean;
  /**
   * Mirror Alarm: have the page that shows this sign-in load `url` (a hidden
   * image) and send a beacon to it (`@touchque/web` does both). A page that is
   * not on your site, i.e. a real-time phishing proxy, gets the approval
   * refused (webhook reason `phishing_origin`). Allow its host in your CSP
   * `img-src` and `connect-src`.
   */
  canary?: { url: string };
  /** Only with a `destination`: whether the user used it before and what it looks like. */
  destination?: DestinationCheck;
}

/** How an approved request was confirmed, and whether that is phishing-resistant. */
export interface ApprovalAssurance {
  /** true only for passkeys (WebAuthn): the signature is bound to your site's origin. */
  phishingResistant: boolean;
  /** 'passkey' | 'push' | 'recovery_code' | ... */
  method: string | null;
}

export type LoginStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';

/** What `login.consume` answers: the approved request, used up by this call. */
export interface ConsumeResponse {
  consumed: true;
  requestId: string;
  externalUsername: string;
  type: string;
  referenceId: string | null;
  details: Array<{ label: string; value: string }> | null;
  confirmedVia: string | null;
  assurance: ApprovalAssurance | null;
  /** Device-signed proof of what was approved, when the phone holds a hardware key. */
  approvalProof: import('./approvalProof').ApprovalProof | null;
  /** Vishing Shield fields, as on `login.status`. */
  provisional?: boolean;
  reconfirmedAt?: string | null;
  revoked?: boolean;
  revokeReason?: 'UNDO' | 'COACHED' | null;
}

export interface LoginStatusResponse {
  status: LoginStatus;
  /** How the request was confirmed ('DEVICE', 'WEBAUTHN', ...); null until confirmed */
  confirmedVia?: string | null;
  /**
   * Device-signed proof of what was approved (only when the approving phone
   * holds a Secure Enclave key). Check it with `verifyApprovalProof`.
   */
  approvalProof?: import('./approvalProof').ApprovalProof | null;
  /** Set once CONFIRMED: rely on `assurance.phishingResistant` for high-assurance sessions. */
  assurance?: ApprovalAssurance | null;
  /**
   * The request can only be approved with a passkey: a phishing-resistant
   * policy, or the Vishing Shield moved it to a passkey at the phone tap
   * because the user was on a call (it is still PENDING then).
   */
  requiresPasskey?: boolean;
  /**
   * Vishing Shield: approved on the phone during a call. Still CONFIRMED;
   * the user's critical actions are refused (`blocked` / `provisional`) until
   * the phone re-confirms it after the call (`reconfirmedAt`) or the user
   * takes it back (`revoked`).
   */
  provisional?: boolean;
  /** When the phone re-confirmed a provisional approval after the call. */
  reconfirmedAt?: string | null;
  /** The user took this approval back on the phone: end what was built on it. */
  revoked?: boolean;
  /** `COACHED`: someone on the phone told the user to approve. `UNDO`: the user undid it. */
  revokeReason?: 'UNDO' | 'COACHED' | null;
  /**
   * A request made with `reply`, once the person typed it back: the ciphertext only. Open it
   * with `openCodeReply(privateKey, requestId, reply.ct)`. A CONFIRMED request without it was
   * approved without typing (an older app).
   */
  reply?: { ct: string; at?: string | null };
}

export interface WaitForApprovalOptions {
  requestId: string;
  /** How long to poll in total, ms (default: 30000 = 30s) */
  timeout?: number;
  /** Polling interval, ms (default: 1500) */
  pollInterval?: number;
}

/**
 * What `login.verify()` hands `onChallenge` as soon as the request exists,
 * before it waits: show `challengeCode` to the user now; the phone asks for it.
 */
export interface VerifyChallenge {
  requestId: string;
  /** The number to show when number matching is on (absent otherwise). */
  challengeCode?: string;
  expiresAt: string;
  /** Why number matching is needed (absent for a plain push). */
  reasons?: RiskReason[];
  /** The "Why?" case code of this decision. */
  caseCode?: string;
}

/** Options of `login.verify()` on top of the request's own. */
export interface VerifyOptions extends LoginRequestOptions {
  /** How long to wait for the user, in ms (default 30 000). */
  timeout?: number;
  pollInterval?: number;
  /**
   * Called once, right after the request is created and before any waiting,
   * with the number to show (number matching: the phone asks the user for
   * it). Not called when only a passkey can approve (verify() then throws
   * TouchquePasskeyRequiredError at once). An error it throws, or a promise
   * it returns that rejects, is logged and ignored: verify() keeps waiting.
   * Its return value is otherwise ignored.
   */
  onChallenge?: (challenge: VerifyChallenge) => unknown;
}

export interface WaitForApprovalResult {
  approved: boolean;
  status: LoginStatus;
}

// ─── Risk Resource (silent sign-ins) ─────────────────────────────

export interface RiskCheckOptions {
  /** User identifier in YOUR system */
  externalUsername: string;
  /** The action the user is about to do (default `'LOGIN'`). A critical action always asks. */
  type?: LoginType;
  /** End user's IP address: compared with the networks of the user's earlier approved sign-ins. */
  clientIp?: string;
  userAgent?: string;
  /** The browser's device-bound key proof (`X-Touchque-Browser`), passed through untouched. */
  browserProof?: string;
  /** The end user's page check from `@touchque/web` (`startClientSignals().encode()`): software driving the browser is never silent. */
  clientSignals?: string;
  /** The page's device report from `@touchque/web` (`deviceRisk.collect({ purpose: 'sign_in' })`): a device signal is never silent. */
  deviceRisk?: string;
  /** The page's identification (`deviceRisk.identify()`'s requestId), preferred over `deviceRisk`. */
  deviceRiskRequestId?: string;
  /**
   * Your own limit on how long ago the last phone approval in this browser
   * may be, in seconds (integer, 0 = always ask). Touchque never goes beyond
   * its own limit (7 days).
   */
  maxAgeSeconds?: number;
  /** For your Touchque Actions only (`event.context`). Any JSON object up to 4 KB. */
  context?: Record<string, unknown>;
}

/** One reason behind a `risk.check` answer. Show `text` or translate `code`. */
export interface RiskReason {
  /**
   * Why it was silent: `known_browser`, `recent_approval`, `same_phone`,
   * `familiar_network`, `no_risk_signal`. Why it asks: `no_browser_key`,
   * `new_browser`, `approval_too_old`, `policy_every_sign_in`, `other_phone`,
   * `new_country`, `new_network`, `network_unknown`, `hosting_network`,
   * `critical_action`, `sensitive_action`, `risk_signal`, `push_fatigue`,
   * `fraud_report`, `new_factor`, `vishing_shield`, `checks_incomplete`,
   * `silent_mode_shadow`, `phone_not_linked`, `frozen`, … New codes are added
   * in minor versions. `action`: one of your Touchque Actions asked
   * (`text` is its reason, `action` its slug).
   */
  code: string;
  /** English text. */
  text: string;
  /** With `code: 'action'`: the slug of the Action. */
  action?: string;
}

export interface RiskCheckResult {
  /**
   * `false` only when Touchque answered exactly `prompt: false`: nothing
   * about this sign-in is new, let the user in without a push. Anything else
   * (including an unreadable answer) is `true`: ask on the phone as usual.
   */
  prompt: boolean;
  reasons: RiskReason[];
  /**
   * "Why?" case code of this decision (`K7P-2QX`). Show it to the user ("Tell
   * your support team: K7P-2QX"); your team opens the whole decision (each
   * check, the rule that matched, what would have let it through) by this code
   * in the dashboard (Logs → Look up a case).
   */
  caseCode?: string;
  /** How sure Touchque is that this is the user (default `'normal'`). */
  assurance: 'high' | 'normal' | 'low';
  /**
   * `'shadow'`: silent sign-ins are only measured for this workspace, so
   * `prompt` is always true and the reasons say what would have happened.
   */
  silentMode: 'enforce' | 'shadow';
}

export interface RiskBrowsersOptions {
  externalUsername: string;
}

/** A browser Touchque knows for a user: one the user approved on the phone (or with a passkey). */
export interface RiskBrowser {
  /** RFC 7638 thumbprint of the browser's key: pass it to `forgetBrowsers` to forget this one. */
  thumbprint: string;
  label: string | null;
  createdAt: string;
  /** Last phone or passkey approval in this browser. */
  lastMfaAt: string | null;
  /** How that approval was given, e.g. `'push'` or `'passkey'`. */
  lastMfaMethod: string | null;
  lastSeenAt: string | null;
  /** Last sign-in Touchque let through without asking. */
  lastSilentAt: string | null;
}

export interface RiskBrowsersResponse {
  browsers: RiskBrowser[];
}

export interface ForgetBrowsersOptions {
  externalUsername: string;
  /** One browser; leave out to forget every browser of the user (e.g. after a password reset). */
  thumbprint?: string;
}

export interface ForgetBrowsersResponse {
  forgotten: number;
}

// ─── Recovery Resource (Never Locked Out) ────────────────────────

export type RecoveryStatus = 'AWAITING_DEVICE' | 'VOUCHING' | 'COOLING' | 'COMPLETED' | 'VETOED' | 'EXPIRED' | 'FAILED';

export interface RecoveryVoucherEligibility {
  externalUsername: string;
  /** Can vouch today: a linked phone with a hardware key, not frozen, not on probation. */
  eligible: boolean;
  /** Why not: `no_phone`, `no_hardware_key`, `keys_lost`, `frozen`, `on_probation`, `same_phone`. */
  reason?: string;
}

export interface RecoveryVouchersResponse {
  externalUsername: string;
  vouchers: RecoveryVoucherEligibility[];
  updatedAt: string | null;
  /** The user's own account is on probation after a vouch recovery until then. */
  probationUntil: string | null;
}

export interface SetRecoveryVouchersOptions {
  externalUsername: string;
  /** Other users of your workspace; at most 5 are kept. Ask for the user's phone before you change it. */
  vouchers: string[];
}

export interface StartRecoveryOptions {
  externalUsername: string;
  /** The user's IP address (the risk engine and the vouchers see it). */
  clientIp?: string;
  userAgent?: string;
  /** How the vouchers know the user. */
  displayName?: string;
  /** Fill up a short named list, e.g. with the organization's admins. */
  fallbackVouchers?: string[];
  /** More vouchers than the floor of 2. */
  required?: number;
  /** A longer cooling-off than the floor of 15 minutes (default 60). */
  coolOffMinutes?: number;
  /** What the vouchers' phones show instead of the default English lines. */
  details?: Array<{ label: string; value: string }>;
  /** What the old phone shows (approve to move now, reject to stop) instead of the default English lines. */
  noticeDetails?: Array<{ label: string; value: string }>;
}

export interface RecoveryVoucherState {
  externalUsername: string;
  source?: 'nominated' | 'fallback';
  state: 'waiting' | 'pending' | 'approved' | 'expired' | 'unreachable';
  /** The number this voucher must type, while their request is open. */
  code: string | null;
}

export interface RecoveryReceipt {
  seq: number;
  at: string;
  step: string;
  actor: Record<string, unknown>;
  data: Record<string, unknown>;
  prev: string | null;
  hash: string;
}

export interface RecoveryCase {
  recoveryId: string;
  externalUsername: string;
  method: 'vouch' | 'old_phone' | 'transfer';
  status: RecoveryStatus;
  required: number;
  approvals: number;
  vouchers: RecoveryVoucherState[];
  oldPhone: { notified: boolean; code: string | null };
  coolOffMinutes: number;
  coolOffUntil: string | null;
  elevated: boolean;
  reasons: string[];
  location: string | null;
  newPhoneBound: boolean;
  expiresAt: string;
  completedAt: string | null;
  endedReason: string | null;
  endedBy: string | null;
  createdAt: string;
  receipts: RecoveryReceipt[];
}

export interface RecoveryStarted extends RecoveryCase {
  /** One-time; shown once. */
  bindCode: string;
  /** Show it as a QR: the Touchque app on the new phone scans it. */
  bindUri: string;
}

export interface VetoRecoveryOptions {
  /** Who stopped it, e.g. the admin's e-mail (shown in the receipts). */
  by?: string;
  /** Default `partner_veto`. */
  reason?: string;
}

export interface ListRecoveriesOptions {
  externalUsername?: string;
  /** Only running recoveries of the workspace. */
  open?: boolean;
}

// ─── Webhook Resource ────────────────────────────────────────────

export interface VerifyWebhookOptions {
  /** Raw request body as string, exactly as received (before JSON.parse). */
  rawBody: string;
  /**
   * The signature to check against. Pass the value of the `x-signature`
   * header. Optional: if omitted, the SDK falls back to the `signature`
   * field Touchque also embeds in the JSON body.
   */
  signature?: string;
  /**
   * Reject the webhook if its `timestamp` is more than this many seconds
   * from now (replay protection). Default 300 (5 minutes). Set to 0 to
   * disable the freshness check.
   */
  toleranceSeconds?: number;
  /**
   * De-duplicates deliveries by their signed `jti`. A second delivery with
   * the same `jti` throws `TouchqueWebhookReplayError`. Use
   * `MemoryWebhookReplayCache` for a single process, or implement this
   * interface over Redis / your database when you run several instances.
   */
  replayCache?: WebhookReplayCache;
}

/**
 * Storage for webhook `jti`s already accepted. `checkAndSet` must atomically
 * record `jti` for `ttlSeconds` and return `true` if it was NOT seen before.
 */
export interface WebhookReplayCache {
  checkAndSet(jti: string, ttlSeconds: number): boolean;
}

export interface WebhookPayload {
  event: string;
  requestId: string;
  externalUsername: string;
  /**
   * A login result: `SUCCESS` or `REJECTED`. An event webhook may carry its
   * own (a recovery's, for example).
   */
  status: 'SUCCESS' | 'REJECTED' | (string & {});
  timestamp: string;
  /**
   * On a SUCCESS webhook, the approving phone's device-signed proof of what
   * was approved (when it holds a Secure Enclave key). Check it with
   * `verifyApprovalProof` before releasing money or data.
   */
  approvalProof?: import('./approvalProof').ApprovalProof;
  /** On SUCCESS: how it was approved and whether that was phishing-resistant. */
  assurance?: ApprovalAssurance;
  /** On REJECTED: why (see `WebhookReasons`). Treat unknown values as a rejection. */
  reason?: string;
  /** On SUCCESS: approved during a call (Vishing Shield); an `APPROVAL_RECONFIRMED` or `APPROVAL_REVOKED` event follows. */
  provisional?: boolean;
  [key: string]: unknown;
}

/**
 * `reason` values of a REJECTED login webhook. Treat a value you do not know
 * as a rejection: new ones are added in minor versions.
 */
export const WebhookReasons = {
  /** The user tapped Reject. */
  USER_REJECTED: 'user_rejected',
  /** The user said "this wasn't me": 2FA is frozen. */
  USER_REPORTED_FRAUD: 'user_reported_fraud',
  /** The user said someone on the phone told them to approve: 2FA is frozen; treat it as a takeover in progress. */
  USER_REPORTED_COACHED: 'user_reported_coached',
  /** An AI agent's request: the user said no and blocked the agent from asking them again (no 2FA freeze). */
  USER_BLOCKED_AGENT: 'user_blocked_agent',
  /** Approved, then refused by the risk engine on evidence seen at the tap. */
  RISK_REVERSED: 'risk_reversed',
  /** Refused for now; the user's next request asks for number matching. */
  RISK_STEP_UP: 'risk_step_up',
  /** The approval carried a device signature that did not verify. */
  APPROVAL_SIGNATURE_INVALID: 'approval_signature_invalid',
  /** The phone reports itself jailbroken or tampered and the action is critical. */
  DEVICE_INTEGRITY_FAILED: 'device_integrity_failed',
  /** Vishing Shield: approved during a call (or with the screen shared / remote-controlled), critical, and no passkey to fall back on. */
  VISHING_SUSPECTED: 'vishing_suspected',
  /** Mirror Alarm: the sign-in page was not on your site (a real-time phishing proxy). */
  PHISHING_ORIGIN: 'phishing_origin',
} as const;

/**
 * `event` values of Touchque's event webhooks (same `callbackUrl` as the
 * login results). Ignore types you do not know.
 */
export const WebhookEvents = {
  DEVICE_LINKED: 'DEVICE_LINKED',
  DEVICE_UNLINKED: 'DEVICE_UNLINKED',
  PASSKEY_REGISTERED: 'PASSKEY_REGISTERED',
  PASSKEY_DELETED: 'PASSKEY_DELETED',
  /** Device risk: an identification or a deviceRisk.check raised a signal that asks for more (enforced or in shadow). Never a trait. */
  DEVICE_RISK_SIGNAL: 'DEVICE_RISK_SIGNAL',
  /** Device risk: an alert rule of the workspace went off (a sign-up burst, many accounts, a tampered-browser spike). */
  DEVICE_RISK_ALERT: 'DEVICE_RISK_ALERT',
  /** After the call, the user confirmed a provisional approval was theirs: critical actions are allowed again. */
  APPROVAL_RECONFIRMED: 'APPROVAL_RECONFIRMED',
  /** The user took an approval back (`reason`: `COACHED` or `UNDO`): end the session or stop the action built on it. */
  APPROVAL_REVOKED: 'APPROVAL_REVOKED',
  /** Mobile SDK: send this push to your app with your own APNs / FCM keys (`mobilePushFromWebhook`). */
  MOBILE_PUSH: 'MOBILE_PUSH',
  // Never Locked Out (tq.recovery): each carries `recoveryId` and `status`.
  /** A recovery started for a user whose phone is gone. */
  RECOVERY_STARTED: 'RECOVERY_STARTED',
  /** The new phone scanned the recovery QR. */
  RECOVERY_DEVICE_BOUND: 'RECOVERY_DEVICE_BOUND',
  /** Enough vouchers approved; the cooling-off runs until `coolOffUntil`. */
  RECOVERY_COOLING: 'RECOVERY_COOLING',
  /** The account moved to the new phone (`method`: `vouch` or `old_phone`; `probationUntil` after a vouch). */
  RECOVERY_COMPLETED: 'RECOVERY_COMPLETED',
  /** The old phone, a voucher or an admin stopped the recovery (`reason`, `by`). */
  RECOVERY_VETOED: 'RECOVERY_VETOED',
  /** The recovery ran out of time, or a new one replaced it (`reason`). */
  RECOVERY_EXPIRED: 'RECOVERY_EXPIRED',
  /** The recovery failed (`reason`: `not_enough_approvals`, `new_phone_key_changed`, `account_gone`). */
  RECOVERY_FAILED: 'RECOVERY_FAILED',
  // Help desk (tq.assist): each carries `assistId` (except ASSIST_CLAIM_UNVERIFIED), `agentRef` and `agentName`.
  /** An IT agent opened a help-desk session on a person's account. */
  ASSIST_OPENED: 'ASSIST_OPENED',
  /** The help-desk session ended (`reason`). */
  ASSIST_ENDED: 'ASSIST_ENDED',
  /** The person confirmed on their phone that they are on the call with IT (`requestId`, `action`, `caseCode`). */
  ASSIST_CHECK_PASSED: 'ASSIST_CHECK_PASSED',
  /** The check failed (`outcome`: `wrong_number`, `not_me`, `coached`, `declined`): page someone. */
  ASSIST_CHECK_FAILED: 'ASSIST_CHECK_FAILED',
  /** The help desk lifted the person's 2FA freeze after a passed check on their phone (`requestId`). */
  ASSIST_UNFROZEN: 'ASSIST_UNFROZEN',
  /** The person checked on their phone that the IT agent working on their account is real. */
  ASSIST_CLAIM_CONFIRMED: 'ASSIST_CLAIM_CONFIRMED',
  /** Someone said they were from IT and nobody from IT was working on the account (`caseCode`): page someone. */
  ASSIST_CLAIM_UNVERIFIED: 'ASSIST_CLAIM_UNVERIFIED',
  // AI agents (tq.agents): changes partners may act on, and what Touchque noticed.
  /** An AI agent was registered. */
  AGENT_CREATED: 'AGENT_CREATED',
  /** An AI agent was suspended (through the API or the dashboard): its tokens stopped working. */
  AGENT_SUSPENDED: 'AGENT_SUSPENDED',
  /** An AI agent may act again. */
  AGENT_RESUMED: 'AGENT_RESUMED',
  /** An AI agent was revoked for good. */
  AGENT_REVOKED: 'AGENT_REVOKED',
  /** A key was added to an AI agent. */
  AGENT_KEY_ADDED: 'AGENT_KEY_ADDED',
  /** A key was removed from an AI agent; tokens bound to it stopped working. */
  AGENT_KEY_REMOVED: 'AGENT_KEY_REMOVED',
  /** The kill switch stopped every AI agent of the workspace. */
  AGENTS_PAUSED: 'AGENTS_PAUSED',
  /** The kill switch was turned off. */
  AGENTS_RESUMED: 'AGENTS_RESUMED',
  /** An AI agent's policy changed. */
  AGENT_POLICY_CHANGED: 'AGENT_POLICY_CHANGED',
  /** The workspace's agent policy (every agent's floor) changed. */
  AGENT_WORKSPACE_POLICY_CHANGED: 'AGENT_WORKSPACE_POLICY_CHANGED',
  /** An approval token was used. */
  AGENT_APPROVAL_REDEEMED: 'AGENT_APPROVAL_REDEEMED',
  /** A person stopped an AI agent from asking them ("this wasn't me", coached, or three rejections). */
  AGENT_BLOCKED_BY_PERSON: 'AGENT_BLOCKED_BY_PERSON',
  /** An admin let an AI agent ask a person again. */
  AGENT_UNBLOCKED_FOR_PERSON: 'AGENT_UNBLOCKED_FOR_PERSON',
  /** An AI agent sent the same request to the same person three times in 10 minutes. */
  AGENT_LOOP_DETECTED: 'AGENT_LOOP_DETECTED',
  /** An AI agent asked a person for a mandate. */
  AGENT_MANDATE_REQUESTED: 'AGENT_MANDATE_REQUESTED',
  /** A mandate was ended. */
  AGENT_MANDATE_REVOKED: 'AGENT_MANDATE_REVOKED',
  /** An AI agent's text carried an instruction to the model or a link that carries data; the request was refused. */
  AGENT_INJECTION_SUSPECTED: 'AGENT_INJECTION_SUSPECTED',
  /** An approval came back sooner than a person can answer; it is never usable. */
  AGENT_INHUMAN_APPROVAL: 'AGENT_INHUMAN_APPROVAL',
  /** A new or renamed AI agent's name read like another agent's; it was refused. */
  AGENT_LOOKALIKE_NAME: 'AGENT_LOOKALIKE_NAME',
} as const;

// ─── Protect Wrapper ─────────────────────────────────────────────

export interface ProtectOptions<TArgs extends any[]> {
  /** The action type (e.g. 'WITHDRAW', 'LOGIN') */
  type: string;
  /** Function to extract the externalUsername from the wrapped function's arguments */
  getUserIdentifier: (...args: TArgs) => string;
  /** Optional function to extract a referenceId from the arguments */
  getReferenceId?: (...args: TArgs) => string | undefined;
  /**
   * Optional function returning the end user's request context (IP address,
   * User-Agent) and transaction details shown on the approval screen.
   */
  getContext?: (...args: TArgs) => Pick<LoginRequestOptions, 'clientIp' | 'userAgent' | 'details'> | undefined;
  /** Timeout in ms */
  timeout?: number;
  /** Polling interval in ms */
  pollInterval?: number;
  /** Show the number to the user as soon as the request exists (see `VerifyOptions.onChallenge`). */
  onChallenge?: VerifyOptions['onChallenge'];
}

// ─── Errors ──────────────────────────────────────────────────────

export interface TouchqueErrorData {
  error?: string;
  message?: string;
  code?: string;
  /** Offline sign: why a code was not approved (`invalid_code`, `locked`, `expired`, `used`, …). */
  reason?: string;
  /** Offline sign: wrong codes left before the challenge locks. */
  attemptsLeft?: number;
  /** Seconds to wait before retrying (429 / 423). */
  retryAfter?: number;
  /** "Why?" case code of a refusal (`K7P-2QX`), to show the user. */
  caseCode?: string;
  /** Where to send the user instead, e.g. `never_locked_out` on a help-desk check with no phone. */
  route?: string;
  /** The feature a `feature_not_in_plan` / `feature_read_only` / `feature_off` refusal is about (`device_risk`…). */
  feature?: string;
}

// ─── Help desk (assist sessions) ─────────────────────────────────

export interface OpenAssistOptions {
  /** The person IT is helping. */
  externalUsername: string;
  /** The signed-in agent: `name` (and `title`) are shown on the person's phone; `ref` is your id for them (default `name`). */
  agent: { name: string; title?: string; ref?: string };
  /** A ticket or a few words, for the log. */
  reason?: string;
  /** 5–120. Default 30. */
  ttlMinutes?: number;
  /** Send the person's phone the calm notice. Default true. */
  notify?: boolean;
}

export type AssistCheckOutcome = 'pending' | 'verified' | 'wrong_number' | 'not_me' | 'coached' | 'declined' | 'expired';

export interface AssistCheck {
  requestId: string;
  action: string;
  actionText: string;
  outcome: AssistCheckOutcome;
  createdAt: string;
  spentAt: string | null;
  expiresAt: string | null;
}

export interface AssistSession {
  id: string;
  externalUsername: string;
  status: 'OPEN' | 'ENDED';
  agent: { ref: string; name: string; title: string | null };
  reason: string | null;
  notified: boolean;
  openedAt: string;
  expiresAt: string;
  endedAt: string | null;
  /** `ended`, `expired`, `replaced`, or yours. */
  endedReason: string | null;
  /** The person has a working Touchque phone to check on; false: Never Locked Out. */
  phone: boolean;
  frozen: boolean;
  checks: AssistCheck[];
}

export interface VerifyAssistOptions {
  /** `reset_2fa`, `reset_password`, `activation_link`, `recovery_link`, `unlock`, `new_phone`, `remove_passkey`, or your own (lowercase, digits, underscores). */
  action: string;
  /** Shown on the phone: "IT (<agent>) is about to <actionText>". */
  actionText?: string;
  /** Your own lines for the phone instead of the default. */
  details?: Array<{ label: string; value: string }>;
}

export interface AssistCheckStarted {
  requestId: string;
  /** Show it to the agent only: they read it to the person, who types it on the phone. */
  challengeCode: string;
  expiresAt: string;
  action: string;
}

// ── QR pairing (tq.qrPairings) ──

/** Where a browser pairing stands. */
export type QrPairingState = 'waiting' | 'scanned' | 'confirmed' | 'requested' | 'approved' | 'refused' | 'reported' | 'expired';

export interface CreateQrPairingOptions {
  /** RFC 7638 thumbprint of the browser's key, base64url (`@touchque/web` `browserKey.thumbprint()`). */
  keyThumbprint: string;
  /** The end user's IP: the phone is told where the browser is and whether it is on the same network. */
  clientIp?: string;
  /** The end user's User-Agent. */
  userAgent?: string;
  /** A short name the phone shows, e.g. "Chrome 155". */
  browser?: string;
  /** E.g. "macOS 15". */
  os?: string;
  /** How long the QR code can be scanned: 30 to 300 seconds (default 120). */
  ttlSeconds?: number;
}

export interface CreatedQrPairing {
  pairingId: string;
  expiresAt: string;
  /** The one-time nonce in the QR code (Touchque keeps only its SHA-256). */
  nonce: string;
  /** What the QR code says: `touchque://pair-browser?v=1&p=…&n=…&k=…`. */
  uri: string;
}

export interface QrPairingProximity {
  sameNetwork: boolean | null;
  sameCountry: boolean | null;
  /** `different_country`, `different_network`. */
  warnings: string[];
}

export interface QrPairing {
  pairingId: string;
  state: QrPairingState;
  keyThumbprint: string;
  expiresAt: string;
  /** The login request made with this pairing, once asked. */
  requestId?: string | null;
  /** Present once scanned: the user whose account is on the phone that scanned. */
  externalUsername?: string;
  scannedAt?: string;
  confirmedAt?: string | null;
  phone?: { country: string | null; location: string | null };
  browser?: { country: string | null; location: string | null };
  proximity?: QrPairingProximity;
  /** Why it was refused (by you, or declined on the phone). */
  outcome?: { reason: string; message: string; caseCode: string | null; deviceCode: string | null; at: string };
  /** The person said someone told them to scan it: their 2FA is frozen. */
  reportedAt?: string;
}

export interface RefuseQrPairingOptions {
  reason: 'policy' | 'device_not_approved' | 'too_many_browsers' | 'rate_limited' | 'no_account' | 'other';
  /** What the phone shows, up to 300 characters of plain text. */
  message: string;
  /** A "Why?" case code for your support team (`ABC-123`). */
  caseCode?: string;
  /** Your code for the computer (`ABC-123`), shown on the phone. */
  deviceCode?: string;
}

// ── Device risk ─────────────────────────────────────────────────────────────

/** The page a device report comes from. Device risk is for these pages only. */
export type DeviceRiskEvent = 'sign_in' | 'sign_up' | 'password_reset' | 'approval';

/** `deviceRisk.check(requestId, options)`: everything but the page's requestId. */
export interface DeviceRiskCheckRequest {
  /** Instead of a requestId: the page's report (`deviceRisk.collect()`), relayed untouched. */
  deviceRisk?: string | null;
  /** What the page is (default `'sign_in'`). */
  event?: DeviceRiskEvent;
  /** The account the page is for, when there is one (accounts per visitor). One account per identification. */
  externalUsername?: string;
  /** The end user's address; default: the address the browser identified from. */
  clientIp?: string;
}

export interface DeviceRiskCheckOptions {
  /**
   * The page's identification: the `touchque_request_id` form field the
   * script tag fills, or `deviceRisk.identify()` in `@touchque/web`. As it
   * came: missing or empty is answered `report: 'missing'`.
   */
  requestId?: string | null;
  /** Or the page's report (`deviceRisk.collect()`), relayed untouched. */
  deviceRisk?: string | null;
  /** What the page is (default `'sign_in'`). */
  event?: DeviceRiskEvent;
  /** The account the page is for, when there is one (accounts per visitor). One account per identification. */
  externalUsername?: string;
  /** The end user's address; default: the address the browser identified from. */
  clientIp?: string;
}

/** A device signal. Each one only ever asks for more; none blocks. */
export interface DeviceRiskSignal {
  /**
   * `device_tampered`, `device_virtual`, `device_geo_mismatch`, `device_many_accounts`,
   * `device_signup_burst`, `device_id_resets`, `device_many_countries`, `device_wrong_site`,
   * `device_report_replayed`, `device_private_window` (context only), `device_step_up_by_admin`,
   * `device_identification_missing` (the page sent no identification, or one that does not verify).
   * New codes are added in minor versions.
   */
  code: string;
  text: string;
  /** What a step-up for it should be; `none`: context only. */
  strength: 'number_match' | 'passkey' | 'none';
  /** Scored now; false: reported only (shadow) until Touchque enforces it. */
  enforced?: boolean;
  evidence?: Record<string, unknown>;
}

/** The visitor as the API shows it: coarse labels only. */
export interface DeviceRiskVisitor {
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  /** Your admin's mark. */
  status: 'none' | 'trusted' | 'step_up';
  labels: Record<string, unknown>;
  matchedBy?: 'key' | 'sid' | 'traits' | 'new';
  sealed?: boolean;
}

/** The address as the risk engine saw it for an event: the place (never coordinates), the operator, the kind of network. */
export interface DeviceRiskNetwork {
  countryCode: string | null;
  region: string | null;
  city: string | null;
  /** How far off the place can be. */
  accuracyKm: number | null;
  timeZone: string | null;
  asn: number | null;
  /** The network operator. */
  asnOrg: string | null;
  /** `hosting`: a cloud or hosting network (scripts, proxies and many VPNs come from one). */
  type: 'isp' | 'hosting' | 'tor' | 'unknown';
  tor: boolean;
  hosting: boolean;
  hostingProvider: string | null;
  /** The browser's clock is 2 h or more off the address's time zone: a VPN or proxy in another country. */
  timezoneMismatch: boolean | null;
}

/** The visitor's counts: the risk engine's (accounts, sign-ups, countries, stored-id resets) and Touchque's identifications. */
export interface DeviceRiskVelocity {
  accounts24h: number | null;
  accounts30d: number | null;
  signUps24h: number | null;
  countries24h: number | null;
  idResets7d: number | null;
  identifications1h: number | null;
  identifications24h: number | null;
}

/** One answer to "a bot?", summing up the signals (the risk engine still decides). */
export interface DeviceRiskBot {
  /** `detected`: the browser says it is driven (webdriver, headless); `suspected`: the pointer moved like software, a zero-size window, software graphics. */
  result: 'detected' | 'suspected' | 'not_detected';
  reasons: Array<'webdriver' | 'headless' | 'pointer_synthetic' | 'zero_window' | 'soft_gpu'>;
}

/** `deviceRisk.searchEvents(options)`: a date range (7 days by default, at most 90, within the retention) and any filters. */
export interface DeviceRiskSearchOptions {
  /** Start: a Date, `YYYY-MM-DD` (UTC) or an ISO time. Default: 7 days before `to`. */
  from?: Date | string;
  /** End: a Date, `YYYY-MM-DD` (UTC, the whole day) or an ISO time. Default: now. */
  to?: Date | string;
  /** Only identifications that raised this signal code. */
  signal?: string;
  /** true: only the ones that asked for more; false: only the others. */
  stepUp?: boolean;
  /** The page. */
  kind?: DeviceRiskEvent;
  /** The page's origin, like https://shop.example.com. */
  origin?: string;
  /** An address or a CIDR range ('203.0.113.0/24'). A filter only: no answer carries an address. */
  ip?: string;
  /** The account (externalUsername). */
  account?: string;
  visitorId?: string;
  requestId?: string;
  /** The previous page's `nextCursor`, as it came. */
  cursor?: string | null;
  /** 1 to 100, default 25. */
  limit?: number;
}

/** One identification in a search: no address and no raw trait. */
export interface DeviceRiskIdentification {
  requestId: string;
  at: string;
  visitorId: string;
  kind: DeviceRiskEvent;
  origin: string | null;
  externalUsername: string | null;
  country: string | null;
  network: DeviceRiskNetwork | null;
  confidence: number | null;
  matchedBy: 'key' | 'sid' | 'traits' | 'new' | null;
  sealed: boolean;
  stepUp: boolean;
  signals: Array<{ code: string; enforced: boolean }>;
  caseCode: string | null;
  bot: DeviceRiskBot | null;
}

/** One page of `deviceRisk.searchEvents()`: pass `nextCursor` back until it is null. */
export interface DeviceRiskSearchResult {
  events: DeviceRiskIdentification[];
  nextCursor: string | null;
  from: string;
  to: string;
}

/** An identification as Touchque saw it (GET /device-risk/events/:requestId): trust this, never the page's copy. */
export interface DeviceRiskEventResult {
  requestId: string;
  /** `tqv_…`: this browser in your workspace only. */
  visitorId: string;
  confidence: number;
  matchedBy: 'key' | 'sid' | 'traits' | 'new';
  sealed: boolean;
  purpose: DeviceRiskEvent;
  origin: string | null;
  country: string | null;
  createdAt: string;
  usedAt: string | null;
  externalUsername: string | null;
  visitor: DeviceRiskVisitor;
  facts: { codes: string[]; evidence: Record<string, unknown>; reset: boolean; twins: boolean; privateWindow: boolean };
  /** The risk engine's verdict (null before the engine answered). */
  verdict: { stepUp: boolean; wouldStepUp: boolean; requires: string; mode: string; signals: DeviceRiskSignal[]; caseCode: string | null } | null;
  network: DeviceRiskNetwork | null;
  velocity: DeviceRiskVelocity;
  bot: DeviceRiskBot;
}

export interface DeviceRiskCheckResult {
  /**
   * What the page had sent: `ok`; `replayed` (another account, or sent twice);
   * or no usable identification, which raises `device_identification_missing`:
   * `missing` (none or empty: the tag removed or blocked), `unknown` (made up,
   * or another workspace's), `expired` (over 15 minutes old), `invalid` (a
   * relayed report that cannot be read).
   */
  report: 'ok' | 'replayed' | 'missing' | 'unknown' | 'expired' | 'invalid';
  requestId: string | null;
  /** `tqv_…`: this browser in your workspace only. */
  visitorId: string | null;
  confidence: number | null;
  visitor: DeviceRiskVisitor | null;
  /** The risk engine's counts for this visitor. */
  counts: Record<string, number> | null;
  /** The address (never coordinates); null without one. */
  network: DeviceRiskNetwork | null;
  /** The visitor's counts; null without a usable identification. */
  velocity: DeviceRiskVelocity | null;
  /** One answer to "a bot?"; null without a usable identification. */
  bot: DeviceRiskBot | null;
  signals: DeviceRiskSignal[];
  /** Ask for more on this page (an emailed code, a passkey, a number-matched approval). Never a reason to refuse. */
  stepUp: boolean;
  /** A signal that asks was raised, enforced or not. */
  wouldStepUp: boolean;
  requires: 'none' | 'number_match' | 'passkey';
  /** `enforce` when at least one raised signal is enforced. */
  mode: 'shadow' | 'enforce';
  /** The engine's state for this check; `'unavailable'` when the risk engine could not be reached and the verdict is a safe default. */
  engine: string | null;
  /** "Why?": the decision record, opened by this code in the dashboard. */
  caseCode?: string;
}

/** `login.request` `reply`: what the person types back on the phone, encrypted to `key`. */
export interface LoginReplyRequest {
  kind: 'code';
  /** Your one-time P-256 public key: `newCodeReplyKey().publicKey`. */
  key: string;
  /** Where the code went, shown on the phone. */
  channel?: 'sms' | 'whatsapp' | 'email' | 'app' | 'backup' | 'other';
  /** The masked number or address it went to (`+**********26`), shown on the phone; at most 40 characters. */
  target?: string;
}

// ─── Safe Guard (Safe transactions approved on the phone) ────────

/** How TouchqueSafeGuard treats a transaction: `governance` is scheduled and waits; `exit` is the emergency exit. */
export type SafeTxClass = 'tighten' | 'ordinary' | 'governance' | 'exit';

/** The guard's settings for this Safe, as you read them from chain. */
export interface SafeGuardConfig {
  threshold: number;
  govThreshold: number;
  /** Seconds. */
  govDelay: number;
  /** Seconds. */
  exitDelay: number;
  /** With the address lock on, a payment or allowance outside the address book is a governance change. */
  recipientLock?: boolean;
}

/** An entry of the guard's address book: the phone names the address with its label. */
export interface SafeGuardRecipient {
  address: string;
  /** At most 64 bytes, without control, bidi or invisible characters. */
  label?: string;
}

/** The raw Safe transaction and what the phone needs to decode it like the guard. */
export interface SafeGuardTx extends SafeTxTarget {
  config: SafeGuardConfig;
  /** MultiSendCallOnly contracts the guard opens call by call (at most 5). */
  batchTargets?: string[];
  recipients?: SafeGuardRecipient[];
  /** This approver's index in the guard: the approval names it. */
  approverIndex: number;
  /** The language of the rows on the phone, `'tr'` by default. */
  locale?: 'en' | 'tr';
}

export interface SafeGuardRequestOptions {
  /** User identifier in YOUR system (the approver). */
  externalUsername: string;
  /** An action type from your dashboard. */
  type: string;
  safeTx: SafeGuardTx;
  /** Your own id for this transaction. */
  referenceId?: string;
  /** Seconds, 30 to 300 (default 300: reading a transaction takes longer than a sign-in). */
  expiresIn?: number;
  clientIp?: string;
  userAgent?: string;
}

export interface SafeGuardRequestResponse extends LoginRequestResponse {
  /** Touchque's own decoding, for your logs and screens. The phone decodes for itself. */
  safeTx: {
    class: SafeTxClass;
    flags: string[];
    safeTxHash: string;
    governanceHash: string | null;
    rows: SafeDisplayRow[];
  };
}

export interface SafeGuardStatusResponse {
  requestId: string;
  externalUsername: string;
  status: LoginStatus;
  /** Given during a call or after a risky Second Thought answer: the person confirms it again later. */
  provisional: boolean;
  safeTx: {
    class: SafeTxClass;
    flags: string[];
    safeTxHash: string;
    governanceHash: string | null;
    /** `approve`: append to the owners' signatures. `schedule`: send `guard.schedule`. */
    purpose: 'approve' | 'schedule';
    approverIndex: number;
    /** Once approved: the 105-byte approval, 0x hex. Check it with `verifySafeApproval`. */
    approval?: string;
    /** Once approved: Unix seconds. */
    expiresAt?: number;
  } | null;
}

// ─────────────────────────────────────────────────────────────
// From src/steps.ts — the headless step-up flow (start/check/complete)
// ─────────────────────────────────────────────────────────────

// src/steps.ts
// The headless step-up flow shared by every integration (Express, Next.js,
// touchqueRouter, or your own framework): start → show the step in YOUR UI →
// check → complete exactly once.
//
// A "step" is plain JSON that is safe to send to the browser: what state the
// approval is in and whatever the user has to see (the matching number, the
// enrollment QR code, the offline QR code). It never contains API secrets.

import * as crypto from 'crypto';
import type { HttpClient } from './core/HttpClient';
import type { Auth } from './resources/Auth';
import type { Login } from './resources/Login';
import type { Offline } from './resources/Offline';
import type { ApprovalAssurance, LoginRequestDetails, RiskReason } from './types';
import { TouchqueAPIError, TouchqueConfigError, TouchqueError } from './errors';
import { detailsDigest } from './approvalProof';

export type StepState =
  | 'waiting' // push sent — show `number` (if any) and wait
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'enroll' // no phone linked yet — show `enroll.qrCodeDataUrl`
  | 'passkey_required' // policy: approve with a passkey (browser ceremony)
  | 'offline' // offline approval started — show `offline.qrDataUrl` (and `offline.challengeCode`), ask for the code
  | 'blocked' // refused by policy / risk / action disabled — see `reason`
  | 'frozen' // too many rejections — see `retryAfter`
  | 'rate_limited'; // too many requests — see `retryAfter`

export interface Step {
  state: StepState;
  requestId?: string;
  /** Number matching: show this on screen; the user picks it on the phone. */
  number?: string;
  expiresAt?: string;
  /** Transaction details the phone shows (amount, recipient…). */
  details?: Array<{ label: string; value: string }>;
  enroll?: { qrCodeDataUrl: string; recoveryCodes?: string[]; expiresAt?: string };
  offline?: {
    challengeId: string;
    qrDataUrl?: string;
    expiresAt?: string;
    totpAvailable?: boolean;
    attemptsLeft?: number;
    /** Number matching: print this under the QR; the phone offers it among two decoys. */
    challengeCode?: string;
  };
  reason?: string;
  /**
   * "Why?" case code of this decision (`K7P-2QX`): show it with the step
   * ("Tell your support team: K7P-2QX"). Safe for the browser.
   */
  caseCode?: string;
  /** Why number matching, a passkey or a refusal (plain English, a fixed list, never a score). */
  reasons?: RiskReason[];
  retryAfter?: number;
  assurance?: ApprovalAssurance;
  /**
   * Only when the workspace collects behavioural signals: lets the browser
   * post them for this request (`@touchque/web` does it when given
   * `telemetry`). Scoped to this one request, not a credential.
   */
  telemetryToken?: string;
  /**
   * Mirror Alarm: the page showing this step loads `url` and beacons to it
   * (`@touchque/web` does it), so a phishing proxy in front of your site is
   * caught. Only on the first waiting step.
   */
  canary?: { url: string };
}

export interface StartOptions {
  /** Your user's id in YOUR system (email, user id…). */
  user: string;
  /** Shown on the phone and bound to the approval. Build it from server-side state. */
  details?: LoginRequestDetails;
  /** Your own transaction id, bound to the approval. */
  referenceId?: string;
  /** End user's IP / user agent (location and device shown on the phone). */
  ip?: string;
  userAgent?: string;
  /** Show an enrollment QR when the user has not linked a phone yet (default true). */
  enroll?: boolean;
  /**
   * Silent sign-ins: the browser's device-bound key proof (`X-Touchque-Browser`),
   * passed through untouched. Once the user approves, Touchque knows this browser.
   */
  browserProof?: string;
  /** For your Touchque Actions only (`event.context`): roles, plan, amount… Never shown on the phone. */
  context?: Record<string, unknown>;
}

export interface Approval {
  requestId: string;
  user: string;
  action: string;
  /** How it was approved; `phishingResistant` is true only for passkeys. */
  assurance: ApprovalAssurance | null;
  confirmedVia: string | null;
  /** Device-signed proof of what was approved (see verifyApprovalProof). */
  approvalProof: unknown;
  /**
   * Vishing Shield: approved on the phone during a call. Let the user in but
   * treat the session as limited: Touchque refuses their critical actions
   * until the phone re-confirms (`APPROVAL_RECONFIRMED`), and
   * `APPROVAL_REVOKED` means end it.
   */
  provisional?: boolean;
  /** The user took this approval back (see `revokeReason`). */
  revoked?: boolean;
  revokeReason?: 'UNDO' | 'COACHED' | null;
  reconfirmedAt?: string | null;
  /**
   * Silent sign-ins only (`assurance.method === 'silent'`, `confirmedVia: 'SILENT'`):
   * nothing was sent to the phone; why Touchque let this known browser in.
   */
  reasons?: RiskReason[];
}

type Resources = { http: HttpClient; auth: Auth; login: Login; offline: Offline };

/** Normalizes details the same way the API does: object or [{label, value}] → [{label, value}] strings. */
export function normalizeDetails(details?: LoginRequestDetails): Array<{ label: string; value: string }> {
  if (!details) return [];
  const pairs = Array.isArray(details)
    ? details.map((d) => [d.label, d.value] as const)
    : Object.entries(details as Record<string, unknown>);
  return pairs.map(([label, value]) => ({ label: String(label).trim(), value: String(value).trim() }));
}

const codeOf = (err: unknown): string | undefined =>
  err instanceof TouchqueAPIError ? (err.code || (err.data as { error?: string })?.error) : undefined;

/** Starts an approval for `action` — never waits. */
export async function start(r: Resources, action: string, opts: StartOptions): Promise<Step> {
  if (!opts?.user) throw new TouchqueConfigError('start() needs the user id (options.user)');
  const details = normalizeDetails(opts.details);
  try {
    const res = await r.login.request({
      externalUsername: opts.user,
      type: action,
      referenceId: opts.referenceId,
      clientIp: opts.ip,
      userAgent: opts.userAgent,
      details: details.length ? details : undefined,
      browserProof: opts.browserProof,
      context: opts.context,
    });
    const canary = res.canary && typeof res.canary.url === 'string' ? { canary: { url: res.canary.url } } : {};
    const why = whyOf(res);
    if (res.requiresPasskey) {
      return { state: 'passkey_required', requestId: res.requestId, expiresAt: res.expiresAt, details: details.length ? details : undefined, ...canary, ...why };
    }
    return {
      state: 'waiting',
      requestId: res.requestId,
      number: res.challengeCode || undefined,
      expiresAt: res.expiresAt,
      details: details.length ? details : undefined,
      ...(res.telemetryToken && { telemetryToken: res.telemetryToken }),
      ...canary,
      ...why,
    };
  } catch (err) {
    if (!(err instanceof TouchqueAPIError)) throw err;
    const code = codeOf(err);
    const data = err.data as { retryAfter?: number; reason?: string; error?: string };
    const why = err.caseCode ? { caseCode: err.caseCode } : {};
    if (err.status === 404 && (code === 'device_not_linked' || /linked device/i.test(err.message))) {
      if (opts.enroll === false) return { state: 'enroll' };
      return enrollStep(r, opts.user);
    }
    if (err.status === 423) return { state: 'frozen', retryAfter: data.retryAfter, ...why };
    if (err.status === 429) return { state: 'rate_limited', retryAfter: data.retryAfter, ...why };
    if (err.status === 400 && (code === 'unknown_action' || /Invalid action type/i.test(err.message))) {
      throw new TouchqueConfigError(
        `Unknown action "${action}". Create it once with tq.actionTypes.define('${action}') or in the Dashboard (Action Types).`,
      );
    }
    if (err.status === 403) {
      const reason = code === 'blocked' ? data.reason || 'policy'
        : code === 'passkey_not_registered' || data.error === 'phishing_resistant_required' ? 'passkey_not_registered'
          : code === 'action_disabled' ? 'action_disabled'
            : code || 'blocked';
      return { state: 'blocked', reason, ...why };
    }
    throw err;
  }
}

/** The case code and plain reasons of a login request's answer, for its step. */
function whyOf(res: { caseCode?: unknown; reasons?: unknown }): Pick<Step, 'caseCode' | 'reasons'> {
  const reasons = Array.isArray(res.reasons)
    ? res.reasons.filter((r): r is RiskReason => Boolean(r) && typeof (r as RiskReason).code === 'string')
      .map((r) => ({ code: r.code, text: typeof r.text === 'string' ? r.text : '' }))
    : [];
  return {
    ...(typeof res.caseCode === 'string' && res.caseCode && { caseCode: res.caseCode }),
    ...(reasons.length && { reasons }),
  };
}

/**
 * First-time linking: a fresh QR for a user with no phone. Never unlinks a phone:
 * a secret is only re-issued when the account is confirmed NOT linked.
 */
async function enrollStep(r: Resources, user: string): Promise<Step> {
  try {
    const gen = await r.auth.generateSecret({ externalUsername: user });
    return { state: 'enroll', enroll: { qrCodeDataUrl: gen.qrCodeDataUrl, recoveryCodes: gen.recoveryCodes, expiresAt: gen.expiresAt } };
  } catch (err) {
    if (!(err instanceof TouchqueAPIError) || err.status !== 409) throw err;
    const current = await r.auth.getUser({ externalUsername: user }).catch(() => null);
    if (current && (current.used || current.deviceId)) {
      // Linked in the meantime — the caller just starts again.
      return { state: 'enroll', reason: 'already_linked' };
    }
    // A QR was issued earlier and not scanned yet: issue a new one (no device to lose).
    const reset = await r.auth.resetSecret({ externalUsername: user });
    return { state: 'enroll', enroll: { qrCodeDataUrl: reset.qrCodeDataUrl as string, recoveryCodes: reset.recoveryCodes, expiresAt: reset.expiresAt } };
  }
}

/** Current state of a started approval. */
export async function check(r: Resources, requestId: string): Promise<Step> {
  const s = await r.login.status(requestId);
  const map: Record<string, StepState> = { PENDING: 'waiting', CONFIRMED: 'approved', REJECTED: 'rejected', EXPIRED: 'expired' };
  const state: StepState = s.status === 'PENDING' && s.requiresPasskey ? 'passkey_required' : map[s.status] || 'waiting';
  return { state, requestId, ...(state === 'approved' && s.assurance ? { assurance: s.assurance } : {}) };
}

export interface CompleteExpectations {
  user: string;
  action: string;
  details?: LoginRequestDetails;
  referenceId?: string;
}

/**
 * Uses an approved request exactly once and checks it is for THIS user, action and
 * transaction. Throws if it was already used, not approved, or approved for something else.
 */
export async function complete(r: Resources, requestId: string, expect: CompleteExpectations): Promise<Approval> {
  const res = await r.http.post<{
    externalUsername: string; type: string; referenceId: string | null; details: Array<{ label: string; value: string }> | null;
    confirmedVia: string | null; assurance: ApprovalAssurance | null; approvalProof: unknown;
    provisional?: boolean; revoked?: boolean; revokeReason?: 'UNDO' | 'COACHED' | null; reconfirmedAt?: string | null;
  }>(`/login/${encodeURIComponent(requestId)}/consume`, {});
  const sameUser = String(res.externalUsername).toLowerCase() === String(expect.user).toLowerCase();
  const sameDetails = detailsDigest(normalizeDetails(expect.details)) === detailsDigest(res.details || []);
  const sameRef = (res.referenceId || null) === (expect.referenceId || null);
  if (!sameUser || res.type !== expect.action || !sameDetails || !sameRef) {
    throw new TouchqueError('Touchque: this approval is for a different user, action or transaction.');
  }
  return {
    requestId,
    user: res.externalUsername,
    action: res.type,
    assurance: res.assurance,
    confirmedVia: res.confirmedVia,
    approvalProof: res.approvalProof,
    // Servers before the Vishing Shield send none of these.
    ...(res.provisional !== undefined && {
      provisional: res.provisional === true, revoked: res.revoked === true, revokeReason: res.revokeReason ?? null, reconfirmedAt: res.reconfirmedAt ?? null,
    }),
  };
}

// ─── Guard token ──────────────────────────────────────────────────────────
// The browser echoes this back while it waits. It is signed with a key derived
// from your API secret and binds the approval to one user, action and
// transaction, so it cannot be replayed for another user, amount or route.

export interface GuardTokenClaims {
  u: string; // user
  a: string; // action
  d: string; // details digest
  r: string | null; // referenceId
  st: StepState;
  rid?: string; // requestId
  n?: string; // matching number
  oc?: string; // offline challenge id
  cc?: string; // "Why?" case code, shown while waiting
  exp: number; // ms
}

const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const tokenKey = (apiSecret: string) => crypto.createHmac('sha256', apiSecret).update('touchque-guard-token-v1').digest();

export function signGuardToken(apiSecret: string, claims: GuardTokenClaims): string {
  const body = b64u(Buffer.from(JSON.stringify(claims), 'utf8'));
  const mac = b64u(crypto.createHmac('sha256', tokenKey(apiSecret)).update(body).digest());
  return `v1.${body}.${mac}`;
}

export function verifyGuardToken(apiSecret: string, token: unknown): GuardTokenClaims | null {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [v, body, mac] = token.split('.');
  if (v !== 'v1' || !body || !mac) return null;
  const expected = crypto.createHmac('sha256', tokenKey(apiSecret)).update(body).digest();
  const given = fromB64u(mac);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(fromB64u(body).toString('utf8')) as GuardTokenClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// From src/approvalProof.ts — verifyApprovalProof (device proof, pin the key)
// ─────────────────────────────────────────────────────────────

// src/approvalProof.ts
// Verifies the device-signed proof of an approval ("what you see is what you
// sign"). When the user's phone holds a Secure Enclave key, every approval is
// signed by it over the request id, the action type, the number-match code
// and a digest of the transaction details the user was shown. The proof
// arrives in the SUCCESS webhook (`approvalProof`) and in
// `login.status(id).approvalProof`; verifying it here does not require
// trusting Touchque: it proves the enrolled phone signed exactly these
// details.

import * as crypto from 'crypto';
import type { LoginRequestDetails } from './types';

export interface ApprovalProof {
  version: 'v2';
  algorithm: 'ECDSA-P256-SHA256';
  /** The exact text the device signed */
  message: string;
  /** base64 DER signature */
  signature: string;
  /** base64 X9.63 Secure Enclave public key of the approving device */
  publicKey: string;
}

export interface VerifyApprovalProofOptions {
  /** The request id returned by login.request() */
  requestId: string;
  /** The action type you sent (e.g. 'WITHDRAW') */
  type: string;
  /**
   * The details you sent with login.request(), exactly as you sent them.
   * Pass undefined when you sent none.
   */
  details?: LoginRequestDetails;
  /**
   * The challenge code login.request() returned, when number matching was
   * used for this request.
   */
  challengeCode?: string;
  /**
   * Pin the device: the base64 public key you stored for this user (e.g. the
   * `proof.publicKey` of their first verified approval). A proof from any
   * other key is rejected. Required unless `allowUnpinnedKey` is set.
   */
  expectedPublicKey?: string;
  /**
   * Accept a proof from whatever key it carries. Without a pinned key the
   * proof only shows that *some* key signed these details — anyone able to
   * forge the webhook or status response could bring their own. Only for
   * trust-on-first-use: store `proof.publicKey` after this first check and
   * pass it as `expectedPublicKey` from then on.
   */
  allowUnpinnedKey?: boolean;
}

function toPairs(details?: LoginRequestDetails): Array<{ label: string; value: string }> {
  if (!details) return [];
  const pairs = Array.isArray(details)
    ? details.map((d) => ({ label: d.label, value: d.value }))
    : Object.entries(details).map(([label, value]) => ({ label, value }));
  return pairs.map((p) => ({ label: String(p.label).trim(), value: String(p.value).trim() }));
}

/** SHA-256 hex of the details as displayed on the phone ('' when none). */
export function detailsDigest(details?: LoginRequestDetails): string {
  const pairs = toPairs(details);
  if (pairs.length === 0) return '';
  const canonical = pairs.map((p) => `${p.label}\u001F${p.value}`).join('\u001E');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Returns true only if the proof was signed by the device's key over exactly
 * the request, type, challenge code and details you expect. Fails closed:
 * without `expectedPublicKey` (or an explicit `allowUnpinnedKey: true`) it
 * returns false. Never throws for malformed input; returns false.
 */
export function verifyApprovalProof(
  proof: ApprovalProof | null | undefined,
  options: VerifyApprovalProofOptions
): boolean {
  try {
    if (!proof || proof.version !== 'v2' || proof.algorithm !== 'ECDSA-P256-SHA256') return false;
    if (options.expectedPublicKey) {
      if (proof.publicKey !== options.expectedPublicKey) return false;
    } else if (options.allowUnpinnedKey !== true) {
      return false;
    }

    const expectedMessage = [
      'touchque-approve:v2',
      options.requestId,
      options.type,
      options.challengeCode ?? '',
      detailsDigest(options.details),
    ].join('\n');
    if (proof.message !== expectedMessage) return false;

    const raw = Buffer.from(proof.publicKey, 'base64');
    if (raw.length !== 65 || raw[0] !== 0x04) return false;
    const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const key = crypto.createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: b64url(raw.subarray(1, 33)), y: b64url(raw.subarray(33, 65)) },
      format: 'jwk',
    });
    return crypto.verify(
      'sha256',
      Buffer.from(proof.message, 'utf8'),
      { key, dsaEncoding: 'der' },
      Buffer.from(proof.signature, 'base64')
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// From src/resources/Login.ts — tq.login (request/status/verify/reportFraud)
// ─────────────────────────────────────────────────────────────

// src/resources/Login.ts
// Login request management — request 2FA, check status, wait for approval
//
// This is the core of Touchque: any action that needs 2FA confirmation
// (login, withdraw, transfer, purchase, etc.) uses these methods.

import { HttpClient, describeError } from '../core/HttpClient';
import {
  LoginRequestOptions,
  LoginRequestResponse,
  LoginStatusResponse,
  ConsumeResponse,
  WaitForApprovalOptions,
  WaitForApprovalResult,
  VerifyOptions,
  VerifyChallenge,
  SecurityChanges,
} from '../types';
import { TouchqueTimeoutError, TouchqueRejectedError, TouchquePasskeyRequiredError } from '../errors';

/** Dates go out as ISO 8601; strings and epoch milliseconds as given. */
function securityChangesBody(changes: SecurityChanges): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [kind, at] of Object.entries(changes)) {
    if (at !== undefined && at !== null) out[kind] = at instanceof Date ? at.toISOString() : at;
  }
  return out;
}

export class Login {
  constructor(private readonly http: HttpClient) {}

  /**
   * Request 2FA confirmation from a user's Touchque app.
   *
   * The user will receive a push notification on their device.
   * They can then approve or reject the request.
   *
   * Built-in `type` values:
   * - `'LOGIN'` — User is logging in
   * - `'DISABLE_2FA'` — User is disabling 2FA
   * - Custom action type IDs or slugs configured in your Touchque Dashboard
   *
   * @example
   * // Basic login verification
   * const response = await tq.login.request({
   *   externalUsername: 'user@company.com',
   *   type: 'LOGIN'
   * });
   *
   * @example
   * // Protect a custom action using its Dashboard-configured ID or slug
   * const response = await tq.login.request({
   *   externalUsername: 'user@company.com',
   *   type: 'action_type_slug_or_id',
   *   referenceId: 'txn_abc123' // Your internal transaction ID
   * });
   *
   * @example
   * // Show the user what they are approving, where it came from
   * const response = await tq.login.request({
   *   externalUsername: 'user@company.com',
   *   type: 'WITHDRAW',
   *   clientIp: req.ip,
   *   userAgent: req.get('user-agent'),
   *   details: { Amount: '1,250.00 USD', Recipient: 'Jane Doe' },
   * });
   *
   * @example
   * // A payout to an IBAN: shown in full on the phone, flagged when it imitates
   * // one the user used before; rules can refuse it within 24 h of a 2FA change
   * const response = await tq.login.request({
   *   externalUsername: 'user@company.com',
   *   type: 'PAYOUT',
   *   destination: { kind: 'iban', value: 'TR33 0006 1005 1978 6457 8413 26', known: savedIbans },
   *   securityChanges: { password: user.passwordChangedAt },
   * });
   * if (response.destination?.lookalike.length) logSuspiciousPayee(response);
   *
   * @example
   * // Silent sign-ins: once approved, this browser is known (see `risk.check`)
   * const response = await tq.login.request({
   *   externalUsername: 'user@company.com',
   *   type: 'LOGIN',
   *   browserProof: req.get('x-touchque-browser'),
   * });
   */
  async request(options: LoginRequestOptions): Promise<LoginRequestResponse> {
    return this.http.post<LoginRequestResponse>('/login/request', {
      externalUsername: options.externalUsername,
      type: options.type,
      ...(options.referenceId && { referenceId: options.referenceId }),
      ...(options.clientIp && { clientIp: options.clientIp }),
      ...(options.userAgent && { userAgent: options.userAgent }),
      ...(options.details && { details: options.details }),
      ...(options.requireBiometric && { requireBiometric: options.requireBiometric }),
      ...(options.requireNumberMatch && { requireNumberMatch: options.requireNumberMatch }),
      ...((options.challengeDigits === 2 || options.challengeDigits === 3) && { challengeDigits: options.challengeDigits }),
      ...(options.expiresIn !== undefined && { expiresIn: options.expiresIn }),
      ...(options.qrPairing && { qrPairing: options.qrPairing }),
      ...(options.reply && { reply: options.reply }),
      ...(options.browserProof && { browserProof: options.browserProof }),
      ...(options.clientSignals && { clientSignals: options.clientSignals }),
      ...(options.deviceRisk && { deviceRisk: options.deviceRisk }),
      ...(options.deviceRiskRequestId && { deviceRiskRequestId: options.deviceRiskRequestId }),
      ...(options.context && { context: options.context }),
      ...(options.securityChanges && { securityChanges: securityChangesBody(options.securityChanges) }),
      ...(options.destination && { destination: options.destination }),
      ...(options.locale && { locale: options.locale }),
    });
  }

  /**
   * Check the current status of a login request.
   *
   * Returns: `'PENDING'` | `'CONFIRMED'` | `'REJECTED'` | `'EXPIRED'`
   *
   * @example
   * const { status } = await tq.login.status('request_id_here');
   * if (status === 'CONFIRMED') {
   *   // User approved — proceed with action
   * }
   */
  async status(requestId: string): Promise<LoginStatusResponse> {
    return this.http.get<LoginStatusResponse>(`/login/status/${encodeURIComponent(requestId)}`);
  }

  /**
   * Use an approved request exactly once. The first call on a CONFIRMED request
   * wins atomically; every later call (a replayed token, a retried form post)
   * throws `TouchqueAPIError` with `code: 'already_used'` (409). Compare the
   * answer's user, type, referenceId and details with what you asked for, or
   * use `tq.complete()`, which does both.
   *
   * @example
   * const approval = await tq.login.consume(requestId);
   * if (approval.externalUsername !== user) throw new Error('approval for someone else');
   */
  async consume(requestId: string): Promise<ConsumeResponse> {
    return this.http.post<ConsumeResponse>(`/login/${encodeURIComponent(requestId)}/consume`, {});
  }

  /**
   * Wait for the user to approve or reject a login request.
   *
   * This is a convenience method that polls the status endpoint
   * until the request is approved, rejected, or times out.
   *
   * **This is the recommended way to integrate Touchque into your routes.**
   *
   * @throws {TouchqueRejectedError} If the user rejects the request
   * @throws {TouchqueTimeoutError} If the request times out (user didn't respond)
   * @throws {TouchquePasskeyRequiredError} If the request now needs a passkey
   *   (`reason: 'step_up'`: the user approved on the phone during a call);
   *   finish it in the browser with `@touchque/web` `passkeys.approveLogin({ requestId })`
   *
   * @example
   * // Simple: Send request and wait for approval in one step
   * try {
   *   const loginReq = await tq.login.request({
   *     externalUsername: 'user@company.com',
   *     type: 'LOGIN'
   *   });
   *
   *   const result = await tq.login.waitForApproval({
   *     requestId: loginReq.requestId,
   *     timeout: 30000  // Wait up to 30 seconds
   *   });
   *
   *   if (result.approved) {
   *     // ✅ User approved — proceed
   *     proceedWithAction();
   *   }
   * } catch (err) {
   *   if (err instanceof TouchqueRejectedError) {
   *     // ❌ User rejected — cancel the action
   *   } else if (err instanceof TouchqueTimeoutError) {
   *     // ⏰ User didn't respond in time
   *   }
   * }
   */
  async waitForApproval(options: WaitForApprovalOptions): Promise<WaitForApprovalResult> {
    const timeout = options.timeout || 30000;
    const pollInterval = options.pollInterval || 400; // 0.4s default polling
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const { status, requiresPasskey } = await this.status(options.requestId);

      if (status === 'CONFIRMED') {
        return { approved: true, status };
      }

      if (status === 'REJECTED') {
        throw new TouchqueRejectedError(options.requestId);
      }

      if (status === 'EXPIRED') {
        throw new TouchqueTimeoutError(options.requestId, timeout);
      }

      // Vishing Shield: the phone was on a call at the tap, so the request now
      // waits for a passkey in the browser; polling would only run into the timeout.
      if (status === 'PENDING' && requiresPasskey) {
        throw new TouchquePasskeyRequiredError(options.requestId, 'step_up');
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout reached
    throw new TouchqueTimeoutError(options.requestId, timeout);
  }

  /**
   * Convenience: Send a 2FA request AND wait for approval in one call.
   *
   * Perfect for protecting any action with a single function call.
   *
   * @throws {TouchqueRejectedError} User rejected
   * @throws {TouchqueTimeoutError} User didn't respond in time
   * @throws {TouchquePasskeyRequiredError} A passkey must approve it (policy, or the
   *   user tapped Approve during a call)
   *
   * With number matching (your `requireNumberMatch`, a workspace policy or
   * the risk engine can turn it on), the user must pick a number on the
   * phone: show `challengeCode` to the user from `onChallenge`, which runs
   * before verify() waits. Otherwise the user has to guess.
   *
   * @example
   * const result = await tq.login.verify({
   *   externalUsername: 'user@company.com',
   *   type: 'SEND_MONEY',
   *   referenceId: 'order_789',
   *   onChallenge: ({ challengeCode }) => {
   *     if (challengeCode) showOnScreen(`Pick ${challengeCode} on your phone`);
   *   },
   * });
   * // If we reach here, the user approved
   * executeAction();
   */
  async verify(
    options: VerifyOptions
  ): Promise<WaitForApprovalResult & { requestId: string; challengeCode?: string }> {
    const { timeout, pollInterval, onChallenge, ...requestOptions } = options;

    // Step 1: Send the 2FA request
    const loginReq = await this.request(requestOptions);
    // Passkey-only (phishing-resistant policy): nothing was pushed, so don't poll for 30 s.
    if (loginReq.requiresPasskey) throw new TouchquePasskeyRequiredError(loginReq.requestId);

    // Step 1b: the number to show, before waiting (the phone asks for it).
    if (onChallenge) {
      const challenge: VerifyChallenge = {
        requestId: loginReq.requestId,
        expiresAt: loginReq.expiresAt,
        ...(loginReq.challengeCode && { challengeCode: loginReq.challengeCode }),
        ...(loginReq.reasons && { reasons: loginReq.reasons }),
        ...(loginReq.caseCode && { caseCode: loginReq.caseCode }),
      };
      try {
        const out = onChallenge(challenge) as Promise<unknown> | undefined;
        if (out && typeof out.catch === 'function') {
          out.catch((err: unknown) => this.http.log.warn(`[Touchque] onChallenge failed: ${describeError(err)}`));
        }
      } catch (err) {
        this.http.log.warn(`[Touchque] onChallenge failed: ${describeError(err)}`);
      }
    }

    // Step 2: Wait for the user's response
    const result = await this.waitForApproval({
      requestId: loginReq.requestId,
      timeout,
      pollInterval,
    });

    return {
      ...result,
      requestId: loginReq.requestId,
      challengeCode: loginReq.challengeCode,
    };
  }

  /**
   * Approve a pending 2FA request using a Recovery Code.
   * Useful when a user loses their phone and needs to bypass 2FA
   * using one of the backup codes generated during setup.
   */
  async approveWithRecoveryCode(options: { requestId: string; code: string }): Promise<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>('/login/recovery', {
      requestId: options.requestId,
      code: options.code,
    });
  }

  /**
   * Report a request you later learned was fraud — a chargeback, a confirmed
   * account takeover, a scam the user was talked into. Touchque's risk engine
   * learns from it (it is the strongest signal it gets) and the report is
   * kept in your audit log. The request's status does not change. Safe to
   * call more than once: a repeat answers `alreadyReported: true`.
   */
  async reportFraud(requestId: string, options: ReportFraudOptions = {}): Promise<ReportFraudResponse> {
    if (!requestId) throw new Error('reportFraud() needs the request id');
    return this.http.post<ReportFraudResponse>(`/login/${encodeURIComponent(requestId)}/report-fraud`, {
      ...(options.reason && { reason: options.reason }),
      ...(options.note && { note: options.note }),
    });
  }
}

export type FraudReason = 'chargeback' | 'account_takeover' | 'social_engineering' | 'other';

export interface ReportFraudOptions {
  /** Default 'other'. */
  reason?: FraudReason;
  /** Free text for your audit log, at most 500 characters. */
  note?: string;
}

export interface ReportFraudResponse {
  reported: true;
  /** true when this request had already been reported. */
  alreadyReported: boolean;
  requestId: string;
}

// ─────────────────────────────────────────────────────────────
// From src/router.ts — touchqueRouter, the relay routes @touchque/web calls (public part)
// ─────────────────────────────────────────────────────────────

// src/router.ts
//
// A mountable Express Router that wires the ~9 relay routes every partner
// backend needs for classic push 2FA + passkeys — the exact routes
// `@touchque/web`'s README previously told every partner to hand-copy (see
// its "Minimal Express relay" example). Nothing here is
// partner-specific except how you resolve the signed-in user (`getUserId`)
// and what you do once someone is authenticated (`onAuthenticated`).
//
//   app.use('/touchque', touchqueRouter(tq, {
//     getUserId: (req) => req.session.user?.email,
//     onAuthenticated: (req, res, info) => { req.session.authenticated = true; },
//   }));
//
// Endpoints mounted (relative to wherever you app.use() this router):
//   POST   /enroll/start                    (auth required) -> GenerateSecretResponse
//   GET    /enroll/status                   (auth required) -> { linked, used, deviceId }
//   POST   /login                           (pre-auth) -> 202 { touchque: step, token } until approved (same contract as requireTouchque)
//   POST   /offline/challenge               (pre-auth, body.externalUsername) -> QR for a phone with no internet
//   POST   /offline/verify                  (pre-auth, body.challengeId/code)
//   POST   /offline/totp                    (pre-auth, body.externalUsername/code) -> time-based code fallback
//   POST   /passkey/authenticate/options    (pre-auth, body.email; none = any passkey, for autofill)
//   POST   /passkey/authenticate/verify     (pre-auth, body.attemptId/response)
//   POST   /passkey/login/options           (pre-auth, body.requestId — approve a pending 2FA request)
//   POST   /passkey/login/verify            (pre-auth, body.requestId/response[/externalUsername])
//   POST   /passkey/register/options        (auth required)
//   POST   /passkey/register/verify         (auth required)
//   GET    /passkey/credentials             (auth required)
//   DELETE /passkey/credentials/:id         (auth required)
//
// "auth required" routes 401 with UNAUTHORIZED_FOR_2FA if `getUserId(req)`
// returns nothing — put your own session/auth middleware in front of this
// router (or have `getUserId` itself check and return undefined).
//
// Pre-auth routes are rate limited per IP and per username by default
// (`rateLimit`), and Touchque itself caps approval pushes per user. Set
// `getLoginUser` so POST /login and the offline routes only work for a user
// who already passed YOUR first factor (password step): then nobody can make
// Touchque push to, or lock out, an arbitrary user through your server.
// The offline routes are OFF until you do (or explicitly opt out with
// `allowOfflineWithoutFirstFactor`): with the username taken from the body,
// anyone could burn a user's offline attempts and lock them out.

import type { Router, Request, Response } from 'express';
import { Touchque } from './index';
import { TouchqueRejectedError, TouchqueTimeoutError, TouchquePasskeyRequiredError, TouchqueAPIError } from './errors';
import { runGuard, guardInputFromHeaders, isStatusPoll, silentInputFromHeaders, SilentSignInOptions } from './guard';
import type { LoginRequestDetails } from './types';

/** Reserved action: the approval on the phone that unlocks adding a passkey. */
const PASSKEY_ENROLL_ACTION = 'PASSKEY_ENROLL';
import { FixedWindowLimiter, RateLimitOptions } from './rateLimiter';
import { logOf } from './internal';
import { describeError, type SdkLog } from './core/HttpClient';
import { expressRouter } from './middleware/loadExpress';

export interface TouchqueRouterOptions {
  /**
   * Resolve the signed-in user's identifier for the "auth required" routes
   * (enrollment, passkey registration/management). Return `undefined` if
   * there is no signed-in user — the route responds 401.
   */
  getUserId: (req: Request) => string | undefined;

  /**
   * STRONGLY RECOMMENDED. The user who has already passed your first factor
   * (e.g. the password step stored in the session). When set, POST /login,
   * POST /offline/challenge and POST /offline/totp use this user and IGNORE any
   * username in the request body; if it returns nothing they answer 401
   * FIRST_FACTOR_REQUIRED. Without it, anyone can type any user's email and
   * make Touchque push to that user's phone (push-bombing) or spend that
   * user's offline attempts.
   */
  getLoginUser?: (req: Request) => string | undefined | Promise<string | undefined>;

  /**
   * Built-in limits for the pre-auth routes (per client IP and per username,
   * per route). On by default: 20 requests per IP and 5 per username per
   * minute. Pass `false` if you already rate limit in front of this router.
   * `req.ip` must be the real client (configure Express `trust proxy`).
   */
  rateLimit?: RateLimitOptions | false;

  /**
   * The offline routes (/offline/challenge, /offline/verify, /offline/totp)
   * answer 403 OFFLINE_REQUIRES_FIRST_FACTOR unless `getLoginUser` is set.
   * Set this to `true` only if you really want them to trust the username in
   * the request body (e.g. your own gateway already authenticated the user).
   */
  allowOfflineWithoutFirstFactor?: boolean;

  /** LoginType passed to the classic-2FA POST /login route. Default: 'LOGIN'. */
  actionType?: string;

  /**
   * Silent sign-ins for POST /login (default off). When on, a new sign-in
   * whose browser sent its device-bound key proof (`X-Touchque-Browser`,
   * added by `@touchque/web` with `browserKey: true`) first asks Touchque
   * whether anything about it is new. If nothing is, it succeeds at once with
   * no push (`onAuthenticated` gets `via: 'silent'`; the answer's
   * `assurance.method` is `'silent'`). Otherwise, and on any error, the usual
   * push starts and its approval makes the browser known. Set `getLoginUser`
   * too: the user must have passed your password step. `{ maxAgeSeconds }`
   * sets your own limit on how long ago the last phone approval in that
   * browser may be.
   */
  silentSignIn?: boolean | SilentSignInOptions;

  /** @deprecated no effect — POST /login no longer holds the request open; the page polls with the token. */
  loginTimeout?: number;

  /**
   * Optional transaction context for the classic-2FA POST /login push,
   * shown on the approval screen (see `LoginRequestOptions.details`). Build
   * it from your own server-side state — anything read from `req.body` here
   * is attacker-controlled.
   */
  getDetails?: (req: Request) => LoginRequestDetails | undefined | Promise<LoginRequestDetails | undefined>;

  /**
   * Called right before this router sends its own success response for
   * POST /login (once approved) or POST /passkey/authenticate/verify (once
   * verified) — the one place a partner almost always needs to do
   * something (open a session cookie, etc.). Mutate `res` here (e.g.
   * `res.cookie(...)`); do not call `res.json()`/`res.send()` yourself —
   * the router does that right after.
   */
  onAuthenticated?: (
    req: Request,
    res: Response,
    info: { externalUsername: string; requestId?: string; via: 'login' | 'passkey' | 'offline' | 'offline-totp' | 'silent' }
  ) => void | Promise<void>;
}

export function touchqueRouter(tq: Touchque, options: TouchqueRouterOptions): Router;  // implementation omitted
