// Touchque Java SDK and Spring Boot starter — bundled type/API reference for AI assistants.
// Concatenation of touchque-java/src/main/java/com/touchque/{TouchqueOptions,TouchqueClient,flow/Step,
// flow/StartOptions,flow/CompleteExpectations,flow/Approval,crypto/ApprovalProof,resources/Login,
// resources/LoginRequestOptions,relay/RelayOptions}.java, the public parts of flow/Guard.java and
// relay/RelayHandler.java, and the starter's com/touchque/spring/{RequireTouchque,TouchqueGuardOptions,
// TouchqueWebhookListener,TouchqueSpring}.java (package and import lines left out).
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

// ─────────────────────────────────────────────────────────────
// package com.touchque — TouchqueOptions
// ─────────────────────────────────────────────────────────────

/**
 * Settings of a {@link TouchqueClient}. Anything left null falls back to the environment:
 * {@code TQ_API_KEY}, {@code TQ_API_SECRET} and {@code TQ_API_URL} (default
 * {@code https://api.touchque.com}).
 *
 * <pre>{@code
 * var tq = new TouchqueClient(new TouchqueOptions().apiKey("tq_...").apiSecret("..."));
 * }</pre>
 */
public final class TouchqueOptions {
    public static final String DEFAULT_BASE_URL = "https://api.touchque.com";

    private String apiKey;
    private String apiSecret;
    private String baseUrl;
    private Duration timeout = Duration.ofSeconds(10);
    private HttpClient httpClient;
    private System.Logger logger;
    private boolean debug;

    /** Your API key from the dashboard ({@code tq_…}). */
    public TouchqueOptions apiKey(String value) {
        this.apiKey = value;
        return this;
    }

    /** Your API secret. Signs every request and verifies webhooks; never send it to a browser or an app. */
    public TouchqueOptions apiSecret(String value) {
        this.apiSecret = value;
        return this;
    }

    /** The API's address. Plain http is accepted only for localhost. */
    public TouchqueOptions baseUrl(String value) {
        this.baseUrl = value;
        return this;
    }

    /** Timeout of one HTTP request (default 10 seconds). */
    public TouchqueOptions timeout(Duration value) {
        this.timeout = value;
        return this;
    }

    /**
     * Your own HttpClient. Configure it NOT to follow redirects
     * ({@code HttpClient.Redirect.NEVER}): a redirect could replay the signed headers to another host.
     */
    public TouchqueOptions httpClient(HttpClient value) {
        this.httpClient = value;
        return this;
    }

    /**
     * Where the SDK reports its own problems: a misconfigured guard, an onChallenge that threw, a
     * relay error or a relay without getLoginUser, a silent sign-in check that failed. Default:
     * nothing is logged. Lines carry an error's class, code and message, never the error object, a
     * request or a user.
     */
    public TouchqueOptions logger(System.Logger value) {
        this.logger = value;
        return this;
    }

    /** With no {@link #logger}: write those lines to System.Logger {@code "touchque"} (local development). */
    public TouchqueOptions debug(boolean value) {
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
            throw new TouchqueConfigException("Set TQ_API_KEY and TQ_API_SECRET (or apiKey and apiSecret in TouchqueOptions).");
        }
        if (!key.startsWith("tq_")) {
            throw new TouchqueConfigException("apiKey must start with \"tq_\". Did you accidentally swap apiKey and apiSecret?");
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
            throw new TouchqueConfigException(name + " is not a valid URL: " + url);
        }
        String scheme = uri.getScheme();
        if (scheme == null || uri.getHost() == null) throw new TouchqueConfigException(name + " is not a valid URL: " + url);
        if (scheme.equalsIgnoreCase("https")) return;
        if (scheme.equalsIgnoreCase("http")) {
            if (isLoopback(uri.getHost())) return;
            throw new TouchqueConfigException("Refusing a plaintext http:// " + name + " for \"" + uri.getHost()
                    + "\". The API key and request signature would be sent in the clear: use https://.");
        }
        throw new TouchqueConfigException(name + " must be http(s): " + url);
    }

    public static boolean isLoopback(String host) {
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("localhost") || h.equals("127.0.0.1") || h.equals("::1") || h.equals("[::1]");
    }
}

// ─────────────────────────────────────────────────────────────
// package com.touchque — TouchqueClient (start/check/complete/protect and the resources)
// ─────────────────────────────────────────────────────────────

/**
 * The Touchque client. Every call is signed with your API secret, so it belongs on your server;
 * browser pieces relay through it.
 *
 * <pre>{@code
 * // TQ_API_KEY=tq_...  TQ_API_SECRET=...
 * var tq = new TouchqueClient();
 * var step = tq.start("SEND_MONEY", new StartOptions("jane@acme.com").details(List.of(LoginDetail.of("Amount", "250 EUR"))));
 * }</pre>
 *
 * Thread-safe; create one and reuse it (in Spring Boot the starter makes it a bean).
 */
public final class TouchqueClient {
    public static final String DEFAULT_BASE_URL = TouchqueOptions.DEFAULT_BASE_URL;

    private final TouchqueHttp http;
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
    public TouchqueClient() {
        this(new TouchqueOptions());
    }

    /** @param options anything left null falls back to the environment */
    public TouchqueClient(TouchqueOptions options) {
        TouchqueOptions.Resolved r = options.resolve();
        this.http = new TouchqueHttp(r.apiKey(), r.apiSecret(), r.baseUrl(), r.timeout(), r.httpClient(), r.log());
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

    /** Touchque Actions: your own code in the approval pipeline (deploy, test, dry run, logs). */
    public Actions actions() {
        return actions;
    }

    /** Silent sign-ins: should this sign-in ask the phone, and which browsers Touchque knows. */
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

    /** AI agents as identities of their own. The agent itself uses {@link com.touchque.agents.TouchqueAgent}. */
    public Agents agents() {
        return agents;
    }

    /** Touchque Login: your customers' accounts, roles, organizations, apps, connections (Management API). */
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

    /** Safe Guard: Safe transactions approved on the approver's phone, for TouchqueSafeGuard. */
    public SafeGuard safeGuard() {
        return safeGuard;
    }

    /** Internal: the signed HTTP client. */
    public TouchqueHttp http() {
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
     * {@code enroll.qrCodeDataUrl} so the user links the Touchque app first.
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
     * @throws TouchqueApprovalMismatchException the approval is for a different user, action or transaction
     * @throws TouchqueApiException             409 already_used, not_approved, rejected, expired or revoked
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

    /** First-time linking: show {@code qrCodeDataUrl}. {@code expiresAt}: when the QR stops working (ISO 8601). */
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

    public Step withExpiresAt(String v) {
        return new Step(state, requestId, number, v, details, caseCode, reasons, telemetryToken, canary, enroll, offline, reason, retryAfter, assurance);
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

    /** The end user's IP: sent with the push and, for a user with no phone, with the first-time QR (the phone shows where it was asked for). */
    public StartOptions ip(String v) {
        this.ip = v;
        return this;
    }

    /** The end user's User-Agent, sent like {@link #ip(String)}. */
    public StartOptions userAgent(String v) {
        this.userAgent = v;
        return this;
    }

    /** Silent sign-ins: the {@code X-Touchque-Browser} header, passed through untouched. */
    public StartOptions browserProof(String v) {
        this.browserProof = v;
        return this;
    }

    /** For your Touchque Actions only ({@code event.context}). */
    public StartOptions context(Map<String, Object> v) {
        this.context = v;
        return this;
    }

    /**
     * False: never show the first-time linking QR (a typed username proves nothing). A user with no
     * phone then gets {@code enroll} with reason {@code enrollment_off}.
     */
    public StartOptions enroll(boolean v) {
        this.enroll = v;
        return this;
    }
}

/** What an approved request must be for (checked by {@code TouchqueClient.complete}). */
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
 * why Touchque let this known browser in (nothing went to the phone).
 */
public record Approval(String requestId, String user, String action, Assurance assurance, String confirmedVia, JsonNode approvalProof,
                       Boolean provisional, Boolean revoked, String revokeReason, String reconfirmedAt, List<RiskReason> reasons) {
}

// ─────────────────────────────────────────────────────────────
// package com.touchque.flow — Guard.run, the two-phase contract for any framework (public part)
// ─────────────────────────────────────────────────────────────

/**
 * Framework-agnostic step-up guard (the Spring starter's {@code @RequireTouchque} is a thin wrapper
 * over it). Contract, the same in every Touchque server SDK:
 * <ul>
 * <li>1st request: 202 {@code {"touchque": step, "token": ...}}; show the step in your UI;</li>
 * <li>repeat with the token (header {@code X-Touchque-Token}): 202 while waiting, then the protected action runs once;
 * a waiting poll repeats the request's {@code expiresAt};</li>
 * <li>while the first-time linking QR is up: 202 {@code {"touchque": {"state": "enroll", "expiresAt": ...}}} without
 * {@code enroll}, keep showing that QR; a new one comes with {@code enroll.qrCodeDataUrl} about 15 s before it expires;</li>
 * <li>refused: 403 / 408 / 423 / 429 {@code {"touchque": {"state": ...}}}.</li>
 * </ul>
 * {@link #response} turns a result that is not an approval into its HTTP answer.
 */
public final class Guard {
    public static final String TOKEN_HEADER = "X-Touchque-Token";
    public static final String OFFLINE_HEADER = "X-Touchque-Offline";
    public static final String CODE_HEADER = "X-Touchque-Code";
    public static final String CODE_TYPE_HEADER = "X-Touchque-Code-Type";
    public static final String BROWSER_HEADER = "X-Touchque-Browser";
    /** On every refused answer (status 400 or more): the step's state. */
    public static final String STATE_HEADER = "X-Touchque-State";
    /** On a refused answer whose step has a reason: that reason. */
    public static final String REASON_HEADER = "X-Touchque-Reason";

    private static final long TOKEN_TTL_MS = 10 * 60 * 1000;
    /** A first-time QR this close to its expiry is replaced instead of kept: the user could not scan it in time. */
    private static final long ENROLL_RENEW_MS = 15 * 1000;
    /** A real proof is a few hundred characters; anything far larger is not one. */
    private static final int MAX_BROWSER_PROOF = 4096;

    private static final Map<String, Integer> STATUS_OF = Map.of(
            "waiting", 202, "enroll", 202, "passkey_required", 202, "offline", 202,
            "approved", 200, "rejected", 403, "blocked", 403, "expired", 408, "frozen", 423, "rate_limited", 429);

    private static final Set<String> WAITING = Set.of("waiting", "passkey_required", "offline");
    /** A push or a passkey on its way: the steps whose polls repeat the request's expiry. */
    private static final Set<String> ON_THE_PHONE = Set.of("waiting", "passkey_required");

    /** The client of {@code run(null, …)}: built on first use, then kept (or set with {@link #setDefaultClient}). */
    private static volatile TouchqueClient sharedClient;
    private static final Object SHARED_CLIENT_LOCK = new Object();
    /** How {@link #defaultClient()} builds it: from the environment. Package-private so a test can make a build fail. */
    static volatile Supplier<TouchqueClient> clientBuilder = TouchqueClient::new;

    private Guard() {
    }

    /** Silent sign-ins for a guard or relay: {@code maxAgeSeconds} is your own limit on how long ago the last phone approval in that browser may be (0 = always ask; null = Touchque's). */
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
        Supplier<Optional<Result>> beforeStart;

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

        /**
         * The end user's IP: sent with the push, the silent check, the offline QR, the time-based
         * code check ({@code codeType("totp")}) and a first-time QR (the phone shows where it was
         * asked for).
         */
        public Input ip(String v) {
            this.ip = v;
            return this;
        }

        /**
         * The end user's User-Agent: sent with the push, the silent check, the offline QR and a
         * first-time QR, not with the time-based code check (that one sends only the IP).
         */
        public Input userAgent(String v) {
            this.userAgent = v;
            return this;
        }

        /** {@code X-Touchque-Token}: the token from the last answer. */
        public Input token(String v) {
            this.token = v;
            return this;
        }

        /** {@code X-Touchque-Offline: 1}: switch to offline approval. */
        public Input offline(boolean v) {
            this.offline = v;
            return this;
        }

        /** {@code X-Touchque-Code}: the code from the phone. */
        public Input code(String v) {
            this.code = v;
            return this;
        }

        /** {@code X-Touchque-Code-Type}: totp for the rolling time-based code. */
        public Input codeType(String v) {
            this.codeType = v;
            return this;
        }

        /**
         * False: never show the first-time linking QR. A user with no phone then gets 202
         * {@code {"state": "enroll", "reason": "enrollment_off"}}.
         */
        public Input enroll(boolean v) {
            this.enroll = v;
            return this;
        }

        /** {@code X-Touchque-Browser}: the browser's device-bound key proof. */
        public Input browserProof(String v) {
            this.browserProof = v;
            return this;
        }

        /** Null: silent sign-ins off. */
        public Input silentSignIn(SilentSignIn v) {
            this.silentSignIn = v;
            return this;
        }

        /** For your Touchque Actions only ({@code event.context}). */
        public Input context(Map<String, Object> v) {
            this.context = v;
            return this;
        }

        /**
         * Called at most once, only for the token of a first-time QR ({@code enroll} with its expiry),
         * right before the guard starts something instead of answering "keep the QR": a silent check
         * or a push once the phone is linked, or a new QR once the old one expired, is about to, or is
         * gone. A result is answered as it is and nothing starts. Relays charge the start here like a
         * fresh attempt, so a status poll never starts anything on the poll budget.
         */
        public Input beforeStart(Supplier<Optional<Result>> v) {
            this.beforeStart = v;
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

        /**
         * The headers of a refused answer (status 400 or more): {@code X-Touchque-State}, and
         * {@code X-Touchque-Reason} when the step has a reason; none otherwise. {@code @touchque/web}
         * reads the step from them when a body has no {@code touchque} (an errorBody's string, say).
         */
        public Map<String, String> refusalHeaders() {
            if (status < 400 || step == null || empty(step.state())) return Map.of();
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put(STATE_HEADER, step.state());
            if (!empty(step.reason())) headers.put(REASON_HEADER, step.reason());
            return headers;
        }
    }

    /**
     * A refused answer (status 400 or more), as an adapter's {@code errorBody} callback sees it.
     * {@code code}: {@code error.code} when the guard set one, else the step's reason, else its state.
     * {@code message}: {@code error.message} when set, else a sentence for the state.
     * {@code touchque}: the step as it would be sent.
     */
    public record Refusal(int status, String code, String message, JsonNode touchque) {
        /** The refusal in a guard's answer, or null for a 202 step or an approval. */
        public static Refusal of(Result result) {
            if (result == null || result.approved() != null || result.status() < 400 || result.body() == null) return null;
            JsonNode step = stepOf(result);
            JsonNode error = result.body().get("error");
            String state = Json.str(step, "state");
            String code = Json.str(error, "code");
            if (empty(code)) code = Json.str(step, "reason");
            if (empty(code)) code = state;
            String message = Json.str(error, "message");
            if (empty(message)) {
                message = switch (String.valueOf(state)) {
                    case "rejected" -> "The approval was rejected.";
                    case "expired" -> "The approval expired. Try again.";
                    case "frozen" -> "Too many rejected approvals. Try again later.";
                    case "rate_limited" -> "Too many attempts. Try again later.";
                    default -> "The approval was refused.";
                };
            }
            return new Refusal(result.status(), code, message, step == null ? null : step.deepCopy());
        }
    }

    /** The step a result answers: its body's {@code touchque}, else its {@link Result#step()} (a hook's result may carry only that). */
    private static JsonNode stepOf(Result result) {
        JsonNode step = result.body() == null ? null : result.body().get("touchque");
        return step != null || result.step() == null ? step : Steps.toJson(result.step());
    }

    /**
     * Your app's own JSON body for refused answers (status 400 or more: 401, 403, 408, 423, 429,
     * 500, 503). Never called for a 202 step or on approval. What it returns counts by its JSON
     * encoding: a JSON object is sent with {@code touchque} set to the step (so
     * {@code @touchque/web} still sees the state; no token is added), anything else (a string, a
     * number, a list, null) as it is. It gets a copy of the step. See {@link #response}.
     */
    @FunctionalInterface
    public interface ErrorBody {
        Object body(Refusal refusal);
    }

    /**
     * The HTTP answer of a guard result that is not an approval, as {@link #response} builds it:
     * the status, the headers ({@code Cache-Control: no-store}, {@code Retry-After} on 423 and 429,
     * {@code X-Touchque-State} and {@code X-Touchque-Reason} on a refusal) and the JSON body (an
     * object, or what an {@link ErrorBody} returned: a string, a number, a list, null). Send the
     * body as JSON.
     */
    public record Response(int status, Map<String, String> headers, JsonNode body) {
    }

    /**
     * What to send for a result that is not an approval: the status and headers
     * {@code @RequireTouchque} and the relay send (they use this too), and the guard's body.
     * {@code errorBody} (null: the guard's body) shapes the refusals, status 400 or more; it is
     * never called for a 202 step. This form writes its result with the SDK's own ObjectMapper and
     * logs nothing when it fails (the guard's body is sent then). For the answer
     * {@code @RequireTouchque} sends with an errorBody, written with your app's ObjectMapper and
     * logged, use {@link #response(Result, ErrorBody, ObjectMapper, System.Logger)}. Without an
     * errorBody the two forms are the same.
     *
     * @throws IllegalArgumentException for an approval: run your action instead
     */
    public static Response response(Result result, ErrorBody errorBody) {
        return response(result, errorBody, null, null);
    }

    /**
     * The answer {@code @RequireTouchque} sends: {@link #response(Result, ErrorBody)} with your
     * app's {@code mapper} writing what {@code errorBody} returns (null: the SDK's; it is read back
     * with the SDK's limits, so more than 1,000 levels of nesting fall back too), and a
     * {@code logger} for {@code [Touchque] errorBody failed: <message>} (null: nothing is logged).
     *
     * @throws IllegalArgumentException for an approval: run your action instead
     */
    public static Response response(Result result, ErrorBody errorBody, ObjectMapper mapper, System.Logger logger) {
        if (result == null || result.approved() != null) {
            throw new IllegalArgumentException("Guard.response answers a step or a refusal; on approval, run your action");
        }
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("Cache-Control", "no-store");
        if (result.retryAfter() != null) headers.put("Retry-After", String.valueOf(result.retryAfter()));
        headers.putAll(result.refusalHeaders());
        return new Response(result.status(), Collections.unmodifiableMap(headers), body(result, errorBody, mapper, new SdkLog(logger, false)));
    }

    /** The guard's body, or for a refusal (400 or more) what {@code errorBody} makes of it. */
    private static JsonNode body(Result result, ErrorBody errorBody, ObjectMapper mapper, SdkLog log) {
        Refusal refusal = errorBody == null ? null : Refusal.of(result);
        if (refusal == null) return result.body();
        try {
            // Decided by the real encoding: written with the app's ObjectMapper and read back with the SDK's, so the
            // answer sent meets the same write and read limits (nesting depth, sizes). What cannot be written falls back below.
            Object value = errorBody.body(refusal);
            JsonNode node = value == null ? NullNode.instance : Json.MAPPER.readTree((mapper != null ? mapper : Json.MAPPER).writeValueAsBytes(value));
            JsonNode step = stepOf(result);
            // The SDK's key wins, so @touchque/web still sees the state.
            if (node instanceof ObjectNode object && step != null) object.set("touchque", step.deepCopy());
            return node != null ? node : NullNode.instance;
        } catch (Exception | StackOverflowError e) {
            // Checked exceptions too (a Kotlin lambda, @SneakyThrows), and a cycle in what it returned: the default body.
            // Jackson's own message, without the reference chain (it names the app's fields and can run to kilobytes).
            String message = e instanceof JsonProcessingException j ? j.getOriginalMessage() : e.getMessage();
            log.error("[Touchque] errorBody failed: " + (message != null ? message : e.getClass().getSimpleName()));
            return result.body();
        }
    }

    /**
     * True when this request only reads a state: it polls an approval already on its way (a valid
     * token bound to this user/action/details, still waiting) or a first-time linking QR still up (a
     * bound {@code enroll} token whose QR expires in more than 15 s), with no offline switch or typed
     * code. Relays do not count it against the per-user push limit. A start such a poll leads to (a
     * push once the phone is linked, a new QR) goes through {@link Input#beforeStart}, where relays
     * charge it like a fresh attempt: every start is counted. A null {@code client} is
     * {@link #defaultClient()}; while that cannot be built, false.
     */
    public static boolean isStatusPoll(TouchqueClient client, Input input) {
        if (empty(input.user) || empty(input.token) || input.offline || !empty(input.code)) return false;
        if (client == null) client = defaultClientOrNull();
        if (client == null) return false;
        ObjectNode claims = Steps.verifyGuardToken(client.apiSecret(), input.token);
        if (claims == null || !bound(claims, input)) return false;
        String st = Json.str(claims, "st");
        if ("enroll".equals(st)) return qrStillUp(Json.lng(claims, "ee"));
        return !empty(Json.str(claims, "rid")) && WAITING.contains(String.valueOf(st));
    }

    /** A first-time QR that expires at {@code ee} (ms since the epoch) can still be scanned: more than 15 s left. */
    private static boolean qrStillUp(Long ee) {
        return ee != null && System.currentTimeMillis() < ee - ENROLL_RENEW_MS;
    }

    /**
     * The guard's answer when no client can be built (TQ_API_KEY / TQ_API_SECRET missing): 401
     * {@code unauthenticated} without a user, else 500 {@code misconfigured}. An adapter that builds
     * its client on first use answers this instead of throwing.
     */
    public static Result withoutClient(Input input) {
        return empty(input.user) ? unauthenticated() : misconfigured();
    }

    /**
     * The client {@link #run} and {@link #isStatusPoll} use when you pass null: the one
     * {@link #setDefaultClient} set, else one built from {@code TQ_API_KEY}, {@code TQ_API_SECRET}
     * and {@code TQ_API_URL} on first use and kept. A build that fails is not kept: the next call
     * tries again. Thread-safe. It is not the Spring Boot starter's bean: that one also reads
     * {@code touchque.*}. Call it at startup to fail fast: the guard's null-client path answers 500
     * {@code misconfigured} and logs nothing, while this throws and names the problem.
     *
     * @throws TouchqueConfigException while it cannot be built (no key or secret, say)
     */
    public static TouchqueClient defaultClient() {
        TouchqueClient c = sharedClient;
        if (c != null) return c;
        synchronized (SHARED_CLIENT_LOCK) {
            if (sharedClient == null) sharedClient = clientBuilder.get();
            return sharedClient;
        }
    }

    /**
     * Replaces the client {@code run(null, …)} and {@code isStatusPoll(null, …)} use, process-wide:
     * a client built with a logger gives that path its log lines. {@code null} forgets it, so the
     * next call builds one from the environment again.
     */
    public static void setDefaultClient(TouchqueClient client) {
        synchronized (SHARED_CLIENT_LOCK) {
            sharedClient = client;
        }
    }

    /** {@link #defaultClient()}, or null while it cannot be built. */
    private static TouchqueClient defaultClientOrNull() {
        try {
            return defaultClient();
        } catch (TouchqueConfigException e) {
            return null;
        }
    }

    public static Result run(TouchqueClient client, Input input);  // implementation omitted
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
 * Verifying it does not require trusting Touchque.
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

    private final TouchqueHttp http;

    /** Internal: use {@code tq.login()}. */
    public Login(TouchqueHttp http) {
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
        return TouchqueHttp.to(http.post("/login/request", options.toJson()), RequestResult.class);
    }

    /** Where a request is now: PENDING, CONFIRMED, REJECTED or EXPIRED. */
    public Status status(String requestId) {
        return TouchqueHttp.to(http.get("/login/status/" + TouchqueHttp.seg(requestId)), Status.class);
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
     * @throws TouchquePasskeyRequiredException only a passkey can approve (policy), or the user tapped Approve during a call (step_up)
     * @throws TouchqueRejectedException the user rejected it
     * @throws TouchqueTimeoutException it expired or the timeout passed
     */
    public VerifyResult verify(LoginRequestOptions options) {
        RequestResult sent = TouchqueHttp.to(http.post("/login/request", options.toJson(false)), RequestResult.class);
        if (sent.requiresPasskey()) throw new TouchquePasskeyRequiredException(sent.requestId(), "policy");
        if (options.onChallenge() != null) {
            try {
                options.onChallenge().accept(new VerifyChallenge(sent.requestId(), emptyToNull(sent.challengeCode()), sent.expiresAt(), sent.reasons(), sent.caseCode()));
            } catch (RuntimeException e) {
                // The caller's callback must not stop the wait.
                http.log().warn("[Touchque] onChallenge failed: " + SdkLog.describe(e));
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
                    throw new TouchqueRejectedException(requestId);
                case "EXPIRED":
                    throw new TouchqueTimeoutException("Touchque: request '" + requestId + "' expired before it was approved.", requestId);
                default:
                    break;
            }
            // Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
            if ("PENDING".equals(s.status()) && s.requiresPasskey()) throw new TouchquePasskeyRequiredException(requestId, "step_up");
            if (Instant.now().plus(interval).isAfter(deadline)) {
                throw new TouchqueTimeoutException("Touchque: request '" + requestId + "' was not approved within " + timeout.toSeconds()
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
            throw new TouchqueNetworkException("interrupted", e);
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
     * {@link com.touchque.TouchqueApiException} with code {@code already_used} (409). The answer
     * has {@code approvalProof}, the phone's signature over what it showed, when the phone has a
     * hardware key.
     */
    public JsonNode consume(String requestId) {
        return http.post("/login/" + TouchqueHttp.seg(requestId) + "/consume", Json.object());
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
        if (requestId == null || requestId.isEmpty()) throw new TouchqueConfigException("reportFraud() needs the request id");
        ObjectNode body = Json.object();
        Json.put(body, "reason", reason);
        Json.put(body, "note", note);
        return http.post("/login/" + TouchqueHttp.seg(requestId) + "/report-fraud", body);
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
     * {@code expiresAt}: when the request expires (ISO 8601; a Vishing Shield escalation to a passkey
     * extends it), null when the API did not say.
     */
    public record Status(String status, String externalUsername, String type, String referenceId, List<LoginDetail> details, boolean consumed,
                         boolean requiresPasskey, String confirmedVia, Assurance assurance, String rejectReason, boolean provisional,
                         String reconfirmedAt, boolean revoked, String revokeReason, JsonNode reply, String expiresAt) {
        /** The answer without {@code expiresAt} (null), as before it was added. */
        public Status(String status, String externalUsername, String type, String referenceId, List<LoginDetail> details, boolean consumed,
                      boolean requiresPasskey, String confirmedVia, Assurance assurance, String rejectReason, boolean provisional,
                      String reconfirmedAt, boolean revoked, String revokeReason, JsonNode reply) {
            this(status, externalUsername, type, referenceId, details, consumed, requiresPasskey, confirmedVia, assurance, rejectReason, provisional,
                    reconfirmedAt, revoked, revokeReason, reply, null);
        }
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
     * ({@code X-Touchque-Browser}). Once the user approves this request, Touchque knows the browser.
     */
    public LoginRequestOptions browserProof(String v) {
        this.browserProof = v;
        return this;
    }

    /** For your Touchque Actions only ({@code event.context}); never shown on the phone. Any JSON object up to 4 KB. */
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

    /** {@code tr} (default) or {@code en}: the language of the rows Touchque adds. */
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
        if (externalUsername == null || externalUsername.isEmpty()) throw new TouchqueConfigException("A login request needs the user (externalUsername)");
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
     * proof (X-Touchque-Browser) first asks Touchque whether anything about it is new; if nothing is,
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
 * POST   /enroll/start                  (signed in)   generateSecret response; sends the browser's IP and User-Agent, as POST /login does
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

    private final TouchqueClient tq;
    private final RelayOptions<T> o;
    private final RateLimit.Limiter limiter;
    private final boolean offlineEnabled;

    public RelayHandler(TouchqueClient client, RelayOptions<T> options) {
        this.tq = client;
        this.o = options;
        this.limiter = options.rateLimit == null ? null : new RateLimit.Limiter(options.rateLimit);
        this.offlineEnabled = options.getLoginUser != null || options.allowOfflineWithoutFirstFactor;
        if (options.getLoginUser == null) {
            client.http().log().warn("[Touchque] RelayHandler: POST /login takes the username from the request body"
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
// package com.touchque.spring (touchque-spring-boot-starter) — @RequireTouchque and its options
// ─────────────────────────────────────────────────────────────

/**
 * One line per protected controller method (or every method of a controller). Until the user
 * approves on their phone this answers {@code 202 {"touchque": step, "token": "..."}}; your page
 * shows the step in its own design and sends the same request again with header
 * {@code X-Touchque-Token}. Once approved the method runs ONCE; a parameter of type
 * {@link com.touchque.flow.Approval} receives the approval.
 *
 * <pre>{@code
 * @PostMapping("/transfer")
 * @RequireTouchque("SEND_MONEY")
 * Receipt transfer(@RequestBody Transfer t, Approval approval) { … }
 * }</pre>
 *
 * Who approves is the signed-in user (email, else sub, else name). For transaction details, a
 * login route's user or silent sign-ins, declare a {@link TouchqueGuardOptions} bean for the action.
 * Refusals keep your app's error shape with a {@link TouchqueErrorBody} bean.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequireTouchque {
    /** The action type (LOGIN, SEND_MONEY…). */
    String value();
}

/**
 * How {@link RequireTouchque} runs for one action. Declare it as a bean:
 *
 * <pre>{@code
 * @Bean
 * TouchqueGuardOptions sendMoney() {
 *     return TouchqueGuardOptions.forAction("SEND_MONEY")
 *         .details(c -> List.of(LoginDetail.of("Amount", c.argument(Transfer.class).amount())));
 * }
 * }</pre>
 */
public final class TouchqueGuardOptions {
    private final String action;
    private Function<TouchqueGuardContext, String> user;
    private Function<TouchqueGuardContext, List<LoginDetail>> details;
    private Function<TouchqueGuardContext, String> referenceId;
    private Function<TouchqueGuardContext, Map<String, Object>> context;
    private Guard.SilentSignIn silentSignIn;
    private boolean enroll = true;
    private TouchqueErrorBody errorBody;

    private TouchqueGuardOptions(String action) {
        this.action = action;
    }

    public static TouchqueGuardOptions forAction(String action) {
        return new TouchqueGuardOptions(action);
    }

    public String action() {
        return action;
    }

    /** Who approves (default: the signed-in user). For a login route, return whoever just passed your password check. */
    public TouchqueGuardOptions user(Function<TouchqueGuardContext, String> v) {
        this.user = v;
        return this;
    }

    /** Transaction details shown on the phone. Build them from server-side state or validated input. */
    public TouchqueGuardOptions details(Function<TouchqueGuardContext, List<LoginDetail>> v) {
        this.details = v;
        return this;
    }

    public TouchqueGuardOptions referenceId(Function<TouchqueGuardContext, String> v) {
        this.referenceId = v;
        return this;
    }

    /** For your Touchque Actions only ({@code event.context}): roles, plan, amount… Never shown on the phone. */
    public TouchqueGuardOptions context(Function<TouchqueGuardContext, Map<String, Object>> v) {
        this.context = v;
        return this;
    }

    /**
     * Silent sign-ins (default off): a new attempt whose browser sent its device-bound key proof
     * ({@code X-Touchque-Browser}) first asks Touchque whether anything is new; if nothing is, the
     * method runs at once with no push.
     */
    public TouchqueGuardOptions silentSignIn(Guard.SilentSignIn v) {
        this.silentSignIn = v;
        return this;
    }

    /**
     * False: never show the first-time linking QR. A user with no phone then gets 202
     * {@code {"state": "enroll", "reason": "enrollment_off"}}.
     */
    public TouchqueGuardOptions enroll(boolean v) {
        this.enroll = v;
        return this;
    }

    /** Your own body for this action's refusals (400 or more), instead of the {@link TouchqueErrorBody} bean's or the default one. */
    public TouchqueGuardOptions errorBody(TouchqueErrorBody v) {
        this.errorBody = v;
        return this;
    }

    Function<TouchqueGuardContext, String> user() {
        return user;
    }

    Function<TouchqueGuardContext, List<LoginDetail>> details() {
        return details;
    }

    Function<TouchqueGuardContext, String> referenceId() {
        return referenceId;
    }

    Function<TouchqueGuardContext, Map<String, Object>> context() {
        return context;
    }

    Guard.SilentSignIn silentSignIn() {
        return silentSignIn;
    }

    boolean enroll() {
        return enroll;
    }

    TouchqueErrorBody errorBody() {
        return errorBody;
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
 * <li>otherwise the listener runs and the answer is 200 {@code {"received":true}} (500 when it throws, so Touchque retries;
 * the jti is released through {@code Webhook.ReplayCache.release}, so the retry runs the listener again).</li>
 * </ul>
 *
 * <pre>{@code
 * @Bean
 * TouchqueWebhookListener webhooks(Sessions sessions) {
 *     return (event, request) -> {
 *         if (Webhook.EVENT_APPROVAL_REVOKED.equals(event.path("event").asText())) sessions.end(event.path("requestId").asText());
 *     };
 * }
 * }</pre>
 */
@FunctionalInterface
public interface TouchqueWebhookListener {
    void onEvent(ObjectNode event, HttpServletRequest request) throws Exception;
}

/** Request helpers shared by the starter's pieces. */
public final class TouchqueSpring {
    /** Request attribute holding the {@link Approval} set by {@link RequireTouchque}. */
    public static final String APPROVAL_ATTRIBUTE = "com.touchque.approval";
    /** Request attribute holding the checked {@link McpAuth.Claims} of an MCP request. */
    public static final String MCP_CLAIMS_ATTRIBUTE = "com.touchque.mcpClaims";

    private static final boolean SECURITY = ClassUtils.isPresent("org.springframework.security.core.Authentication", TouchqueSpring.class.getClassLoader());

    private TouchqueSpring() {
    }

    /** The approval of the current request (set by {@link RequireTouchque}), or null. */
    public static Approval approval(HttpServletRequest request) {
        return request.getAttribute(APPROVAL_ATTRIBUTE) instanceof Approval a ? a : null;
    }

    /** The checked MCP token of the current request (set by the MCP filter), or null. */
    public static McpAuth.Claims mcpClaims(HttpServletRequest request) {
        return request.getAttribute(MCP_CLAIMS_ATTRIBUTE) instanceof McpAuth.Claims c ? c : null;
    }

    /** The signed-in user as Touchque knows them: the email claim, else sub, else the principal's name. */
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

// ─────────────────────────────────────────────────────────────
// From touchque-java .../agents/CrossAppAccess.java, IdJagVerifier.java — Cross App Access: ID-JAG, DPoP binding
// ─────────────────────────────────────────────────────────────

package com.touchque.agents;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectReader;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.touchque.TouchqueConfigException;
import com.touchque.TouchqueIdJagException;
import com.touchque.TouchqueNetworkException;
import com.touchque.TouchqueOptions;
import com.touchque.crypto.AgentKeys;
import com.touchque.crypto.Jws;
import com.touchque.crypto.SigningKey;
import com.touchque.internal.Json;
import com.touchque.internal.TouchqueHttp;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;

/**
 * Cross App Access: Identity Assertion JWT Authorization Grants (ID-JAG,
 * draft-ietf-oauth-identity-assertion-authz-grant, an open standard). An organization's identity
 * provider (Touchque SSO) decides which of its apps may reach which other service for its
 * members; the app trades a member's ID token for an ID-JAG there, then the ID-JAG for an access
 * token at the other service's authorization server, with no consent screen per member. Your own
 * authorization server takes them with {@link IdJagVerifier}.
 *
 * <pre>{@code
 * var jag = CrossAppAccess.requestIdJag(new CrossAppAccess.RequestOptions(id, secret, idToken, "https://auth.files.example")
 *     .issuer("https://sso.touchque.com"));
 * JsonNode tokens = CrossAppAccess.redeemIdJag(new CrossAppAccess.RedeemOptions("https://auth.files.example/token", "acme", jag.assertion())
 *     .clientSecret(filesSecret));
 * }</pre>
 *
 * <p>Sender-constrained with DPoP (RFC 9449), optional: give the same key to both calls. The ID-JAG is
 * then bound to it (cnf.jkt) and is useless to anyone who copies it without the key. A token endpoint
 * that asks for a nonce (400 or 401 use_dpop_nonce with a valid DPoP-Nonce header) gets the same request
 * once more, with a new proof carrying it. Calls with the DPoP-bound access token carry a proof of their own:
 *
 * <pre>{@code
 * var dpopKey = CrossAppAccess.createIdJagDpopKey();
 * var jag = CrossAppAccess.requestIdJag(requestOptions.dpopKey(dpopKey));            // jag.dpopBound()
 * JsonNode tokens = CrossAppAccess.redeemIdJag(redeemOptions.dpopKey(dpopKey));
 * String at = tokens.get("access_token").asText();
 * HttpRequest call = HttpRequest.newBuilder(URI.create(url)).GET()
 *     .header("Authorization", "DPoP " + at)
 *     .header("DPoP", CrossAppAccess.idJagDpopProof(dpopKey, "GET", url, at, null)).build();
 * }</pre>
 *
 * <p>Only a 2xx answer whose body is a JSON object is a token endpoint's answer. Any other status (redirects are
 * never followed) throws {@link TouchqueIdJagException} with that status and the answer's {@code error} when it is
 * an RFC 6749 error code (else {@code server_error}); a 2xx without a JSON object throws {@code invalid_response};
 * a token endpoint that cannot be reached or read throws {@code temporarily_unavailable} with no status and the
 * failure as its cause. An interrupted call also restores the thread's interrupt status.
 */
public final class CrossAppAccess {
    public static final String ID_JAG_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id-jag";
    public static final String ID_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:id_token";
    public static final String TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
    public static final String JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

    private static final HttpClient SHARED_CLIENT = TouchqueHttp.createClient(Duration.ofSeconds(10));
    /** JSON with nothing after its one value but whitespace: a token endpoint's body is one JSON object or none. */
    private static final ObjectReader ONE_JSON_VALUE = Json.MAPPER.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    /** The longest {@code error} taken as an error code (RFC 6749 sets no length; a longer one is server_error). */
    private static final int MAX_ERROR_CODE = 128;

    private CrossAppAccess() {
    }

    /** What {@link #requestIdJag} needs. */
    public static final class RequestOptions {
        private final String clientId;
        private final String clientSecret;
        private final String idToken;
        private final String audience;
        private String issuer;
        private String tokenEndpoint;
        private String resource;
        private String scope;
        private IdJagDpopKey dpopKey;

        /**
         * @param clientId your app at the identity provider ({@code tqapp_…} at Touchque SSO).
         * @param clientSecret its secret.
         * @param idToken the member's ID token the identity provider issued to your app.
         * @param audience the other service's authorization server (its issuer).
         */
        public RequestOptions(String clientId, String clientSecret, String idToken, String audience) {
            this.clientId = clientId;
            this.clientSecret = clientSecret;
            this.idToken = idToken;
            this.audience = audience;
        }

        /** The identity provider's issuer (its token endpoint is discovered), or give {@link #tokenEndpoint}. */
        public RequestOptions issuer(String v) {
            this.issuer = v;
            return this;
        }

        public RequestOptions tokenEndpoint(String v) {
            this.tokenEndpoint = v;
            return this;
        }

        public RequestOptions resource(String v) {
            this.resource = v;
            return this;
        }

        public RequestOptions scope(String v) {
            this.scope = v;
            return this;
        }

        /** Binds the ID-JAG to this key (DPoP, RFC 9449); redeem it with the same key. */
        public RequestOptions dpopKey(IdJagDpopKey v) {
            this.dpopKey = v;
            return this;
        }
    }

    /** What {@link #redeemIdJag} needs. */
    public static final class RedeemOptions {
        private final String tokenEndpoint;
        private final String clientId;
        private final String assertion;
        private String clientSecret;
        private String resource;
        private String scope;
        private IdJagDpopKey dpopKey;

        public RedeemOptions(String tokenEndpoint, String clientId, String assertion) {
            this.tokenEndpoint = tokenEndpoint;
            this.clientId = clientId;
            this.assertion = assertion;
        }

        /** Without a secret the client is public: its client_id goes in the form. */
        public RedeemOptions clientSecret(String v) {
            this.clientSecret = v;
            return this;
        }

        public RedeemOptions resource(String v) {
            this.resource = v;
            return this;
        }

        public RedeemOptions scope(String v) {
            this.scope = v;
            return this;
        }

        /**
         * The key the ID-JAG is bound to: a DPoP proof goes along, and the access token is then DPoP-bound too
         * (sign each call with it: {@link CrossAppAccess#idJagDpopProof(IdJagDpopKey, String, String, String, String)}).
         */
        public RedeemOptions dpopKey(IdJagDpopKey v) {
            this.dpopKey = v;
            return this;
        }
    }

    /**
     * An ID-JAG the identity provider issued. {@code dpopBound}: with a DPoP key, whether the returned
     * ID-JAG carries that key's thumbprint (cnf.jkt), as an identity provider without DPoP support
     * ignores the proof; null without one.
     */
    public record IdJagGrant(String assertion, Integer expiresIn, String scope, Boolean dpopBound) {
        public IdJagGrant(String assertion, Integer expiresIn, String scope) {
            this(assertion, expiresIn, scope, null);
        }
    }

    /** A DPoP key (RFC 9449, P-256) that binds an ID-JAG to its holder; keep it in this process. */
    public static final class IdJagDpopKey {
        private final SigningKey key;
        private final String thumbprint;

        private IdJagDpopKey(SigningKey key) {
            this.key = key;
            this.thumbprint = AgentKeys.thumbprint(key.publicJwk());
        }

        /** kty, crv, x, y: the public key only. */
        public ObjectNode publicJwk() {
            return key.publicJwk();
        }

        /** RFC 7638 thumbprint: the ID-JAG's cnf.jkt. */
        public String thumbprint() {
            return thumbprint;
        }

        @Override
        public String toString() {
            return "IdJagDpopKey[thumbprint=" + thumbprint + "]";
        }
    }

    /** Makes a fresh DPoP key for {@link #requestIdJag} and {@link #redeemIdJag}. */
    public static IdJagDpopKey createIdJagDpopKey() {
        return new IdJagDpopKey(SigningKey.newEs256());
    }

    /** A DPoP proof for one POST to {@code url}, as {@link #requestIdJag} and {@link #redeemIdJag} send it. */
    public static String idJagDpopProof(IdJagDpopKey key, String url) {
        return idJagDpopProof(key, "POST", url, null, null);
    }

    /**
     * A DPoP proof (RFC 9449) for one request with this key; make a new one for every request.
     *
     * <p>Its {@code htu} is {@code url} with the scheme and host lowercased, the default port (80 for http, 443 for
     * https) dropped, "/" for an empty path, the path kept as given, and no user info, query or fragment. Only raw
     * non-ASCII characters in the path are percent-encoded (UTF-8, NFC), as the JDK's HttpClient sends them; dot
     * segments, percent-encoding and an IP address host stay as written.
     *
     * @param method the request's method: trimmed of ASCII whitespace (space, tab, CR, LF, VT, FF; not NUL, U+00A0 or
     *     other Unicode spaces) and sent uppercased as {@code htm}; null, empty or blank is POST. Any other character
     *     that is not an RFC 9110 token character throws {@link TouchqueConfigException}.
     * @param url an absolute http or https URL that {@link URI} parses with a host ({@link TouchqueConfigException} otherwise).
     * @param accessToken the DPoP-bound access token the request carries in {@code Authorization: DPoP <token>}
     *     (adds {@code ath}), or null (or empty) for a token endpoint.
     * @param nonce the server's {@code DPoP-Nonce} (RFC 9449 sections 8 and 9), or null (or empty) for none. It goes in
     *     as given, without a syntax check.
     */
    public static String idJagDpopProof(IdJagDpopKey key, String method, String url, String accessToken, String nonce) {
        return TouchqueAgent.dpopProof(key.key, htm(method), htu(url), accessToken == null || accessToken.isEmpty() ? null : accessToken,
                nonce == null || nonce.isEmpty() ? null : nonce);
    }

    /**
     * RFC 9449 htm: {@code method} trimmed of ASCII whitespace and uppercased, POST when empty; an HTTP method is an
     * RFC 9110 token.
     */
    static String htm(String method) {
        String m = method == null ? "" : trimAsciiWhitespace(method);
        if (m.isEmpty()) return "POST";
        for (int i = 0; i < m.length(); i++) {
            if (!tchar(m.charAt(i))) throw new TouchqueConfigException("a DPoP proof's method must be an HTTP method (RFC 9110 token characters only)");
        }
        return m.toUpperCase(Locale.ROOT);
    }

    /**
     * {@code s} without the ASCII whitespace at either end: space, tab, LF, VT, FF and CR. Unlike {@link String#strip()},
     * other Unicode spaces and the separators U+001C to U+001F stay (and then fail the token check).
     */
    private static String trimAsciiWhitespace(String s) {
        int start = 0;
        int end = s.length();
        while (start < end && asciiWhitespace(s.charAt(start))) start++;
        while (end > start && asciiWhitespace(s.charAt(end - 1))) end--;
        return s.substring(start, end);
    }

    private static boolean asciiWhitespace(char c) {
        return c == ' ' || (c >= '\t' && c <= '\r');   // \t \n VT \f \r
    }

    /** RFC 9449 htu: {@code url} as {@code scheme://host[:port]/path} (see {@link #idJagDpopProof(IdJagDpopKey, String, String, String, String)}). */
    static String htu(String url) {
        URI u;
        try {
            u = new URI(new URI(url).toASCIIString());   // raw non-ASCII path characters percent-encoded (NFC, UTF-8), as HttpClient sends them
        } catch (URISyntaxException | NullPointerException e) {
            u = null;
        }
        String scheme = u != null && u.getScheme() != null ? u.getScheme().toLowerCase(Locale.ROOT) : "";
        int defaultPort = "https".equals(scheme) ? 443 : "http".equals(scheme) ? 80 : -1;
        if (defaultPort < 0 || u.getHost() == null || u.getPort() > 65535) throw new TouchqueConfigException("a DPoP proof needs an absolute http or https URL");
        String port = u.getPort() < 0 || u.getPort() == defaultPort ? "" : ":" + u.getPort();
        String path = u.getRawPath().isEmpty() ? "/" : u.getRawPath();
        return scheme + "://" + u.getHost().toLowerCase(Locale.ROOT) + port + path;
    }

    /** https, or http on this machine (tests). */
    static boolean safeUrl(String url) {
        try {
            URI u = URI.create(url);
            if (u.getHost() == null) return false;
            return "https".equals(u.getScheme()) || ("http".equals(u.getScheme()) && TouchqueOptions.isLoopback(u.getHost()));
        } catch (IllegalArgumentException | NullPointerException e) {
            return false;
        }
    }

    /** A JSON document by GET (never following redirects). */
    static JsonNode getJson(String url) {
        try {
            HttpResponse<InputStream> res = SHARED_CLIENT.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                    .header("Accept", "application/json").GET().build(), HttpResponse.BodyHandlers.ofInputStream());
            String text = TouchqueHttp.readLimited(res.body());
            if (res.statusCode() >= 400) throw new IllegalStateException(url + " answered " + res.statusCode());
            JsonNode parsed = Json.parse(text);
            return parsed instanceof ObjectNode ? parsed : Json.object();
        } catch (IOException e) {
            throw new IllegalStateException(e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted", e);
        }
    }

    /** The identity provider's OpenID configuration, checked against its issuer. */
    static JsonNode discover(String issuer, Function<String, JsonNode> fetch) {
        JsonNode meta = fetch.apply(issuer.replaceAll("/+$", "") + "/.well-known/openid-configuration");
        if (!issuer.equals(Json.str(meta, "issuer"))) throw new TouchqueConfigException("the identity provider's metadata does not match its issuer");
        return meta;
    }

    /**
     * A token endpoint's answer: its body when that is one JSON object (else null), the latest valid DPoP-Nonce the
     * server sent during the call (see {@link CrossAppAccess#dpopNonce(List)}) and its WWW-Authenticate values (not
     * read here).
     */
    private record Answer(int status, ObjectNode data, String dpopNonce, List<String> challenges) {
        /**
         * RFC 9449 section 8: a 400 or 401 use_dpop_nonce with a valid nonce to use. The error is in the JSON body, or
         * for a 401 in a DPoP challenge; WWW-Authenticate is read only then.
         */
        boolean wantsNonce() {
            if (dpopNonce == null || (status != 400 && status != 401)) return false;
            return "use_dpop_nonce".equals(Json.str(data, "error")) || (status == 401 && dpopNonceChallenge(challenges));
        }
    }

    /**
     * POSTs the form; with a DPoP key, a fresh proof goes along, and a server that asks for its nonce gets the same
     * request once more with it. Only a 2xx with a JSON object is an answer: anything else throws
     * {@link TouchqueIdJagException}, which carries the latest valid DPoP-Nonce of the call.
     */
    private static Answer postForm(String url, Map<String, String> form, String basicId, String basicSecret, IdJagDpopKey dpopKey) {
        if (!safeUrl(url)) throw new TouchqueConfigException(url + " must be an https URL");
        StringBuilder body = new StringBuilder();
        form.forEach((k, v) -> {
            if (v == null) return;
            if (body.length() > 0) body.append('&');
            body.append(URLEncoder.encode(k, StandardCharsets.UTF_8)).append('=').append(URLEncoder.encode(v, StandardCharsets.UTF_8));
        });
        String authorization = null;
        if (basicId != null) {
            String raw = URLEncoder.encode(basicId, StandardCharsets.UTF_8) + ":" + URLEncoder.encode(basicSecret, StandardCharsets.UTF_8);
            authorization = "Basic " + Base64.getEncoder().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
        }
        Answer a = send(url, body.toString(), authorization, dpopKey != null ? idJagDpopProof(dpopKey, url) : null, null);
        // The server wants its nonce in the proof: the same request once more, with a new proof carrying it; one retry only.
        if (dpopKey != null && a.wantsNonce()) {
            a = send(url, body.toString(), authorization, idJagDpopProof(dpopKey, "POST", url, null, a.dpopNonce()), a.dpopNonce());
        }
        if (a.status() < 200 || a.status() > 299) {
            // A refusal, or a redirect (never followed): the code is the body's error, never WWW-Authenticate's.
            String error = errorCode(a.data());
            String description = Json.str(a.data(), "error_description");
            throw new TouchqueIdJagException(error != null ? error : "server_error", description != null ? description : url + " answered " + a.status(),
                    a.status(), a.dpopNonce());
        }
        if (a.data() == null) {
            throw new TouchqueIdJagException("invalid_response", url + " answered " + a.status() + " without a JSON object", a.status(), a.dpopNonce());
        }
        return a;
    }

    /**
     * One POST. {@code latestNonce}: the valid DPoP-Nonce of the call's earlier answer, kept when this answer has none,
     * so every error carries the latest one the server sent. A server that cannot be reached, an answer the HTTP client
     * refuses (malformed or oversized headers) and a body that cannot be read (cut off, over 10 MB) throw
     * temporarily_unavailable with no status, that latest nonce (this answer's when its headers came with a valid one)
     * and the failure as the cause.
     */
    private static Answer send(String url, String body, String authorization, String proof, String latestNonce) {
        HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                .header("Accept", "application/json")
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        if (proof != null) req.header("DPoP", proof);
        if (authorization != null) req.header("Authorization", authorization);
        String nonce = latestNonce;
        try {
            HttpResponse<InputStream> res = SHARED_CLIENT.send(req.build(), HttpResponse.BodyHandlers.ofInputStream());
            String answered = dpopNonce(res.headers().allValues("DPoP-Nonce"));
            if (answered != null) nonce = answered;
            ObjectNode data = jsonObject(TouchqueHttp.readLimited(res.body()));
            return new Answer(res.statusCode(), data, nonce, res.headers().allValues("WWW-Authenticate"));
        } catch (IOException | TouchqueNetworkException e) {
            String why = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            throw new TouchqueIdJagException("temporarily_unavailable", url + ": " + why, null, nonce, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new TouchqueIdJagException("temporarily_unavailable", url + ": interrupted", null, nonce, e);
        }
    }

    /** The body when it is one JSON object (whitespace around it aside), else null: empty, null, an array, not JSON. */
    private static ObjectNode jsonObject(String text) {
        try {
            return ONE_JSON_VALUE.readTree(text) instanceof ObjectNode o ? o : null;
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /**
     * The answer's {@code error} when it is an RFC 6749 error code: a string of 1 to 128 characters, each
     * %x20-21 / %x23-5B / %x5D-7E (printable ASCII and space, except '"' and '\'). Else null (server_error).
     */
    static String errorCode(JsonNode data) {
        String error = Json.str(data, "error");
        if (error == null || error.isEmpty() || error.length() > MAX_ERROR_CODE) return null;
        for (int i = 0; i < error.length(); i++) {
            char c = error.charAt(i);
            if (c < 0x20 || c > 0x7e || c == '"' || c == '\\') return null;
        }
        return error;
    }

    /**
     * An answer's DPoP-Nonce when it is one value in RFC 9449 nonce syntax (1*NQCHAR: printable ASCII except space,
     * '"' and '\'); a header repeated with the same value counts once. Missing, empty, invalid or repeated with
     * different values: null, so nothing is retried with it or handed over. One pass over the values.
     */
    static String dpopNonce(List<String> values) {
        String nonce = null;
        for (String v : values) {
            if (nonce != null && !nonce.equals(v)) return null;
            nonce = v;
        }
        if (nonce == null || nonce.isEmpty()) return null;
        for (int i = 0; i < nonce.length(); i++) {
            char c = nonce.charAt(i);
            if (c < 0x21 || c > 0x7e || c == '"' || c == '\\') return null;
        }
        return nonce;
    }

    /**
     * Whether WWW-Authenticate holds a DPoP challenge with error="use_dpop_nonce" (RFC 9449 section 9). One pass over
     * each value (RFC 9110 section 11.6.1), with no regular expression, so a long header costs no stack and linear time.
     * List elements split at commas outside quoted strings. An element that starts with a token not followed by "="
     * starts a challenge: its auth-scheme, then a token68 or its first auth-param. Any other auth-param belongs to the
     * challenge before it. A quoted-string value has its quoted-pairs undone; one that is never closed has no value.
     * A malformed element is skipped, and one where a challenge would start ends the challenge before it.
     */
    private static boolean dpopNonceChallenge(List<String> headers) {
        for (String h : headers) {
            String scheme = null;
            boolean elementStart = true;
            int i = 0;
            while (i < h.length()) {
                char c = h.charAt(i);
                if (c == ',' || c == ' ' || c == '\t') {
                    if (c == ',') elementStart = true;
                    i++;
                    continue;
                }
                boolean first = elementStart;
                elementStart = false;
                int start = i;
                i = tokenEnd(h, i);
                int next = spacesEnd(h, i);
                if (i == start) {
                    if (first) scheme = null;
                    i = elementEnd(h, i);
                } else if (next < h.length() && h.charAt(next) == '=') {
                    // An auth-param: token BWS "=" BWS ( token / quoted-string ).
                    String name = h.substring(start, i);
                    int v = spacesEnd(h, next + 1);
                    String value;
                    if (v < h.length() && h.charAt(v) == '"') {
                        StringBuilder quoted = new StringBuilder();
                        for (i = v + 1; i < h.length() && h.charAt(i) != '"'; i++) {
                            if (h.charAt(i) == '\\' && i + 1 < h.length()) i++;
                            quoted.append(h.charAt(i));
                        }
                        if (i == h.length()) break;   // no closing quote
                        value = quoted.toString();
                        i++;
                    } else {
                        i = tokenEnd(h, v);
                        value = h.substring(v, i);
                    }
                    int end = spacesEnd(h, i);
                    if (end < h.length() && h.charAt(end) != ',') {
                        i = elementEnd(h, end);
                    } else {
                        i = end;
                        if ("DPoP".equalsIgnoreCase(scheme) && "error".equalsIgnoreCase(name) && "use_dpop_nonce".equals(value)) return true;
                    }
                } else if (first && (next > i || next == h.length() || h.charAt(next) == ',')) {
                    scheme = h.substring(start, i);   // a challenge: its auth-scheme, then its params or token68
                    i = next;
                } else {
                    // After an auth-scheme, a token68 (never a scheme of its own); at an element's start, not a challenge.
                    if (first) scheme = null;
                    i = elementEnd(h, i);
                }
            }
        }
        return false;
    }

    /** An RFC 9110 token character (tchar). */
    private static boolean tchar(char c) {
        return (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || "!#$%&'*+-.^_`|~".indexOf(c) >= 0;
    }

    /** The end of the HTTP token (RFC 9110 tchar) at {@code i}. */
    private static int tokenEnd(String h, int i) {
        while (i < h.length() && tchar(h.charAt(i))) i++;
        return i;
    }

    /** The end of the spaces and tabs at {@code i}. */
    private static int spacesEnd(String h, int i) {
        while (i < h.length() && (h.charAt(i) == ' ' || h.charAt(i) == '\t')) i++;
        return i;
    }

    /** The next comma outside a quoted string, from {@code i}, or the end. */
    private static int elementEnd(String h, int i) {
        boolean quoted = false;
        for (; i < h.length(); i++) {
            char c = h.charAt(i);
            if (quoted && c == '\\') i++;
            else if (c == '"') quoted = !quoted;
            else if (c == ',' && !quoted) return i;
        }
        return h.length();
    }

    /** Trades a member's ID token for an ID-JAG at the identity provider (token exchange, client_secret_basic). */
    public static IdJagGrant requestIdJag(RequestOptions o) {
        String endpoint = o.tokenEndpoint;
        if (endpoint == null || endpoint.isEmpty()) {
            if (o.issuer == null || o.issuer.isEmpty()) throw new TouchqueConfigException("requestIdJag needs issuer or tokenEndpoint");
            endpoint = Json.str(discover(o.issuer, CrossAppAccess::getJson), "token_endpoint");
            if (endpoint == null) throw new TouchqueConfigException("the identity provider names no token_endpoint");
        }
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", TOKEN_EXCHANGE_GRANT);
        form.put("requested_token_type", ID_JAG_TOKEN_TYPE);
        form.put("subject_token", o.idToken);
        form.put("subject_token_type", ID_TOKEN_TYPE);
        form.put("audience", o.audience);
        form.put("resource", o.resource);
        form.put("scope", o.scope);
        Answer answer = postForm(endpoint, form, o.clientId, o.clientSecret, o.dpopKey);
        ObjectNode data = answer.data();
        String assertion = Json.str(data, "access_token");
        if (!ID_JAG_TOKEN_TYPE.equals(Json.str(data, "issued_token_type")) || assertion == null || assertion.isEmpty()) {
            throw new TouchqueIdJagException("invalid_response", "the identity provider did not answer with an ID-JAG", null, answer.dpopNonce());
        }
        Long expiresIn = Json.lng(data, "expires_in");
        Boolean dpopBound = null;
        if (o.dpopKey != null) {
            // An identity provider without DPoP support ignores the proof: say so instead of guessing.
            Jws.Parts parts = Jws.split(assertion);
            JsonNode cnf = parts != null ? parts.claims().get("cnf") : null;
            dpopBound = cnf != null && cnf.isObject() && o.dpopKey.thumbprint.equals(Json.str(cnf, "jkt"));
        }
        return new IdJagGrant(assertion, expiresIn == null ? null : expiresIn.intValue(), Json.str(data, "scope"), dpopBound);
    }

    /** Trades an ID-JAG for an access token at the other service's authorization server (jwt-bearer). */
    public static ObjectNode redeemIdJag(RedeemOptions o) {
        boolean isPublic = o.clientSecret == null || o.clientSecret.isEmpty();
        Map<String, String> form = new LinkedHashMap<>();
        form.put("grant_type", JWT_BEARER_GRANT);
        form.put("assertion", o.assertion);
        form.put("resource", o.resource);
        form.put("scope", o.scope);
        form.put("client_id", isPublic ? o.clientId : null);
        return postForm(o.tokenEndpoint, form, isPublic ? null : o.clientId, isPublic ? null : o.clientSecret, o.dpopKey).data();
    }
}

package com.touchque.agents;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.touchque.TouchqueConfigException;
import com.touchque.TouchqueIdJagException;
import com.touchque.crypto.Jws;
import com.touchque.internal.Json;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiPredicate;
import java.util.function.Function;

/**
 * Your authorization server, taking ID-JAGs from an organization's identity provider: checks the
 * one an authenticated client presents (jwt-bearer grant) and uses it once. Build one and keep it:
 * the used-once jti store and the key cache live in the instance.
 *
 * <pre>{@code
 * // Once, in a field of your token endpoint:
 * private final IdJagVerifier verifier = new IdJagVerifier(new IdJagVerifier.Options("https://sso.touchque.com", "https://auth.files.example"));
 * // Each token request:
 * var claims = verifier.verify(form.get("assertion"), authenticatedClientId);
 * // An authorization server that checks DPoP proofs passes the proof key's thumbprint:
 * var bound = verifier.verify(form.get("assertion"), authenticatedClientId, dpopJkt);   // bound.cnfJkt()
 * }</pre>
 */
public final class IdJagVerifier {
    private final String issuer;
    private final String audience;
    private final long skew;
    private final BiPredicate<String, Long> firstUse;
    private final Function<String, JsonNode> fetch;
    private final Object keysLock = new Object();
    private final Map<String, Long> seen = new ConcurrentHashMap<>();
    private Map<String, JsonNode> keys = new HashMap<>();
    private String jwksUri;
    private Instant keysAt;
    private Instant triedAt = Instant.EPOCH;

    /** Settings of {@link IdJagVerifier}. */
    public static final class Options {
        private final String issuer;
        private final String audience;
        private String jwksUri;
        private Duration clockSkew = Duration.ofSeconds(60);
        private BiPredicate<String, Long> firstUse;
        private Function<String, JsonNode> fetch;

        /**
         * @param issuer the identity provider, e.g. https://sso.touchque.com.
         * @param audience your authorization server's issuer identifier (the ID-JAG's aud).
         */
        public Options(String issuer, String audience) {
            this.issuer = issuer;
            this.audience = audience;
        }

        /** Its JWKS, when not found from the issuer's /.well-known/openid-configuration. */
        public Options jwksUri(String v) {
            this.jwksUri = v;
            return this;
        }

        public Options clockSkew(Duration v) {
            this.clockSkew = v;
            return this;
        }

        /**
         * Records an ID-JAG's jti (with its exp) and says whether it is new (each is used once).
         * Defaults to memory in this process; give a shared store (Redis SET NX) when several
         * processes take ID-JAGs.
         */
        public Options firstUse(BiPredicate<String, Long> v) {
            this.firstUse = v;
            return this;
        }

        /** For tests: how JSON documents are fetched. */
        public Options fetch(Function<String, JsonNode> v) {
            this.fetch = v;
            return this;
        }
    }

    /**
     * A checked ID-JAG. {@code sub}: the member at the identity provider; {@code clientId}: your client_id of the app that presented it;
     * {@code cnfJkt}: the DPoP key thumbprint the ID-JAG is bound to (cnf.jkt), or null.
     */
    public record Claims(String iss, String sub, String aud, String clientId, String jti, long issuedAt, long expiresAt, List<String> scopes,
            String resource, String tenant, String email, Long authTime, List<String> amr, ObjectNode claims, String cnfJkt) {
        public Claims(String iss, String sub, String aud, String clientId, String jti, long issuedAt, long expiresAt, List<String> scopes,
                String resource, String tenant, String email, Long authTime, List<String> amr, ObjectNode claims) {
            this(iss, sub, aud, clientId, jti, issuedAt, expiresAt, scopes, resource, tenant, email, authTime, amr, claims, null);
        }
    }

    public IdJagVerifier(Options options) {
        if (options.issuer == null || options.issuer.isEmpty() || options.audience == null || options.audience.isEmpty()) {
            throw new TouchqueConfigException("IdJagVerifier needs issuer (the identity provider) and audience (your authorization server's issuer)");
        }
        this.issuer = options.issuer;
        this.audience = options.audience;
        this.jwksUri = options.jwksUri;
        this.skew = options.clockSkew != null ? options.clockSkew.getSeconds() : 60;
        this.firstUse = options.firstUse != null ? options.firstUse : this::rememberOnce;
        this.fetch = options.fetch != null ? options.fetch : CrossAppAccess::getJson;
    }

    private boolean rememberOnce(String jti, Long exp) {
        long now = Instant.now().getEpochSecond();
        seen.entrySet().removeIf(e -> e.getValue() < now);
        return seen.putIfAbsent(jti, exp + skew) == null;
    }

    private void loadKeys() {
        if (jwksUri == null || jwksUri.isEmpty()) {
            jwksUri = Json.str(CrossAppAccess.discover(issuer, fetch), "jwks_uri");
            if (jwksUri == null) throw new IllegalStateException("the identity provider names no jwks_uri");
        }
        Map<String, JsonNode> loaded = new HashMap<>();
        JsonNode list = fetch.apply(jwksUri).get("keys");
        if (list != null && list.isArray()) {
            for (JsonNode k : list) {
                String kid = Json.str(k, "kid");
                if (k.isObject() && kid != null && !kid.isEmpty()) loaded.put(kid, k);
            }
        }
        keys = loaded;
        keysAt = Instant.now();
    }

    private JsonNode keyFor(String kid) {
        synchronized (keysLock) {
            if (keysAt == null || Duration.between(keysAt, Instant.now()).toMinutes() >= 10) loadKeys();
            if (!keys.containsKey(kid) && Duration.between(triedAt, Instant.now()).toSeconds() > 60) {
                triedAt = Instant.now();
                loadKeys();
            }
            return keys.get(kid);
        }
    }

    private static TouchqueIdJagException bad(String message) {
        return new TouchqueIdJagException("invalid_grant", message);
    }

    /**
     * The ID-JAG, checked and used once; throws {@link TouchqueIdJagException} (error invalid_grant). An ID-JAG bound
     * to a DPoP key (cnf.jkt) is refused: use {@link #verify(String, String, String)} for those.
     */
    public Claims verify(String assertion, String clientId) {
        return verify(assertion, clientId, null);
    }

    /**
     * The ID-JAG, checked and used once. {@code dpopJkt}: the thumbprint of the DPoP proof you verified on this
     * request, or null; an ID-JAG bound to a key (cnf.jkt) is refused without a matching one.
     */
    public Claims verify(String assertion, String clientId, String dpopJkt) {
        Jws.Parts parts = Jws.split(assertion != null ? assertion : "");
        if (parts == null) throw bad("assertion is not a JWT");
        ObjectNode head = parts.header();
        ObjectNode c = parts.claims();
        if (!"oauth-id-jag+jwt".equals(Json.str(head, "typ"))) throw bad("not an ID-JAG (typ oauth-id-jag+jwt)");
        String alg = Json.str(head, "alg");
        String kid = Json.str(head, "kid");
        if (!("RS256".equals(alg) || "ES256".equals(alg) || "EdDSA".equals(alg)) || kid == null || kid.isEmpty()) throw bad("unsupported signature");
        JsonNode key;
        try {
            key = keyFor(kid);
        } catch (RuntimeException e) {
            throw new TouchqueIdJagException("temporarily_unavailable", "the identity provider's keys could not be read: " + e.getMessage());
        }
        if (key == null || !Jws.verify(alg, key, parts.input(), parts.signature())) throw bad("signature does not verify");
        long now = Instant.now().getEpochSecond();
        List<String> auds = new ArrayList<>();
        JsonNode aud = c.get("aud");
        if (aud != null && aud.isArray()) aud.forEach(a -> auds.add(a.isTextual() ? a.asText() : null));
        else auds.add(Json.str(c, "aud"));
        Long exp = Json.lng(c, "exp");
        Long iat = Json.lng(c, "iat");
        String sub = Json.str(c, "sub");
        String jti = Json.str(c, "jti");
        if (!issuer.equals(Json.str(c, "iss"))) throw bad("another issuer");
        if (auds.size() != 1 || !audience.equals(auds.get(0))) throw bad("not for this authorization server");
        if (clientId == null || clientId.isEmpty() || !clientId.equals(Json.str(c, "client_id"))) throw bad("issued to another client");
        if (exp == null || exp + skew < now) throw bad("expired");
        if (iat == null || iat - skew > now) throw bad("issued in the future");
        if (sub == null || sub.isEmpty() || jti == null || jti.isEmpty()) throw bad("sub and jti are required");
        // Before the jti is spent: a copy without the key cannot use the ID-JAG up.
        String cnfJkt = null;
        if (c.has("cnf")) {
            JsonNode cnf = c.get("cnf");
            String jkt = cnf.isObject() ? Json.str(cnf, "jkt") : null;
            if (jkt == null) throw bad("unsupported confirmation method (only DPoP cnf.jkt)");
            if (dpopJkt == null || dpopJkt.isEmpty()) throw bad("bound to a DPoP key: a DPoP proof with that key is required");
            if (!dpopJkt.equals(jkt)) throw bad("the DPoP proof was made with another key");
            cnfJkt = jkt;
        }
        if (!firstUse.test(jti, exp)) throw bad("already used");
        String scope = Json.str(c, "scope");
        List<String> amr = new ArrayList<>();
        if (c.get("amr") != null && c.get("amr").isArray()) c.get("amr").forEach(a -> amr.add(a.asText()));
        return new Claims(issuer, sub, audience, clientId, jti, iat, exp, scope == null || scope.isEmpty() ? List.of() : List.of(scope.split(" ")),
                Json.str(c, "resource"), Json.str(c, "tenant"), Json.str(c, "email"), Json.lng(c, "auth_time"), List.copyOf(amr), c, cnfJkt);
    }
}

package com.touchque;

/**
 * A refused ID-JAG or exchange (Cross App Access). {@link #error()} is the OAuth error: {@code invalid_grant}
 * for a bad ID-JAG, else what the server answered. From a token endpoint ({@code requestIdJag},
 * {@code redeemIdJag}) that is the answer's {@code error} when it is an RFC 6749 error code, else
 * {@code server_error}, for any status but 2xx (redirects included); {@code invalid_response} for a 2xx without
 * a JSON object (or, from {@code requestIdJag}, without an ID-JAG); {@code temporarily_unavailable} when the
 * server could not be reached or its answer could not be read, with no {@link #status()} and the failure as
 * {@link #getCause()}. {@link #dpopNonce()} is the latest valid DPoP-Nonce the server sent during the call,
 * when it sent one.
 */
public class TouchqueIdJagException extends TouchqueException {
    private final String error;
    private final Integer status;
    private final String dpopNonce;

    public TouchqueIdJagException(String error, String message, Integer status, String dpopNonce) {
        super(message);
        this.error = error;
        this.status = status;
        this.dpopNonce = dpopNonce;
    }

    /** With {@code cause}: what failed underneath (the {@code IOException} of a token endpoint that could not be read). */
    public TouchqueIdJagException(String error, String message, Integer status, String dpopNonce, Throwable cause) {
        super(message, cause);
        this.error = error;
        this.status = status;
        this.dpopNonce = dpopNonce;
    }

    public TouchqueIdJagException(String error, String message, Integer status) {
        this(error, message, status, null);
    }

    public TouchqueIdJagException(String error, String message) {
        this(error, message, null, null);
    }

    public String error() {
        return error;
    }

    /** The HTTP status the server answered with, when there was one. */
    public Integer status() {
        return status;
    }

    /**
     * The latest {@code DPoP-Nonce} the server sent during the call (RFC 9449 section 8), or null: after a nonce retry
     * the second answer's when it carried one, else the first answer's, on every error of the call (also
     * {@code invalid_response} and {@code temporarily_unavailable}). Only a value in RFC 9449 nonce syntax
     * (printable ASCII except space, '"' and '\'), never one from a missing, empty, invalid or conflicting header. With a
     * DPoP key, a request refused with use_dpop_nonce and a valid nonce was already sent once more with it. To try
     * again yourself, put it in a new proof: {@code CrossAppAccess.idJagDpopProof(key, "POST", url, null, nonce)}.
     */
    public String dpopNonce() {
        return dpopNonce;
    }
}

// ─────────────────────────────────────────────────────────────
// From touchque-java .../resources/Auth.java — tq.auth(): first-time QR with the browser's IP and User-Agent, setup context
// ─────────────────────────────────────────────────────────────

package com.touchque.resources;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.touchque.internal.Json;
import com.touchque.internal.TouchqueHttp;

/** Setup secrets (the QR code the Touchque app scans) and a user's link status. */
public final class Auth {
    private final TouchqueHttp http;

    /** Internal: use {@code tq.auth()}. */
    public Auth(TouchqueHttp http) {
        this.http = http;
    }

    /**
     * A new setup secret for a user: show {@code qrCodeDataUrl} so the Touchque app links the
     * phone. 409 when an unscanned or used secret exists ({@link #resetSecret} issues a new one).
     * Without the browser's IP and User-Agent the phone cannot show where the QR was asked for:
     * prefer {@link #generateSecret(String, String, String)} while handling a browser's request.
     */
    public JsonNode generateSecret(String externalUsername) {
        return generateSecret(externalUsername, null, null);
    }

    /**
     * {@link #generateSecret(String)} with the browser that asks for the QR: the END user's IP and
     * User-Agent, from the request as for a login request (each left out when null or empty).
     * Touchque keeps where the QR was asked for with the secret, never in the QR, and the phone
     * shows it before it links ({@link SetupContext}). Touchque cleans both itself (it drops a
     * port, ignores a loopback address or one that is not an IP, strips control characters from
     * the User-Agent and keeps its first 512) and never refuses the call over them.
     */
    public JsonNode generateSecret(String externalUsername, String clientIp, String userAgent) {
        return http.post("/auth/generate-secret", secretBody(externalUsername, clientIp, userAgent));
    }

    /**
     * Regenerates a user's secret. It sends no IP or User-Agent, so the new QR has no setup context
     * (the old QR's is dropped): prefer {@link #resetSecret(String, String, String)} while handling
     * a browser's request.
     */
    public JsonNode resetSecret(String externalUsername) {
        return resetSecret(externalUsername, null, null);
    }

    /**
     * {@link #resetSecret(String)} with the END user's IP and User-Agent, sent as
     * {@link #generateSecret(String, String, String)} sends them (each left out when null or empty).
     * Touchque records them with the new QR as generate does ({@link SetupContext}); when neither is
     * sent or usable, the new QR has none.
     */
    public JsonNode resetSecret(String externalUsername, String clientIp, String userAgent) {
        return http.post("/auth/secret/reset", secretBody(externalUsername, clientIp, userAgent));
    }

    /** {@code {externalUsername, clientIp?, userAgent?}}: the same rule as a login request, null and empty left out. */
    private static ObjectNode secretBody(String externalUsername, String clientIp, String userAgent) {
        ObjectNode body = Json.object().put("externalUsername", externalUsername);
        Json.put(body, "clientIp", clientIp);
        Json.put(body, "userAgent", userAgent);
        return body;
    }

    /**
     * Checks a setup secret code. This is the phone's call: the Touchque app makes it after it
     * scans the QR, and a valid code's answer carries {@code setupContext}, where that QR was asked
     * for, as the phone shows it before it links ({@link SetupContext#of} reads it from the answer,
     * {@link SetupContext#parse} from the raw value). Its {@code farFromPhone} compares that place
     * with the address that calls validate: when your server calls it, with your server, not the
     * phone.
     */
    public JsonNode validateSecret(String secret) {
        return http.post("/auth/secret/validate", Json.object().put("secret", secret));
    }

    /**
     * A user's link status without sending a push: {@code used} flips true and {@code deviceId} is
     * set once the app scans the secret. {@code device} is the linked phone's self-reported posture
     * (device trust: platform, OS, security patch, screen lock, jailbreak, hardware key,
     * attestation, {@code state} and {@code issues}), or null before a phone is linked. 404 for an
     * unknown user.
     */
    public JsonNode getUser(String externalUsername) {
        return http.get("/users/" + TouchqueHttp.seg(externalUsername));
    }

    /**
     * Where a first-time linking QR was asked for, as Touchque recorded it from the call that made
     * the QR ({@link Auth#generateSecret(String, String, String)} or
     * {@link Auth#resetSecret(String, String, String)}, with the IP and User-Agent you sent), never from
     * the QR itself. The phone shows it before it links, so a person tricked into scanning someone
     * else's QR sees that person's city and device. Every field may be null: {@code ip} (the
     * address the phone shows), {@code location} (from the IP), {@code device} (from the
     * User-Agent), {@code requestedAt} (ISO 8601, as the API sent it) and {@code farFromPhone}
     * (whether that place is far from the address that called validate: the phone's when the
     * Touchque app calls it, your server's when your server does; null when Touchque cannot tell).
     * {@link #of} reads it from a validate answer, {@link #parse} from the raw {@code setupContext}
     * value.
     */
    public record SetupContext(String ip, SetupLocation location, SetupDevice device, String requestedAt, Boolean farFromPhone) {
        /**
         * The {@code setupContext} of a {@link Auth#validateSecret} answer:
         * {@code parse(validateAnswer.get("setupContext"))}, so null when the answer is null, is
         * not an object or has none (see {@link #parse}).
         */
        public static SetupContext of(JsonNode validateAnswer) {
            return parse(validateAnswer == null ? null : validateAnswer.get("setupContext"));
        }

        /**
         * Reads a raw {@code setupContext} value, the field of a validate answer
         * ({@code answer.get("setupContext")}; {@link #of} takes the whole answer). Null when it is
         * null (Java or JSON), missing or not an object: nothing was recorded for that QR (its
         * request named no usable IP or User-Agent), or an older QR or server. Lenient: a field that
         * is missing, null or of the wrong type is null ({@code ip} and {@code requestedAt} only
         * strings, {@code farFromPhone} only a boolean, {@code location} and {@code device} only
         * objects, whose fields are read the same way, so one whose fields all have the wrong type
         * is an object of nulls); unknown fields are ignored; it never throws.
         */
        public static SetupContext parse(JsonNode raw) {
            if (raw == null || !raw.isObject()) return null;
            JsonNode location = raw.get("location");
            JsonNode device = raw.get("device");
            JsonNode far = raw.get("farFromPhone");
            return new SetupContext(Json.str(raw, "ip"),
                    location != null && location.isObject()
                            ? new SetupLocation(Json.str(location, "city"), Json.str(location, "country"), Json.str(location, "countryCode")) : null,
                    device != null && device.isObject()
                            ? new SetupDevice(Json.str(device, "browser"), Json.str(device, "os"), Json.str(device, "model")) : null,
                    Json.str(raw, "requestedAt"),
                    far != null && far.isBoolean() ? far.booleanValue() : null);
        }
    }

    /** Where the IP of a {@link SetupContext} is, e.g. Berlin, Germany, DE. Each field may be null. */
    public record SetupLocation(String city, String country, String countryCode) {
    }

    /** The browser that asked for the QR, from its User-Agent, e.g. Safari, iOS, iPhone ({@code model} when it names one). Each field may be null. */
    public record SetupDevice(String browser, String os, String model) {
    }
}
