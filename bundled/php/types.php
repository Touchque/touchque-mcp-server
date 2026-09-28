<?php
// TouchQue PHP SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-php/src/{Config.php,TouchQue.php,Steps.php}.
// Regenerate by copying those files here whenever the SDK's public API changes.


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
            return [
                'state' => 'waiting', 'requestId' => $res['requestId'] ?? null, 'number' => $res['challengeCode'] ?? null,
                'expiresAt' => $res['expiresAt'] ?? null, 'details' => $norm ?: null,
            ];
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
