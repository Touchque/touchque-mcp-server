// TouchQue Java SDK and Spring Boot starter — bundled type/API reference for AI assistants.
// Concatenation of touchque-java/src/main/java/com/touchque/{TouchQueOptions,TouchQueClient,flow/Step,
// flow/StartOptions,flow/CompleteExpectations,flow/Approval,crypto/ApprovalProof,resources/Login,
// resources/LoginRequestOptions,relay/RelayOptions}.java, the public parts of flow/Guard.java and
// relay/RelayHandler.java, and the starter's com/touchque/spring/{RequireTouchQue,TouchQueGuardOptions,
// TouchQueWebhookListener,TouchQueSpring}.java (package and import lines left out).
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

// ─────────────────────────────────────────────────────────────
// package com.touchque — TouchQueOptions
// ─────────────────────────────────────────────────────────────

/**
 * Settings of a {@link TouchQueClient}. Anything left null falls back to the environment:
 * {@code TQ_API_KEY}, {@code TQ_API_SECRET} and {@code TQ_API_URL} (default
 * {@code https://api.touchque.com}).
 *
 * <pre>{@code
 * var tq = new TouchQueClient(new TouchQueOptions().apiKey("tq_...").apiSecret("..."));
 * }</pre>
 */
public final class TouchQueOptions {
    public static final String DEFAULT_BASE_URL = "https://api.touchque.com";

    private String apiKey;
    private String apiSecret;
    private String baseUrl;
    private Duration timeout = Duration.ofSeconds(10);
    private HttpClient httpClient;
    private System.Logger logger;
    private boolean debug;

    /** Your API key from the dashboard ({@code tq_…}). */
    public TouchQueOptions apiKey(String value) {
        this.apiKey = value;
        return this;
    }

    /** Your API secret. Signs every request and verifies webhooks; never send it to a browser or an app. */
    public TouchQueOptions apiSecret(String value) {
        this.apiSecret = value;
        return this;
    }

    /** The API's address. Plain http is accepted only for localhost. */
    public TouchQueOptions baseUrl(String value) {
        this.baseUrl = value;
        return this;
    }

    /** Timeout of one HTTP request (default 10 seconds). */
    public TouchQueOptions timeout(Duration value) {
        this.timeout = value;
        return this;
    }

    /**
     * Your own HttpClient. Configure it NOT to follow redirects
     * ({@code HttpClient.Redirect.NEVER}): a redirect could replay the signed headers to another host.
     */
    public TouchQueOptions httpClient(HttpClient value) {
        this.httpClient = value;
        return this;
    }

    /**
     * Where the SDK reports its own problems: a misconfigured guard, an onChallenge that threw, a
     * relay error or a relay without getLoginUser, a silent sign-in check that failed. Default:
     * nothing is logged. Lines carry an error's class, code and message, never the error object, a
     * request or a user.
     */
    public TouchQueOptions logger(System.Logger value) {
        this.logger = value;
        return this;
    }

    /** With no {@link #logger}: write those lines to System.Logger {@code "touchque"} (local development). */
    public TouchQueOptions debug(boolean value) {
        this.debug = value;
        return this;
    }

    public String apiKey() {
        return apiKey;
    }

    public String apiSecret() {
        return apiSecret;
    }

    public String baseUrl() {
        return baseUrl;
    }

    public Duration timeout() {
        return timeout;
    }

    public HttpClient httpClient() {
        return httpClient;
    }

    public System.Logger logger() {
        return logger;
    }

    public boolean debug() {
        return debug;
    }

    record Resolved(String apiKey, String apiSecret, String baseUrl, Duration timeout, HttpClient httpClient, SdkLog log) {
    }

    /** The options with the environment filled in, checked. */
    Resolved resolve() {
        String key = apiKey != null ? apiKey : System.getenv("TQ_API_KEY");
        String secret = apiSecret != null ? apiSecret : System.getenv("TQ_API_SECRET");
        String url = baseUrl != null ? baseUrl : System.getenv("TQ_API_URL");
        if (url == null || url.isEmpty()) url = DEFAULT_BASE_URL;
        if (key == null || key.isEmpty() || secret == null || secret.isEmpty()) {
            throw new TouchQueConfigException("Set TQ_API_KEY and TQ_API_SECRET (or apiKey and apiSecret in TouchQueOptions).");
        }
        if (!key.startsWith("tq_")) {
            throw new TouchQueConfigException("apiKey must start with \"tq_\". Did you accidentally swap apiKey and apiSecret?");
        }
        assertSafeBaseUrl(url, "baseUrl");
        return new Resolved(key, secret, url.replaceAll("/+$", ""), timeout, httpClient, new SdkLog(logger, debug));
    }

    /** Allow plaintext http only for localhost / loopback (local development). */
    public static void assertSafeBaseUrl(String url, String name) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new TouchQueConfigException(name + " is not a valid URL: " + url);
        }
        String scheme = uri.getScheme();
        if (scheme == null || uri.getHost() == null) throw new TouchQueConfigException(name + " is not a valid URL: " + url);
        if (scheme.equalsIgnoreCase("https")) return;
        if (scheme.equalsIgnoreCase("http")) {
            if (isLoopback(uri.getHost())) return;
            throw new TouchQueConfigException("Refusing a plaintext http:// " + name + " for \"" + uri.getHost()
                    + "\". The API key and request signature would be sent in the clear: use https://.");
        }
        throw new TouchQueConfigException(name + " must be http(s): " + url);
    }

    public static boolean isLoopback(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("localhost") || h.equals("127.0.0.1") || h.equals("::1") || h.equals("[::1]");
    }
}

// ─────────────────────────────────────────────────────────────
// package com.touchque — TouchQueClient (start/check/complete/protect and the resources)
// ─────────────────────────────────────────────────────────────

/**
 * The TouchQue client. Every call is signed with your API secret, so it belongs on your server;
 * browser pieces relay through it.
 *
 * <pre>{@code
 * // TQ_API_KEY=tq_...  TQ_API_SECRET=...
 * var tq = new TouchQueClient();
 * var step = tq.start("SEND_MONEY", new StartOptions("jane@acme.com").details(List.of(LoginDetail.of("Amount", "250 EUR"))));
 * }</pre>
 *
 * Thread-safe; create one and reuse it (in Spring Boot the starter makes it a bean).
 */
public final class TouchQueClient {
    public static final String DEFAULT_BASE_URL = TouchQueOptions.DEFAULT_BASE_URL;

    private final TouchQueHttp http;
    private final Auth auth;
    private final Login login;
    private final WebAuthn webauthn;
    private final Webhook webhook;
    private final Offline offline;
    private final ActionTypes actionTypes;
    private final Actions actions;
    private final Risk risk;
    private final Recovery recovery;
    private final Assist assist;
    private final Agents agents;
    private final Identity identity;
    private final Mobile mobile;
    private final QrPairings qrPairings;
    private final DeviceRisk deviceRisk;
    private final SafeGuard safeGuard;

    /** A client from the environment ({@code TQ_API_KEY}, {@code TQ_API_SECRET}, {@code TQ_API_URL}). */
    public TouchQueClient() {
        this(new TouchQueOptions());
    }

    /** @param options anything left null falls back to the environment */
    public TouchQueClient(TouchQueOptions options) {
        TouchQueOptions.Resolved r = options.resolve();
        this.http = new TouchQueHttp(r.apiKey(), r.apiSecret(), r.baseUrl(), r.timeout(), r.httpClient(), r.log());
        this.auth = new Auth(http);
        this.login = new Login(http);
        this.webauthn = new WebAuthn(http);
        this.webhook = new Webhook(r.apiSecret());
        this.offline = new Offline(http);
        this.actionTypes = new ActionTypes(http);
        this.actions = new Actions(http);
        this.risk = new Risk(http);
        this.recovery = new Recovery(http);
        this.assist = new Assist(http);
        this.agents = new Agents(http);
        this.identity = new Identity(http);
        this.mobile = new Mobile(http);
        this.qrPairings = new QrPairings(http);
        this.deviceRisk = new DeviceRisk(http);
        this.safeGuard = new SafeGuard(http);
    }

    /** Setup secrets and a user's link status. */
    public Auth auth() {
        return auth;
    }

    /** Push approvals: request, status, verify, use once, report fraud. */
    public Login login() {
        return login;
    }

    /** Passkeys (the backend half of the browser ceremonies). */
    public WebAuthn webauthn() {
        return webauthn;
    }

    /** Webhook signature verification. */
    public Webhook webhook() {
        return webhook;
    }

    /** Offline Sign: QR challenge and typed-code approvals with the phone offline. */
    public Offline offline() {
        return offline;
    }

    /** Action types: what users approve (LOGIN, SEND_MONEY…). */
    public ActionTypes actionTypes() {
        return actionTypes;
    }

    /** TouchQue Actions: your own code in the approval pipeline (deploy, test, dry run, logs). */
    public Actions actions() {
        return actions;
    }

    /** Silent sign-ins: should this sign-in ask the phone, and which browsers TouchQue knows. */
    public Risk risk() {
        return risk;
    }

    /** Never Locked Out: move a user whose phone is gone to a new phone, with colleagues vouching. */
    public Recovery recovery() {
        return recovery;
    }

    /** Help desk: IT working on a person's account in the open, and checks on their phone before sensitive actions. */
    public Assist assist() {
        return assist;
    }

    /** AI agents as identities of their own. The agent itself uses {@link com.touchque.agents.TouchQueAgent}. */
    public Agents agents() {
        return agents;
    }

    /** TouchQue Login: your customers' accounts, roles, organizations, apps, connections (Management API). */
    public Identity identity() {
        return identity;
    }

    /** Mobile SDK: your own iOS/Android app approves for your users. */
    public Mobile mobile() {
        return mobile;
    }

    /** Pairing a browser by QR code: the phone that scans it is the one asked to approve. */
    public QrPairings qrPairings() {
        return qrPairings;
    }

    /** Device risk: the device on your sign-up, reset, sign-in or approval page (a paid add-on). */
    public DeviceRisk deviceRisk() {
        return deviceRisk;
    }

    /** Safe Guard: Safe transactions approved on the approver's phone, for TouchQueSafeGuard. */
    public SafeGuard safeGuard() {
        return safeGuard;
    }

    /** Internal: the signed HTTP client. */
    public TouchQueHttp http() {
        return http;
    }

    /** Internal: signs the guard tokens. */
    public String apiSecret() {
        return http.apiSecret();
    }

    public String baseUrl() {
        return http.baseUrl();
    }

    /**
     * Starts an approval and returns at once: show the step in your UI. {@code waiting} with
     * {@code number}: show the number, the user picks it on the phone. {@code enroll}: show
     * {@code enroll.qrCodeDataUrl} so the user links the TouchQue app first.
     */
    public Step start(String action, StartOptions options) {
        return Steps.start(this, action, options);
    }

    /** Where a started approval is now: waiting, approved, rejected, expired… */
    public Step check(String requestId) {
        return Steps.check(this, requestId);
    }

    /**
     * Uses an approved request exactly once, after checking it is for this user, action and
     * transaction. Call it right before doing the protected thing.
     *
     * @throws TouchQueApprovalMismatchException the approval is for a different user, action or transaction
     * @throws TouchQueApiException             409 already_used, not_approved, rejected, expired or revoked
     */
    public Approval complete(String requestId, CompleteExpectations expect) {
        return Steps.complete(this, requestId, expect);
    }

    /** Runs {@code action} only after the user approved it on the phone (the push and the wait of {@code login().verify}). */
    public <T> T protect(LoginRequestOptions request, Supplier<T> action) {
        login.verify(request);
        return action.get();
    }
}

// ─────────────────────────────────────────────────────────────
// package com.touchque.flow — Step, StartOptions, CompleteExpectations, Approval
// ─────────────────────────────────────────────────────────────

/**
 * What the user has to see while an approval runs, safe to send to the browser as JSON (it never
 * holds a secret). States: waiting, approved, rejected, expired, enroll, passkey_required, offline,
 * blocked, frozen, rate_limited. {@code number}: the number to show, the user picks it on the phone.
 * {@code caseCode}: the "Why?" code ("Tell your support team: K7P-2QX"). {@code canary}: Mirror Alarm,
 * the page showing this first step loads it. {@code enroll}: first-time linking, show its QR.
 * {@code offline}: the offline QR (the phone has no internet).
 */
public record Step(String state, String requestId, String number, String expiresAt, List<LoginDetail> details, String caseCode,
                   List<RiskReason> reasons, String telemetryToken, Canary canary, Enroll enroll, Offline offline, String reason,
                   Integer retryAfter, Assurance assurance) {

    /** Mirror Alarm: a tiny image your sign-in page loads, so a phishing proxy in front of your site gets the approval refused. */
    public record Canary(String url) {
    }

    /** First-time linking: show {@code qrCodeDataUrl}. */
    public record Enroll(String qrCodeDataUrl, List<String> recoveryCodes, String expiresAt) {
    }

    /** The offline QR: {@code challengeCode} is the number to print under it with number matching. */
    public record Offline(String challengeId, String qrDataUrl, String expiresAt, Boolean totpAvailable, String challengeCode, Integer attemptsLeft) {
    }

    /** A step with only a state. */
    public static Step of(String state) {
        return new Step(state, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    public Step withRequestId(String v) {
        return new Step(state, v, number, expiresAt, details, caseCode, reasons, telemetryToken, canary, enroll, offline, reason, retryAfter, assurance);
    }

    public Step withNumber(String v) {
        return new Step(state, requestId, v, expiresAt, details, caseCode, reasons, telemetryToken, canary, enroll, offline, reason, retryAfter, assurance);
    }

    public Step withDetails(List<LoginDetail> v) {
        return new Step(state, requestId, number, expiresAt, v, caseCode, reasons, telemetryToken, canary, enroll, offline, reason, retryAfter, assurance);
    }

    public Step withCaseCode(String v) {
        return new Step(state, requestId, number, expiresAt, details, v, reasons, telemetryToken, canary, enroll, offline, reason, retryAfter, assurance);
    }

    public Step withEnroll(Enroll v) {
        return new Step(state, requestId, number, expiresAt, details, caseCode, reasons, telemetryToken, canary, v, offline, reason, retryAfter, assurance);
    }

    public Step withOffline(Offline v) {
        return new Step(state, requestId, number, expiresAt, details, caseCode, reasons, telemetryToken, canary, enroll, v, reason, retryAfter, assurance);
    }

    public Step withReason(String v) {
        return new Step(state, requestId, number, expiresAt, details, caseCode, reasons, telemetryToken, canary, enroll, offline, v, retryAfter, assurance);
    }

    public Step withRetryAfter(Integer v) {
        return new Step(state, requestId, number, expiresAt, details, caseCode, reasons, telemetryToken, canary, enroll, offline, reason, v, assurance);
    }

    public Step withAssurance(Assurance v) {
        return new Step(state, requestId, number, expiresAt, details, caseCode, reasons, telemetryToken, canary, enroll, offline, reason, retryAfter, v);
    }
}

/** What to start an approval for. */
public final class StartOptions {
    final String user;
    List<LoginDetail> details;
    String referenceId;
    String ip;
    String userAgent;
    String browserProof;
    Map<String, Object> context;
    boolean enroll = true;

    /** @param user the user in YOUR system */
    public StartOptions(String user) {
        this.user = user;
    }

    public StartOptions details(List<LoginDetail> v) {
        this.details = v;
        return this;
    }

    public StartOptions referenceId(String v) {
        this.referenceId = v;
        return this;
    }

    /** The end user's IP. */
    public StartOptions ip(String v) {
        this.ip = v;
        return this;
    }

    public StartOptions userAgent(String v) {
        this.userAgent = v;
        return this;
    }

    /** Silent sign-ins: the {@code X-TouchQue-Browser} header, passed through untouched. */
    public StartOptions browserProof(String v) {
        this.browserProof = v;
        return this;
    }

    /** For your TouchQue Actions only ({@code event.context}). */
    public StartOptions context(Map<String, Object> v) {
        this.context = v;
        return this;
    }

    /** False: never show the first-time linking QR (a typed username proves nothing). */
    public StartOptions enroll(boolean v) {
        this.enroll = v;
        return this;
    }
}

/** What an approved request must be for (checked by {@code TouchQueClient.complete}). */
public record CompleteExpectations(String user, String action, List<LoginDetail> details, String referenceId) {
    public static CompleteExpectations of(String user, String action) {
        return new CompleteExpectations(user, action, null, null);
    }
}

/**
 * An approval used once: run the protected action now. {@code confirmedVia}: DEVICE, WEBAUTHN,
 * OFFLINE_CODE, OFFLINE_TOTP or SILENT. {@code approvalProof}: the phone's signature over what it
 * showed ({@link com.touchque.crypto.ApprovalProof}). {@code provisional}: Vishing Shield, approved
 * during a call; let the user in, but treat the session as limited: critical actions are refused
 * until APPROVAL_RECONFIRMED, and APPROVAL_REVOKED means end it. {@code reasons}: silent sign-ins,
 * why TouchQue let this known browser in (nothing went to the phone).
 */
public record Approval(String requestId, String user, String action, Assurance assurance, String confirmedVia, JsonNode approvalProof,
                       Boolean provisional, Boolean revoked, String revokeReason, String reconfirmedAt, List<RiskReason> reasons) {
}

// ─────────────────────────────────────────────────────────────
// package com.touchque.flow — Guard.run, the two-phase contract for any framework (public part)
// ─────────────────────────────────────────────────────────────

/**
 * Framework-agnostic step-up guard (the Spring starter's {@code @RequireTouchQue} is a thin wrapper
 * over it). Contract, the same in every TouchQue server SDK:
 * <ul>
 * <li>1st request: 202 {@code {"touchque": step, "token": ...}}; show the step in your UI;</li>
 * <li>repeat with the token (header {@code X-TouchQue-Token}): 202 while waiting, then the protected action runs once;</li>
 * <li>refused: 403 / 408 / 423 / 429 {@code {"touchque": {"state": ...}}}.</li>
 * </ul>
 */
public final class Guard {
    public static final String TOKEN_HEADER = "X-TouchQue-Token";
    public static final String OFFLINE_HEADER = "X-TouchQue-Offline";
    public static final String CODE_HEADER = "X-TouchQue-Code";
    public static final String CODE_TYPE_HEADER = "X-TouchQue-Code-Type";
    public static final String BROWSER_HEADER = "X-TouchQue-Browser";

    private static final long TOKEN_TTL_MS = 10 * 60 * 1000;
    /** A real proof is a few hundred characters; anything far larger is not one. */
    private static final int MAX_BROWSER_PROOF = 4096;

    private static final Map<String, Integer> STATUS_OF = Map.of(
            "waiting", 202, "enroll", 202, "passkey_required", 202, "offline", 202,
            "approved", 200, "rejected", 403, "blocked", 403, "expired", 408, "frozen", 423, "rate_limited", 429);

    private static final Set<String> WAITING = Set.of("waiting", "passkey_required", "offline");

    private Guard() {
    }

    /** Silent sign-ins for a guard or relay: {@code maxAgeSeconds} is your own limit on how long ago the last phone approval in that browser may be (0 = always ask; null = TouchQue's). */
    public record SilentSignIn(Integer maxAgeSeconds) {
        public static SilentSignIn on() {
            return new SilentSignIn(null);
        }
    }

    /** One request through the guard. */
    public static final class Input {
        String user;
        final String action;
        List<LoginDetail> details;
        String referenceId;
        String ip;
        String userAgent;
        String token;
        boolean offline;
        String code;
        String codeType;
        boolean enroll = true;
        String browserProof;
        SilentSignIn silentSignIn;
        Map<String, Object> context;

        public Input(String user, String action) {
            this.user = user;
            this.action = action;
        }

        public Input details(List<LoginDetail> v) {
            this.details = v;
            return this;
        }

        public Input referenceId(String v) {
            this.referenceId = v;
            return this;
        }

        /** The end user's IP. */
        public Input ip(String v) {
            this.ip = v;
            return this;
        }

        public Input userAgent(String v) {
            this.userAgent = v;
            return this;
        }

        /** {@code X-TouchQue-Token}: the token from the last answer. */
        public Input token(String v) {
            this.token = v;
            return this;
        }

        /** {@code X-TouchQue-Offline: 1}: switch to offline approval. */
        public Input offline(boolean v) {
            this.offline = v;
            return this;
        }

        /** {@code X-TouchQue-Code}: the code from the phone. */
        public Input code(String v) {
            this.code = v;
            return this;
        }

        /** {@code X-TouchQue-Code-Type}: totp for the rolling time-based code. */
        public Input codeType(String v) {
            this.codeType = v;
            return this;
        }

        /** False: never show the first-time linking QR. */
        public Input enroll(boolean v) {
            this.enroll = v;
            return this;
        }

        /** {@code X-TouchQue-Browser}: the browser's device-bound key proof. */
        public Input browserProof(String v) {
            this.browserProof = v;
            return this;
        }

        /** Null: silent sign-ins off. */
        public Input silentSignIn(SilentSignIn v) {
            this.silentSignIn = v;
            return this;
        }

        /** For your TouchQue Actions only ({@code event.context}). */
        public Input context(Map<String, Object> v) {
            this.context = v;
            return this;
        }

        /** Reads the guard headers (token, offline switch, code, code type, browser proof) with a header getter. */
        public Input headers(java.util.function.Function<String, String> header) {
            this.token = header.apply(TOKEN_HEADER);
            this.offline = "1".equals(header.apply(OFFLINE_HEADER));
            this.code = header.apply(CODE_HEADER);
            this.codeType = header.apply(CODE_TYPE_HEADER);
            this.browserProof = header.apply(BROWSER_HEADER);
            return this;
        }
    }

    /**
     * The guard's answer: either {@code approved} (run your protected action once) or {@code status}
     * and {@code body} to send back as JSON. {@link #retryAfter()}: seconds for a Retry-After header
     * (frozen, rate limited).
     */
    public record Result(int status, Approval approved, ObjectNode body, Step step) {
        public Integer retryAfter() {
            return step != null && step.retryAfter() != null && step.retryAfter() > 0 ? step.retryAfter() : null;
        }
    }

    /**
     * True when this request only polls an approval already on its way: a valid token bound to this
     * user/action/details, still waiting, and no offline switch or typed code. It can only read the
     * status, so relays do not count it against the per-user push limit.
     */
    public static boolean isStatusPoll(TouchQueClient client, Input input) {
        if (empty(input.user) || empty(input.token) || input.offline || !empty(input.code)) return false;
        ObjectNode claims = Steps.verifyGuardToken(client.apiSecret(), input.token);
        if (claims == null || empty(Json.str(claims, "rid"))) return false;
        return bound(claims, input) && WAITING.contains(String.valueOf(Json.str(claims, "st")));
    }

    public static Result run(TouchQueClient client, Input input);  // implementation omitted
    // ... private helpers omitted
}

// ─────────────────────────────────────────────────────────────
// package com.touchque.crypto — ApprovalProof.verify (device proof, pin the key)
// ─────────────────────────────────────────────────────────────

/**
 * Verifies the device-signed proof of an approval ("what you see is what you sign"). When the phone
 * holds a hardware key (Secure Enclave / Android Keystore), every approval is signed over the request
 * id, the action type, the number-match code and a digest of the details the user was shown. The
 * proof arrives in the SUCCESS webhook ({@code approvalProof}) and in the consumed approval.
 * Verifying it does not require trusting TouchQue.
 */
public final class ApprovalProof {
    private static final String MESSAGE_PREFIX = "touchque-approve:v2";

    private ApprovalProof() {
    }

    /** What {@link #verify} checks the proof against. */
    public static final class Options {
        private final String requestId;
        private final String type;
        private List<LoginDetail> details;
        private String challengeCode;
        private String expectedPublicKey;
        private boolean allowUnpinnedKey;

        /** @param requestId the id the request returned; @param type the action type you sent, e.g. WITHDRAW */
        public Options(String requestId, String type) {
            this.requestId = requestId;
            this.type = type;
        }

        /** The details you sent, exactly as you sent them. */
        public Options details(List<LoginDetail> v) {
            this.details = v;
            return this;
        }

        /** The number-match code, when used. */
        public Options challengeCode(String v) {
            this.challengeCode = v;
            return this;
        }

        /**
         * Pin the device: the base64 public key you stored for this user (e.g. the {@code publicKey} of
         * their first verified approval). Required unless {@link #allowUnpinnedKey} is true.
         */
        public Options expectedPublicKey(String v) {
            this.expectedPublicKey = v;
            return this;
        }

        /** Accept whatever key the proof carries (trust on first use only: store the key, pin it after). */
        public Options allowUnpinnedKey(boolean v) {
            this.allowUnpinnedKey = v;
            return this;
        }
    }

    /** True only if the proof was signed by the device key over exactly what you expect. Never throws. */
    public static boolean verify(JsonNode proof, Options o) {
        try {
            if (proof == null || !"v2".equals(Json.str(proof, "version")) || !"ECDSA-P256-SHA256".equals(Json.str(proof, "algorithm"))) return false;
            String publicKey = Json.str(proof, "publicKey");
            String message = Json.str(proof, "message");
            String signature = Json.str(proof, "signature");
            if (publicKey == null || message == null || signature == null) return false;
            if (o.expectedPublicKey != null && !o.expectedPublicKey.isEmpty()) {
                if (!MessageDigest.isEqual(o.expectedPublicKey.getBytes(StandardCharsets.UTF_8), publicKey.getBytes(StandardCharsets.UTF_8))) return false;
            } else if (!o.allowUnpinnedKey) {
                return false;
            }
            String expected = String.join("\n", MESSAGE_PREFIX, nz(o.requestId), nz(o.type), nz(o.challengeCode), Details.digest(o.details));
            if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), message.getBytes(StandardCharsets.UTF_8))) return false;
            byte[] raw = Base64.getDecoder().decode(publicKey);
            if (raw.length != 65 || raw[0] != 0x04) return false;
            byte[] sig = Base64.getDecoder().decode(signature);
            if (sig.length == 0) return false;
            Signature s = Signature.getInstance("SHA256withECDSA");
            s.initVerify(Keys.ecPublic(Arrays.copyOfRange(raw, 1, 33), Arrays.copyOfRange(raw, 33, 65)));
            s.update(message.getBytes(StandardCharsets.UTF_8));
            return s.verify(sig);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            return false;
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}

// ─────────────────────────────────────────────────────────────
// package com.touchque.resources — tq.login() (request/status/verify/reportFraud) and its options
// ─────────────────────────────────────────────────────────────

/** Push approvals on the user's phone: request, status, wait, use once, report fraud. */
public final class Login {
    /** Reasons accepted by {@link #reportFraud}. */
    public static final List<String> FRAUD_REASONS = List.of("chargeback", "account_takeover", "social_engineering", "other");

    private final TouchQueHttp http;

    /** Internal: use {@code tq.login()}. */
    public Login(TouchQueHttp http) {
        this.http = http;
    }

    /** A push to the user's phone (returns at once; see {@link #verify} to wait). */
    public RequestResult request(String externalUsername) {
        return request(new LoginRequestOptions(externalUsername));
    }

    /**
     * A push to the user's phone with every option: transaction details, the end user's IP and
     * browser, number matching, the browser proof of silent sign-ins, context for your Actions,
     * security changes, a destination, a QR pairing. With behavioral biometrics on, the answer has
     * {@code telemetryToken} for the {@code @touchque/web} widget.
     */
    public RequestResult request(LoginRequestOptions options) {
        return TouchQueHttp.to(http.post("/login/request", options.toJson()), RequestResult.class);
    }

    /** Where a request is now: PENDING, CONFIRMED, REJECTED or EXPIRED. */
    public Status status(String requestId) {
        return TouchQueHttp.to(http.get("/login/status/" + TouchQueHttp.seg(requestId)), Status.class);
    }

    /** Asks the phone and waits for the answer. */
    public VerifyResult verify(String externalUsername) {
        return verify(new LoginRequestOptions(externalUsername));
    }

    /**
     * Asks the phone and polls until the user approves or rejects. With number matching (your
     * option, a workspace policy, a critical action or the risk engine) the user picks a number on
     * the phone: {@code onChallenge} runs right after the request exists and before any waiting.
     *
     * @throws TouchQuePasskeyRequiredException only a passkey can approve (policy), or the user tapped Approve during a call (step_up)
     * @throws TouchQueRejectedException the user rejected it
     * @throws TouchQueTimeoutException it expired or the timeout passed
     */
    public VerifyResult verify(LoginRequestOptions options) {
        RequestResult sent = TouchQueHttp.to(http.post("/login/request", options.toJson(false)), RequestResult.class);
        if (sent.requiresPasskey()) throw new TouchQuePasskeyRequiredException(sent.requestId(), "policy");
        if (options.onChallenge() != null) {
            try {
                options.onChallenge().accept(new VerifyChallenge(sent.requestId(), emptyToNull(sent.challengeCode()), sent.expiresAt(), sent.reasons(), sent.caseCode()));
            } catch (RuntimeException e) {
                // The caller's callback must not stop the wait.
                http.log().warn("[TouchQue] onChallenge failed: " + SdkLog.describe(e));
            }
        }
        return waitFor(sent.requestId(), sent.challengeCode(),
                options.timeout() != null ? options.timeout() : Duration.ofSeconds(30),
                options.pollInterval() != null ? options.pollInterval() : Duration.ofMillis(400));
    }

    /** Waits for a request you already sent (e.g. with {@link #request}). Null durations take the defaults (30 s, 400 ms). */
    public VerifyResult waitForApproval(String requestId, Duration timeout, Duration pollInterval) {
        return waitFor(requestId, null, timeout != null ? timeout : Duration.ofSeconds(30), pollInterval != null ? pollInterval : Duration.ofMillis(400));
    }

    private VerifyResult waitFor(String requestId, String challengeCode, Duration timeout, Duration interval) {
        Instant deadline = Instant.now().plus(timeout);
        while (true) {
            Status s = status(requestId);
            switch (String.valueOf(s.status())) {
                case "CONFIRMED":
                    // Vishing Shield: approved during a call; critical actions wait for the phone to re-confirm.
                    return new VerifyResult(true, s.status(), requestId, emptyToNull(challengeCode), s.assurance(), s.confirmedVia(), s.provisional());
                case "REJECTED":
                    throw new TouchQueRejectedException(requestId);
                case "EXPIRED":
                    throw new TouchQueTimeoutException("TouchQue: request '" + requestId + "' expired before it was approved.", requestId);
                default:
                    break;
            }
            // Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
            if ("PENDING".equals(s.status()) && s.requiresPasskey()) throw new TouchQuePasskeyRequiredException(requestId, "step_up");
            if (Instant.now().plus(interval).isAfter(deadline)) {
                throw new TouchQueTimeoutException("TouchQue: request '" + requestId + "' was not approved within " + timeout.toSeconds()
                        + "s. The user did not respond in time.", requestId);
            }
            sleep(interval);
        }
    }

    static void sleep(Duration d) {
        try {
            Thread.sleep(d.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new TouchQueNetworkException("interrupted", e);
        }
    }

    static String emptyToNull(String s) {
        return s == null || s.isEmpty() ? null : s;
    }

    /** Approves a pending request with one of the user's recovery codes (no phone). */
    public JsonNode approveWithRecoveryCode(String requestId, String code) {
        return http.post("/login/recovery", Json.object().put("requestId", requestId).put("code", code));
    }

    /**
     * Uses an approved request exactly once. The first call on a CONFIRMED request wins
     * atomically; every later call (a replayed token, a retried form post) throws
     * {@link com.touchque.TouchQueApiException} with code {@code already_used} (409). The answer
     * has {@code approvalProof}, the phone's signature over what it showed, when the phone has a
     * hardware key.
     */
    public JsonNode consume(String requestId) {
        return http.post("/login/" + TouchQueHttp.seg(requestId) + "/consume", Json.object());
    }

    /**
     * Reports a request you later learned was fraud (a chargeback, a confirmed account takeover, a
     * scam the user was talked into). The risk engine learns from it and the report is kept in your
     * audit log; the request's status does not change. A repeat answers {@code alreadyReported: true}.
     *
     * @param reason one of {@link #FRAUD_REASONS} (null: other)
     * @param note   free text for your audit log, at most 500 characters
     */
    public JsonNode reportFraud(String requestId, String reason, String note) {
        if (requestId == null || requestId.isEmpty()) throw new TouchQueConfigException("reportFraud() needs the request id");
        ObjectNode body = Json.object();
        Json.put(body, "reason", reason);
        Json.put(body, "note", note);
        return http.post("/login/" + TouchQueHttp.seg(requestId) + "/report-fraud", body);
    }

    /** What {@code onChallenge} receives as soon as the request exists. {@code challengeCode} is the number to show, or null. */
    public record VerifyChallenge(String requestId, String challengeCode, String expiresAt, List<RiskReason> reasons, String caseCode) {
    }

    /**
     * The answer of {@code POST /login/request}. {@code challengeCode}: the number to show with
     * number matching. {@code caseCode}: the "Why?" code of this decision. {@code requiresPasskey}:
     * a phishing-resistant policy demands a passkey, no push was sent. {@code destination}:
     * {@code {known, lookalike}} when you sent one.
     */
    public record RequestResult(String requestId, String challengeCode, String message, String expiresAt, String caseCode,
                                List<RiskReason> reasons, boolean requiresPasskey, String telemetryToken, JsonNode canary, JsonNode destination) {
    }

    /**
     * Where a request is: {@code status} PENDING, CONFIRMED, REJECTED or EXPIRED. {@code provisional}:
     * Vishing Shield, approved during a call and waiting for the phone to re-confirm.
     */
    public record Status(String status, String externalUsername, String type, String referenceId, List<LoginDetail> details, boolean consumed,
                         boolean requiresPasskey, String confirmedVia, Assurance assurance, String rejectReason, boolean provisional,
                         String reconfirmedAt, boolean revoked, String revokeReason, JsonNode reply) {
    }

    /** An approved request: {@code provisional} means approved during a call (critical actions wait for the phone to re-confirm). */
    public record VerifyResult(boolean approved, String status, String requestId, String challengeCode, Assurance assurance,
                               String confirmedVia, boolean provisional) {
    }
}

/** Every field of {@code POST /login/request}, with fluent setters. */
public final class LoginRequestOptions {
    private final String externalUsername;
    private String type = "LOGIN";
    private String referenceId;
    private String clientIp;
    private String userAgent;
    private boolean requireBiometric;
    private boolean requireNumberMatch;
    private Integer challengeDigits;
    private Integer expiresIn;
    private String clientSignals;
    private String deviceRisk;
    private String deviceRiskRequestId;
    private String qrPairing;
    private ObjectNode reply;
    private List<LoginDetail> details;
    private String browserProof;
    private Map<String, Object> context;
    private SecurityChanges securityChanges;
    private Destination destination;
    private String locale;
    private Duration timeout;
    private Duration pollInterval;
    private Consumer<Login.VerifyChallenge> onChallenge;

    /** @param externalUsername the user in YOUR system (email, id) */
    public LoginRequestOptions(String externalUsername) {
        this.externalUsername = externalUsername;
    }

    public String externalUsername() {
        return externalUsername;
    }

    /** The action type (default {@code LOGIN}). */
    public LoginRequestOptions type(String v) {
        this.type = v;
        return this;
    }

    public LoginRequestOptions referenceId(String v) {
        this.referenceId = v;
        return this;
    }

    /** The END USER's IP (shown as "City, Country" on the phone; Tor, travel and attack-tool checks). */
    public LoginRequestOptions clientIp(String v) {
        this.clientIp = v;
        return this;
    }

    /** The end user's User-Agent (shown as browser and device). */
    public LoginRequestOptions userAgent(String v) {
        this.userAgent = v;
        return this;
    }

    public LoginRequestOptions requireBiometric(boolean v) {
        this.requireBiometric = v;
        return this;
    }

    public LoginRequestOptions requireNumberMatch(boolean v) {
        this.requireNumberMatch = v;
        return this;
    }

    /** Digits of the matching number when one is shown: 2 or 3. The longer of this and the workspace policy wins. */
    public LoginRequestOptions challengeDigits(Integer v) {
        this.challengeDigits = v;
        return this;
    }

    /** How long the push waits for the person, in seconds: 30 (default) to 300. */
    public LoginRequestOptions expiresIn(Integer v) {
        this.expiresIn = v;
        return this;
    }

    /** The end user's page check from {@code @touchque/web}, passed through untouched: a browser driven by software asks with number matching. */
    public LoginRequestOptions clientSignals(String v) {
        this.clientSignals = v;
        return this;
    }

    /**
     * The page's device report from {@code @touchque/web} ({@code deviceRisk.collect({ purpose })}), passed
     * through untouched. Used only when your workspace turned Device risk on: its signals only ever ask
     * for more, and a device your admin marked "step up always" asks at once.
     */
    public LoginRequestOptions deviceRisk(String v) {
        this.deviceRisk = v;
        return this;
    }

    /** The page's identification ({@code deviceRisk.identify()}), preferred over deviceRisk; for this account only. */
    public LoginRequestOptions deviceRiskRequestId(String v) {
        this.deviceRiskRequestId = v;
        return this;
    }

    /**
     * A browser pairing by QR code ({@code tq.qrPairings()}), scanned and confirmed on the phone:
     * only the phone that scanned it is asked, once, with number matching, for the user it scanned for.
     */
    public LoginRequestOptions qrPairing(String v) {
        this.qrPairing = v;
        return this;
    }

    /**
     * Ask the person to type back on the phone a sign-in code another service sent them. {@code key}:
     * {@code CodeReply.newKey().publicKey()}; {@code channel} (sms, whatsapp, email, app, backup,
     * other) and {@code target} (the masked number or address, at most 40 characters) are shown on
     * the phone, null to leave out. {@code status().reply()} holds only the ciphertext:
     * {@code CodeReply.open} opens it. Such a request lives 5 minutes. Not with {@code qrPairing}.
     */
    public LoginRequestOptions reply(String key, String channel, String target) {
        ObjectNode r = Json.object().put("kind", "code").put("key", key);
        Json.put(r, "channel", channel);
        Json.put(r, "target", target);
        this.reply = r;
        return this;
    }

    /** Transaction context for the approval screen (at most 8 lines). */
    public LoginRequestOptions details(List<LoginDetail> v) {
        this.details = v;
        return this;
    }

    /**
     * Silent sign-ins: the browser's device-bound key proof exactly as the browser sent it
     * ({@code X-TouchQue-Browser}). Once the user approves this request, TouchQue knows the browser.
     */
    public LoginRequestOptions browserProof(String v) {
        this.browserProof = v;
        return this;
    }

    /** For your TouchQue Actions only ({@code event.context}); never shown on the phone. Any JSON object up to 4 KB. */
    public LoginRequestOptions context(Map<String, Object> v) {
        this.context = v;
        return this;
    }

    /** When the user's sign-in security last changed in your system. */
    public LoginRequestOptions securityChanges(SecurityChanges v) {
        this.securityChanges = v;
        return this;
    }

    /** Where the action sends money or value (shown in full on the phone; do not repeat it in details). */
    public LoginRequestOptions destination(Destination v) {
        this.destination = v;
        return this;
    }

    /** {@code tr} (default) or {@code en}: the language of the rows TouchQue adds. */
    public LoginRequestOptions locale(String v) {
        this.locale = v;
        return this;
    }

    /** verify() only: how long to wait (default 30 seconds). */
    public LoginRequestOptions timeout(Duration v) {
        this.timeout = v;
        return this;
    }

    /** verify() only: how often to ask (default 400 ms). */
    public LoginRequestOptions pollInterval(Duration v) {
        this.pollInterval = v;
        return this;
    }

    /**
     * verify() only: called once, right after the request is created and before any waiting.
     * Show {@code challengeCode} to the user now; the phone asks for it. Not called when only a
     * passkey can approve. An exception it throws is ignored.
     */
    public LoginRequestOptions onChallenge(Consumer<Login.VerifyChallenge> v) {
        this.onChallenge = v;
        return this;
    }

    Duration timeout() {
        return timeout;
    }

    Duration pollInterval() {
        return pollInterval;
    }

    Consumer<Login.VerifyChallenge> onChallenge() {
        return onChallenge;
    }

    /** The JSON body of the request. */
    public ObjectNode toJson() {
        return toJson(true);
    }

    ObjectNode toJson(boolean withWaitFields) {
        if (externalUsername == null || externalUsername.isEmpty()) throw new TouchQueConfigException("A login request needs the user (externalUsername)");
        ObjectNode body = Json.object();
        body.put("externalUsername", externalUsername);
        body.put("type", type == null || type.isEmpty() ? "LOGIN" : type);
        Json.put(body, "referenceId", referenceId);
        Json.put(body, "clientIp", clientIp);
        Json.put(body, "userAgent", userAgent);
        if (requireBiometric) body.put("requireBiometric", true);
        if (requireNumberMatch) body.put("requireNumberMatch", true);
        if (challengeDigits != null && (challengeDigits == 2 || challengeDigits == 3)) body.put("challengeDigits", challengeDigits);
        if (withWaitFields) {
            Json.put(body, "expiresIn", expiresIn);
            Json.put(body, "clientSignals", clientSignals);
        }
        Json.put(body, "qrPairing", qrPairing);
        if (reply != null) body.set("reply", reply.deepCopy());
        Json.put(body, "deviceRisk", deviceRisk);
        Json.put(body, "deviceRiskRequestId", deviceRiskRequestId);
        if (details != null && !details.isEmpty()) body.set("details", detailsJson(details));
        Json.put(body, "browserProof", browserProof);
        if (context != null && !context.isEmpty()) body.set("context", Json.toNode(context));
        if (securityChanges != null) Json.putNode(body, "securityChanges", securityChanges.toJson());
        if (destination != null) {
            ObjectNode d = Json.object().put("kind", destination.kind()).put("value", destination.value());
            if (destination.known() != null) d.set("known", Json.toNode(destination.known()));
            body.set("destination", d);
        }
        Json.put(body, "locale", locale);
        return body;
    }

    /** {@code [{label, value}, ...]}. */
    public static ArrayNode detailsJson(List<LoginDetail> details) {
        ArrayNode arr = Json.array();
        for (LoginDetail d : details) arr.add(Json.object().put("label", d.label()).put("value", d.value()));
        return arr;
    }
}

// ─────────────────────────────────────────────────────────────
// package com.touchque.relay — RelayOptions and RelayHandler, the relay routes @touchque/web calls (public part)
// ─────────────────────────────────────────────────────────────

/** Options of {@link RelayHandler}. */
public final class RelayOptions<T> {
    /** Called right before a success answer: open your session here; change the response (headers, status), the handler sets the body. */
    @FunctionalInterface
    public interface AuthenticatedCallback<T> {
        void accept(T request, RelayResponse response, RelayAuthenticated info) throws Exception;
    }

    final Function<T, String> getUserId;
    Function<T, String> getLoginUser;
    RateLimit.Options rateLimit = RateLimit.Options.defaults();
    boolean allowOfflineWithoutFirstFactor;
    String actionType = "LOGIN";
    Function<T, List<LoginDetail>> getDetails;
    AuthenticatedCallback<T> onAuthenticated;
    Guard.SilentSignIn silentSignIn;

    /** @param getUserId the signed-in user, for the routes that need one (enrollment, passkey management) */
    public RelayOptions(Function<T, String> getUserId) {
        this.getUserId = getUserId;
    }

    /**
     * The user who passed YOUR first factor (password step). STRONGLY RECOMMENDED: /login and the
     * offline routes then act for this user and ignore any username in the body (401
     * FIRST_FACTOR_REQUIRED when it returns nothing). Without it the offline routes stay off.
     */
    public RelayOptions<T> getLoginUser(Function<T, String> v) {
        this.getLoginUser = v;
        return this;
    }

    /** Rate limits of the pre-auth routes; null turns them off (rate limit in front of the relay then). */
    public RelayOptions<T> rateLimit(RateLimit.Options v) {
        this.rateLimit = v;
        return this;
    }

    /** Let the offline routes trust the body's username (no getLoginUser). */
    public RelayOptions<T> allowOfflineWithoutFirstFactor(boolean v) {
        this.allowOfflineWithoutFirstFactor = v;
        return this;
    }

    /** Action type for /login and the offline routes (default LOGIN). */
    public RelayOptions<T> actionType(String v) {
        this.actionType = v;
        return this;
    }

    /** Transaction context for the approval screen; build it from server-side state, never from the body. */
    public RelayOptions<T> getDetails(Function<T, List<LoginDetail>> v) {
        this.getDetails = v;
        return this;
    }

    /** Called right before a success answer: open your session for {@code info.externalUsername()}. */
    public RelayOptions<T> onAuthenticated(AuthenticatedCallback<T> v) {
        this.onAuthenticated = v;
        return this;
    }

    /**
     * Silent sign-ins for /login (default off): a new sign-in whose browser sent its device-bound key
     * proof (X-TouchQue-Browser) first asks TouchQue whether anything about it is new; if nothing is,
     * it succeeds at once with no push.
     */
    public RelayOptions<T> silentSignIn(Guard.SilentSignIn v) {
        this.silentSignIn = v;
        return this;
    }
}

/**
 * Framework-agnostic relay: the routes a frontend ({@code @touchque/web}) needs for push 2FA,
 * offline codes and passkeys, so you don't hand-write them. Same routes and behaviour as the Node
 * SDK's {@code touchqueRouter}:
 * <pre>
 * POST   /enroll/start                  (signed in)   generateSecret response
 * GET    /enroll/status                 (signed in)   { linked, used, deviceId }
 * POST   /login                         (pre-auth)    202 { touchque: step, token } until approved
 * POST   /offline/challenge             (pre-auth)    QR for a phone with no internet
 * POST   /offline/verify                (pre-auth)    body.challengeId / code
 * POST   /offline/totp                  (pre-auth)    the time-based code
 * POST   /passkey/authenticate/options  (pre-auth)    body.email; none = any passkey (autofill)
 * POST   /passkey/authenticate/verify   (pre-auth)    body.attemptId / response
 * POST   /passkey/login/options         (pre-auth)    body.requestId: approve a pending request
 * POST   /passkey/login/verify          (pre-auth)    body.requestId / response
 * POST   /passkey/register/options      (signed in)   the phone approves adding a passkey first
 * POST   /passkey/register/verify       (signed in)
 * GET    /passkey/credentials           (signed in)
 * DELETE /passkey/credentials/{id}      (signed in)
 * </pre>
 */
public final class RelayHandler<T> {
    /** A 1.5 s poll for a 2-minute push is 80 requests: one attempt's worth of polls. */
    private static final int POLLS_PER_ATTEMPT = 10;
    /** Reserved action: the approval on the phone that unlocks adding a passkey. */
    private static final String PASSKEY_ENROLL_ACTION = "PASSKEY_ENROLL";

    private final TouchQueClient tq;
    private final RelayOptions<T> o;
    private final RateLimit.Limiter limiter;
    private final boolean offlineEnabled;

    public RelayHandler(TouchQueClient client, RelayOptions<T> options) {
        this.tq = client;
        this.o = options;
        this.limiter = options.rateLimit == null ? null : new RateLimit.Limiter(options.rateLimit);
        this.offlineEnabled = options.getLoginUser != null || options.allowOfflineWithoutFirstFactor;
        if (options.getLoginUser == null) {
            client.http().log().warn("[TouchQue] RelayHandler: POST /login takes the username from the request body"
                    + (offlineEnabled ? ", and so do the offline routes" : "; the offline routes are disabled until you set it")
                    + ". Set getLoginUser to bind them to your first factor (password step) so they cannot be used against arbitrary users.");
        }
    }

    /** Handles one relay request; null when no relay route matches (answer 404 yourself). */
    public RelayResponse handle(RelayRequest<T> req) {
        String method = req.method().toUpperCase(Locale.ROOT);
        if (method.equals("HEAD")) method = "GET";
        String path = "/" + req.path().split("\\?", 2)[0].replaceAll("^/+|/+$", "");
        switch (method + " " + path.toLowerCase(Locale.ROOT)) {
            case "POST /enroll/start":
                return enrollStart(req);
            case "GET /enroll/status":
                return enrollStatus(req);
            case "POST /login":
                return login(req);
            case "POST /offline/challenge":
                return offlineChallenge(req);
            case "POST /offline/verify":
                return offlineVerify(req);
            case "POST /offline/totp":
                return offlineTotp(req);
            case "POST /passkey/authenticate/options":
                return passkeyAuthenticateOptions(req);
            case "POST /passkey/authenticate/verify":
                return passkeyAuthenticateVerify(req);
            case "POST /passkey/login/options":
                return passkeyLoginOptions(req);
            case "POST /passkey/login/verify":
                return passkeyLoginVerify(req);
            case "POST /passkey/register/options":
                return passkeyRegisterOptions(req);
            case "POST /passkey/register/verify":
                return passkeyRegisterVerify(req);
            case "GET /passkey/credentials":
                return passkeyCredentials(req);
            default:
                break;
        }
        String prefix = "/passkey/credentials/";
        if (method.equals("DELETE") && path.toLowerCase(Locale.ROOT).startsWith(prefix) && path.length() > prefix.length() && !path.substring(prefix.length()).contains("/")) {
            return deleteCredential(req, URLDecoder.decode(path.substring(prefix.length()).replace("+", "%2B"), StandardCharsets.UTF_8));
        }
        return null;
    }

    // ... private route handlers omitted
}

// ─────────────────────────────────────────────────────────────
// package com.touchque.spring (touchque-spring-boot-starter) — @RequireTouchQue and its options
// ─────────────────────────────────────────────────────────────

/**
 * One line per protected controller method (or every method of a controller). Until the user
 * approves on their phone this answers {@code 202 {"touchque": step, "token": "..."}}; your page
 * shows the step in its own design and sends the same request again with header
 * {@code X-TouchQue-Token}. Once approved the method runs ONCE; a parameter of type
 * {@link com.touchque.flow.Approval} receives the approval.
 *
 * <pre>{@code
 * @PostMapping("/transfer")
 * @RequireTouchQue("SEND_MONEY")
 * Receipt transfer(@RequestBody Transfer t, Approval approval) { … }
 * }</pre>
 *
 * Who approves is the signed-in user (email, else sub, else name). For transaction details, a
 * login route's user or silent sign-ins, declare a {@link TouchQueGuardOptions} bean for the action.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequireTouchQue {
    /** The action type (LOGIN, SEND_MONEY…). */
    String value();
}

/**
 * How {@link RequireTouchQue} runs for one action. Declare it as a bean:
 *
 * <pre>{@code
 * @Bean
 * TouchQueGuardOptions sendMoney() {
 *     return TouchQueGuardOptions.forAction("SEND_MONEY")
 *         .details(c -> List.of(LoginDetail.of("Amount", c.argument(Transfer.class).amount())));
 * }
 * }</pre>
 */
public final class TouchQueGuardOptions {
    private final String action;
    private Function<TouchQueGuardContext, String> user;
    private Function<TouchQueGuardContext, List<LoginDetail>> details;
    private Function<TouchQueGuardContext, String> referenceId;
    private Function<TouchQueGuardContext, Map<String, Object>> context;
    private Guard.SilentSignIn silentSignIn;
    private boolean enroll = true;

    private TouchQueGuardOptions(String action) {
        this.action = action;
    }

    public static TouchQueGuardOptions forAction(String action) {
        return new TouchQueGuardOptions(action);
    }

    public String action() {
        return action;
    }

    /** Who approves (default: the signed-in user). For a login route, return whoever just passed your password check. */
    public TouchQueGuardOptions user(Function<TouchQueGuardContext, String> v) {
        this.user = v;
        return this;
    }

    /** Transaction details shown on the phone. Build them from server-side state or validated input. */
    public TouchQueGuardOptions details(Function<TouchQueGuardContext, List<LoginDetail>> v) {
        this.details = v;
        return this;
    }

    public TouchQueGuardOptions referenceId(Function<TouchQueGuardContext, String> v) {
        this.referenceId = v;
        return this;
    }

    /** For your TouchQue Actions only ({@code event.context}): roles, plan, amount… Never shown on the phone. */
    public TouchQueGuardOptions context(Function<TouchQueGuardContext, Map<String, Object>> v) {
        this.context = v;
        return this;
    }

    /**
     * Silent sign-ins (default off): a new attempt whose browser sent its device-bound key proof
     * ({@code X-TouchQue-Browser}) first asks TouchQue whether anything is new; if nothing is, the
     * method runs at once with no push.
     */
    public TouchQueGuardOptions silentSignIn(Guard.SilentSignIn v) {
        this.silentSignIn = v;
        return this;
    }

    /** False: never show the first-time linking QR. */
    public TouchQueGuardOptions enroll(boolean v) {
        this.enroll = v;
        return this;
    }

    Function<TouchQueGuardContext, String> user() {
        return user;
    }

    Function<TouchQueGuardContext, List<LoginDetail>> details() {
        return details;
    }

    Function<TouchQueGuardContext, String> referenceId() {
        return referenceId;
    }

    Function<TouchQueGuardContext, Map<String, Object>> context() {
        return context;
    }

    Guard.SilentSignIn silentSignIn() {
        return silentSignIn;
    }

    boolean enroll() {
        return enroll;
    }
}

// ─────────────────────────────────────────────────────────────
// package com.touchque.spring — verified webhooks and request helpers
// ─────────────────────────────────────────────────────────────

/**
 * Receives verified webhooks at {@code touchque.webhook.path} (default /webhooks/touchque):
 * <ul>
 * <li>bad signature or too old → 401, the listener is not called;</li>
 * <li>a replay of a delivery already accepted → 200 {@code {"received":true,"duplicate":true}}, not called again;</li>
 * <li>otherwise the listener runs and the answer is 200 {@code {"received":true}} (500 when it throws, so TouchQue retries;
 * the jti is released through {@code Webhook.ReplayCache.release}, so the retry runs the listener again).</li>
 * </ul>
 *
 * <pre>{@code
 * @Bean
 * TouchQueWebhookListener webhooks(Sessions sessions) {
 *     return (event, request) -> {
 *         if (Webhook.EVENT_APPROVAL_REVOKED.equals(event.path("event").asText())) sessions.end(event.path("requestId").asText());
 *     };
 * }
 * }</pre>
 */
@FunctionalInterface
public interface TouchQueWebhookListener {
    void onEvent(ObjectNode event, HttpServletRequest request) throws Exception;
}

/** Request helpers shared by the starter's pieces. */
public final class TouchQueSpring {
    /** Request attribute holding the {@link Approval} set by {@link RequireTouchQue}. */
    public static final String APPROVAL_ATTRIBUTE = "com.touchque.approval";
    /** Request attribute holding the checked {@link McpAuth.Claims} of an MCP request. */
    public static final String MCP_CLAIMS_ATTRIBUTE = "com.touchque.mcpClaims";

    private static final boolean SECURITY = ClassUtils.isPresent("org.springframework.security.core.Authentication", TouchQueSpring.class.getClassLoader());

    private TouchQueSpring() {
    }

    /** The approval of the current request (set by {@link RequireTouchQue}), or null. */
    public static Approval approval(HttpServletRequest request) {
        return request.getAttribute(APPROVAL_ATTRIBUTE) instanceof Approval a ? a : null;
    }

    /** The checked MCP token of the current request (set by the MCP filter), or null. */
    public static McpAuth.Claims mcpClaims(HttpServletRequest request) {
        return request.getAttribute(MCP_CLAIMS_ATTRIBUTE) instanceof McpAuth.Claims c ? c : null;
    }

    /** The signed-in user as TouchQue knows them: the email claim, else sub, else the principal's name. */
    public static String user(HttpServletRequest request) {
        Principal p = request.getUserPrincipal();
        if (p == null) return null;
        String fromClaims = SECURITY ? SecurityUsers.of(p) : null;
        return fromClaims != null ? fromClaims : p.getName();
    }

    /**
     * The END user's IP (IPv4-mapped addresses as IPv4). Behind a proxy, set
     * {@code server.forward-headers-strategy} so the container sees the real address.
     */
    public static String clientIp(HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        if (ip == null) return null;
        String lower = ip.toLowerCase(Locale.ROOT);
        if (lower.startsWith("::ffff:") && ip.indexOf('.') > 0) return ip.substring(7);
        if (lower.startsWith("0:0:0:0:0:ffff:") && ip.indexOf('.') > 0) return ip.substring(15);
        return ip;
    }
}
