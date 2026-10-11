<?php
// TouchQue PHP SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-php/src/{Config.php,TouchQue.php,Steps.php,ApprovalProof.php,Resources/Login.php,
// Resources/Offline.php,Relay/RelayResponse.php,Relay/RateLimitStore.php,Laravel/TouchQueMiddleware.php,
// Laravel/TouchQueRelay.php} plus the public part of src/Relay/RelayHandler.php.
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.


namespace TouchQue;

use TouchQue\Exceptions\TouchQueConfigException;

class Config
{
    public const DEFAULT_BASE_URL = 'https://api.touchque.com';

    private string $apiKey;
    private string $apiSecret;
    private string $baseUrl;
    private int $timeout;

    /**
     * Falls back to the environment when an argument is omitted: `TQ_API_KEY`,
     * `TQ_API_SECRET`, `TQ_API_URL` (default `https://api.touchque.com`).
     */
    public function __construct(
        ?string $apiKey = null,
        ?string $apiSecret = null,
        ?string $baseUrl = null,
        int $timeout = 10000
    ) {
        $apiKey = $apiKey ?? (getenv('TQ_API_KEY') ?: null);
        $apiSecret = $apiSecret ?? (getenv('TQ_API_SECRET') ?: null);
        $baseUrl = $baseUrl ?? (getenv('TQ_API_URL') ?: self::DEFAULT_BASE_URL);

        if (!$apiKey || !$apiSecret) {
            throw new TouchQueConfigException('Set TQ_API_KEY and TQ_API_SECRET (or pass them to Config).');
        }
        if (strpos($apiKey, 'tq_') !== 0) {
            throw new TouchQueConfigException('apiKey must start with "tq_". Did you accidentally swap apiKey and apiSecret?');
        }
        self::assertSafeBaseUrl($baseUrl);
        $this->apiKey = $apiKey;
        $this->apiSecret = $apiSecret;
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->timeout = $timeout;
    }

    /** Allow plaintext http only for localhost / loopback (local development). */
    private static function assertSafeBaseUrl(string $baseUrl): void
    {
        $scheme = strtolower((string)parse_url($baseUrl, PHP_URL_SCHEME));
        $host = strtolower((string)parse_url($baseUrl, PHP_URL_HOST));
        if ($scheme === 'https') {
            return;
        }
        if ($scheme === 'http' && in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
            return;
        }
        if ($scheme === 'http') {
            throw new TouchQueConfigException(
                "Refusing a plaintext http:// baseUrl for \"{$host}\". The API key and request "
                . 'signature would be sent in the clear — use https://.'
            );
        }
        throw new TouchQueConfigException("baseUrl must be http(s): {$baseUrl}");
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
// From src/TouchQue.php — the TouchQue client class
// ─────────────────────────────────────────────────────────────


namespace TouchQue;

use TouchQue\Http\HttpClient;
use TouchQue\Resources\Actions;
use TouchQue\Resources\Auth;
use TouchQue\Resources\Login;
use TouchQue\Resources\Offline;
use TouchQue\Resources\WebAuthn;
use TouchQue\Resources\Webhook;

/**
 * TouchQue SDK client.
 *
 *     // .env: TQ_API_KEY=tq_...  TQ_API_SECRET=...
 *     $tq = new TouchQue();                                    // from the environment
 *     $tq = new TouchQue(new Config($apiKey, $apiSecret));      // explicit
 *
 * One line per protected route — see `TouchQue\Laravel\TouchQueMiddleware`,
 * or call `start()` / `check()` / `complete()` yourself for any framework.
 */
class TouchQue
{
    public Auth $auth;
    public Login $login;
    public WebAuthn $webauthn;
    public Webhook $webhook;
    public Offline $offline;
    public Actions $actions;

    private Config $config;

    public function __construct(?Config $config = null)
    {
        $this->config = $config ?? new Config();
        $httpClient = new HttpClient($this->config);

        $this->auth = new Auth($httpClient);
        $this->login = new Login($httpClient);
        $this->webauthn = new WebAuthn($httpClient);
        $this->webhook = new Webhook($this->config);
        $this->offline = new Offline($httpClient);
        $this->actions = new Actions($httpClient);
    }

    /** @internal used by Guard/Steps to sign/verify the browser-facing token. */
    public function getApiSecret(): string
    {
        return $this->config->getApiSecret();
    }

    /**
     * Starts an approval and returns immediately — show the step in your UI.
     * `waiting` + `number`: show the number, the user picks it on the phone.
     * `enroll`: show `enroll['qrCodeDataUrl']` so the user links the TouchQue app first.
     */
    public function start(string $action, string $user, ?array $details = null, ?string $referenceId = null, ?string $ip = null, ?string $userAgent = null): array
    {
        return Steps::start($this, $action, $user, $details, $referenceId, $ip, $userAgent);
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


namespace TouchQue;

use TouchQue\Exceptions\TouchQueAPIException;
use TouchQue\Exceptions\TouchQueConfigException;
use TouchQue\Exceptions\TouchQueException;

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

    /** Starts an approval for `$action` — never waits. */
    public static function start(
        TouchQue $client,
        string $action,
        string $user,
        ?array $details = null,
        ?string $referenceId = null,
        ?string $ip = null,
        ?string $userAgent = null,
        bool $enroll = true
    ): array {
        if ($user === '') {
            throw new TouchQueConfigException('start() needs the user id');
        }
        $norm = self::normalizeDetails($details);
        try {
            $res = $client->login->request($user, $action, $referenceId, $ip, $userAgent, false, false, $norm ?: null);
            if (!empty($res['requiresPasskey'])) {
                return ['state' => 'passkey_required', 'requestId' => $res['requestId'] ?? null,
                    'expiresAt' => $res['expiresAt'] ?? null, 'details' => $norm ?: null];
            }
            $step = [
                'state' => 'waiting', 'requestId' => $res['requestId'] ?? null, 'number' => $res['challengeCode'] ?? null,
                'expiresAt' => $res['expiresAt'] ?? null, 'details' => $norm ?: null,
            ];
            if (!empty($res['telemetryToken'])) {
                // Only when the workspace collects behavioural signals: lets the browser post
                // them for this one request (@touchque/web does it when given `telemetry`).
                $step['telemetryToken'] = $res['telemetryToken'];
            }
            return $step;
        } catch (TouchQueAPIException $err) {
            $code = $err->getErrorCode() ?? ($err->getData()['error'] ?? null);
            if ($err->getStatus() === 404 && ($code === 'device_not_linked' || stripos($err->getMessage(), 'linked device') !== false)) {
                if (!$enroll) {
                    return ['state' => 'enroll'];
                }
                return self::enrollStep($client, $user);
            }
            if ($err->getStatus() === 423) {
                return ['state' => 'frozen', 'retryAfter' => $err->getRetryAfter()];
            }
            if ($err->getStatus() === 429) {
                return ['state' => 'rate_limited', 'retryAfter' => $err->getRetryAfter()];
            }
            if ($err->getStatus() === 400 && ($code === 'unknown_action' || stripos($err->getMessage(), 'invalid action type') !== false)) {
                throw new TouchQueConfigException(
                    "Unknown action \"$action\". Create it once with \$client->actions->define('$action') "
                    . 'or in the Dashboard (Action Types).'
                );
            }
            if ($err->getStatus() === 403) {
                $reason = ($code === 'blocked' ? $err->getReason() : null)
                    ?? ($code === 'passkey_not_registered' || ($err->getData()['error'] ?? null) === 'phishing_resistant_required' ? 'passkey_not_registered' : null)
                    ?? ($code === 'action_disabled' ? 'action_disabled' : null)
                    ?? $code ?? 'blocked';
                return ['state' => 'blocked', 'reason' => $reason];
            }
            throw $err;
        }
    }

    /** First-time linking. Never unlinks a phone: a secret is only re-issued when the account is confirmed NOT linked. */
    private static function enrollStep(TouchQue $client, string $user): array
    {
        try {
            $gen = $client->auth->generateSecret($user);
            return ['state' => 'enroll', 'enroll' => [
                'qrCodeDataUrl' => $gen['qrCodeDataUrl'] ?? null, 'recoveryCodes' => $gen['recoveryCodes'] ?? null,
                'expiresAt' => $gen['expiresAt'] ?? null,
            ]];
        } catch (TouchQueAPIException $err) {
            if ($err->getStatus() !== 409) {
                throw $err;
            }
            $current = null;
            try {
                $current = $client->auth->getUser($user);
            } catch (TouchQueAPIException $e) {
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

    private const STATE_MAP = ['PENDING' => 'waiting', 'CONFIRMED' => 'approved', 'REJECTED' => 'rejected', 'EXPIRED' => 'expired'];

    /** Current state of a started approval. */
    public static function check(TouchQue $client, string $requestId): array
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
     * action and transaction. Throws TouchQueException if it was already
     * used, not approved, or approved for something else.
     */
    public static function complete(
        TouchQue $client,
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
            throw new TouchQueException('TouchQue: this approval is for a different user, action or transaction.');
        }
        return [
            'requestId' => $requestId,
            'user' => $res['externalUsername'] ?? null,
            'action' => $res['type'] ?? null,
            'assurance' => $res['assurance'] ?? null,
            'confirmedVia' => $res['confirmedVia'] ?? null,
            'approvalProof' => $res['approvalProof'] ?? null,
        ];
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


namespace TouchQue;

/**
 * Verifies the device-signed proof of an approval ("what you see is what you
 * sign"). When the user's phone holds a hardware key (Secure Enclave /
 * Android Keystore), every approval is signed by it over the request id, the
 * action type, the number-match code and a digest of the transaction details
 * the user was shown. The proof arrives in the SUCCESS webhook
 * (`approvalProof`) and in `login->status($id)['approvalProof']`. Verifying it
 * does not require trusting TouchQue: it proves the enrolled phone signed
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


namespace TouchQue\Resources;

use TouchQue\Http\HttpClient;
use TouchQue\Exceptions\TouchQueTimeoutException;
use TouchQue\Exceptions\TouchQueRejectedException;
use TouchQue\Exceptions\TouchQuePasskeyRequiredError;
use TouchQue\Exceptions\TouchQueConfigException;

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
     */
    public function request(
        string $externalUsername,
        string $type = 'LOGIN',
        ?string $referenceId = null,
        ?string $clientIp = null,
        ?string $userAgent = null,
        bool $requireBiometric = false,
        bool $requireNumberMatch = false,
        ?array $details = null
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
        if ($details !== null && count($details) > 0) {
            $payload['details'] = $details;
        }

        return $this->http->post('/login/request', $payload);
    }

    /**
     * Check the current status of a login request.
     */
    public function status(string $requestId): array
    {
        return $this->http->get('/login/status/' . rawurlencode($requestId));
    }

    /**
     * Request a login and wait (poll) until the user approves or rejects it.
     *
     * @throws TouchQuePasskeyRequiredError when a phishing-resistant policy
     *   requires the request to be approved with a passkey (no push sent).
     * @throws TouchQueRejectedException when the user rejects it.
     * @throws TouchQueTimeoutException on timeout or expiry.
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
        ?array $details = null
    ): array {
        $requestResult = $this->request($externalUsername, $type, $referenceId, $clientIp, $userAgent, $requireBiometric, $requireNumberMatch, $details);
        $requestId = $requestResult['requestId'];
        if (!empty($requestResult['requiresPasskey'])) {
            throw new TouchQuePasskeyRequiredError($requestId);
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
                ];
            }

            if ($status === 'REJECTED') {
                throw new TouchQueRejectedException("Request $requestId was rejected by the user.");
            }

            if ($status === 'EXPIRED') {
                throw new TouchQueTimeoutException("Request $requestId expired before it was approved.");
            }

            $elapsed = (microtime(true) * 1000) - $startTime;
            if ($elapsed > $timeoutMs) {
                throw new TouchQueTimeoutException("Login verification timed out after {$timeoutMs}ms");
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
     * form post) throws TouchQueAPIException with error code "already_used" (409).
     */
    public function consume(string $requestId): array
    {
        return $this->http->post('/login/' . rawurlencode($requestId) . '/consume', []);
    }

    /** Reasons accepted by reportFraud(). */
    public const FRAUD_REASONS = ['chargeback', 'account_takeover', 'social_engineering', 'other'];

    /**
     * Reports a request you later learned was fraud — a chargeback, a
     * confirmed account takeover, a scam the user was talked into. TouchQue's
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
            throw new TouchQueConfigException('reportFraud() needs the request id');
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


namespace TouchQue\Resources;

use TouchQue\Http\HttpClient;
use TouchQue\Exceptions\TouchQueAPIException;

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

    private function notApprovedAsResult(callable $call): array
    {
        try {
            return $call();
        } catch (TouchQueAPIException $err) {
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


namespace TouchQue\Relay;

use TouchQue\Exceptions\TouchQueAPIException;
use TouchQue\Exceptions\TouchQuePasskeyRequiredError;
use TouchQue\Exceptions\TouchQueRejectedException;
use TouchQue\Exceptions\TouchQueTimeoutException;
use TouchQue\Guard;
use TouchQue\TouchQue;

/**
 * Framework-agnostic relay: the routes a frontend (`@touchque/web`) needs for
 * classic push 2FA, offline codes and passkeys, so you don't hand-write them.
 * Same routes and behaviour as the Node SDK's `touchqueRouter`. For Laravel
 * use `TouchQue\Laravel\TouchQueRelay`; anywhere else call handle() with the
 * path relative to where you mount it and send the RelayResponse.
 *
 *   POST   /enroll/start                    (auth required) -> generateSecret response
 *   GET    /enroll/status                   (auth required) -> { linked, used, deviceId }
 *   POST   /login                           (pre-auth) -> 202 { touchque: step, token } until approved (same contract as Guard)
 *   POST   /offline/challenge               (pre-auth, body.externalUsername) -> QR for a phone with no internet
 *   POST   /offline/verify                  (pre-auth, body.challengeId/code)
 *   POST   /offline/totp                    (pre-auth, body.externalUsername/code) -> time-based code fallback
 *   POST   /passkey/authenticate/options    (pre-auth, body.email)
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
 *                   ['externalUsername' => string, 'requestId' => ?string, 'via' => 'login'|'passkey'|'offline'|'offline-totp']
 *                   ('requestId' is absent for 'offline-totp'). Mutate $response (headers, status);
 *                   the handler sets the body.
 */
class RelayHandler
{
    private TouchQue $tq;
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

    public function __construct(TouchQue $tq, array $options)
    {
        if (!isset($options['getUserId']) || !is_callable($options['getUserId'])) {
            throw new \InvalidArgumentException('RelayHandler: the "getUserId" option is required and must be callable.');
        }
        foreach (['getLoginUser', 'getDetails', 'onAuthenticated'] as $name) {
            if (isset($options[$name]) && !is_callable($options[$name])) {
                throw new \InvalidArgumentException("RelayHandler: the \"$name\" option must be callable.");
            }
        }
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
        $this->limiter = $rateLimit === false ? null : new FixedWindowLimiter($rateLimit);
        $this->offlineEnabled = $this->getLoginUser !== null || ($options['allowOfflineWithoutFirstFactor'] ?? false) === true;

        if ($this->getLoginUser === null && !self::$warnedPreAuth) {
            self::$warnedPreAuth = true;
            error_log('[TouchQue] RelayHandler: POST /login takes the username from the request body'
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


namespace TouchQue\Relay;

/**
 * What RelayHandler wants sent back: an HTTP status, a JSON body and headers.
 * Framework adapters turn it into their own response (see
 * TouchQue\Laravel\TouchQueRelay); in plain PHP call send().
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


namespace TouchQue\Relay;

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
// From src/Laravel/TouchQueMiddleware.php — ->middleware('touchque:ACTION')
// ─────────────────────────────────────────────────────────────


namespace TouchQue\Laravel;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use TouchQue\Guard;
use TouchQue\TouchQue;

/**
 * Laravel: one line per protected route.
 *
 *     Route::post('/transfer', [TransferController::class, 'store'])
 *         ->middleware('touchque:SEND_MONEY');
 *
 * Register the alias in `bootstrap/app.php` (Laravel 11+) or
 * `app/Http/Kernel.php` (`$middlewareAliases`):
 *
 *     $middleware->alias(['touchque' => \TouchQue\Laravel\TouchQueMiddleware::class]);
 *
 * `TouchQue` is constructor-injected, so Laravel's container resolves it
 * automatically — bind it once in a service provider:
 *
 *     $this->app->singleton(TouchQue::class, fn () => new TouchQue());
 *
 * Until the user approves on their phone this answers
 * `202 {"touchque": step, "token": "..."}`. Your page shows the step in its
 * own design and sends the same request again with header
 * `X-TouchQue-Token: <token>`. Once approved the route runs ONCE, with
 * `$request->touchque` set to the approval.
 *
 * The signed-in user comes from Laravel's own auth (`$request->user()`,
 * tried as `->email`, `->getAuthIdentifier()`, `->username`). For the login
 * route (no signed-in user yet), extend this class and override
 * `resolveUser()` to return whoever just passed your password check.
 */
class TouchQueMiddleware
{
    private TouchQue $touchQue;

    public function __construct(TouchQue $touchQue)
    {
        $this->touchQue = $touchQue;
    }

    public function handle(Request $request, Closure $next, string $action, ?string $detailsMethod = null)
    {
        $user = $this->resolveUser($request);
        $details = $detailsMethod && method_exists($request, $detailsMethod) ? $request->{$detailsMethod}() : null;

        $result = Guard::run(
            $this->touchQue,
            $user,
            $action,
            $details,
            null,
            $request->ip(),
            $request->userAgent(),
            ...array_values(Guard::inputFromHeaders(fn (string $name) => $request->header($name)))
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
}

// ─────────────────────────────────────────────────────────────
// From src/Laravel/TouchQueRelay.php — TouchQueRelay::routes($router, 'touchque')
// ─────────────────────────────────────────────────────────────


namespace TouchQue\Laravel;

use Illuminate\Contracts\Routing\Registrar;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use TouchQue\Relay\RelayHandler;
use TouchQue\Relay\RelayResponse;
use TouchQue\TouchQue;

/**
 * Laravel: every relay route a frontend (`@touchque/web`) needs — POST /login,
 * enrollment, offline codes, passkey ceremonies — as one controller. See
 * `TouchQue\Relay\RelayHandler` for the routes, options and security rules.
 *
 * Bind it once in a service provider with your options (the callables get the
 * Illuminate `Request`; `onAuthenticated` also gets the pending
 * `RelayResponse`, whose headers you may change):
 *
 *     $this->app->singleton(TouchQueRelay::class, fn ($app) => new TouchQueRelay($app->make(TouchQue::class), [
 *         'getLoginUser' => fn (Request $r) => $r->session()->get('password_verified_user'),
 *         'onAuthenticated' => function (Request $r, RelayResponse $res, array $info) {
 *             $r->session()->regenerate();
 *             $r->session()->put('touchque_user', $info['externalUsername']);
 *         },
 *     ]));
 *
 * and register the routes, e.g. in routes/web.php (session middleware needed
 * for getLoginUser/onAuthenticated):
 *
 *     TouchQueRelay::routes(app('router'), 'touchque');
 *
 * Routes point at this class (no closures), so `php artisan route:cache` works.
 * Without a `getUserId` option the signed-in user comes from Laravel's own auth
 * (`$request->user()`, tried as `->email`, `->getAuthIdentifier()`, `->username`),
 * like TouchQueMiddleware. `$request->ip()` must be the real client: configure
 * TrustProxies behind a load balancer.
 */
class TouchQueRelay
{
    private RelayHandler $handler;

    public function __construct(TouchQue $touchQue, array $options = [])
    {
        if (!isset($options['getUserId'])) {
            $options['getUserId'] = function (Request $request): ?string {
                return $this->resolveUser($request);
            };
        }
        $this->handler = new RelayHandler($touchQue, $options);
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
