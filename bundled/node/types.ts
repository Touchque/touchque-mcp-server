// TouchQue Node.js SDK — bundled type reference for AI assistants.
// Concatenation of touchque-node/src/{types.ts,steps.ts,approvalProof.ts,resources/Login.ts}
// plus the public part of src/router.ts (touchqueRouter), from the SDK source.
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API
// changes (see touchque-mcp-server/README.md).

// src/types.ts
// All TypeScript types and interfaces for the TouchQue Node.js SDK

export interface TouchQueConfig {
  /** Your TouchQue API key (starts with `tq_`) */
  apiKey: string;
  /** Your TouchQue API secret */
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
   * for the TouchQue mobile app to scan. Show this directly in an `<img>`
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

export interface GetUserResponse {
  externalUsername: string;
  /** Set once the mobile app has linked (scanned) the secret. */
  deviceId: string | null;
  /** true once the secret has been linked to a device via /auth/secret/link. */
  used: boolean;
  frozen: boolean;
  createdAt: string;
  expireAt: string | null;
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
   * TouchQue then treats them as ONE sign-in: once the phone REJECTS the push the QR is dead
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
   * Custom types can be created/configured in your TouchQue Dashboard.
   */
  type: LoginType;
  /** Optional reference (e.g. your internal transaction ID) */
  referenceId?: string;
  
  /** The IP address of the user initiating the request. TouchQue will resolve this to a City/Country. */
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
   * Silent sign-ins: the browser's device-bound key proof, exactly as the
   * browser sent it (`X-TouchQue-Browser` header, made by `@touchque/web`).
   * When the user approves this request on the phone (or with a passkey),
   * TouchQue remembers the browser, so a later `risk.check` can let the same
   * browser in without asking. Pass it through untouched; an invalid proof
   * only means "a browser TouchQue does not know".
   */
  browserProof?: string;
  /**
   * For your TouchQue Actions only (`event.context`): roles, plan, amount…
   * Any JSON object up to 4 KB. Never shown on the phone.
   */
  context?: Record<string, unknown>;
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
}

/** How an approved request was confirmed, and whether that is phishing-resistant. */
export interface ApprovalAssurance {
  /** true only for passkeys (WebAuthn): the signature is bound to your site's origin. */
  phishingResistant: boolean;
  /** 'passkey' | 'push' | 'recovery_code' | ... */
  method: string | null;
}

export type LoginStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'EXPIRED';

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
   * TouchQuePasskeyRequiredError at once). An error it throws, or a promise
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
  /** The browser's device-bound key proof (`X-TouchQue-Browser`), passed through untouched. */
  browserProof?: string;
  /**
   * Your own limit on how long ago the last phone approval in this browser
   * may be, in seconds (integer, 0 = always ask). TouchQue never goes beyond
   * its own limit (7 days).
   */
  maxAgeSeconds?: number;
  /** For your TouchQue Actions only (`event.context`). Any JSON object up to 4 KB. */
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
   * in minor versions. `action`: one of your TouchQue Actions asked
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
   * `false` only when TouchQue answered exactly `prompt: false`: nothing
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
  /** How sure TouchQue is that this is the user (default `'normal'`). */
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

/** A browser TouchQue knows for a user: one the user approved on the phone (or with a passkey). */
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
  /** Last sign-in TouchQue let through without asking. */
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
  /** Show it as a QR: the TouchQue app on the new phone scans it. */
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
   * field TouchQue also embeds in the JSON body.
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
   * the same `jti` throws `TouchQueWebhookReplayError`. Use
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
  status: LoginStatus;
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
 * `event` values of TouchQue's event webhooks (same `callbackUrl` as the
 * login results). Ignore types you do not know.
 */
export const WebhookEvents = {
  DEVICE_LINKED: 'DEVICE_LINKED',
  DEVICE_UNLINKED: 'DEVICE_UNLINKED',
  PASSKEY_REGISTERED: 'PASSKEY_REGISTERED',
  PASSKEY_DELETED: 'PASSKEY_DELETED',
  /** After the call, the user confirmed a provisional approval was theirs: critical actions are allowed again. */
  APPROVAL_RECONFIRMED: 'APPROVAL_RECONFIRMED',
  /** The user took an approval back (`reason`: `COACHED` or `UNDO`): end the session or stop the action built on it. */
  APPROVAL_REVOKED: 'APPROVAL_REVOKED',
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

export interface TouchQueErrorData {
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
import { TouchQueAPIError, TouchQueConfigError, TouchQueError } from './errors';
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
   * Silent sign-ins: the browser's device-bound key proof (`X-TouchQue-Browser`),
   * passed through untouched. Once the user approves, TouchQue knows this browser.
   */
  browserProof?: string;
  /** For your TouchQue Actions only (`event.context`): roles, plan, amount… Never shown on the phone. */
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
   * treat the session as limited: TouchQue refuses their critical actions
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
   * nothing was sent to the phone; why TouchQue let this known browser in.
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
  err instanceof TouchQueAPIError ? (err.code || (err.data as { error?: string })?.error) : undefined;

/** Starts an approval for `action` — never waits. */
export async function start(r: Resources, action: string, opts: StartOptions): Promise<Step> {
  if (!opts?.user) throw new TouchQueConfigError('start() needs the user id (options.user)');
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
    if (!(err instanceof TouchQueAPIError)) throw err;
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
      throw new TouchQueConfigError(
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
    if (!(err instanceof TouchQueAPIError) || err.status !== 409) throw err;
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
    throw new TouchQueError('TouchQue: this approval is for a different user, action or transaction.');
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
// trusting TouchQue: it proves the enrolled phone signed exactly these
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
// This is the core of TouchQue: any action that needs 2FA confirmation
// (login, withdraw, transfer, purchase, etc.) uses these methods.

import { HttpClient } from '../core/HttpClient';
import {
  LoginRequestOptions,
  LoginRequestResponse,
  LoginStatusResponse,
  WaitForApprovalOptions,
  WaitForApprovalResult,
  VerifyOptions,
  VerifyChallenge,
} from '../types';
import { TouchQueTimeoutError, TouchQueRejectedError, TouchQuePasskeyRequiredError } from '../errors';

export class Login {
  constructor(private readonly http: HttpClient) {}

  /**
   * Request 2FA confirmation from a user's TouchQue app.
   *
   * The user will receive a push notification on their device.
   * They can then approve or reject the request.
   *
   * Built-in `type` values:
   * - `'LOGIN'` — User is logging in
   * - `'DISABLE_2FA'` — User is disabling 2FA
   * - Custom action type IDs or slugs configured in your TouchQue Dashboard
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
      ...(options.browserProof && { browserProof: options.browserProof }),
      ...(options.context && { context: options.context }),
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
   * Wait for the user to approve or reject a login request.
   *
   * This is a convenience method that polls the status endpoint
   * until the request is approved, rejected, or times out.
   *
   * **This is the recommended way to integrate TouchQue into your routes.**
   *
   * @throws {TouchQueRejectedError} If the user rejects the request
   * @throws {TouchQueTimeoutError} If the request times out (user didn't respond)
   * @throws {TouchQuePasskeyRequiredError} If the request now needs a passkey
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
   *   if (err instanceof TouchQueRejectedError) {
   *     // ❌ User rejected — cancel the action
   *   } else if (err instanceof TouchQueTimeoutError) {
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
        throw new TouchQueRejectedError(options.requestId);
      }

      if (status === 'EXPIRED') {
        throw new TouchQueTimeoutError(options.requestId, timeout);
      }

      // Vishing Shield: the phone was on a call at the tap, so the request now
      // waits for a passkey in the browser; polling would only run into the timeout.
      if (status === 'PENDING' && requiresPasskey) {
        throw new TouchQuePasskeyRequiredError(options.requestId, 'step_up');
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout reached
    throw new TouchQueTimeoutError(options.requestId, timeout);
  }

  /**
   * Convenience: Send a 2FA request AND wait for approval in one call.
   *
   * Perfect for protecting any action with a single function call.
   *
   * @throws {TouchQueRejectedError} User rejected
   * @throws {TouchQueTimeoutError} User didn't respond in time
   * @throws {TouchQuePasskeyRequiredError} A passkey must approve it (policy, or the
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
    if (loginReq.requiresPasskey) throw new TouchQuePasskeyRequiredError(loginReq.requestId);

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
          out.catch((err: unknown) => console.warn('[TouchQue] onChallenge failed:', err instanceof Error ? err.message : err));
        }
      } catch (err) {
        console.warn('[TouchQue] onChallenge failed:', err instanceof Error ? err.message : err);
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
   * account takeover, a scam the user was talked into. TouchQue's risk engine
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
//   POST   /login                           (pre-auth) -> 202 { touchque: step, token } until approved (same contract as requireTouchQue)
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
// (`rateLimit`), and TouchQue itself caps approval pushes per user. Set
// `getLoginUser` so POST /login and the offline routes only work for a user
// who already passed YOUR first factor (password step): then nobody can make
// TouchQue push to, or lock out, an arbitrary user through your server.
// The offline routes are OFF until you do (or explicitly opt out with
// `allowOfflineWithoutFirstFactor`): with the username taken from the body,
// anyone could burn a user's offline attempts and lock them out.

import { Router, Request, Response } from 'express';
import { TouchQue } from './index';
import { TouchQueRejectedError, TouchQueTimeoutError, TouchQuePasskeyRequiredError, TouchQueAPIError } from './errors';
import { runGuard, guardInputFromHeaders, isStatusPoll, silentInputFromHeaders, SilentSignInOptions } from './guard';
import type { LoginRequestDetails } from './types';

/** Reserved action: the approval on the phone that unlocks adding a passkey. */
const PASSKEY_ENROLL_ACTION = 'PASSKEY_ENROLL';
import { FixedWindowLimiter, RateLimitOptions } from './rateLimiter';

export interface TouchQueRouterOptions {
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
   * make TouchQue push to that user's phone (push-bombing) or spend that
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
   * whose browser sent its device-bound key proof (`X-TouchQue-Browser`,
   * added by `@touchque/web` with `browserKey: true`) first asks TouchQue
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

export function touchqueRouter(tq: TouchQue, options: TouchQueRouterOptions): Router;  // implementation omitted
