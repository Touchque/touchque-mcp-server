<?php
// Touchque PHP SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-php/src/{Config.php,Touchque.php,Steps.php,ApprovalProof.php,Resources/Login.php,
// Resources/Offline.php,Relay/RelayResponse.php,Relay/RateLimitStore.php,Laravel/TouchqueMiddleware.php,
// Laravel/TouchqueRelay.php} plus the public parts of src/Guard.php and src/Relay/RelayHandler.php.
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.


namespace Touchque;

use Touchque\Exceptions\TouchqueConfigException;

class Config
{
    public const DEFAULT_BASE_URL = 'https://api.touchque.com';

    /** @internal The message of the TouchqueConfigException for a missing key or secret. */
    public const MISSING_KEYS = 'Set TQ_API_KEY and TQ_API_SECRET (or pass them to Config).';

    private string $apiKey;
    private string $apiSecret;
    private string $baseUrl;
    private int $timeout;
    /** @var object|callable|null */
    private $logger;
    private bool $debug;

    /**
     * Falls back to the environment when an argument is omitted: `TQ_API_KEY`,
     * `TQ_API_SECRET`, `TQ_API_URL` (default `https://api.touchque.com`).
     *
     * @param object|callable|null $logger Where the SDK reports its own problems (a misconfigured
     *   guard, a failed onChallenge, a relay without getLoginUser): any PSR-3 logger (its
     *   warning() / error()), or a callable(string $level, string $message). Default: nothing is
     *   logged. Lines carry an error's class and message, never request data.
     * @param bool $debug With no logger: write those lines to error_log() (local development).
     */
    public function __construct(
        ?string $apiKey = null,
        ?string $apiSecret = null,
        ?string $baseUrl = null,
        int $timeout = 10000,
        $logger = null,
        bool $debug = false
    ) {
        $apiKey = $apiKey ?? (getenv('TQ_API_KEY') ?: null);
        $apiSecret = $apiSecret ?? (getenv('TQ_API_SECRET') ?: null);
        $baseUrl = $baseUrl ?? (getenv('TQ_API_URL') ?: self::DEFAULT_BASE_URL);

        if (!$apiKey || !$apiSecret) {
            throw new TouchqueConfigException(self::MISSING_KEYS);
        }
        if (strpos($apiKey, 'tq_') !== 0) {
            throw new TouchqueConfigException('apiKey must start with "tq_". Did you accidentally swap apiKey and apiSecret?');
        }
        self::assertSafeBaseUrl($baseUrl);
        $this->apiKey = $apiKey;
        $this->apiSecret = $apiSecret;
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeout = $timeout;
        $this->logger = $logger;
        $this->debug = $debug;
    }

    /**
     * @internal Reports one of the SDK's own problems ('warning' or 'error'): to the logger, to
     * error_log() with debug, else nowhere. A logger that throws never breaks the request.
     */
    public function log(string $level, string $message): void
    {
        try {
            if (is_callable($this->logger)) {
                ($this->logger)($level, $message);
            } elseif (is_object($this->logger) && method_exists($this->logger, $level)) {
                $this->logger->{$level}($message);
            } elseif ($this->logger === null && $this->debug) {
                error_log($message);
            }
        } catch (\Throwable $e) {
            // a logger must never break a request
        }
    }

    /** @internal `Class: message` for a log line: never the request it came from. */
    public static function describe(\Throwable $e): string
    {
        return get_class($e) . ': ' . $e->getMessage();
    }

    /** Allow plaintext http only for localhost / loopback (local development). */
    private static function assertSafeBaseUrl(string $baseUrl): void
    {
        $scheme = strtolower((string)parse_url($baseUrl, PHP_URL_SCHEME));
        $host = strtolower((string)parse_url($baseUrl, PHP_URL_HOST));
        if ($scheme === 'https') {
            return;
        }
        // parse_url() keeps the brackets of an IPv6 host: http://[::1]:3000 gives "[::1]".
        if ($scheme === 'http' && in_array($host, ['localhost', '127.0.0.1', '::1', '[::1]'], true)) {
            return;
        }
        if ($scheme === 'http') {
            throw new TouchqueConfigException(
                "Refusing a plaintext http:// baseUrl for \"{$host}\". The API key and request "
                . 'signature would be sent in the clear — use https://.'
            );
        }
        throw new TouchqueConfigException("baseUrl must be http(s): {$baseUrl}");
    }

    public function getApiKey(): string
    {
        return $this->apiKey;
    }

    public function getApiSecret(): string
    {
        return $this->apiSecret;
    }

    public function getBaseUrl(): string
    {
        return $this->baseUrl;
    }

    public function getTimeout(): int
    {
        return $this->timeout;
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Touchque.php — the Touchque client class
// ─────────────────────────────────────────────────────────────


namespace Touchque;

use Touchque\Http\HttpClient;
use Touchque\Resources\Actions;
use Touchque\Resources\Agents;
use Touchque\Resources\Identity;
use Touchque\Resources\Mobile;
use Touchque\Resources\QrPairings;
use Touchque\Resources\DeviceRisk;
use Touchque\Resources\SafeGuard;
use Touchque\Resources\ActionTypes;
use Touchque\Resources\Auth;
use Touchque\Resources\Login;
use Touchque\Resources\Offline;
use Touchque\Resources\Risk;
use Touchque\Resources\Recovery;
use Touchque\Resources\Assist;
use Touchque\Resources\WebAuthn;
use Touchque\Resources\Webhook;

/**
 * Touchque SDK client.
 *
 *     // .env: TQ_API_KEY=tq_...  TQ_API_SECRET=...
 *     $tq = new Touchque();                                    // from the environment
 *     $tq = new Touchque(new Config($apiKey, $apiSecret));      // explicit
 *
 * One line per protected route — see `Touchque\Laravel\TouchqueMiddleware`,
 * or call `start()` / `check()` / `complete()` yourself for any framework.
 */
class Touchque
{
    public Auth $auth;
    public Login $login;
    public WebAuthn $webauthn;
    public Webhook $webhook;
    public Offline $offline;
    /** Action types: what users approve (LOGIN, SEND_MONEY…). Was `$actions` before 4.0. */
    public ActionTypes $actionTypes;
    /** Touchque Actions: your own code in the approval pipeline. */
    public Actions $actions;
    /** Silent sign-ins: should this sign-in ask the phone, and which browsers Touchque knows. */
    public Risk $risk;
    /** Never Locked Out: move a user whose phone is gone to a new phone, with colleagues vouching. */
    public Recovery $recovery;
    /** Help desk: IT working on a person's account in the open, and checks on their phone before sensitive actions. */
    public Assist $assist;
    /** AI agents as identities of their own: register (public key), suspend, revoke, kill switch. The agent itself uses TouchqueAgent. */
    public Agents $agents;
    /** Touchque Login: your customers' accounts, roles, organizations, apps, connections (Management API). */
    public Identity $identity;
    /** Mobile SDK: your own iOS/Android app approves for your users (enrollment tokens, devices, settings). */
    public Mobile $mobile;
    /** Pairing a browser by QR code: the phone that scans it is the one asked to approve. */
    public QrPairings $qrPairings;
    /** Device risk: the device on your sign-up, reset, sign-in or approval page (a paid add-on). */
    public DeviceRisk $deviceRisk;
    /** Safe Guard: Safe transactions approved on the approver's phone, for TouchqueSafeGuard. */
    public SafeGuard $safeGuard;

    private Config $config;

    /** @internal The SDK's own log (silent unless the Config has a logger or debug). */
    public function log(string $level, string $message): void
    {
        $this->config->log($level, $message);
    }

    public function __construct(?Config $config = null)
    {
        $this->config = $config ?? new Config();
        $httpClient = new HttpClient($this->config);

        $this->auth = new Auth($httpClient);
        $this->login = new Login($httpClient);
        $this->webauthn = new WebAuthn($httpClient);
        $this->webhook = new Webhook($this->config);
        $this->offline = new Offline($httpClient);
        $this->actionTypes = new ActionTypes($httpClient);
        $this->actions = new Actions($httpClient);
        $this->risk = new Risk($httpClient);
        $this->recovery = new Recovery($httpClient);
        $this->assist = new Assist($httpClient);
        $this->agents = new Agents($httpClient);
        $this->identity = new Identity($httpClient);
        $this->mobile = new Mobile($httpClient);
        $this->qrPairings = new QrPairings($httpClient);
        $this->deviceRisk = new DeviceRisk($httpClient);
        $this->safeGuard = new SafeGuard($httpClient);
    }

    /** @internal used by Guard/Steps to sign/verify the browser-facing token. */
    public function getApiSecret(): string
    {
        return $this->config->getApiSecret();
    }

    /**
     * Starts an approval and returns immediately — show the step in your UI.
     * `waiting` + `number`: show the number, the user picks it on the phone.
     * `enroll`: show `enroll['qrCodeDataUrl']` so the user links the Touchque app first.
     * `$browserProof` (silent sign-ins): the `X-Touchque-Browser` header, passed through
     * untouched; once the user approves, Touchque knows this browser.
     */
    public function start(string $action, string $user, ?array $details = null, ?string $referenceId = null, ?string $ip = null, ?string $userAgent = null, ?string $browserProof = null): array
    {
        return Steps::start($this, $action, $user, $details, $referenceId, $ip, $userAgent, true, $browserProof);
    }

    /** Where a started approval is now: waiting, approved, rejected, expired… */
    public function check(string $requestId): array
    {
        return Steps::check($this, $requestId);
    }

    /**
     * Uses an approved request exactly once, after checking it is for this
     * user, action and transaction. Call it right before doing the protected thing.
     */
    public function complete(string $requestId, string $user, string $action, ?array $details = null, ?string $referenceId = null): array
    {
        return Steps::complete($this, $requestId, $user, $action, $details, $referenceId);
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Steps.php — the headless step-up flow
// ─────────────────────────────────────────────────────────────


namespace Touchque;

use Touchque\Exceptions\TouchqueAPIException;
use Touchque\Exceptions\TouchqueConfigException;
use Touchque\Exceptions\TouchqueException;

/**
 * The headless step-up flow shared by every integration (Laravel, or your
 * own framework): start -> show the step in YOUR UI -> check -> complete
 * exactly once.
 *
 * A "step" is a plain associative array, safe to `json_encode`: what state
 * the approval is in and whatever the user has to see (the matching number,
 * the enrollment QR code, the offline QR code). It never contains API secrets.
 *
 * States: waiting | approved | rejected | expired | enroll | passkey_required
 *         | offline | blocked | frozen | rate_limited
 */
class Steps
{
    /** Same normalization the API does: a map or a list of {label, value} -> [{label, value}] strings. */
    public static function normalizeDetails(?array $details): array
    {
        if (empty($details)) {
            return [];
        }
        $isList = self::isList($details);
        $pairs = [];
        if ($isList) {
            foreach ($details as $d) {
                $pairs[] = [(string)$d['label'], (string)$d['value']];
            }
        } else {
            foreach ($details as $label => $value) {
                $pairs[] = [(string)$label, (string)$value];
            }
        }
        return array_map(
            fn ($p) => ['label' => trim($p[0]), 'value' => trim($p[1])],
            $pairs
        );
    }

    /** array_is_list() polyfill (this SDK supports PHP 7.4+). */
    private static function isList(array $arr): bool
    {
        if ($arr === []) {
            return true;
        }
        return array_keys($arr) === range(0, count($arr) - 1);
    }

    public static function detailsDigest(?array $details): string
    {
        $pairs = self::normalizeDetails($details);
        if (empty($pairs)) {
            return '';
        }
        $canonical = implode("\x1e", array_map(fn ($p) => $p['label'] . "\x1f" . $p['value'], $pairs));
        return hash('sha256', $canonical);
    }

    /**
     * Starts an approval for `$action` — never waits.
     *
     * A user with no phone linked gets the linking QR (`enroll`); with
     * `$enroll = false` they get `['state' => 'enroll', 'reason' => 'enrollment_off']`.
     *
     * `$browserProof` (silent sign-ins): the browser's device-bound key proof
     * (`X-Touchque-Browser`), passed through untouched. Once the user approves,
     * Touchque knows this browser.
     */
    public static function start(
        Touchque $client,
        string $action,
        string $user,
        ?array $details = null,
        ?string $referenceId = null,
        ?string $ip = null,
        ?string $userAgent = null,
        bool $enroll = true,
        ?string $browserProof = null,
        ?array $context = null
    ): array {
        if ($user === '') {
            throw new TouchqueConfigException('start() needs the user id');
        }
        $norm = self::normalizeDetails($details);
        try {
            $res = $client->login->request($user, $action, $referenceId, $ip, $userAgent, false, false, $norm ?: null, $browserProof, $context);
            $canary = isset($res['canary']['url']) && is_string($res['canary']['url']) ? ['url' => $res['canary']['url']] : null;
            $why = self::why($res);
            if (!empty($res['requiresPasskey'])) {
                $step = ['state' => 'passkey_required', 'requestId' => $res['requestId'] ?? null,
                    'expiresAt' => $res['expiresAt'] ?? null, 'details' => $norm ?: null] + $why;
                if ($canary) {
                    $step['canary'] = $canary;
                }
                return $step;
            }
            $step = [
                'state' => 'waiting', 'requestId' => $res['requestId'] ?? null, 'number' => $res['challengeCode'] ?? null,
                'expiresAt' => $res['expiresAt'] ?? null, 'details' => $norm ?: null,
            ] + $why;
            if (!empty($res['telemetryToken'])) {
                // Only when the workspace collects behavioural signals: lets the browser post
                // them for this one request (@touchque/web does it when given `telemetry`).
                $step['telemetryToken'] = $res['telemetryToken'];
            }
            if ($canary) {
                // Mirror Alarm: the page showing this step loads the canary (@touchque/web does it), so a
                // phishing proxy in front of your site gets the approval refused. Only on this first step.
                $step['canary'] = $canary;
            }
            return $step;
        } catch (TouchqueAPIException $err) {
            $code = $err->getErrorCode() ?? ($err->getData()['error'] ?? null);
            $why = $err->getCaseCode() !== null ? ['caseCode' => $err->getCaseCode()] : [];
            if ($err->getStatus() === 404 && ($code === 'device_not_linked' || stripos($err->getMessage(), 'linked device') !== false)) {
                if (!$enroll) {
                    // No phone, and this guard may not show the linking QR: final, a page stops polling.
                    return ['state' => 'enroll', 'reason' => 'enrollment_off'];
                }
                return self::enrollStep($client, $user);
            }
            if ($err->getStatus() === 423) {
                return ['state' => 'frozen', 'retryAfter' => $err->getRetryAfter()] + $why;
            }
            if ($err->getStatus() === 429) {
                return ['state' => 'rate_limited', 'retryAfter' => $err->getRetryAfter()] + $why;
            }
            if ($err->getStatus() === 400 && ($code === 'unknown_action' || stripos($err->getMessage(), 'invalid action type') !== false)) {
                throw new TouchqueConfigException(
                    "Unknown action \"$action\". Create it once with \$client->actionTypes->define('$action') "
                    . 'or in the Dashboard (Action Types).'
                );
            }
            if ($err->getStatus() === 403) {
                $reason = ($code === 'blocked' ? $err->getReason() : null)
                    ?? ($code === 'passkey_not_registered' || ($err->getData()['error'] ?? null) === 'phishing_resistant_required' ? 'passkey_not_registered' : null)
                    ?? ($code === 'action_disabled' ? 'action_disabled' : null)
                    ?? $code ?? 'blocked';
                return ['state' => 'blocked', 'reason' => $reason] + $why;
            }
            throw $err;
        }
    }

    /** First-time linking. Never unlinks a phone: a secret is only re-issued when the account is confirmed NOT linked. */
    private static function enrollStep(Touchque $client, string $user): array
    {
        try {
            return self::enrollQr($client->auth->generateSecret($user));
        } catch (TouchqueAPIException $err) {
            if ($err->getStatus() !== 409) {
                throw $err;
            }
            $current = null;
            try {
                $current = $client->auth->getUser($user);
            } catch (TouchqueAPIException $e) {
                // unknown user: fall through to reset below
            }
            if ($current && (!empty($current['used']) || !empty($current['deviceId']))) {
                return ['state' => 'enroll', 'reason' => 'already_linked'];
            }
            return self::enrollQr($client->auth->resetSecret($user));
        }
    }

    /**
     * The enroll step for a new linking QR. `expiresAt` is when the QR stops working: the API's
     * `expiresAt` when it is an ISO 8601 date-time, else now + its `ttlMs`, else null.
     */
    private static function enrollQr(array $res): array
    {
        $expiresAt = null;
        if (self::isoMs($res['expiresAt'] ?? null) !== null) {
            $expiresAt = $res['expiresAt'];
        } elseif (is_numeric($res['ttlMs'] ?? null) && $res['ttlMs'] > 0) {
            $expiresAt = self::isoOf((int)(microtime(true) * 1000) + (int)$res['ttlMs']);
        }
        return ['state' => 'enroll', 'enroll' => [
            'qrCodeDataUrl' => $res['qrCodeDataUrl'] ?? null, 'recoveryCodes' => $res['recoveryCodes'] ?? null,
            'expiresAt' => $expiresAt,
        ]];
    }

    /** @internal Milliseconds since the epoch of an ISO 8601 date-time with a zone (`2026-11-12T10:05:00.000Z`), or null. */
    public static function isoMs($value): ?int
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i', $value)) {
            return null;
        }
        try {
            return (int)(new \DateTimeImmutable($value))->format('Uv');
        } catch (\Exception $e) {
            return null;
        }
    }

    /** @internal Milliseconds since the epoch as ISO 8601 in UTC, like JavaScript's toISOString(). */
    public static function isoOf(int $ms): string
    {
        return gmdate('Y-m-d\TH:i:s', intdiv($ms, 1000)) . sprintf('.%03dZ', $ms % 1000);
    }

    /**
     * "Why?": the case code (`K7P-2QX`) and plain reasons of a login request's
     * answer, for its step. Both are safe for the browser: show the code with the
     * step ("Tell your support team: K7P-2QX").
     */
    private static function why(array $res): array
    {
        $out = [];
        if (isset($res['caseCode']) && is_string($res['caseCode']) && $res['caseCode'] !== '') {
            $out['caseCode'] = $res['caseCode'];
        }
        $reasons = [];
        foreach (is_array($res['reasons'] ?? null) ? $res['reasons'] : [] as $r) {
            if (is_array($r) && isset($r['code']) && is_string($r['code'])) {
                $reasons[] = ['code' => $r['code'], 'text' => isset($r['text']) && is_string($r['text']) ? $r['text'] : ''];
            }
        }
        if ($reasons) {
            $out['reasons'] = $reasons;
        }
        return $out;
    }

    private const STATE_MAP = ['PENDING' => 'waiting', 'CONFIRMED' => 'approved', 'REJECTED' => 'rejected', 'EXPIRED' => 'expired'];

    /**
     * Current state of a started approval. While it waits (`waiting`,
     * `passkey_required`) the step has the request's live `expiresAt` when
     * Touchque sends it: a switch to a passkey during a call extends it.
     */
    public static function check(Touchque $client, string $requestId): array
    {
        $s = $client->login->status($requestId);
        $state = ($s['status'] === 'PENDING' && !empty($s['requiresPasskey']))
            ? 'passkey_required' : (self::STATE_MAP[$s['status']] ?? 'waiting');
        $step = ['state' => $state, 'requestId' => $requestId];
        if ($state === 'approved' && !empty($s['assurance'])) {
            $step['assurance'] = $s['assurance'];
        }
        if (($state === 'waiting' || $state === 'passkey_required') && self::isoMs($s['expiresAt'] ?? null) !== null) {
            $step['expiresAt'] = $s['expiresAt'];
        }
        return $step;
    }

    /**
     * Uses an approved request exactly once and checks it is for THIS user,
     * action and transaction. Throws TouchqueException if it was already
     * used, not approved, or approved for something else.
     */
    public static function complete(
        Touchque $client,
        string $requestId,
        string $user,
        string $action,
        ?array $details = null,
        ?string $referenceId = null
    ): array {
        $res = $client->login->consume($requestId);
        $sameUser = strtolower((string)($res['externalUsername'] ?? '')) === strtolower($user);
        $sameDetails = self::detailsDigest($details) === self::detailsDigest($res['details'] ?? []);
        $sameRef = ($res['referenceId'] ?? null) === ($referenceId ?? null);
        if (!$sameUser || ($res['type'] ?? null) !== $action || !$sameDetails || !$sameRef) {
            throw new TouchqueException('Touchque: this approval is for a different user, action or transaction.');
        }
        $approval = [
            'requestId' => $requestId,
            'user' => $res['externalUsername'] ?? null,
            'action' => $res['type'] ?? null,
            'assurance' => $res['assurance'] ?? null,
            'confirmedVia' => $res['confirmedVia'] ?? null,
            'approvalProof' => $res['approvalProof'] ?? null,
        ];
        if (array_key_exists('provisional', $res)) {
            // Vishing Shield: approved during a call. Let the user in, but treat the session as limited:
            // critical actions are refused until APPROVAL_RECONFIRMED, and APPROVAL_REVOKED means end it.
            $approval += [
                'provisional' => !empty($res['provisional']), 'revoked' => !empty($res['revoked']),
                'revokeReason' => $res['revokeReason'] ?? null, 'reconfirmedAt' => $res['reconfirmedAt'] ?? null,
            ];
        }
        return $approval;
    }

    // ── Guard token ──────────────────────────────────────────────────────
    // The browser echoes this back while it waits. It is signed with a key
    // derived from the API secret and binds the approval to one user, action
    // and transaction, so it cannot be replayed for another user, amount or route.

    private static function tokenKey(string $apiSecret): string
    {
        return hash_hmac('sha256', 'touchque-guard-token-v1', $apiSecret, true);
    }

    private static function b64u(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function fromB64u(string $s): string
    {
        $padded = $s . str_repeat('=', (4 - strlen($s) % 4) % 4);
        return (string)base64_decode(strtr($padded, '-_', '+/'));
    }

    public static function signGuardToken(string $apiSecret, array $claims): string
    {
        $body = self::b64u(json_encode($claims));
        $mac = self::b64u(hash_hmac('sha256', $body, self::tokenKey($apiSecret), true));
        return "v1.$body.$mac";
    }

    public static function verifyGuardToken(string $apiSecret, ?string $token): ?array
    {
        if ($token === null || strlen($token) > 4096) {
            return null;
        }
        $parts = explode('.', $token);
        if (count($parts) !== 3 || $parts[0] !== 'v1') {
            return null;
        }
        [, $body, $mac] = $parts;
        $expected = self::b64u(hash_hmac('sha256', $body, self::tokenKey($apiSecret), true));
        if (!hash_equals($expected, $mac)) {
            return null;
        }
        $claims = json_decode(self::fromB64u($body), true);
        if (!is_array($claims) || !isset($claims['exp']) || $claims['exp'] < (microtime(true) * 1000)) {
            return null;
        }
        return $claims;
    }
}

// ─────────────────────────────────────────────────────────────
// From src/ApprovalProof.php — ApprovalProof::verify (device proof, pin the key)
// ─────────────────────────────────────────────────────────────


namespace Touchque;

/**
 * Verifies the device-signed proof of an approval ("what you see is what you
 * sign"). When the user's phone holds a hardware key (Secure Enclave /
 * Android Keystore), every approval is signed by it over the request id, the
 * action type, the number-match code and a digest of the transaction details
 * the user was shown. The proof arrives in the SUCCESS webhook
 * (`approvalProof`) and in `login->status($id)['approvalProof']`. Verifying it
 * does not require trusting Touchque: it proves the enrolled phone signed
 * exactly these details. Needs ext-openssl.
 */
final class ApprovalProof
{
    private const MESSAGE_PREFIX = 'touchque-approve:v2';
    /** DER SubjectPublicKeyInfo header for an uncompressed P-256 (prime256v1) point. */
    private const P256_SPKI_PREFIX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

    /**
     * Returns true only if `$proof` was signed by the device key over exactly
     * the request, action type, challenge code and details you expect.
     *
     * Options:
     *  - requestId (string, required): the id login->request() returned
     *  - type (string, required): the action type you sent, e.g. 'WITHDRAW'
     *  - details (array|null): the details you sent, exactly as you sent them
     *  - challengeCode (string|null): the number-match code, when used
     *  - expectedPublicKey (string|null): pin the device — the base64 public
     *    key you stored for this user (e.g. `$proof['publicKey']` of their
     *    first verified approval). Required unless allowUnpinnedKey is true.
     *  - allowUnpinnedKey (bool): accept whatever key the proof carries.
     *    Without a pin the proof only shows that *some* key signed these
     *    details. Only for trust-on-first-use: store the key, pin it after.
     *
     * Fails closed and never throws for malformed input; returns false.
     *
     * @param array<string, mixed>|null $proof
     * @param array<string, mixed> $options
     */
    public static function verify(?array $proof, array $options): bool
    {
        if (!function_exists('openssl_verify')) {
            throw new \RuntimeException('ApprovalProof::verify needs the openssl PHP extension (ext-openssl).');
        }
        try {
            if ($proof === null || ($proof['version'] ?? null) !== 'v2' || ($proof['algorithm'] ?? null) !== 'ECDSA-P256-SHA256') {
                return false;
            }
            $publicKey = $proof['publicKey'] ?? null;
            $message = $proof['message'] ?? null;
            $signature = $proof['signature'] ?? null;
            if (!is_string($publicKey) || !is_string($message) || !is_string($signature)) {
                return false;
            }
            $expectedKey = $options['expectedPublicKey'] ?? null;
            if (is_string($expectedKey) && $expectedKey !== '') {
                if (!hash_equals($expectedKey, $publicKey)) {
                    return false;
                }
            } elseif (($options['allowUnpinnedKey'] ?? false) !== true) {
                return false;
            }

            $expectedMessage = implode("\n", [
                self::MESSAGE_PREFIX,
                (string)($options['requestId'] ?? ''),
                (string)($options['type'] ?? ''),
                isset($options['challengeCode']) ? (string)$options['challengeCode'] : '',
                Steps::detailsDigest($options['details'] ?? null),
            ]);
            if (!hash_equals($expectedMessage, $message)) {
                return false;
            }

            $raw = base64_decode($publicKey, true);
            if ($raw === false || strlen($raw) !== 65 || $raw[0] !== "\x04") {
                return false;
            }
            $der = hex2bin(self::P256_SPKI_PREFIX) . $raw;
            $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
            $key = @openssl_pkey_get_public($pem);
            if ($key === false) {
                return false; // not a point on P-256
            }
            $sig = base64_decode($signature, true);
            if ($sig === false || $sig === '') {
                return false;
            }
            return @openssl_verify($message, $sig, $key, OPENSSL_ALGO_SHA256) === 1;
        } catch (\Throwable $e) {
            return false;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Resources/Login.php — $tq->login (request/status/verify/reportFraud)
// ─────────────────────────────────────────────────────────────


namespace Touchque\Resources;

use Touchque\Http\HttpClient;
use Touchque\Exceptions\TouchqueTimeoutException;
use Touchque\Exceptions\TouchqueRejectedException;
use Touchque\Exceptions\TouchquePasskeyRequiredError;
use Touchque\Exceptions\TouchqueConfigException;

class Login
{
    private HttpClient $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Request a 2FA login/approval from the user's mobile device.
     *
     * When the integration has behavioral biometrics enabled
     * (`TenantPolicy.behavioralBiometricsEnabled`), the response also contains
     * `telemetryToken` — pass it plus `requestId` to your frontend to
     * initialize the `@touchque/web` behavioral widget
     * (`tq.behavioral.attach(...)`). There is no widget in this server SDK.
     *
     * `$details` is transaction context shown on the approval screen, e.g.
     * ['Amount' => '1,250.00 USD', 'Recipient' => 'Jane Doe'] (shown in
     * order), or a list of ['label' => ..., 'value' => ...]. At most 8
     * entries, labels <= 40 and values <= 120 characters; the API rejects
     * (never truncates) anything outside those limits. Build it from
     * server-side state, never from browser input.
     *
     * `$browserProof` (silent sign-ins): the browser's device-bound key proof,
     * exactly as the browser sent it (`X-Touchque-Browser` header, made by
     * `@touchque/web` with `browserKey: true`). When the user approves this
     * request on the phone (or with a passkey), Touchque remembers the
     * browser, so a later `$tq->risk->check()` can let the same browser in
     * without asking. Pass it through untouched; an invalid proof only means
     * "a browser Touchque does not know".
     *
     * `$securityChanges`: when the user's sign-in security last changed in your
     * system, ['password' | 'mfa' | 'device' | 'email' | 'phone' => DateTimeInterface,
     * ISO 8601 string or epoch milliseconds]. Touchque adds what it saw itself;
     * access rules and Actions read the minutes since each
     * (`minutesSince.mfaChange`, `.deviceChange`, ...), e.g. refuse
     * `PAYOUT_CHANGE` within 24 hours of a 2FA change.
     *
     * `$destination`: where the action sends money or value,
     * ['kind' => 'iban' | 'account' | 'wallet' | 'address' | 'payee', 'value' => ..., 'known' => [...]].
     * The phone shows it in full in groups of four, with a warning when it
     * looks like one the user used before but is not the same; the answer's
     * `destination` is ['known' => bool, 'lookalike' => [...]]. Do not repeat
     * it in `$details`. `$locale` ('tr' default, or 'en') is the language of those rows.
     */
    public function request(
        string $externalUsername,
        string $type = 'LOGIN',
        ?string $referenceId = null,
        ?string $clientIp = null,
        ?string $userAgent = null,
        bool $requireBiometric = false,
        bool $requireNumberMatch = false,
        ?array $details = null,
        ?string $browserProof = null,
        ?array $context = null,
        ?int $challengeDigits = null,
        ?int $expiresIn = null,
        ?string $clientSignals = null,
        ?array $securityChanges = null,
        ?array $destination = null,
        ?string $locale = null,
        ?string $qrPairing = null,
        ?string $deviceRisk = null,
        ?string $deviceRiskRequestId = null,
        ?array $reply = null
    ): array {
        $payload = [
            'externalUsername' => $externalUsername,
            'type' => $type
        ];

        if ($referenceId !== null) {
            $payload['referenceId'] = $referenceId;
        }
        if ($clientIp !== null) {
            $payload['clientIp'] = $clientIp;
        }
        if ($userAgent !== null) {
            $payload['userAgent'] = $userAgent;
        }
        if ($requireBiometric) {
            $payload['requireBiometric'] = true;
        }
        if ($requireNumberMatch) {
            $payload['requireNumberMatch'] = true;
        }
        if ($challengeDigits === 2 || $challengeDigits === 3) {
            $payload['challengeDigits'] = $challengeDigits;
        }
        // How long the push waits for the person: 30 (default) to 300 seconds.
        if ($expiresIn !== null) {
            $payload['expiresIn'] = $expiresIn;
        }
        // A browser pairing by QR code ($tq->qrPairings), confirmed on the phone: only that phone is asked, once.
        if ($qrPairing !== null && $qrPairing !== '') {
            $payload['qrPairing'] = $qrPairing;
        }
        // Ask the person to type back on the phone a sign-in code another service sent them:
        // ['kind' => 'code', 'key' => CodeReply::newKey()['publicKey'], 'channel' => 'sms', 'target' => '+**********26'].
        // status()['reply']['ct'] holds only the ciphertext: \Touchque\CodeReply::open() opens it. Not with $qrPairing.
        if ($reply !== null) {
            $payload['reply'] = $reply;
        }
        // The end user's page check from @touchque/web: a browser driven by software asks with number matching.
        if ($clientSignals !== null && $clientSignals !== '') {
            $payload['clientSignals'] = $clientSignals;
        }
        // The page's device report from @touchque/web (deviceRisk.collect), when the workspace turned Device risk on:
        // its signals only ever ask for more.
        if ($deviceRisk !== null && $deviceRisk !== '') {
            $payload['deviceRisk'] = $deviceRisk;
        }
        // Or the page's identification (deviceRisk.identify), for this account only.
        if ($deviceRiskRequestId !== null && $deviceRiskRequestId !== '') {
            $payload['deviceRiskRequestId'] = $deviceRiskRequestId;
        }
        if ($details !== null && count($details) > 0) {
            $payload['details'] = $details;
        }
        if ($browserProof !== null && $browserProof !== '') {
            $payload['browserProof'] = $browserProof;
        }
        // For your Touchque Actions only (event.context); never shown on the phone.
        if ($context !== null && count($context) > 0) {
            $payload['context'] = $context;
        }
        if ($securityChanges !== null && count($securityChanges) > 0) {
            $payload['securityChanges'] = self::securityChangesBody($securityChanges);
        }
        if ($destination !== null && count($destination) > 0) {
            $payload['destination'] = $destination;
        }
        if ($locale !== null && $locale !== '') {
            $payload['locale'] = $locale;
        }

        return $this->http->post('/login/request', $payload);
    }

    /** Dates go out as ISO 8601; strings and epoch milliseconds as given. */
    private static function securityChangesBody(array $changes): array
    {
        $out = [];
        foreach ($changes as $kind => $at) {
            if ($at === null) {
                continue;
            }
            $out[$kind] = $at instanceof \DateTimeInterface ? $at->format(\DateTimeInterface::ATOM) : $at;
        }
        return $out;
    }

    /**
     * Check the current status of a login request.
     */
    public function status(string $requestId): array
    {
        return $this->http->get('/login/status/' . rawurlencode($requestId));
    }

    /**
     * Wait (poll) until the user approves or rejects a request you sent with
     * `request()`: `verify()` without the request, for when you show the
     * number (`challengeCode`) or store the request id first. Mirrors the
     * Node SDK's `login.waitForApproval`.
     *
     *     $sent = $tq->login->request($user, 'SEND_MONEY');
     *     show($sent['challengeCode'] ?? null);
     *     $result = $tq->login->waitForApproval($sent['requestId'], 30000);
     *
     * @return array{approved: bool, status: string, requestId: string, assurance: ?string, confirmedVia: ?string, provisional: bool}
     * @throws TouchquePasskeyRequiredError when the user tapped Approve during a call and the
     *   request now waits for a passkey (`reason` step_up).
     * @throws TouchqueRejectedException when the user rejects it.
     * @throws TouchqueTimeoutException when it expired or `$timeoutMs` (default 30 seconds) ran out.
     */
    public function waitForApproval(string $requestId, int $timeoutMs = 30000, int $pollIntervalMs = 400): array
    {
        if ($requestId === '') {
            throw new TouchqueConfigException('waitForApproval() needs the request id');
        }
        $start = microtime(true);
        while (true) {
            $statusResult = $this->status($requestId);
            $status = $statusResult['status'] ?? null;
            if ($status === 'CONFIRMED') {
                return [
                    'approved' => true,
                    'status' => $status,
                    'requestId' => $requestId,
                    'assurance' => $statusResult['assurance'] ?? null,
                    'confirmedVia' => $statusResult['confirmedVia'] ?? null,
                    // Vishing Shield: approved during a call; critical actions wait for the phone to re-confirm.
                    'provisional' => !empty($statusResult['provisional']),
                ];
            }
            if ($status === 'REJECTED') {
                throw new TouchqueRejectedException("Request $requestId was rejected by the user.");
            }
            if ($status === 'EXPIRED') {
                throw new TouchqueTimeoutException("Request $requestId expired before it was approved.");
            }
            // Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
            if ($status === 'PENDING' && !empty($statusResult['requiresPasskey'])) {
                throw new TouchquePasskeyRequiredError($requestId, 'step_up');
            }
            if ((microtime(true) - $start) * 1000 > $timeoutMs) {
                throw new TouchqueTimeoutException("Request $requestId was not approved within {$timeoutMs}ms");
            }
            usleep(max(0, $pollIntervalMs) * 1000);
        }
    }

    /**
     * Request a login and wait (poll) until the user approves or rejects it.
     *
     * With number matching (your `$requireNumberMatch`, a workspace policy or the
     * risk engine can turn it on) the user must pick a number on the phone.
     * `$onChallenge` is called once, right after the request is created and before
     * any waiting, with `['requestId', 'challengeCode', 'expiresAt', 'reasons',
     * 'caseCode']`: show `challengeCode` to the user now; the phone asks for it. An
     * exception it throws is logged and ignored (verify keeps waiting). It is not
     * called when only a passkey can approve.
     *
     *     $tq->login->verify($user, 'SEND_MONEY', null, 30000, $ip, $ua, false, false, null, null,
     *         function (array $c) { if (isset($c['challengeCode'])) show("Pick {$c['challengeCode']} on your phone"); });
     *     // PHP 8: verify($user, 'SEND_MONEY', onChallenge: function (array $c) { ... })
     *
     * @throws TouchquePasskeyRequiredError when a phishing-resistant policy
     *   requires the request to be approved with a passkey (no push sent, `reason` policy), or the user
     *   tapped Approve during a call and the request now waits for a passkey (`reason` step_up).
     * @throws TouchqueRejectedException when the user rejects it.
     * @throws TouchqueTimeoutException on timeout or expiry.
     */
    public function verify(
        string $externalUsername,
        string $type = 'LOGIN',
        ?string $referenceId = null,
        int $timeoutMs = 30000,
        ?string $clientIp = null,
        ?string $userAgent = null,
        bool $requireBiometric = false,
        bool $requireNumberMatch = false,
        ?array $details = null,
        ?string $browserProof = null,
        ?callable $onChallenge = null,
        ?array $context = null,
        ?int $challengeDigits = null,
        ?array $securityChanges = null,
        ?array $destination = null,
        ?string $locale = null
    ): array {
        $requestResult = $this->request($externalUsername, $type, $referenceId, $clientIp, $userAgent, $requireBiometric, $requireNumberMatch, $details, $browserProof, $context, $challengeDigits, null, null, $securityChanges, $destination, $locale);
        $requestId = $requestResult['requestId'];
        if (!empty($requestResult['requiresPasskey'])) {
            throw new TouchquePasskeyRequiredError($requestId);
        }

        // The number to show, before waiting: the phone asks the user for it.
        if ($onChallenge !== null) {
            $challenge = ['requestId' => $requestId, 'expiresAt' => $requestResult['expiresAt'] ?? null];
            foreach (['challengeCode', 'reasons', 'caseCode'] as $key) {
                if (!empty($requestResult[$key])) {
                    $challenge[$key] = $requestResult[$key];
                }
            }
            try {
                $onChallenge($challenge);
            } catch (\Throwable $e) {
                // The caller's callback must not stop the wait.
                $this->http->log('warning', '[Touchque] onChallenge failed: ' . \Touchque\Config::describe($e));
            }
        }

        $startTime = microtime(true) * 1000;
        $pollInterval = 400;

        while (true) {
            $statusResult = $this->status($requestId);
            $status = $statusResult['status'];

            if ($status === 'CONFIRMED') {
                return [
                    'approved' => true,
                    'status' => $status,
                    'requestId' => $requestId,
                    'challengeCode' => $requestResult['challengeCode'] ?? null,
                    'assurance' => $statusResult['assurance'] ?? null,
                    'confirmedVia' => $statusResult['confirmedVia'] ?? null,
                    // Vishing Shield: approved during a call; critical actions wait for the phone to re-confirm.
                    'provisional' => !empty($statusResult['provisional']),
                ];
            }

            if ($status === 'REJECTED') {
                throw new TouchqueRejectedException("Request $requestId was rejected by the user.");
            }

            if ($status === 'EXPIRED') {
                throw new TouchqueTimeoutException("Request $requestId expired before it was approved.");
            }

            // Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
            if ($status === 'PENDING' && !empty($statusResult['requiresPasskey'])) {
                throw new TouchquePasskeyRequiredError($requestId, 'step_up');
            }

            $elapsed = (microtime(true) * 1000) - $startTime;
            if ($elapsed > $timeoutMs) {
                throw new TouchqueTimeoutException("Login verification timed out after {$timeoutMs}ms");
            }

            usleep($pollInterval * 1000); // usleep takes microseconds
        }
    }

    /**
     * Approve a pending 2FA request using a Recovery Code (bypasses mobile device).
     * Mirrors the Node/Python/Go SDKs' `approveWithRecoveryCode`/`approve_with_recovery_code`/`ApproveWithRecoveryCode`.
     */
    public function approveWithRecoveryCode(string $requestId, string $code): array
    {
        return $this->http->post('/login/recovery', [
            'requestId' => $requestId,
            'code' => $code
        ]);
    }

    /**
     * Uses an approved request exactly once. The first call on a CONFIRMED
     * request wins atomically; every later call (a replayed token, a retried
     * form post) throws TouchqueAPIException with error code "already_used" (409).
     */
    public function consume(string $requestId): array
    {
        return $this->http->post('/login/' . rawurlencode($requestId) . '/consume', []);
    }

    /** Reasons accepted by reportFraud(). */
    public const FRAUD_REASONS = ['chargeback', 'account_takeover', 'social_engineering', 'other'];

    /**
     * Reports a request you later learned was fraud — a chargeback, a
     * confirmed account takeover, a scam the user was talked into. Touchque's
     * risk engine learns from it (it is the strongest signal it gets) and the
     * report is kept in your audit log. The request's status does not change.
     * Safe to call more than once: a repeat answers `alreadyReported => true`.
     *
     * @param string|null $reason one of self::FRAUD_REASONS (default 'other')
     * @param string|null $note   free text for your audit log, at most 500 characters
     * @return array{reported: bool, alreadyReported: bool, requestId: string}
     */
    public function reportFraud(string $requestId, ?string $reason = null, ?string $note = null): array
    {
        if ($requestId === '') {
            throw new TouchqueConfigException('reportFraud() needs the request id');
        }
        $payload = [];
        if ($reason !== null && $reason !== '') {
            $payload['reason'] = $reason;
        }
        if ($note !== null && $note !== '') {
            $payload['note'] = $note;
        }
        return $this->http->post('/login/' . rawurlencode($requestId) . '/report-fraud', $payload);
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Resources/Offline.php — Offline Sign (QR + code)
// ─────────────────────────────────────────────────────────────


namespace Touchque\Resources;

use Touchque\Http\HttpClient;
use Touchque\Exceptions\TouchqueAPIException;

/** Offline Sign — QR challenge / typed code approvals that work with the
 * phone offline (no internet on the device). */
class Offline
{
    private HttpClient $http;

    public function __construct(HttpClient $http)
    {
        $this->http = $http;
    }

    /**
     * Issues an offline QR challenge. Returns
     * `{ challengeId, qr, qrDataUrl, expiresAt, expiresInSeconds, totpAvailable }`
     * (+ `challengeCode` when number matching applies: print it under the QR; the phone
     * offers it among two decoys and the user taps the match).
     * `$details` is REQUIRED for critical action types.
     *
     * `$requestId` is the push this QR is a fallback for: once the phone REJECTS it the QR is
     * dead (no new QR is issued, a code for the old one is refused with `request_rejected`), and a
     * push with number matching makes the QR show the same number. Always pass it when the QR
     * follows a push.
     */
    public function challenge(
        string $externalUsername,
        string $type = 'LOGIN',
        ?array $details = null,
        ?string $clientIp = null,
        ?string $userAgent = null,
        ?int $ttlSeconds = null,
        bool $includeQrImage = true,
        ?string $requestId = null,
        bool $requireNumberMatch = false
    ): array {
        $body = ['externalUsername' => $externalUsername, 'type' => $type];
        if ($details !== null) {
            $body['details'] = $details;
        }
        if ($clientIp !== null) {
            $body['clientIp'] = $clientIp;
        }
        if ($userAgent !== null) {
            $body['userAgent'] = $userAgent;
        }
        if ($ttlSeconds !== null) {
            $body['ttlSeconds'] = $ttlSeconds;
        }
        if (!$includeQrImage) {
            $body['includeQrImage'] = false;
        }
        if ($requestId !== null) {
            $body['requestId'] = $requestId;
        }
        if ($requireNumberMatch) {
            $body['requireNumberMatch'] = true;
        }
        return $this->http->post('/offline/challenge', $body);
    }

    /**
     * Verifies the 7-character code shown on the phone. Never throws for a
     * wrong/expired/used code — check `approved`; `reason` is one of
     * invalid_code | locked | expired | used | unknown_challenge |
     * request_rejected | too_many_failures | device_not_enrolled.
     */
    public function verify(string $challengeId, string $code): array
    {
        return $this->notApprovedAsResult(fn () => $this->http->post('/offline/verify', [
            'challengeId' => $challengeId,
            'code' => $code,
        ]));
    }

    /**
     * Verifies the rolling time-based code (no QR scan needed). Refused for critical action types.
     * `$requestId`: the push this sign-in belongs to — a code is refused (`request_rejected`) once the phone rejected it.
     */
    public function verifyTotp(string $externalUsername, string $code, string $type = 'LOGIN', ?string $clientIp = null, ?string $requestId = null): array
    {
        $body = ['externalUsername' => $externalUsername, 'code' => $code, 'type' => $type];
        if ($clientIp !== null) {
            $body['clientIp'] = $clientIp;
        }
        if ($requestId !== null) {
            $body['requestId'] = $requestId;
        }
        return $this->notApprovedAsResult(fn () => $this->http->post('/offline/totp/verify', $body));
    }

    /**
     * For checking typed time-based codes while your server cannot reach Touchque (an outage):
     * salted, slow digests of each user's next codes, never a key. Up to 1,000 users and 24,000 user-steps a call; `$steps` 1-480
     * (default 480, four hours) from `$fromStep` (default: the current 30-second step). Returns
     * `{ stepSeconds, fromStep, steps, notAfterStep, kdf, users: [{ externalUsername, fromStep, salt, digests }] }`
     * with only the users who can use time-based codes now. Check a typed code with
     * `matchTotpVerifier()`. Requires the workspace policies `offlineTotpEnabled` and
     * `outageVerifiersEnabled`. Fetch again every few minutes: removed and frozen users fall out.
     */
    public function totpVerifiers(array $externalUsernames, ?int $fromStep = null, ?int $steps = null): array
    {
        $body = ['externalUsernames' => array_values($externalUsernames)];
        if ($fromStep !== null) {
            $body['fromStep'] = $fromStep;
        }
        if ($steps !== null) {
            $body['steps'] = $steps;
        }
        return $this->http->post('/offline/totp/verifiers', $body);
    }

    /**
     * Checks a typed code against one user's digests from `totpVerifiers()` without calling
     * Touchque. Returns the step the code belongs to (the current one or one either side), or
     * null. Accept each step once: remember the step you accepted for the user and refuse codes
     * for it or an older one. `$at`: Unix time (default now).
     */
    public static function matchTotpVerifier(array $verifiers, array $user, string $code, ?int $at = null): ?int
    {
        $given = str_replace([' ', '-', "\t"], '', strtoupper($code));
        if (strlen($given) !== 7 || strspn($given, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') !== 7) {
            return null;
        }
        $now = intdiv($at ?? time(), (int) $verifiers['stepSeconds']);
        $salt = base64_decode($user['salt'], true);
        if ($salt === false) {
            return null;
        }
        $digests = base64_decode($user['digests'], true);
        $length = (int) $verifiers['kdf']['length'];
        if ($digests === false || $length <= 0) {
            return null;
        }
        foreach ([$now, $now - 1, $now + 1] as $step) {
            if ($step < $user['fromStep'] || $step > $verifiers['notAfterStep']) {
                continue;
            }
            $i = ($step - $user['fromStep']) * 2 * $length;
            if ($i + 2 * $length > strlen($digests)) {
                continue;
            }
            $got = hash_pbkdf2('sha256', $given, $salt . ':' . $step, (int) $verifiers['kdf']['iterations'], $length, true);
            if (hash_equals(substr($digests, $i, $length), $got) || hash_equals(substr($digests, $i + $length, $length), $got)) {
                return $step;
            }
        }
        return null;
    }

    private function notApprovedAsResult(callable $call): array
    {
        try {
            return $call();
        } catch (TouchqueAPIException $err) {
            if ($err->getStatus() < 500) {
                return [
                    'approved' => false,
                    'reason' => $err->getReason() ?? $err->getErrorCode() ?? ($err->getData()['error'] ?? null),
                    'attemptsLeft' => $err->getAttemptsLeft(),
                ];
            }
            throw $err;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Guard.php — Guard::run, the guard inside your handler, and its helpers (public part)
// ─────────────────────────────────────────────────────────────

namespace Touchque;
use Touchque\Exceptions\TouchqueAPIException;
use Touchque\Exceptions\TouchqueConfigException;
use Touchque\Exceptions\TouchqueNetworkException;

/**
 * Framework-agnostic step-up guard. `Touchque\Laravel\TouchqueMiddleware` is
 * a thin wrapper over `Guard::run()`.
 *
 * Contract (same in every Touchque server SDK):
 *   1st request            -> 202 {"touchque": step, "token": ...}   show the step in your UI
 *   repeat with the token   -> 202 while waiting (each answer carries the request's live `expiresAt`),
 *                              then the protected action runs once
 *   refused                 -> 403 / 408 / 423 / 429 {"touchque": {"state": ..., ...}}
 *   first-time QR up        -> 202 {"touchque": {"state": "enroll", "expiresAt": ...}} with no
 *                              `enroll`: keep showing the QR; about 15 s before it expires a new
 *                              one comes with `enroll.qrCodeDataUrl` and new recovery codes
 *   no phone, `$enroll` off -> 202 {"touchque": {"state": "enroll", "reason": "enrollment_off"}}: final
 *
 * `run(null, ...)` uses defaultClient() (setDefaultClient() replaces it);
 * `response()` turns a result into the status, headers and body to send.
 *
 * Request headers the browser sends back:
 *   X-Touchque-Token         the token from the last response
 *   X-Touchque-Offline: 1    switch to offline approval (phone has no internet)
 *   X-Touchque-Code          the code from the phone (offline QR code, or with
 *   X-Touchque-Code-Type: totp   the rolling time-based code)
 *   X-Touchque-Browser       the browser's device-bound key proof (silent sign-ins,
 *                            read only when the adapter's `silentSignIn` option is on)
 */
class Guard
{
    public const TOKEN_HEADER = 'x-touchque-token';
    public const OFFLINE_HEADER = 'x-touchque-offline';
    public const CODE_HEADER = 'x-touchque-code';
    public const CODE_TYPE_HEADER = 'x-touchque-code-type';
    public const BROWSER_HEADER = 'x-touchque-browser';

    /**
     * Reads the guard headers from any case-insensitive header getter
     * (`fn(string $name): ?string`).
     */
    public static function inputFromHeaders(callable $get): array;

    /**
     * The guard input an adapter adds for silent sign-ins: the
     * `X-Touchque-Browser` header, read only when the option is on.
     * Returns `['silentSignIn' => bool|array, 'browserProof' => ?string]`.
     *
     * @param bool|array|null $option the adapter's `silentSignIn` option
     */
    public static function silentInputFromHeaders($option, callable $get): array;

    /**
     * Checks an adapter's `silentSignIn` option: `false` (default), `true`, or
     * `['maxAgeSeconds' => int >= 0]`.
     *
     * @param mixed $option
     * @throws \InvalidArgumentException
     */
    public static function assertSilentSignInOption($option, string $who): void;

    /**
     * True when this request only polls an approval that is already on its way:
     * a valid token bound to this user/action/details, still waiting, or showing
     * the first-time QR while it is up (more than 15 s before it expires), and no
     * offline switch or typed code. Relays do not count it against the per-user
     * push limit (with a 1.5 s poll the 6th poll was refused after 7.5 s). Such an
     * enroll poll can still start (the user linked, or the QR is gone): relays
     * charge that through run()'s `$beforeStart`. Renewing an expiring QR counts.
     * `$client`: as run()'s; null is the default client, and false while it
     * cannot be built.
     */
    public static function isStatusPoll(
        ?Touchque $client,
        ?string $user,
        string $action,
        ?array $details = null,
        ?string $referenceId = null,
        ?string $token = null,
        bool $offline = false,
        ?string $code = null
    ): bool;

    /**
     * The headers for a result that is not an approval: `Cache-Control: no-store`,
     * `Retry-After` when the step has one (423, 429) and, for status >= 400,
     * `X-Touchque-State` plus `X-Touchque-Reason` when the step has a reason.
     * `@touchque/web` rebuilds the step from them when a body has no `touchque`
     * key; cross-origin pages need them in Access-Control-Expose-Headers.
     */
    public static function headers(array $result): array;

    /** The 401 for a request without a signed-in user. */
    public static function unauthenticated(): array;

    /** The 500 for a setup error: missing keys, an undefined action type. */
    public static function misconfigured(): array;

    /**
     * What an `errorBody` callback gets for a result with status >= 400:
     * `['status' => int, 'code' => string, 'message' => string, 'touchque' => array]`.
     * `code` is the error's code, else the step's reason, else its state;
     * `message` is the error's message, else one for the state ("The approval
     * was rejected.", "The approval expired. Try again." …); `touchque` is the
     * step as it would be sent.
     */
    public static function refusal(array $result): array;

    /**
     * The body to send for a result with status >= 400 in your own error shape:
     * what `$errorBody` returns for `refusal($result)` (a copy of the step: PHP
     * arrays are values). Its json_encode(), as it is, decides (TouchqueMiddleware
     * converts Laravel's Arrayable / Jsonable first): a JSON object (an array with
     * string keys, a stdClass, a JsonSerializable or public properties that encode
     * to one) gets key `touchque` set to the step, replacing yours, so
     * `@touchque/web` still sees the state; anything else (a string, a number, a
     * list, null) is the body as it is. No `token` is added. Throws what the
     * callback throws, and JsonException for a result that cannot be encoded.
     *
     * @return mixed
     */
    public static function errorBody(array $result, callable $errorBody);

    /**
     * The HTTP answer for a result of run() that is not an approval, exactly as
     * TouchqueMiddleware and the relay send it:
     * `['status' => int, 'headers' => array, 'body' => mixed]`. Send `body` with
     * your framework's JSON response (encode `null` yourself: Laravel's
     * `JsonResponse(null)` sends `{}`).
     *
     * `headers` are headers(): `Cache-Control: no-store`, `Retry-After` on 423
     * and 429, `X-Touchque-State` and `X-Touchque-Reason` on 400 and above.
     * `body` is the result's body; for 400 and above with `$errorBody`, what
     * errorBody() makes of it. A callable that throws, or a result that cannot
     * be encoded, is logged (`[Touchque] errorBody failed: <message>`) and the
     * default body sent: through `$client`'s logger, else Laravel's logger in a
     * Laravel app, else nowhere.
     *
     * @throws \InvalidArgumentException for an approval: run your action instead
     */
    public static function response(array $result, ?callable $errorBody = null, ?Touchque $client = null): array;

    /**
     * The client `run(null, ...)` and `isStatusPoll(null, ...)` use:
     *   1. the one given to setDefaultClient();
     *   2. else, in a Laravel app with a binding of `Touchque`
     *      (`$app->bind/singleton(Touchque::class, ...)`), the container's, resolved
     *      on each call (the container owns its lifetime); a contextual binding for
     *      TouchqueMiddleware is not used;
     *   3. else one built from TQ_API_KEY / TQ_API_SECRET (and TQ_API_URL) on
     *      first use and kept once built.
     * Call it at startup to fail fast: it throws TouchqueConfigException, naming
     * the problem, while no client can be built (a build that failed is tried
     * again on the next call).
     *
     * @throws TouchqueConfigException
     */
    public static function defaultClient(): Touchque;

    /**
     * Makes `$client` the default client of `run(null, ...)` and
     * `isStatusPoll(null, ...)`, over a container binding and the environment:
     * the way to give them your own Config (a logger, a base URL). null forgets
     * it (and the client built from the environment): the next call uses a
     * Laravel binding of `Touchque`, else builds from the environment.
     */
    public static function setDefaultClient(?Touchque $client): void;

    /**
     * @internal Logs once per process that the default client cannot be built
     * (`run(null, ...)`, TouchqueMiddleware). There is no Config to carry your
     * logger: Laravel's logger in a Laravel app, else nowhere.
     */
    public static function logUnconfigured(TouchqueConfigException $err): void;

    /**
     * Runs one step of the guard. Returns either
     * `["approved" => [...], "status" => 200]` (run your protected action) or
     * `["status" => <code>, "body" => ["touchque" => step, "token" => ...]]`
     * (send it as response() gives it: that status, `headers()` and that JSON body).
     *
     * `$client`: your Touchque, or null for defaultClient(): the one given to
     * setDefaultClient(), else a Laravel binding of `Touchque`, else one built
     * from TQ_API_KEY / TQ_API_SECRET on first use and kept once built (a
     * failed build is tried again on the next request). While it cannot be
     * built the answer is 500 `misconfigured` (401 `unauthenticated` without a
     * user), logged once per process through Laravel's logger in a Laravel app.
     *
     * `$enroll = false` (a guard that may not show the linking QR): a user with
     * no phone gets 202 `{"state": "enroll", "reason": "enrollment_off"}`.
     *
     * Silent sign-ins: `$browserProof` is the browser's device-bound key proof
     * (`X-Touchque-Browser`), passed through untouched and attached to the
     * push, so its approval makes the browser known. With `$silentSignIn`
     * (`true`, or `['maxAgeSeconds' => int]` for your own limit on the age of
     * the last phone approval; default `false`), a new attempt that carries a
     * proof first asks Touchque (`$tq->risk->check()`): when it answers exactly
     * `prompt: false` the guard approves at once with no push (`assurance.method`
     * `silent`, `confirmedVia` `SILENT`, `requestId` `silent`, `reasons`).
     * Otherwise, and on any error, the usual push starts.
     *
     * `$beforeStart` (for rate limiters): called at most once, only for a poll
     * with a first-time QR token, right before it would start instead of keeping
     * the QR (the user linked: the silent check or the push; the QR expired, is
     * about to, or is gone: a new QR). Return null to go on, or a result
     * (`['status' => int, 'body' => array]`) to answer instead; anything else
     * throws InvalidArgumentException, so nothing starts. A relay charges the
     * user's budget there, since isStatusPoll() exempted that poll.
     */
    public static function run(
        ?Touchque $client,
        ?string $user,
        string $action,
        ?array $details = null,
        ?string $referenceId = null,
        ?string $ip = null,
        ?string $userAgent = null,
        ?string $token = null,
        bool $offline = false,
        ?string $code = null,
        ?string $codeType = null,
        bool $enroll = true,
        ?string $browserProof = null,
        $silentSignIn = false,
        ?array $context = null,
        ?callable $beforeStart = null
    ): array;
}

// ─────────────────────────────────────────────────────────────
// From src/Relay/RelayHandler.php — the relay routes @touchque/web calls (public part)
// ─────────────────────────────────────────────────────────────


namespace Touchque\Relay;

use Touchque\Exceptions\TouchqueAPIException;
use Touchque\Exceptions\TouchquePasskeyRequiredError;
use Touchque\Exceptions\TouchqueRejectedException;
use Touchque\Exceptions\TouchqueTimeoutException;
use Touchque\Guard;
use Touchque\Touchque;

/**
 * Framework-agnostic relay: the routes a frontend (`@touchque/web`) needs for
 * classic push 2FA, offline codes and passkeys, so you don't hand-write them.
 * Same routes and behaviour as the Node SDK's `touchqueRouter`. For Laravel
 * use `Touchque\Laravel\TouchqueRelay`; anywhere else call handle() with the
 * path relative to where you mount it and send the RelayResponse.
 *
 *   POST   /enroll/start                    (auth required) -> generateSecret response
 *   GET    /enroll/status                   (auth required) -> { linked, used, deviceId }
 *   POST   /login                           (pre-auth) -> 202 { touchque: step, token } until approved (same contract as Guard)
 *   POST   /offline/challenge               (pre-auth, body.externalUsername) -> QR for a phone with no internet
 *   POST   /offline/verify                  (pre-auth, body.challengeId/code)
 *   POST   /offline/totp                    (pre-auth, body.externalUsername/code) -> time-based code fallback
 *   POST   /passkey/authenticate/options    (pre-auth, body.email; none = any passkey, for autofill)
 *   POST   /passkey/authenticate/verify     (pre-auth, body.attemptId/response)
 *   POST   /passkey/login/options           (pre-auth, body.requestId — approve a pending 2FA request)
 *   POST   /passkey/login/verify            (pre-auth, body.requestId/response)
 *   POST   /passkey/register/options        (auth required)
 *   POST   /passkey/register/verify         (auth required)
 *   GET    /passkey/credentials             (auth required)
 *   DELETE /passkey/credentials/{id}        (auth required)
 *
 * "auth required" routes answer 401 UNAUTHORIZED_FOR_2FA when `getUserId`
 * returns nothing. Pre-auth routes are rate limited per IP and per username
 * (`rateLimit`). Set `getLoginUser` so POST /login and the offline routes only
 * work for the user who already passed YOUR first factor (password step);
 * the offline routes stay off (403) until you do, or until you explicitly opt
 * out with `allowOfflineWithoutFirstFactor`.
 *
 * Options (callables receive the `$nativeRequest` given to handle()):
 *   getUserId       (required) fn($req): ?string — the signed-in user, for the auth-required routes.
 *   getLoginUser    fn($req): ?string — the user who passed your first factor. STRONGLY RECOMMENDED.
 *                   When set, /login and the offline routes act for this user and ignore any
 *                   username in the body (401 FIRST_FACTOR_REQUIRED when it returns nothing).
 *                   Without it /login never shows the linking QR: a user with no phone gets 202
 *                   {touchque: {state: 'enroll', reason: 'enrollment_off'}}, as passkey registration does.
 *   rateLimit       array|false — ['windowMs' => 60000, 'perIp' => 20, 'perUser' => 5,
 *                   'store' => RateLimitStore]; false if you rate limit in front of the relay.
 *                   Under PHP-FPM pass a shared store (see RateLimitStore).
 *   allowOfflineWithoutFirstFactor  bool — let the offline routes trust the body username.
 *   actionType      string — action type for /login and the offline routes. Default 'LOGIN'.
 *   getDetails      fn($req): ?array — transaction context for the approval screen. Build it from
 *                   server-side state; the request body is attacker-controlled.
 *   onAuthenticated fn($req, RelayResponse $response, array $info): void — called right before a
 *                   success response is returned: open your session here. $info is
 *                   ['externalUsername' => string, 'requestId' => ?string, 'via' => 'login'|'passkey'|'offline'|'offline-totp'|'silent']
 *                   ('requestId' is absent for 'offline-totp'). Mutate $response (headers, status);
 *                   the handler sets the body.
 *   silentSignIn    bool|array — silent sign-ins for POST /login (default false). When on, a new sign-in
 *                   whose browser sent its device-bound key proof (X-Touchque-Browser, added by
 *                   `@touchque/web` with `browserKey: true`) first asks Touchque whether anything about it
 *                   is new. If nothing is, it succeeds at once with no push (onAuthenticated gets
 *                   'via' => 'silent', 'requestId' => 'silent'; the answer's assurance.method is 'silent').
 *                   Otherwise, and on any error, the usual push starts and its approval makes the browser
 *                   known. Set getLoginUser too: the user must have passed your password step.
 *                   ['maxAgeSeconds' => int] sets your own limit on how long ago the last phone approval
 *                   in that browser may be (0 = always ask).
 */
class RelayHandler
{
    private Touchque $tq;
    /** @var callable */
    private $getUserId;
    /** @var callable|null */
    private $getLoginUser;
    /** @var callable|null */
    private $getDetails;
    /** @var callable|null */
    private $onAuthenticated;
    private ?FixedWindowLimiter $limiter;
    private bool $offlineEnabled;
    private string $actionType;
    /** @var bool|array */
    private $silentSignIn;

    private static bool $warnedPreAuth = false;

    /** A 1.5 s poll for a 2-minute push is 80 requests: one attempt's worth of polls. */
    private const POLLS_PER_ATTEMPT = 10;
    /** Reserved action: the approval on the phone that unlocks adding a passkey. */
    private const PASSKEY_ENROLL_ACTION = 'PASSKEY_ENROLL';

    private const ROUTES = [
        'POST /enroll/start' => 'enrollStart',
        'GET /enroll/status' => 'enrollStatus',
        'POST /login' => 'login',
        'POST /offline/challenge' => 'offlineChallenge',
        'POST /offline/verify' => 'offlineVerify',
        'POST /offline/totp' => 'offlineTotp',
        'POST /passkey/authenticate/options' => 'passkeyAuthenticateOptions',
        'POST /passkey/authenticate/verify' => 'passkeyAuthenticateVerify',
        'POST /passkey/login/options' => 'passkeyLoginOptions',
        'POST /passkey/login/verify' => 'passkeyLoginVerify',
        'POST /passkey/register/options' => 'passkeyRegisterOptions',
        'POST /passkey/register/verify' => 'passkeyRegisterVerify',
        'GET /passkey/credentials' => 'passkeyCredentials',
    ];

    public function __construct(Touchque $tq, array $options)
    {
        if (!isset($options['getUserId']) || !is_callable($options['getUserId'])) {
            throw new \InvalidArgumentException('RelayHandler: the "getUserId" option is required and must be callable.');
        }
        foreach (['getLoginUser', 'getDetails', 'onAuthenticated'] as $name) {
            if (isset($options[$name]) && !is_callable($options[$name])) {
                throw new \InvalidArgumentException("RelayHandler: the \"$name\" option must be callable.");
            }
        }
        Guard::assertSilentSignInOption($options['silentSignIn'] ?? false, 'RelayHandler');
        $rateLimit = $options['rateLimit'] ?? [];
        if ($rateLimit !== false && !is_array($rateLimit)) {
            throw new \InvalidArgumentException('RelayHandler: "rateLimit" must be an array of options or false.');
        }

        $this->tq = $tq;
        $this->getUserId = $options['getUserId'];
        $this->getLoginUser = $options['getLoginUser'] ?? null;
        $this->getDetails = $options['getDetails'] ?? null;
        $this->onAuthenticated = $options['onAuthenticated'] ?? null;
        $this->actionType = (string)($options['actionType'] ?? 'LOGIN');
        $this->silentSignIn = $options['silentSignIn'] ?? false;
        $this->limiter = $rateLimit === false ? null : new FixedWindowLimiter($rateLimit);
        $this->offlineEnabled = $this->getLoginUser !== null || ($options['allowOfflineWithoutFirstFactor'] ?? false) === true;

        if ($this->getLoginUser === null && !self::$warnedPreAuth) {
            self::$warnedPreAuth = true;
            $tq->log('warning', '[Touchque] RelayHandler: POST /login takes the username from the request body'
                . ($this->offlineEnabled ? ', and so do the offline routes' : '; the offline routes are disabled until you set it')
                . '. Set "getLoginUser" to bind them to your first factor (password step) so they cannot be used against arbitrary users.');
        }
    }

    /**
     * Handles one relay request.
     *
     * @param string   $method        HTTP method (HEAD is treated as GET).
     * @param string   $path          Path relative to where the relay is mounted, e.g. "/login".
     * @param array    $body          The decoded JSON request body.
     * @param string   $ip            The real client IP ('' if unknown). Behind a proxy, resolve it
     *                                from trusted proxy headers first.
     * @param callable $header        fn(string $name): ?string — case-insensitive request header getter.
     * @param mixed    $nativeRequest Your framework's request, passed to the option callbacks.
     * @return RelayResponse|null     null when no relay route matches (let your app answer 404).
     */
    public function handle(string $method, string $path, array $body, string $ip, ?string $userAgent, callable $header, $nativeRequest = null): ?RelayResponse
    {
        $method = strtoupper($method);
        if ($method === 'HEAD') {
            $method = 'GET';
        }
        $path = (string)strtok($path, '?');
        $path = '/' . trim($path, '/');

        $ctx = ['body' => $body, 'ip' => $ip, 'userAgent' => $userAgent, 'header' => $header, 'req' => $nativeRequest];

        $route = self::ROUTES[$method . ' ' . strtolower($path)] ?? null;
        if ($route !== null) {
            return $this->{$route}($ctx);
        }
        if ($method === 'DELETE' && preg_match('#^/passkey/credentials/([^/]+)$#i', $path, $m)) {
            return $this->deleteCredential($ctx, rawurldecode($m[1]));
        }
        return null;
    }

    // ... private route handlers omitted
}

// ─────────────────────────────────────────────────────────────
// From src/Relay/RelayResponse.php
// ─────────────────────────────────────────────────────────────


namespace Touchque\Relay;

/**
 * What RelayHandler wants sent back: an HTTP status, a JSON body and headers.
 * Framework adapters turn it into their own response (see
 * Touchque\Laravel\TouchqueRelay); in plain PHP call send().
 *
 * `onAuthenticated` receives the pending success response and may change it
 * (e.g. addHeader('Set-Cookie', ...)); the handler sets the body afterwards.
 */
class RelayResponse
{
    private int $status;
    private array $body;
    /** @var array<string, array{name: string, values: string[]}> keyed by lower-case name */
    private array $headers = [];

    public function __construct(int $status = 200, array $body = [], array $headers = [])
    {
        $this->status = $status;
        $this->body = $body;
        foreach ($headers as $name => $value) {
            $this->setHeader((string)$name, (string)$value);
        }
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function setStatus(int $status): self
    {
        $this->status = $status;
        return $this;
    }

    /** The JSON body as an array (always a JSON object on the wire). */
    public function getBody(): array
    {
        return $this->body;
    }

    public function setBody(array $body): self
    {
        $this->body = $body;
        return $this;
    }

    /** Sets a header, replacing any value it had. */
    public function setHeader(string $name, string $value): self
    {
        $this->headers[strtolower($name)] = ['name' => $name, 'values' => [$value]];
        return $this;
    }

    /** Adds a header value, keeping existing ones (e.g. several Set-Cookie). */
    public function addHeader(string $name, string $value): self
    {
        $key = strtolower($name);
        if (!isset($this->headers[$key])) {
            $this->headers[$key] = ['name' => $name, 'values' => []];
        }
        $this->headers[$key]['values'][] = $value;
        return $this;
    }

    /** Case-insensitive; the first value, or null. */
    public function getHeader(string $name): ?string
    {
        return $this->headers[strtolower($name)]['values'][0] ?? null;
    }

    /**
     * @return array<string, string|string[]> name => value (a list when a header has several values)
     */
    public function getHeaders(): array
    {
        $out = [];
        foreach ($this->headers as $h) {
            $out[$h['name']] = count($h['values']) === 1 ? $h['values'][0] : $h['values'];
        }
        return $out;
    }

    /** The body encoded as JSON (an empty body is `{}`). */
    public function toJson(): string
    {
        $json = json_encode($this->body === [] ? new \stdClass() : $this->body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        return $json === false ? '{}' : $json;
    }

    /** Emits status, headers and body with PHP's own functions (plain PHP / no framework). */
    public function send(): void
    {
        if (!headers_sent()) {
            http_response_code($this->status);
            header('Content-Type: application/json; charset=utf-8');
            foreach ($this->headers as $h) {
                foreach ($h['values'] as $i => $value) {
                    header($h['name'] . ': ' . $value, $i === 0);
                }
            }
        }
        echo $this->toJson();
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Relay/RateLimitStore.php — implement over APCu/Redis under PHP-FPM
// ─────────────────────────────────────────────────────────────


namespace Touchque\Relay;

/**
 * Counter storage for FixedWindowLimiter.
 *
 * hit() must atomically count one hit for $key in its current fixed window
 * and return `['count' => int, 'resetAt' => int]`: the number of hits in that
 * window including this one, and when the window ends (unix milliseconds).
 * A new window (count 1, resetAt = $nowMs + $windowMs) starts when none is
 * open for $key or the open one has ended.
 *
 * PHP usually runs one process per request (PHP-FPM), so the in-memory
 * default (MemoryRateLimitStore) starts empty on every request there and
 * limits nothing. Implement this over a shared store instead: APCu (one
 * host) or Redis (several hosts), e.g. Redis `INCR key` + `PEXPIRE key
 * windowMs` when the count is 1, then `PTTL key` for resetAt.
 */
interface RateLimitStore
{
    /**
     * @return array{count: int, resetAt: int}
     */
    public function hit(string $key, int $windowMs, int $nowMs): array;
}

// ─────────────────────────────────────────────────────────────
// From src/Laravel/TouchqueMiddleware.php — ->middleware('touchque:ACTION')
// ─────────────────────────────────────────────────────────────


namespace Touchque\Laravel;

use Closure;
use Illuminate\Container\Container;
use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Contracts\Support\Jsonable;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Touchque\Exceptions\TouchqueConfigException;
use Touchque\Guard;
use Touchque\Touchque;

/**
 * Laravel: one line per protected route.
 *
 *     Route::post('/transfer', [TransferController::class, 'store'])
 *         ->middleware('touchque:SEND_MONEY');
 *
 * Register the alias in `bootstrap/app.php` (Laravel 11+) or
 * `app/Http/Kernel.php` (`$middlewareAliases`):
 *
 *     $middleware->alias(['touchque' => \Touchque\Laravel\TouchqueMiddleware::class]);
 *
 * The client is resolved from Laravel's container on the first request, so a
 * binding of `Touchque` in a service provider is used (for your own Config: a
 * logger, a base URL), and so is a contextual one
 * (`$app->when(TouchqueMiddleware::class)->needs(Touchque::class)->give(...)`);
 * without one it is built from TQ_API_KEY / TQ_API_SECRET:
 *
 *     $this->app->singleton(Touchque::class, fn () => new Touchque());
 *
 * A missing key never throws: a guarded route answers 500 `misconfigured`
 * (401 `unauthenticated` without a signed-in user) and never runs, and the
 * middleware logs it once through Laravel's logger.
 *
 * Until the user approves on their phone this answers
 * `202 {"touchque": step, "token": "..."}`. Your page shows the step in its
 * own design and sends the same request again with header
 * `X-Touchque-Token: <token>`. Once approved the route runs ONCE, with
 * `$request->touchque` set to the approval.
 *
 * What the phone shows (an amount, a payee): put the name of a Request
 * macro (or a method of your Request class) after the action; the array it
 * returns is shown and bound to the approval. A name that is neither
 * answers 500 `misconfigured`:
 *
 *     Request::macro('transferDetails', fn () => ['Amount' => request('amount') . ' EUR']);
 *     ->middleware('touchque:SEND_MONEY,transferDetails');
 *
 * The signed-in user comes from Laravel's own auth (`$request->user()`,
 * tried as `->email`, `->getAuthIdentifier()`, `->username`). For the login
 * route (no signed-in user yet), extend this class and override
 * `resolveUser()` to return whoever just passed your password check.
 *
 * Silent sign-ins (default off): with `silentSignIn` on, a new attempt whose
 * browser sent its device-bound key proof (`X-Touchque-Browser`, added by
 * `@touchque/web` with `browserKey: true`) first asks Touchque whether
 * anything about it is new. If nothing is, the route runs at once with no
 * push (`touchque` approval with `assurance.method` `silent` and `reasons`).
 * Otherwise, and on any error, the usual push starts and its approval makes
 * the browser known. Turn it on in a subclass
 * (`protected $silentSignIn = true;`) or when binding the middleware:
 *
 *     $this->app->bind(TouchqueMiddleware::class, fn () => new TouchqueMiddleware(
 *         null, ['silentSignIn' => ['maxAgeSeconds' => 8 * 3600]]));
 *
 * Every answer of 400 and above carries `X-Touchque-State` (and
 * `X-Touchque-Reason` when the step has a reason).
 *
 * Your own error shape (`errorBody`): every answer of 400 and above (401, 403,
 * 408, 423, 429, 500, 503; never a 202 step, never an approval) is built by
 * your callable from the refusal (`Guard::refusal()`: `status`, `code`,
 * `message`, `touchque`). What it encodes to, as JsonResponse encodes it
 * (Jsonable, Arrayable, JsonSerializable…), decides: a JSON object is sent with
 * `touchque` set to the step; anything else as it is. Status and headers stay
 * the same; a callable that throws, or a result that cannot be encoded, is
 * logged and the default body sent:
 *
 *     $this->app->bind(TouchqueMiddleware::class, fn () => new TouchqueMiddleware(null, [
 *         'errorBody' => fn (array $r) => ['message' => $r['message'], 'code' => $r['code']],
 *     ]));
 */
class TouchqueMiddleware
{
    /** Built on the first request when not given. */
    private ?Touchque $touchque;

    /**
     * Silent sign-ins: `false` (default), `true`, or `['maxAgeSeconds' => int]`
     * for your own limit on how long ago the last phone approval in that
     * browser may be (0 = always ask).
     *
     * @var bool|array
     */
    protected $silentSignIn = false;

    /**
     * For your Touchque Actions only (`event.context`): a callable taking the
     * Request and returning an array (roles, plan, amount…). Never shown on
     * the phone. Or override `resolveContext()`.
     *
     * @var callable|null
     */
    protected $context = null;

    /**
     * Your own error shape: a callable taking the refusal of an answer with
     * status >= 400 (`['status', 'code', 'message', 'touchque']`) and returning
     * the body. Set it with the `errorBody` option, or in your subclass's
     * constructor.
     *
     * @var callable|null
     */
    protected $errorBody = null;

    /**
     * @param Touchque|null $touchque the client; null (the default) resolves it
     *   from Laravel's container (your binding, or TQ_API_KEY / TQ_API_SECRET) on
     *   the first request, where a missing key is an answer, not an exception.
     * @param array $options ['silentSignIn' => bool|array, 'context' => callable(Request): array,
     *   'errorBody' => callable(array $refusal): mixed]
     */
    public function __construct($touchque = null, array $options = [])
    {
        if ($touchque !== null && !$touchque instanceof Touchque) {
            throw new \InvalidArgumentException('TouchqueMiddleware: the client must be a Touchque instance or null.');
        }
        $this->touchque = $touchque;
        if (isset($options['context'])) {
            $this->context = $options['context'];
        }
        if (array_key_exists('silentSignIn', $options)) {
            $this->silentSignIn = $options['silentSignIn'];
        }
        if (isset($options['errorBody'])) {
            $this->errorBody = $options['errorBody'];
        }
        Guard::assertSilentSignInOption($this->silentSignIn, 'TouchqueMiddleware');
        if ($this->errorBody !== null && !is_callable($this->errorBody)) {
            throw new \InvalidArgumentException('TouchqueMiddleware: "errorBody" must be callable.');
        }
    }

    public function handle(Request $request, Closure $next, string $action, ?string $detailsMethod = null)
    {
        $user = $this->resolveUser($request);
        try {
            $touchque = $this->client();
        } catch (TouchqueConfigException $err) {
            // Logged once per process, shared with Guard::run(null, ...).
            Guard::logUnconfigured($err);
            return $this->respond($user ? Guard::misconfigured() : Guard::unauthenticated());
        }

        $details = null;
        if ($detailsMethod) {
            // A Request macro (Request::macro('transferDetails', ...)) is how a route usually adds
            // one; method_exists() does not see macros. A name that is neither must not approve
            // without the details the route meant the phone to show.
            if (!method_exists($request, $detailsMethod) && !$request::hasMacro($detailsMethod)) {
                $touchque->log('error', "[Touchque] TouchqueMiddleware: the Request has no method or macro \"{$detailsMethod}\" for the details");
                return $this->respond(Guard::misconfigured());
            }
            $details = $request->{$detailsMethod}();
        }

        $header = fn (string $name) => $request->header($name);
        $input = Guard::inputFromHeaders($header);
        $silent = Guard::silentInputFromHeaders($this->silentSignIn, $header);

        $result = Guard::run(
            $touchque,
            $user,
            $action,
            $details,
            null,
            $request->ip(),
            $request->userAgent(),
            $input['token'],
            $input['offline'],
            $input['code'],
            $input['codeType'],
            true,
            $silent['browserProof'],
            $silent['silentSignIn'],
            $this->resolveContext($request)
        );

        if (isset($result['approved'])) {
            // $request->attributes->get('touchque') in your route — Request
            // doesn't declare a $touchque property, so we don't set one dynamically.
            $request->attributes->set('touchque', $result['approved']);
            return $next($request);
        }

        return $this->respond($result);
    }

    /**
     * Who is approving. Default: the authenticated user's email, auth
     * identifier, or username. Override in a subclass for the login step,
     * where you should return the user who just passed your password check
     * instead of `$request->user()`.
     */
    protected function resolveUser(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }
        return $user->email ?? (method_exists($user, 'getAuthIdentifier') ? (string)$user->getAuthIdentifier() : null) ?? $user->username ?? null;
    }

    /** What your Touchque Actions get as `event.context` (default: the `context` option, or none). */
    protected function resolveContext(Request $request): ?array
    {
        return $this->context ? ($this->context)($request) : null;
    }

    /**
     * The client given, else Laravel's container `Touchque` (your binding, or one
     * built from TQ_API_KEY / TQ_API_SECRET), kept once built. Throws
     * TouchqueConfigException when it cannot be built.
     */
    private function client(): Touchque
    {
        if ($this->touchque === null) {
            $this->touchque = class_exists(Container::class)
                ? $this->fromContainer(Container::getInstance())
                : new Touchque();
        }
        return $this->touchque;
    }

    /**
     * What constructor injection gave before 5.1: a contextual binding for this
     * middleware (`$app->when(TouchqueMiddleware::class)->needs(Touchque::class)`),
     * else the container's `Touchque`.
     */
    private function fromContainer(Container $app): Touchque
    {
        foreach (array_unique([static::class, self::class]) as $class) {
            // Public in Laravel 9-11; `??` reads it as missing anywhere it is not.
            $given = $app->contextual[$class][Touchque::class] ?? null;
            if ($given instanceof Closure) {
                return $given($app, []);
            }
            if (is_string($given)) {
                return $app->make($given);
            }
            if ($given instanceof Touchque) {
                return $given;
            }
        }
        return $app->make(Touchque::class);
    }

    /** The JSON answer for a result that is not an approval: Guard::response() with your errorBody. */
    private function respond(array $result): JsonResponse
    {
        $errorBody = $this->errorBody;
        $answer = Guard::response(
            $result,
            $errorBody === null ? null : static fn (array $refusal) => self::asJsonResponseEncodes($errorBody($refusal)),
            $this->touchque
        );
        if ($answer['body'] === null) {
            // Encoded here so that null is sent as null (JsonResponse would send {}).
            return new JsonResponse('null', $answer['status'], $answer['headers'], 0, true);
        }
        // The same bytes, and getOriginalContent() is the body.
        return new JsonResponse($answer['body'], $answer['status'], $answer['headers']);
    }

    /**
     * An errorBody result in the form JsonResponse encodes it: a Jsonable as its
     * JSON (objects stay objects), a JsonSerializable as it is, an Arrayable as its
     * array. Guard::errorBody() then decides by the JSON.
     *
     * @param mixed $value
     * @return mixed
     */
    private static function asJsonResponseEncodes($value)
    {
        if (interface_exists(Jsonable::class) && $value instanceof Jsonable) {
            return json_decode($value->toJson(), false, 512, JSON_THROW_ON_ERROR);
        }
        if ($value instanceof \JsonSerializable) {
            return $value;
        }
        if (interface_exists(Arrayable::class) && $value instanceof Arrayable) {
            return $value->toArray();
        }
        return $value;
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Laravel/TouchqueRelay.php — TouchqueRelay::routes($router, 'touchque')
// ─────────────────────────────────────────────────────────────


namespace Touchque\Laravel;

use Illuminate\Contracts\Routing\Registrar;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Touchque\Relay\RelayHandler;
use Touchque\Relay\RelayResponse;
use Touchque\Touchque;

/**
 * Laravel: every relay route a frontend (`@touchque/web`) needs — POST /login,
 * enrollment, offline codes, passkey ceremonies — as one controller. See
 * `Touchque\Relay\RelayHandler` for the routes, options and security rules.
 *
 * Bind it once in a service provider with your options (the callables get the
 * Illuminate `Request`; `onAuthenticated` also gets the pending
 * `RelayResponse`, whose headers you may change):
 *
 *     $this->app->singleton(TouchqueRelay::class, fn ($app) => new TouchqueRelay($app->make(Touchque::class), [
 *         'getLoginUser' => fn (Request $r) => $r->session()->get('password_verified_user'),
 *         'onAuthenticated' => function (Request $r, RelayResponse $res, array $info) {
 *             $r->session()->regenerate();
 *             $r->session()->put('touchque_user', $info['externalUsername']);
 *         },
 *         // Silent sign-ins: a known browser (X-Touchque-Browser) with nothing new skips the push.
 *         'silentSignIn' => true,
 *     ]));
 *
 * and register the routes, e.g. in routes/web.php (session middleware needed
 * for getLoginUser/onAuthenticated):
 *
 *     TouchqueRelay::routes(app('router'), 'touchque');
 *
 * Routes point at this class (no closures), so `php artisan route:cache` works.
 * Without a `getUserId` option the signed-in user comes from Laravel's own auth
 * (`$request->user()`, tried as `->email`, `->getAuthIdentifier()`, `->username`),
 * like TouchqueMiddleware. `$request->ip()` must be the real client: configure
 * TrustProxies behind a load balancer.
 */
class TouchqueRelay
{
    private RelayHandler $handler;

    public function __construct(Touchque $touchque, array $options = [])
    {
        if (!isset($options['getUserId'])) {
            $options['getUserId'] = function (Request $request): ?string {
                return $this->resolveUser($request);
            };
        }
        $this->handler = new RelayHandler($touchque, $options);
    }

    /**
     * Registers the 14 relay routes under $prefix on a Laravel router
     * (`app('router')`, or the `$router` a `Route::group()` closure receives).
     */
    public static function routes(Registrar $router, string $prefix = 'touchque'): void
    {
        $p = trim($prefix, '/');
        $p = $p === '' ? '' : '/' . $p;
        $c = static::class;

        $router->post($p . '/enroll/start', [$c, 'enrollStart']);
        $router->get($p . '/enroll/status', [$c, 'enrollStatus']);
        $router->post($p . '/login', [$c, 'login']);
        $router->post($p . '/offline/challenge', [$c, 'offlineChallenge']);
        $router->post($p . '/offline/verify', [$c, 'offlineVerify']);
        $router->post($p . '/offline/totp', [$c, 'offlineTotp']);
        $router->post($p . '/passkey/authenticate/options', [$c, 'passkeyAuthenticateOptions']);
        $router->post($p . '/passkey/authenticate/verify', [$c, 'passkeyAuthenticateVerify']);
        $router->post($p . '/passkey/login/options', [$c, 'passkeyLoginOptions']);
        $router->post($p . '/passkey/login/verify', [$c, 'passkeyLoginVerify']);
        $router->post($p . '/passkey/register/options', [$c, 'passkeyRegisterOptions']);
        $router->post($p . '/passkey/register/verify', [$c, 'passkeyRegisterVerify']);
        $router->get($p . '/passkey/credentials', [$c, 'passkeyCredentials']);
        $router->delete($p . '/passkey/credentials/{id}', [$c, 'deleteCredential']);
    }

    public function enrollStart(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/enroll/start');
    }

    public function enrollStatus(Request $request): JsonResponse
    {
        return $this->relay($request, 'GET', '/enroll/status');
    }

    public function login(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/login');
    }

    public function offlineChallenge(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/offline/challenge');
    }

    public function offlineVerify(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/offline/verify');
    }

    public function offlineTotp(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/offline/totp');
    }

    public function passkeyAuthenticateOptions(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/passkey/authenticate/options');
    }

    public function passkeyAuthenticateVerify(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/passkey/authenticate/verify');
    }

    public function passkeyLoginOptions(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/passkey/login/options');
    }

    public function passkeyLoginVerify(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/passkey/login/verify');
    }

    public function passkeyRegisterOptions(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/passkey/register/options');
    }

    public function passkeyRegisterVerify(Request $request): JsonResponse
    {
        return $this->relay($request, 'POST', '/passkey/register/verify');
    }

    public function passkeyCredentials(Request $request): JsonResponse
    {
        return $this->relay($request, 'GET', '/passkey/credentials');
    }

    public function deleteCredential(Request $request, string $id): JsonResponse
    {
        return $this->relay($request, 'DELETE', '/passkey/credentials/' . rawurlencode($id));
    }

    /** Runs one relay route for a Laravel request and returns Laravel's JSON response. */
    public function relay(Request $request, string $method, string $path): JsonResponse
    {
        // JSON bodies only, like the Node router behind express.json().
        $body = $request->isJson() ? $request->json()->all() : [];
        $res = $this->handler->handle(
            $method,
            $path,
            is_array($body) ? $body : [],
            (string)$request->ip(),
            $request->userAgent(),
            function (string $name) use ($request): ?string {
                $value = $request->header($name);
                return is_string($value) ? $value : null;
            },
            $request
        );
        if ($res === null) {
            return new JsonResponse(['error' => 'not_found'], 404);
        }
        return self::toJsonResponse($res);
    }

    public static function toJsonResponse(RelayResponse $res): JsonResponse
    {
        $body = $res->getBody();
        return new JsonResponse($body === [] ? new \stdClass() : $body, $res->getStatus(), $res->getHeaders());
    }

    /**
     * The signed-in user when no `getUserId` option is given. Default: the
     * authenticated user's email, auth identifier, or username.
     */
    protected function resolveUser(Request $request): ?string
    {
        $user = $request->user();
        if (!$user) {
            return null;
        }
        return $user->email ?? (method_exists($user, 'getAuthIdentifier') ? (string)$user->getAuthIdentifier() : null) ?? $user->username ?? null;
    }
}

// ─────────────────────────────────────────────────────────────
// From src/CrossAppAccess.php, src/IdJagVerifier.php — Cross App Access: ID-JAG, DPoP binding
// ─────────────────────────────────────────────────────────────


namespace Touchque;

use Touchque\Exceptions\TouchqueConfigException;
use Touchque\Exceptions\TouchqueIdJagException;
use Touchque\Exceptions\TouchqueNetworkException;

/**
 * Cross App Access: Identity Assertion JWT Authorization Grants (ID-JAG,
 * draft-ietf-oauth-identity-assertion-authz-grant, an open standard). An
 * organization's identity provider (Touchque SSO) decides which of its apps
 * may reach which other service for its members; the app trades a member's ID
 * token for an ID-JAG there, then the ID-JAG for an access token at the other
 * service's authorization server, with no consent screen per member.
 *
 *   $jag = CrossAppAccess::requestIdJag(['issuer' => 'https://sso.touchque.com', 'clientId' => $id, 'clientSecret' => $secret,
 *                                        'idToken' => $idToken, 'audience' => 'https://auth.files.example']);
 *   $tokens = CrossAppAccess::redeemIdJag(['tokenEndpoint' => 'https://auth.files.example/token', 'clientId' => 'acme',
 *                                          'clientSecret' => $filesSecret, 'assertion' => $jag['assertion']]);
 *
 * Sender-constrained with DPoP (RFC 9449), optional: give the same key to both calls. The ID-JAG is
 * then bound to it (cnf.jkt) and is useless to anyone who copies it without the key.
 *
 *   $dpopKey = CrossAppAccess::createIdJagDpopKey();
 *   $jag = CrossAppAccess::requestIdJag([... , 'dpopKey' => $dpopKey]);      // $jag['dpopBound']
 *   $tokens = CrossAppAccess::redeemIdJag([... , 'assertion' => $jag['assertion'], 'dpopKey' => $dpopKey]);
 *
 * A token endpoint that asks for a DPoP nonce (use_dpop_nonce, with one valid DPoP-Nonce header) gets
 * the same request once more with it. Each call with a DPoP-bound access token ($tokens['token_type']
 * 'DPoP') sends `Authorization: DPoP <access token>` and a new proof for that request:
 *
 *   $proof = CrossAppAccess::idJagDpopProof($dpopKey, $url, ['method' => 'GET', 'accessToken' => $tokens['access_token']]);
 *
 * Your own authorization server takes them with IdJagVerifier (pass the DPoP proof key's
 * thumbprint as its third argument: a bound ID-JAG without it is refused).
 */
final class CrossAppAccess
{
    public const ID_JAG_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id-jag';
    public const ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token';
    public const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
    public const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

    /** The options idJagDpopProof() takes. */
    private const PROOF_OPTIONS = ['method', 'accessToken', 'nonce'];

    /** RFC 9110 tchar: the characters of a token (an HTTP method, an auth-scheme, an auth-param name). */
    private const TCHAR = '!#$%&\'*+-.^_`|~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

    /** ASCII case mapping with strtr: strtolower()/strtoupper() follow the locale before PHP 8.2. */
    private const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    private const LOWER = 'abcdefghijklmnopqrstuvwxyz';

    /** @internal https, or http on this machine (tests). */
    public static function safeUrl(string $url): bool
    {
        $u = parse_url($url);
        $host = $u['host'] ?? '';
        return ($u['scheme'] ?? '') === 'https' || (($u['scheme'] ?? '') === 'http' && in_array($host, ['localhost', '127.0.0.1', '[::1]'], true));
    }

    /**
     * A fresh DPoP key (RFC 9449, P-256) for requestIdJag and redeemIdJag; keep it in this process.
     * `['privateKey' => OpenSSLAsymmetricKey, 'publicJwk' => array, 'thumbprint' => string]`, the
     * thumbprint (RFC 7638) being the ID-JAG's cnf.jkt.
     */
    public static function createIdJagDpopKey(): array
    {
        $jwk = AgentKeys::generate('ES256')['privateJwk'];
        $public = ['kty' => 'EC', 'crv' => 'P-256', 'x' => $jwk['x'], 'y' => $jwk['y']];
        $key = openssl_pkey_get_private(AgentKeys::ecPem(AgentKeys::b64urlDecode($jwk['d']), AgentKeys::b64urlDecode($jwk['x']), AgentKeys::b64urlDecode($jwk['y'])));
        if ($key === false) {
            throw new TouchqueConfigException('Could not make a DPoP key');
        }
        return ['privateKey' => $key, 'publicJwk' => $public, 'thumbprint' => AgentKeys::thumbprint($public)];
    }

    /**
     * A DPoP proof (RFC 9449) with a key from createIdJagDpopKey(), for one request to $url. Options (a
     * string or null each; an option name not listed here, such as 'access_token', or a value of another
     * type throws TouchqueConfigException naming it):
     *  - method: the request's HTTP method, trimmed and uppercased (htm); empty or left out: POST. A method
     *    with a character that is not an RFC 9110 token character throws TouchqueConfigException.
     *  - accessToken: for a call with a DPoP-bound access token (sent as `Authorization: DPoP <access token>`):
     *    adds ath, the token's SHA-256 hash.
     *  - nonce: the server's DPoP-Nonce: adds the nonce claim (as given: not checked for nonce syntax).
     * htu is $url with its scheme and host lowercased, the default port (80 for http, 443 for https) dropped,
     * "/" for an empty path, the path kept as given (no dot-segment removal, no percent-encoding changes), and
     * no user info, query or fragment; a URL that is not an absolute http or https URL, or that has a control
     * character, throws TouchqueConfigException. The header's jwk is rebuilt from the key as exactly kty, crv,
     * x and y.
     */
    public static function idJagDpopProof(array $key, string $url, array $options = []): string
    {
        $unknown = array_diff(array_map('strval', array_keys($options)), self::PROOF_OPTIONS);
        if ($unknown) {
            throw new TouchqueConfigException('CrossAppAccess::idJagDpopProof(): unknown option(s) ' . implode(', ', $unknown)
                . ' (options are camelCase: ' . implode(', ', self::PROOF_OPTIONS) . ')');
        }
        foreach (self::PROOF_OPTIONS as $name) {
            if (isset($options[$name]) && !is_string($options[$name])) {
                throw new TouchqueConfigException("CrossAppAccess::idJagDpopProof(): {$name} must be a string");
            }
        }
        $jwk = self::dpopPublicJwk($key);
        $claims = ['htm' => self::htm($options['method'] ?? ''), 'htu' => self::htu($url), 'iat' => time(), 'jti' => bin2hex(random_bytes(16))];
        if (($options['accessToken'] ?? '') !== '') {
            $claims['ath'] = AgentKeys::b64url(hash('sha256', $options['accessToken'], true));
        }
        if (($options['nonce'] ?? '') !== '') {
            $claims['nonce'] = $options['nonce'];
        }
        $header = json_encode(['typ' => 'dpop+jwt', 'alg' => 'ES256', 'jwk' => $jwk], JSON_UNESCAPED_SLASHES);
        $payload = json_encode($claims, JSON_UNESCAPED_SLASHES);
        if ($header === false || $payload === false) {
            throw new TouchqueConfigException('Could not encode the DPoP proof: ' . json_last_error_msg());
        }
        $input = AgentKeys::b64url($header) . '.' . AgentKeys::b64url($payload);
        if (!openssl_sign($input, $der, $key['privateKey'], OPENSSL_ALGO_SHA256)) {
            throw new TouchqueConfigException('Could not sign with the DPoP key');
        }
        return $input . '.' . AgentKeys::b64url(AgentKeys::derToRaw($der));
    }

    /**
     * The public part of a key from createIdJagDpopKey(), rebuilt from its private key as exactly kty, crv,
     * x and y, whatever else the key array carries. Anything else throws TouchqueConfigException: a private
     * key that is not P-256, or a publicJwk that is not its public part.
     */
    private static function dpopPublicJwk(array $key): array
    {
        $private = $key['privateKey'] ?? null;
        $given = $key['publicJwk'] ?? null;
        $ec = null;
        if ($private instanceof \OpenSSLAsymmetricKey || (is_resource($private) && get_resource_type($private) === 'OpenSSL key')) {
            $ec = openssl_pkey_get_details($private)['ec'] ?? null;
        }
        if (!is_array($ec) || ($ec['curve_name'] ?? null) !== 'prime256v1' || !isset($ec['d'], $ec['x'], $ec['y']) || !is_array($given)) {
            throw new TouchqueConfigException('the DPoP key must be one from createIdJagDpopKey()');
        }
        $jwk = ['kty' => 'EC', 'crv' => 'P-256', 'x' => AgentKeys::b64url(str_pad($ec['x'], 32, "\0", STR_PAD_LEFT)), 'y' => AgentKeys::b64url(str_pad($ec['y'], 32, "\0", STR_PAD_LEFT))];
        if (($given['x'] ?? null) !== $jwk['x'] || ($given['y'] ?? null) !== $jwk['y']) {
            throw new TouchqueConfigException('the DPoP key must be one from createIdJagDpopKey()');
        }
        return $jwk;
    }

    /**
     * RFC 9449 htm: $method with ASCII whitespace (space, \t, \n, \r, \v, \f; not NUL, not U+00A0) trimmed and
     * uppercased, POST when that leaves nothing; only RFC 9110 token characters.
     */
    private static function htm(string $method): string
    {
        $htm = strtr(trim($method, " \t\n\r\x0B\x0C"), self::LOWER, self::UPPER);
        if ($htm === '') {
            return 'POST';
        }
        if (strspn($htm, self::TCHAR) !== strlen($htm)) {
            throw new TouchqueConfigException('CrossAppAccess::idJagDpopProof(): method ' . json_encode($method, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE)
                . ' is not an HTTP method (RFC 9110 token characters only)');
        }
        return $htm;
    }

    /**
     * RFC 9449 htu of $url, an absolute http or https URL: scheme and host lowercased, the default port (80 for
     * http, 443 for https) dropped, "/" for an empty path, the path kept as given, and no user info, query or
     * fragment.
     */
    private static function htu(string $url): string
    {
        if (preg_match('/[\x00-\x1F\x7F]/', $url)) {
            // parse_url() would turn it into "_": the htu would not be the URL the request goes to.
            throw new TouchqueConfigException('the URL ' . addcslashes($url, "\0..\37\177") . ' has a control character');
        }
        $u = parse_url($url);
        $scheme = is_array($u) ? strtr($u['scheme'] ?? '', self::UPPER, self::LOWER) : '';
        if (($scheme !== 'http' && $scheme !== 'https') || ($u['host'] ?? '') === '') {
            throw new TouchqueConfigException("{$url} is not an absolute http or https URL");
        }
        $defaultPort = ['http' => 80, 'https' => 443][$scheme];
        $port = isset($u['port']) && $u['port'] !== $defaultPort ? ':' . $u['port'] : '';
        $path = $u['path'] ?? '';
        return $scheme . '://' . strtr($u['host'], self::UPPER, self::LOWER) . $port . ($path === '' ? '/' : $path);
    }

    /** @internal The identity provider's OpenID configuration, checked against its issuer. */
    public static function discover(string $issuer): array
    {
        $meta = McpAuth::getJson(rtrim($issuer, '/') . '/.well-known/openid-configuration');
        if (($meta['issuer'] ?? null) !== $issuer) {
            throw new TouchqueConfigException("the identity provider's metadata does not match its issuer");
        }
        return $meta;
    }

    /**
     * One token request: [the answer, a JSON object; the latest valid DPoP-Nonce the server sent (else null)].
     * Only a 2xx answer that is a JSON object is one: any other status (a redirect is not followed) throws
     * TouchqueIdJagException with the answer's error (server_error when it is not an RFC 6749 error code), a
     * 2xx that is not a JSON object invalid_response, and a request that gets no answer curl can read
     * temporarily_unavailable; each with that nonce.
     */
    private static function postForm(string $url, array $form, ?array $basic, ?array $dpopKey = null): array
    {
        if (!self::safeUrl($url)) {
            throw new TouchqueConfigException("{$url} must be an https URL");
        }
        $target = self::wireUrl($url);
        $body = http_build_query(array_filter($form, static fn ($v) => $v !== null), '', '&', PHP_QUERY_RFC3986);
        $headers = ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'];
        if ($basic !== null) {
            $headers[] = 'Authorization: Basic ' . base64_encode(rawurlencode($basic[0]) . ':' . rawurlencode($basic[1]));
        }
        $answer = self::send($url, $target, $body, $headers, $dpopKey, null);
        $nonce = $answer['nonce'];
        // RFC 9449 section 8: the server wants its nonce in the proof. When its DPoP-Nonce header is one valid
        // value, the same request (body, client authentication) goes once more with a new proof carrying it;
        // never more than once.
        if ($dpopKey !== null && $nonce !== null && self::asksForNonce($answer)) {
            $answer = self::send($url, $target, $body, $headers, $dpopKey, $nonce);
            $nonce = $answer['nonce'] ?? $nonce; // the retry's answer's, when it has one
        }
        $status = $answer['status'];
        $data = $answer['data'];
        if ($status < 200 || $status > 299) {
            // The code comes from the body only (never from WWW-Authenticate, which only decides the retry).
            $description = $data['error_description'] ?? null;
            throw new TouchqueIdJagException(self::errorCode($data['error'] ?? null),
                is_string($description) && $description !== '' ? $description : "{$url} answered {$status}", $status ?: null, $nonce);
        }
        if ($data === null) {
            throw new TouchqueIdJagException('invalid_response', "{$url} answered {$status} without a JSON object", $status, $nonce);
        }
        return [$data, $nonce];
    }

    /**
     * The OAuth error code of a refusal (RFC 6749 section 5.2): the answer's error when it is a string of 1 to 128
     * error characters (%x20-21 / %x23-5B / %x5D-7E: printable ASCII but " and \), else server_error.
     */
    private static function errorCode($error): string
    {
        return is_string($error) && strlen($error) <= 128 && preg_match('/^[\x20\x21\x23-\x5B\x5D-\x7E]+$/D', $error) === 1 ? $error : 'server_error';
    }

    /**
     * $url as curl sends it, so that the proof's htu is the path on the wire: in its path each byte from 0x80 up
     * percent-encoded and the hex digits of each percent-encoding uppercased (what libcurl does to the path,
     * the case in its recent versions only), everything else as given. With CURLOPT_PATH_AS_IS, curl then sends
     * that path unchanged, dot segments included.
     */
    private static function wireUrl(string $url): string
    {
        if (!preg_match('~^([^:/?#]+://[^/?#]*)([^?#]*)(.*)$~sD', $url, $m)) {
            return $url;
        }
        $path = preg_replace_callback('/%[0-9A-Fa-f]{2}|[\x80-\xFF]/', static function (array $c): string {
            return $c[0][0] === '%' ? strtr($c[0], 'abcdef', 'ABCDEF') : sprintf('%%%02X', ord($c[0]));
        }, $m[2]);
        return $path === null ? $url : $m[1] . $path . $m[3];
    }

    /**
     * One POST to $target ($url as curl sends it), with a new DPoP proof when there is a key: ['status', 'data'
     * (the answer when it is a JSON object, else null), 'nonce' (the DPoP-Nonce header when it is one value of
     * valid nonce syntax, else null), 'challenge' (WWW-Authenticate)]. No answer curl can read (refused, reset,
     * DNS, timeout, a malformed or oversized answer, a body cut short) throws TouchqueIdJagException
     * temporarily_unavailable with no status, $nonce (the latest valid DPoP-Nonce of the call so far: the one
     * this request's proof carries) and curl's error as its previous exception; a URL curl refuses to send
     * throws TouchqueConfigException.
     */
    private static function send(string $url, string $target, string $body, array $headers, ?array $dpopKey, ?string $nonce): array
    {
        if ($dpopKey !== null) {
            $headers[] = 'DPoP: ' . self::idJagDpopProof($dpopKey, $target, ['nonce' => $nonce]);
        }
        $received = [];
        $ch = curl_init($target);
        $options = [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_FOLLOWLOCATION => false, CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$received): int {
                if (strncasecmp($line, 'HTTP/', 5) === 0) {
                    $received = []; // a new response: only the last one's headers count (not a 100 Continue's)
                } elseif (($colon = strpos($line, ':')) !== false) {
                    $name = strtr(trim(substr($line, 0, $colon), " \t"), self::UPPER, self::LOWER);
                    $received[$name][] = trim(substr($line, $colon + 1), " \t\r\n");
                }
                return strlen($line);
            },
        ];
        if (defined('CURLOPT_PATH_AS_IS')) { // libcurl 7.42 and later
            $options[CURLOPT_PATH_AS_IS] = true; // no dot-segment removal: the path the proof's htu has
        }
        curl_setopt_array($ch, $options);
        $raw = curl_exec($ch);
        if (!is_string($raw)) {
            $errno = curl_errno($ch);
            $why = curl_error($ch) ?: curl_strerror($errno);
            if ($errno === CURLE_URL_MALFORMAT) {
                throw new TouchqueConfigException("{$url} is not a URL curl can send: {$why}");
            }
            throw new TouchqueIdJagException('temporarily_unavailable', "{$url} could not be read: {$why}", null, $nonce,
                new TouchqueNetworkException($why, $errno));
        }
        $nonces = array_values(array_unique($received['dpop-nonce'] ?? []));
        return [
            'status' => (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'data' => self::jsonObject($raw),
            'nonce' => count($nonces) === 1 && self::isNonce($nonces[0]) ? $nonces[0] : null,
            'challenge' => implode(', ', $received['www-authenticate'] ?? []),
        ];
    }

    /** $raw decoded when it is a JSON object, else null (not JSON, or a JSON string, number, boolean, null or list). */
    private static function jsonObject(string $raw): ?array
    {
        if (($raw[strspn($raw, " \t\n\r")] ?? '') !== '{') {
            return null;
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : null;
    }

    /** RFC 9449 section 8.1: nonce = 1*NQCHAR, NQCHAR = %x21 / %x23-5B / %x5D-7E (printable ASCII but space, " and \). */
    private static function isNonce(string $value): bool
    {
        return preg_match('/^[\x21\x23-\x5B\x5D-\x7E]++$/D', $value) === 1;
    }

    /** RFC 9449 section 8: a 400 or 401 use_dpop_nonce, in the JSON body or a 401's WWW-Authenticate DPoP challenge. */
    private static function asksForNonce(array $answer): bool
    {
        if ($answer['status'] !== 400 && $answer['status'] !== 401) {
            return false;
        }
        return ($answer['data']['error'] ?? null) === 'use_dpop_nonce'
            || ($answer['status'] === 401 && self::dpopChallengeAsksForNonce($answer['challenge']));
    }

    /**
     * Whether a WWW-Authenticate value (RFC 9110 section 11.6.1; several fields joined with commas) has a
     * DPoP challenge with error="use_dpop_nonce" (RFC 9449 section 9). Scheme and parameter names match
     * in any case; a quoted value counts with its quoted-pairs undone. One pass from left to right with
     * strspn()/strcspn(), never backing up: linear in the header's length, whatever it holds.
     */
    private static function dpopChallengeAsksForNonce(string $header): bool
    {
        $n = strlen($header);
        $scheme = '';
        $i = 0;
        while ($i < $n) {
            $i += strspn($header, " \t,", $i);
            if ($i >= $n) {
                break;
            }
            $len = strspn($header, self::TCHAR, $i);
            if ($len === 0) {
                $i = self::elementEnd($header, $i); // not a token (a stray character): skip this list element
                continue;
            }
            $name = strtr(substr($header, $i, $len), self::UPPER, self::LOWER);
            $i += $len;
            $j = $i + strspn($header, " \t", $i);
            if ($j < $n && $header[$j] === '=') {
                // auth-param = token BWS "=" BWS ( token / quoted-string )
                $k = $j + 1 + strspn($header, " \t", $j + 1);
                $value = null;
                if ($k < $n && $header[$k] === '"') {
                    [$value, $i] = self::quotedString($header, $k);
                } elseif (($valueLength = strspn($header, self::TCHAR, $k)) > 0) {
                    $value = substr($header, $k, $valueLength);
                    $i = $k + $valueLength;
                } else {
                    $i = self::elementEnd($header, $j); // a token68's "=" padding, or nothing after "="
                }
                if ($scheme === 'dpop' && $name === 'error' && $value === 'use_dpop_nonce') {
                    return true;
                }
            } elseif ($j === $n || $header[$j] === ',' || $j > $i) {
                $scheme = $name; // an auth-scheme: a new challenge
                $i = $j;
            } else {
                $i = self::elementEnd($header, $i); // a token68 such as abc/def
            }
        }
        return false;
    }

    /** The offset of the comma that ends the list element at $i (quoted strings skipped whole), or the end. */
    private static function elementEnd(string $s, int $i): int
    {
        $n = strlen($s);
        while ($i < $n) {
            $i += strcspn($s, ',"', $i);
            if ($i >= $n || $s[$i] === ',') {
                break;
            }
            $i = self::quotedString($s, $i)[1];
        }
        return $i;
    }

    /**
     * The quoted-string at $start (its opening quote): [its value with the quoted-pairs undone, or null when
     * it never closes; the offset after it].
     */
    private static function quotedString(string $s, int $start): array
    {
        $n = strlen($s);
        $value = '';
        $i = $start + 1;
        while ($i < $n) {
            $run = strcspn($s, '"\\', $i);
            $value .= substr($s, $i, $run);
            $i += $run;
            if ($i >= $n) {
                break;
            }
            if ($s[$i] === '"') {
                return [$value, $i + 1];
            }
            $value .= substr($s, $i + 1, 1); // a quoted-pair: the character after the backslash
            $i += 2;
        }
        return [null, $n];
    }

    private static function scopeText($scope): ?string
    {
        return is_array($scope) ? implode(' ', $scope) : $scope;
    }

    /** The dpopKey option: null or an array (checked in full when its first proof is made). */
    private static function dpopKeyOption(array $o): ?array
    {
        $key = $o['dpopKey'] ?? null;
        if ($key !== null && !is_array($key)) {
            throw new TouchqueConfigException('the DPoP key must be one from createIdJagDpopKey()');
        }
        return $key;
    }

    /**
     * Trades a member's ID token for an ID-JAG at the identity provider (token exchange, client_secret_basic).
     * Options: issuer or tokenEndpoint, clientId, clientSecret, idToken, audience, resource?, scope?,
     * dpopKey? (binds the ID-JAG to that key; redeem it with the same key).
     * Returns ['assertion' => …, 'expiresIn' => …, 'scope' => …], plus with dpopKey 'dpopBound': whether
     * the returned ID-JAG carries that key's thumbprint (cnf.jkt). Throws TouchqueIdJagException as
     * redeemIdJag does, and invalid_response for a JSON object that is not an ID-JAG.
     */
    public static function requestIdJag(array $o): array
    {
        $dpopKey = self::dpopKeyOption($o);
        $endpoint = $o['tokenEndpoint'] ?? null;
        if (!$endpoint) {
            if (empty($o['issuer'])) {
                throw new TouchqueConfigException('requestIdJag needs issuer or tokenEndpoint');
            }
            $endpoint = self::discover($o['issuer'])['token_endpoint'] ?? null;
            if (!is_string($endpoint)) {
                throw new TouchqueConfigException('the identity provider names no token_endpoint');
            }
        }
        [$data, $nonce] = self::postForm($endpoint, [
            'grant_type' => self::TOKEN_EXCHANGE_GRANT, 'requested_token_type' => self::ID_JAG_TOKEN_TYPE,
            'subject_token' => $o['idToken'] ?? '', 'subject_token_type' => self::ID_TOKEN_TYPE, 'audience' => $o['audience'] ?? '',
            'resource' => $o['resource'] ?? null, 'scope' => self::scopeText($o['scope'] ?? null),
        ], [$o['clientId'] ?? '', $o['clientSecret'] ?? ''], $dpopKey);
        if (($data['issued_token_type'] ?? null) !== self::ID_JAG_TOKEN_TYPE || !is_string($data['access_token'] ?? null)) {
            throw new TouchqueIdJagException('invalid_response', 'the identity provider did not answer with an ID-JAG', null, $nonce);
        }
        $out = ['assertion' => $data['access_token'], 'expiresIn' => $data['expires_in'] ?? null, 'scope' => $data['scope'] ?? null];
        if ($dpopKey !== null) {
            // An identity provider without DPoP support ignores the proof: say so instead of guessing.
            $parts = explode('.', $data['access_token']);
            $claims = count($parts) === 3 ? json_decode(AgentKeys::b64urlDecode($parts[1]), true) : null;
            $jkt = is_array($claims) && is_array($claims['cnf'] ?? null) ? ($claims['cnf']['jkt'] ?? null) : null;
            $out['dpopBound'] = is_string($jkt) && $jkt === AgentKeys::thumbprint(self::dpopPublicJwk($dpopKey));
        }
        return $out;
    }

    /**
     * Trades an ID-JAG for an access token at the other service's authorization server (jwt-bearer).
     * Options: tokenEndpoint, clientId, clientSecret?, assertion, resource?, scope?, dpopKey? (the key the
     * ID-JAG is bound to: a DPoP proof goes along, and the access token is then DPoP-bound too: each
     * call with it carries idJagDpopProof($dpopKey, $url, ['method' => …, 'accessToken' => …])).
     * Returns the token endpoint's answer, a JSON object. Anything else throws TouchqueIdJagException (here
     * and in requestIdJag): an answer that is not 2xx (a redirect is not followed), with that status and the
     * answer's error when it is an RFC 6749 error code (1 to 128 printable ASCII characters but " and \), else
     * server_error; a 2xx that is not a JSON object, invalid_response with that status; no answer curl can read
     * (refused, reset, DNS, timeout, a malformed or oversized answer, a body cut short), temporarily_unavailable
     * with no status, curl's error being its getPrevious() (a TouchqueNetworkException with curl's message and
     * CURLE_* number). A URL curl refuses to send throws TouchqueConfigException.
     * With dpopKey, a 400 or 401 use_dpop_nonce whose DPoP-Nonce header is one value of valid nonce syntax
     * (RFC 9449: printable ASCII but space, " and \) gets the same request once more with a proof carrying
     * that nonce (here and in requestIdJag); a missing or empty one, one repeated with different values, or
     * an invalid one gets no retry. A TouchqueIdJagException carries in $dpopNonce the latest valid
     * DPoP-Nonce the server sent in the call: the retry's answer's when it has one, else the first answer's
     * (null when there is none; an invalid value is never put there).
     */
    public static function redeemIdJag(array $o): array
    {
        $dpopKey = self::dpopKeyOption($o);
        $secret = $o['clientSecret'] ?? null;
        return self::postForm($o['tokenEndpoint'] ?? '', [
            'grant_type' => self::JWT_BEARER_GRANT, 'assertion' => $o['assertion'] ?? '',
            'resource' => $o['resource'] ?? null, 'scope' => self::scopeText($o['scope'] ?? null),
            'client_id' => $secret ? null : ($o['clientId'] ?? ''),
        ], $secret ? [$o['clientId'] ?? '', $secret] : null, $dpopKey)[0];
    }
}


namespace Touchque;

use Touchque\Exceptions\TouchqueConfigException;
use Touchque\Exceptions\TouchqueIdJagException;

/**
 * Your authorization server, taking ID-JAGs (Cross App Access) from an
 * organization's identity provider: checks the one an authenticated client
 * presents with the jwt-bearer grant and uses it once.
 *
 *   $v = new IdJagVerifier(['issuer' => 'https://sso.touchque.com', 'audience' => 'https://auth.files.example']);
 *   $claims = $v->verify($_POST['assertion'], $authenticatedClientId);
 *   // $claims['sub'] (the member at that identity provider), 'email', 'scopes', 'resource', 'tenant'
 *
 * An authorization server that checks DPoP proofs passes the proof key's thumbprint:
 *   $claims = $v->verify($_POST['assertion'], $authenticatedClientId, $dpopJkt);   // $claims['cnfJkt']
 *
 * Options: issuer, audience, jwksUri?, clockSkew? (60), firstUse? (callable(string $jti, int $exp): bool,
 * a shared store such as Redis SET NX; memory in this process by default). Needs ext-openssl
 * (EdDSA: ext-sodium).
 */
class IdJagVerifier
{
    private string $issuer;
    private string $audience;
    private ?string $jwksUri;
    private int $skew;
    /** @var callable */
    private $firstUse;
    /** @var callable */
    private $fetch;
    private array $keys = [];
    private int $keysAt = 0;
    private int $triedAt = 0;
    private array $seen = [];

    public function __construct(array $options)
    {
        if (empty($options['issuer']) || empty($options['audience'])) {
            throw new TouchqueConfigException("IdJagVerifier needs issuer (the identity provider) and audience (your authorization server's issuer)");
        }
        $this->issuer = $options['issuer'];
        $this->audience = $options['audience'];
        $this->jwksUri = $options['jwksUri'] ?? null;
        $this->skew = (int)($options['clockSkew'] ?? 60);
        $this->firstUse = $options['firstUse'] ?? [$this, 'rememberOnce'];
        $this->fetch = $options['fetch'] ?? [McpAuth::class, 'getJson'];
    }

    /** @internal */
    public function rememberOnce(string $jti, int $exp): bool
    {
        $now = time();
        foreach ($this->seen as $k => $until) {
            if ($until < $now) {
                unset($this->seen[$k]);
            }
        }
        if (isset($this->seen[$jti])) {
            return false;
        }
        $this->seen[$jti] = $exp + $this->skew;
        return true;
    }

    private function loadKeys(): void
    {
        if (!$this->jwksUri) {
            $uri = CrossAppAccess::discover($this->issuer)['jwks_uri'] ?? null;
            if (!is_string($uri)) {
                throw new \UnexpectedValueException('the identity provider names no jwks_uri');
            }
            $this->jwksUri = $uri;
        }
        $keys = [];
        foreach ((($this->fetch)($this->jwksUri)['keys'] ?? []) as $jwk) {
            if (!empty($jwk['kid'])) {
                $keys[$jwk['kid']] = $jwk;
            }
        }
        $this->keys = $keys;
        $this->keysAt = time();
    }

    private function keyFor(string $kid): ?array
    {
        if (!$this->keysAt || time() - $this->keysAt > 600) {
            $this->loadKeys();
        }
        if (!isset($this->keys[$kid]) && time() - $this->triedAt > 60) {
            $this->triedAt = time();
            $this->loadKeys();
        }
        return $this->keys[$kid] ?? null;
    }

    /**
     * The ID-JAG, checked and used once: its claims, or TouchqueIdJagException (error invalid_grant).
     * $dpopJkt: the thumbprint of the DPoP proof you verified on this request, if any; an ID-JAG bound
     * to a key (cnf.jkt) is refused without a matching one.
     */
    public function verify(string $assertion, string $clientId, ?string $dpopJkt = null): array
    {
        $bad = static fn (string $m) => new TouchqueIdJagException('invalid_grant', $m);
        $parts = explode('.', $assertion);
        if (count($parts) !== 3) {
            throw $bad('assertion is not a JWT');
        }
        $head = json_decode(AgentKeys::b64urlDecode($parts[0]), true);
        $c = json_decode(AgentKeys::b64urlDecode($parts[1]), true);
        if (!is_array($head) || !is_array($c)) {
            throw $bad('assertion is not a JWT');
        }
        if (($head['typ'] ?? null) !== 'oauth-id-jag+jwt') {
            throw $bad('not an ID-JAG (typ oauth-id-jag+jwt)');
        }
        $alg = $head['alg'] ?? '';
        if (!in_array($alg, ['RS256', 'ES256', 'EdDSA'], true) || !is_string($head['kid'] ?? null)) {
            throw $bad('unsupported signature');
        }
        try {
            $jwk = $this->keyFor($head['kid']);
        } catch (\Throwable $e) {
            throw new TouchqueIdJagException('temporarily_unavailable', "the identity provider's keys could not be read: " . $e->getMessage());
        }
        if ($jwk === null || !McpAuth::verifySignature($parts[0] . '.' . $parts[1], AgentKeys::b64urlDecode($parts[2]), $alg, $jwk)) {
            throw $bad('signature does not verify');
        }
        $now = time();
        $auds = is_array($c['aud'] ?? null) ? $c['aud'] : [$c['aud'] ?? null];
        if (($c['iss'] ?? null) !== $this->issuer) {
            throw $bad('another issuer');
        }
        if (count($auds) !== 1 || $auds[0] !== $this->audience) {
            throw $bad('not for this authorization server');
        }
        if (!is_string($c['client_id'] ?? null) || $c['client_id'] !== $clientId) {
            throw $bad('issued to another client');
        }
        if (!is_numeric($c['exp'] ?? null) || $c['exp'] + $this->skew < $now) {
            throw $bad('expired');
        }
        if (!is_numeric($c['iat'] ?? null) || $c['iat'] - $this->skew > $now) {
            throw $bad('issued in the future');
        }
        if (!is_string($c['sub'] ?? null) || !is_string($c['jti'] ?? null)) {
            throw $bad('sub and jti are required');
        }
        // Before the jti is spent: a copy without the key cannot use the ID-JAG up.
        $cnfJkt = null;
        if (array_key_exists('cnf', $c)) {
            if (!is_array($c['cnf']) || !is_string($c['cnf']['jkt'] ?? null)) {
                throw $bad('unsupported confirmation method (only DPoP cnf.jkt)');
            }
            if ($dpopJkt === null || $dpopJkt === '') {
                throw $bad('bound to a DPoP key: a DPoP proof with that key is required');
            }
            if (!hash_equals($c['cnf']['jkt'], $dpopJkt)) {
                throw $bad('the DPoP proof was made with another key');
            }
            $cnfJkt = $c['cnf']['jkt'];
        }
        if (!($this->firstUse)($c['jti'], (int)$c['exp'])) {
            throw $bad('already used');
        }
        return [
            'iss' => $c['iss'], 'sub' => $c['sub'], 'aud' => $auds[0], 'clientId' => $c['client_id'], 'jti' => $c['jti'],
            'issuedAt' => (int)$c['iat'], 'expiresAt' => (int)$c['exp'],
            'scopes' => is_string($c['scope'] ?? null) && $c['scope'] !== '' ? explode(' ', $c['scope']) : [],
            'resource' => $c['resource'] ?? null, 'tenant' => $c['tenant'] ?? null, 'email' => $c['email'] ?? null,
            'authTime' => $c['auth_time'] ?? null, 'amr' => $c['amr'] ?? null, 'cnfJkt' => $cnfJkt, 'claims' => $c,
        ];
    }
}


namespace Touchque\Exceptions;

/**
 * A refused ID-JAG or exchange (Cross App Access). $error is the OAuth error:
 * invalid_grant for a bad ID-JAG, temporarily_unavailable when a token endpoint
 * could not be reached or its answer read (getPrevious(): the
 * TouchqueNetworkException with curl's error), else what the server answered.
 * $dpopNonce is the latest valid DPoP-Nonce (RFC 9449 section 8) the token
 * endpoint sent in that call: the retry's answer's when it has one, else the
 * first answer's; null when there is none (a missing or empty header, one
 * repeated with different values, or one that is not nonce syntax). A proof
 * for another try carries it (CrossAppAccess::idJagDpopProof's 'nonce').
 */
class TouchqueIdJagException extends TouchqueException
{
    public string $error;
    public ?int $status;
    public ?string $dpopNonce;

    public function __construct(string $error, string $message, ?int $status = null, ?string $dpopNonce = null, ?\Throwable $previous = null)
    {
        parent::__construct($message, $status ?? 0, null, $previous);
        $this->error = $error;
        $this->status = $status;
        $this->dpopNonce = $dpopNonce;
    }
}
