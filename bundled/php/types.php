<?php
// Touchque PHP SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-php/src/{Config.php,Touchque.php,Steps.php,ApprovalProof.php,Resources/Login.php,
// Resources/Offline.php,Relay/RelayResponse.php,Relay/RateLimitStore.php,Laravel/TouchqueMiddleware.php,
// Laravel/TouchqueRelay.php} plus the public part of src/Relay/RelayHandler.php.
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.


namespace Touchque;

use Touchque\Exceptions\TouchqueConfigException;

class Config
{
    public const DEFAULT_BASE_URL = 'https://api.touchque.com';

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
            throw new TouchqueConfigException('Set TQ_API_KEY and TQ_API_SECRET (or pass them to Config).');
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
                    return ['state' => 'enroll'];
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
            $gen = $client->auth->generateSecret($user);
            return ['state' => 'enroll', 'enroll' => [
                'qrCodeDataUrl' => $gen['qrCodeDataUrl'] ?? null, 'recoveryCodes' => $gen['recoveryCodes'] ?? null,
                'expiresAt' => $gen['expiresAt'] ?? null,
            ]];
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
            $reset = $client->auth->resetSecret($user);
            return ['state' => 'enroll', 'enroll' => [
                'qrCodeDataUrl' => $reset['qrCodeDataUrl'] ?? null, 'recoveryCodes' => $reset['recoveryCodes'] ?? null,
                'expiresAt' => $reset['expiresAt'] ?? null,
            ]];
        }
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

    /** Current state of a started approval. */
    public static function check(Touchque $client, string $requestId): array
    {
        $s = $client->login->status($requestId);
        $state = ($s['status'] === 'PENDING' && !empty($s['requiresPasskey']))
            ? 'passkey_required' : (self::STATE_MAP[$s['status']] ?? 'waiting');
        $step = ['state' => $state, 'requestId' => $requestId];
        if ($state === 'approved' && !empty($s['assurance'])) {
            $step['assurance'] = $s['assurance'];
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
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
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
 * `Touchque` is constructor-injected, so Laravel's container resolves it
 * automatically — bind it once in a service provider:
 *
 *     $this->app->singleton(Touchque::class, fn () => new Touchque());
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
 *     $this->app->bind(TouchqueMiddleware::class, fn ($app) => new TouchqueMiddleware(
 *         $app->make(Touchque::class), ['silentSignIn' => ['maxAgeSeconds' => 8 * 3600]]));
 */
class TouchqueMiddleware
{
    private Touchque $touchque;

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

    /** @param array $options ['silentSignIn' => bool|array, 'context' => callable(Request): array] */
    public function __construct(Touchque $touchque, array $options = [])
    {
        $this->touchque = $touchque;
        if (isset($options['context'])) {
            $this->context = $options['context'];
        }
        if (array_key_exists('silentSignIn', $options)) {
            $this->silentSignIn = $options['silentSignIn'];
        }
        Guard::assertSilentSignInOption($this->silentSignIn, 'TouchqueMiddleware');
    }

    public function handle(Request $request, Closure $next, string $action, ?string $detailsMethod = null)
    {
        $user = $this->resolveUser($request);
        $details = null;
        if ($detailsMethod) {
            // A Request macro (Request::macro('transferDetails', ...)) is how a route usually adds
            // one; method_exists() does not see macros. A name that is neither must not approve
            // without the details the route meant the phone to show.
            if (!method_exists($request, $detailsMethod) && !$request::hasMacro($detailsMethod)) {
                $this->touchque->log('error', "[Touchque] TouchqueMiddleware: the Request has no method or macro \"{$detailsMethod}\" for the details");
                return new JsonResponse([
                    'touchque' => ['state' => 'blocked', 'reason' => 'misconfigured'],
                    'error' => ['code' => 'misconfigured', 'message' => 'Two-factor approval is not configured correctly.'],
                ], 500, ['Cache-Control' => 'no-store']);
            }
            $details = $request->{$detailsMethod}();
        }

        $header = fn (string $name) => $request->header($name);
        $input = Guard::inputFromHeaders($header);
        $silent = Guard::silentInputFromHeaders($this->silentSignIn, $header);

        $result = Guard::run(
            $this->touchque,
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

        $headers = ['Cache-Control' => 'no-store'];
        if (!empty($result['body']['touchque']['retryAfter'])) {
            $headers['Retry-After'] = (string)$result['body']['touchque']['retryAfter'];
        }
        return new JsonResponse($result['body'], $result['status'], $headers);
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
