// TouchQue .NET SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-dotnet/src/TouchQue/{TouchQueOptions.cs,TouchQueClient.cs,Flow/Steps.cs,Flow/Guard.cs,
// Crypto/ApprovalProof.cs,Resources/Login.cs} plus the public part of Relay/RelayHandler.cs, and
// src/TouchQue.AspNetCore/{ServiceCollectionExtensions.cs,RequireTouchQue.cs,TouchQueRelayEndpoints.cs}.
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

using Microsoft.Extensions.Logging;

namespace TouchQue;

/// <summary>
/// Settings of a <see cref="TouchQueClient"/>. Anything left null falls back to the
/// environment: <c>TQ_API_KEY</c>, <c>TQ_API_SECRET</c> and <c>TQ_API_URL</c>
/// (default <c>https://api.touchque.com</c>).
/// </summary>
public sealed class TouchQueOptions
{
    public const string DefaultBaseUrl = "https://api.touchque.com";

    /// <summary>Your API key from the dashboard (<c>tq_…</c>).</summary>
    public string? ApiKey { get; set; }

    /// <summary>Your API secret. Signs every request and verifies webhooks; never send it to a browser or an app.</summary>
    public string? ApiSecret { get; set; }

    /// <summary>The API's address. Plain http is accepted only for localhost.</summary>
    public string? BaseUrl { get; set; }

    /// <summary>Timeout of one HTTP request (default 10 seconds). Ignored when you pass your own HttpClient.</summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(10);

    /// <summary>
    /// Where the SDK reports its own problems: a misconfigured guard, an OnChallenge that threw,
    /// a relay without GetLoginUser. Default: nothing is logged. Lines carry an error's type and
    /// message, never request data.
    /// </summary>
    public ILogger? Logger { get; set; }

    /// <summary>With no <see cref="Logger"/>: write those lines to Console.Error (local development).</summary>
    public bool Debug { get; set; }

    /// <summary>The options with the environment filled in, checked.</summary>
    internal ResolvedOptions Resolve()
    {
        var apiKey = ApiKey ?? Environment.GetEnvironmentVariable("TQ_API_KEY");
        var apiSecret = ApiSecret ?? Environment.GetEnvironmentVariable("TQ_API_SECRET");
        var baseUrl = BaseUrl ?? Environment.GetEnvironmentVariable("TQ_API_URL");
        if (string.IsNullOrEmpty(baseUrl)) baseUrl = DefaultBaseUrl;
        if (string.IsNullOrEmpty(apiKey) || string.IsNullOrEmpty(apiSecret))
        {
            throw new TouchQueConfigException("Set TQ_API_KEY and TQ_API_SECRET (or ApiKey and ApiSecret in TouchQueOptions).");
        }
        if (!apiKey.StartsWith("tq_", StringComparison.Ordinal))
        {
            throw new TouchQueConfigException("ApiKey must start with \"tq_\". Did you accidentally swap ApiKey and ApiSecret?");
        }
        AssertSafeBaseUrl(baseUrl, "BaseUrl");
        return new ResolvedOptions(apiKey, apiSecret, baseUrl.TrimEnd('/'), Timeout, new Internal.SdkLog(Logger, Debug));
    }

    /// <summary>Allow plaintext http only for localhost / loopback (local development).</summary>
    internal static void AssertSafeBaseUrl(string url, string name)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            throw new TouchQueConfigException($"{name} is not a valid URL: {url}");
        }
        if (uri.Scheme == Uri.UriSchemeHttps) return;
        if (uri.Scheme == Uri.UriSchemeHttp)
        {
            if (IsLoopback(uri.Host)) return;
            throw new TouchQueConfigException(
                $"Refusing a plaintext http:// {name} for \"{uri.Host}\". The API key and request signature would be sent in the clear: use https://.");
        }
        throw new TouchQueConfigException($"{name} must be http(s): {url}");
    }

    internal static bool IsLoopback(string host)
    {
        var h = host.ToLowerInvariant();
        return h is "localhost" or "127.0.0.1" or "::1" or "[::1]";
    }
}

internal sealed record ResolvedOptions(string ApiKey, string ApiSecret, string BaseUrl, TimeSpan Timeout, Internal.SdkLog Log);

// ─────────────────────────────────────────────────────────────
// From TouchQueClient.cs — the client (StartAsync/CheckAsync/CompleteAsync and the resources)
// ─────────────────────────────────────────────────────────────

using TouchQue.Internal;

namespace TouchQue;

/// <summary>
/// The TouchQue client. Every call is signed with your API secret, so it belongs on
/// your server; browser pieces relay through it.
/// <code>
/// // TQ_API_KEY=tq_…  TQ_API_SECRET=…
/// var tq = new TouchQueClient();
/// var step = await tq.StartAsync("SEND_MONEY", new StartOptions { User = "jane@acme.com", Details = [("Amount", "250 EUR")] });
/// </code>
/// Thread-safe; create one and reuse it (in ASP.NET Core, <c>services.AddTouchQue()</c>).
/// </summary>
public sealed class TouchQueClient
{
    public const string DefaultBaseUrl = TouchQueOptions.DefaultBaseUrl;

    private readonly TouchQueHttp _http;

    /// <summary>A client from the environment (<c>TQ_API_KEY</c>, <c>TQ_API_SECRET</c>, <c>TQ_API_URL</c>).</summary>
    public TouchQueClient() : this(new TouchQueOptions()) { }

    /// <param name="options">Anything left null falls back to the environment.</param>
    /// <param name="httpClient">
    /// Your own HttpClient (e.g. from IHttpClientFactory). Configure it NOT to follow
    /// redirects: a redirect could replay the signed headers to another host.
    /// </param>
    public TouchQueClient(TouchQueOptions options, HttpClient? httpClient = null)
    {
        var resolved = options.Resolve();
        _http = new TouchQueHttp(resolved, httpClient);
        Auth = new AuthResource(_http);
        Login = new LoginResource(_http);
        WebAuthn = new WebAuthnResource(_http);
        Webhook = new WebhookResource(resolved.ApiSecret);
        Offline = new OfflineResource(_http);
        ActionTypes = new ActionTypesResource(_http);
        Actions = new ActionsResource(_http);
        Risk = new RiskResource(_http);
        Recovery = new RecoveryResource(_http);
        Assist = new AssistResource(_http);
        Agents = new AgentsResource(_http);
        Identity = new IdentityResource(_http);
        Mobile = new MobileResource(_http);
        QrPairings = new QrPairingsResource(_http);
        DeviceRisk = new DeviceRiskResource(_http);
    }

    /// <summary>Setup secrets and a user's link status.</summary>
    public AuthResource Auth { get; }

    /// <summary>Push approvals: request, status, verify, use once, report fraud.</summary>
    public LoginResource Login { get; }

    /// <summary>Passkeys (the backend half of the browser ceremonies).</summary>
    public WebAuthnResource WebAuthn { get; }

    /// <summary>Webhook signature verification.</summary>
    public WebhookResource Webhook { get; }

    /// <summary>Offline Sign: QR challenge and typed-code approvals with the phone offline.</summary>
    public OfflineResource Offline { get; }

    /// <summary>Action types: what users approve (LOGIN, SEND_MONEY…).</summary>
    public ActionTypesResource ActionTypes { get; }

    /// <summary>TouchQue Actions: your own code in the approval pipeline (deploy, test, dry run, logs).</summary>
    public ActionsResource Actions { get; }

    /// <summary>Silent sign-ins: should this sign-in ask the phone, and which browsers TouchQue knows.</summary>
    public RiskResource Risk { get; }

    /// <summary>Never Locked Out: move a user whose phone is gone to a new phone, with colleagues vouching.</summary>
    public RecoveryResource Recovery { get; }

    /// <summary>Help desk: IT working on a person's account in the open, and checks on their phone before sensitive actions.</summary>
    public AssistResource Assist { get; }

    /// <summary>AI agents as identities of their own. The agent itself uses <see cref="TouchQueAgent"/>.</summary>
    public AgentsResource Agents { get; }

    /// <summary>TouchQue Login: your customers' accounts, roles, organizations, apps, connections (Management API).</summary>
    public IdentityResource Identity { get; }

    /// <summary>Mobile SDK: your own iOS/Android app approves for your users.</summary>
    public MobileResource Mobile { get; }

    /// <summary>Pairing a browser by QR code: the phone that scans it is the one asked to approve.</summary>
    public QrPairingsResource QrPairings { get; }

    /// <summary>Device risk: the device on your sign-up, reset, sign-in or approval page (a paid add-on).</summary>
    public DeviceRiskResource DeviceRisk { get; }

    internal string ApiSecret => _http.ApiSecret;

    internal SdkLog Log => _http.Log;

    internal string BaseUrl => _http.BaseUrl;

    /// <summary>
    /// Starts an approval and returns at once: show the step in your UI. <c>waiting</c>
    /// with <c>Number</c>: show the number, the user picks it on the phone. <c>enroll</c>:
    /// show <c>Enroll.QrCodeDataUrl</c> so the user links the TouchQue app first.
    /// </summary>
    public Task<Step> StartAsync(string action, StartOptions options, CancellationToken ct = default) =>
        Steps.StartAsync(this, action, options, ct);

    /// <summary>Where a started approval is now: waiting, approved, rejected, expired…</summary>
    public Task<Step> CheckAsync(string requestId, CancellationToken ct = default) =>
        Steps.CheckAsync(this, requestId, ct);

    /// <summary>
    /// Uses an approved request exactly once, after checking it is for this user, action
    /// and transaction. Call it right before doing the protected thing.
    /// </summary>
    /// <exception cref="TouchQueApprovalMismatchException">The approval is for a different user, action or transaction.</exception>
    /// <exception cref="TouchQueApiException">409 already_used, not_approved, rejected, expired or revoked.</exception>
    public Task<Approval> CompleteAsync(string requestId, CompleteExpectations expect, CancellationToken ct = default) =>
        Steps.CompleteAsync(this, requestId, expect, ct);

    /// <summary>
    /// Runs <paramref name="action"/> only after the user approved it on the phone (the push
    /// and the wait of <see cref="LoginResource.VerifyAsync(LoginRequestOptions, CancellationToken)"/>).
    /// </summary>
    public async Task<T> ProtectAsync<T>(LoginRequestOptions request, Func<Task<T>> action, CancellationToken ct = default)
    {
        await Login.VerifyAsync(request, ct).ConfigureAwait(false);
        return await action().ConfigureAwait(false);
    }
}

// ─────────────────────────────────────────────────────────────
// From Flow/Steps.cs — the headless step-up flow and the Step record
// ─────────────────────────────────────────────────────────────

using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using TouchQue.Internal;

namespace TouchQue;

/// <summary>
/// What the user has to see while an approval runs, safe to send to the browser
/// as JSON (it never holds a secret). States: waiting, approved, rejected, expired,
/// enroll, passkey_required, offline, blocked, frozen, rate_limited.
/// </summary>
public sealed record Step
{
    public string State { get; init; } = "";
    public string? RequestId { get; init; }
    /// <summary>The number to show; the user picks it on the phone.</summary>
    public string? Number { get; init; }
    public string? ExpiresAt { get; init; }
    public IReadOnlyList<LoginDetail>? Details { get; init; }
    /// <summary>The "Why?" case code: show it ("Tell your support team: K7P-2QX").</summary>
    public string? CaseCode { get; init; }
    public IReadOnlyList<RiskReason>? Reasons { get; init; }
    /// <summary>Lets <c>@touchque/web</c> post behavioural signals for this one request.</summary>
    public string? TelemetryToken { get; init; }
    /// <summary>Mirror Alarm: the page showing this first step loads it.</summary>
    public Canary? Canary { get; init; }
    /// <summary>First-time linking: show <c>QrCodeDataUrl</c>.</summary>
    public StepEnroll? Enroll { get; init; }
    /// <summary>The offline QR (phone has no internet).</summary>
    public StepOffline? Offline { get; init; }
    public string? Reason { get; init; }
    public int? RetryAfter { get; init; }
    public Assurance? Assurance { get; init; }
}

public sealed record StepEnroll
{
    public string? QrCodeDataUrl { get; init; }
    public IReadOnlyList<string>? RecoveryCodes { get; init; }
    public string? ExpiresAt { get; init; }
}

public sealed record StepOffline
{
    public string ChallengeId { get; init; } = "";
    public string? QrDataUrl { get; init; }
    public string? ExpiresAt { get; init; }
    public bool? TotpAvailable { get; init; }
    public string? ChallengeCode { get; init; }
    public int? AttemptsLeft { get; init; }
}

/// <summary>An approval used once: run the protected action now.</summary>
public sealed record Approval
{
    public string RequestId { get; init; } = "";
    public string User { get; init; } = "";
    public string Action { get; init; } = "";
    public Assurance? Assurance { get; init; }
    /// <summary>DEVICE, WEBAUTHN, OFFLINE_CODE, OFFLINE_TOTP or SILENT.</summary>
    public string? ConfirmedVia { get; init; }
    /// <summary>The phone's signature over what it showed (<see cref="TouchQue.ApprovalProof"/>).</summary>
    public JsonObject? ApprovalProof { get; init; }
    /// <summary>
    /// Vishing Shield: approved during a call. Let the user in, but treat the session as
    /// limited: critical actions are refused until APPROVAL_RECONFIRMED, and APPROVAL_REVOKED means end it.
    /// </summary>
    public bool? Provisional { get; init; }
    public bool? Revoked { get; init; }
    public string? RevokeReason { get; init; }
    public string? ReconfirmedAt { get; init; }
    /// <summary>Silent sign-ins: why TouchQue let this known browser in (nothing went to the phone).</summary>
    public IReadOnlyList<RiskReason>? Reasons { get; init; }
}

/// <summary>What to start an approval for.</summary>
public sealed record StartOptions
{
    /// <summary>The user in YOUR system.</summary>
    public required string User { get; init; }
    public IReadOnlyList<LoginDetail>? Details { get; init; }
    public string? ReferenceId { get; init; }
    /// <summary>The end user's IP.</summary>
    public string? Ip { get; init; }
    public string? UserAgent { get; init; }
    /// <summary>Silent sign-ins: the <c>X-TouchQue-Browser</c> header, passed through untouched.</summary>
    public string? BrowserProof { get; init; }
    /// <summary>For your TouchQue Actions only (<c>event.context</c>).</summary>
    public IReadOnlyDictionary<string, object?>? Context { get; init; }
    /// <summary>False: never show the first-time linking QR (a typed username proves nothing).</summary>
    public bool Enroll { get; init; } = true;
}

/// <summary>What an approved request must be for (checked by <see cref="TouchQueClient.CompleteAsync"/>).</summary>
public sealed record CompleteExpectations
{
    public required string User { get; init; }
    public required string Action { get; init; }
    public IReadOnlyList<LoginDetail>? Details { get; init; }
    public string? ReferenceId { get; init; }
}

/// <summary>
/// The headless step-up flow shared by every integration: start → show the step in
/// YOUR UI → check → complete exactly once.
/// </summary>
internal static class Steps
{
    private static readonly Dictionary<string, string> StateMap = new()
    {
        ["PENDING"] = "waiting", ["CONFIRMED"] = "approved", ["REJECTED"] = "rejected", ["EXPIRED"] = "expired",
    };

    public static async Task<Step> StartAsync(TouchQueClient client, string action, StartOptions o, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(o.User)) throw new TouchQueConfigException("StartAsync() needs the user id");
        var norm = TouchQue.Details.Normalize(o.Details);
        var details = norm.Count > 0 ? norm : null;
        try
        {
            var res = await client.Login.RequestAsync(new LoginRequestOptions
            {
                ExternalUsername = o.User,
                Type = action,
                ReferenceId = o.ReferenceId,
                ClientIp = o.Ip,
                UserAgent = o.UserAgent,
                Details = details,
                BrowserProof = o.BrowserProof,
                Context = o.Context,
            }, ct).ConfigureAwait(false);
            var reasons = res.Reasons is { Count: > 0 } ? res.Reasons.Select(r => new RiskReason { Code = r.Code, Text = r.Text }).ToList() : null;
            var canary = string.IsNullOrEmpty(res.Canary?.Url) ? null : new Canary { Url = res.Canary!.Url };
            var caseCode = string.IsNullOrEmpty(res.CaseCode) ? null : res.CaseCode;
            if (res.RequiresPasskey)
            {
                return new Step { State = "passkey_required", RequestId = res.RequestId, ExpiresAt = res.ExpiresAt, Details = details, CaseCode = caseCode, Reasons = reasons, Canary = canary };
            }
            return new Step
            {
                State = "waiting",
                RequestId = res.RequestId,
                Number = string.IsNullOrEmpty(res.ChallengeCode) ? null : res.ChallengeCode,
                ExpiresAt = res.ExpiresAt,
                Details = details,
                CaseCode = caseCode,
                Reasons = reasons,
                // Only when the workspace collects behavioural signals.
                TelemetryToken = string.IsNullOrEmpty(res.TelemetryToken) ? null : res.TelemetryToken,
                // Mirror Alarm: only on this first step.
                Canary = canary,
            };
        }
        catch (TouchQueApiException e)
        {
            var code = e.Code ?? e.Error;
            var caseCode = e.CaseCode;
            if (e.Status == 404 && (code == "device_not_linked" || e.Message.Contains("linked device", StringComparison.OrdinalIgnoreCase)))
            {
                return o.Enroll ? await EnrollStepAsync(client, o.User, ct).ConfigureAwait(false) : new Step { State = "enroll" };
            }
            if (e.Status == 423) return new Step { State = "frozen", RetryAfter = e.RetryAfter, CaseCode = caseCode };
            if (e.Status == 429) return new Step { State = "rate_limited", RetryAfter = e.RetryAfter, CaseCode = caseCode };
            if (e.Status == 400 && (code == "unknown_action" || e.Message.Contains("invalid action type", StringComparison.OrdinalIgnoreCase)))
            {
                throw new TouchQueConfigException($"Unknown action \"{action}\". Create it once with client.ActionTypes.DefineAsync(\"{action}\") or in the dashboard (Action Types).");
            }
            if (e.Status == 403)
            {
                var reason = (code == "blocked" ? e.Reason : null)
                    ?? (code == "passkey_not_registered" || e.Error == "phishing_resistant_required" ? "passkey_not_registered" : null)
                    ?? (code == "action_disabled" ? "action_disabled" : null)
                    ?? code ?? "blocked";
                return new Step { State = "blocked", Reason = reason, CaseCode = caseCode };
            }
            throw;
        }
    }

    /// <summary>First-time linking. Never unlinks a phone: a secret is only re-issued when the account is confirmed NOT linked.</summary>
    private static async Task<Step> EnrollStepAsync(TouchQueClient client, string user, CancellationToken ct)
    {
        try
        {
            var gen = await client.Auth.GenerateSecretAsync(user, ct).ConfigureAwait(false);
            return new Step { State = "enroll", Enroll = new StepEnroll { QrCodeDataUrl = gen.QrCodeDataUrl, RecoveryCodes = gen.RecoveryCodes, ExpiresAt = gen.ExpiresAt } };
        }
        catch (TouchQueApiException e) when (e.Status == 409)
        {
            TouchQueUser? current = null;
            try
            {
                current = await client.Auth.GetUserAsync(user, ct).ConfigureAwait(false);
            }
            catch (TouchQueApiException)
            {
                // unknown user: reset below
            }
            if (current is not null && (current.Used || !string.IsNullOrEmpty(current.DeviceId)))
            {
                return new Step { State = "enroll", Reason = "already_linked" };
            }
            var reset = await client.Auth.ResetSecretAsync(user, ct).ConfigureAwait(false);
            return new Step { State = "enroll", Enroll = new StepEnroll { QrCodeDataUrl = reset.QrCodeDataUrl, RecoveryCodes = reset.RecoveryCodes, ExpiresAt = reset.ExpiresAt } };
        }
    }

    public static async Task<Step> CheckAsync(TouchQueClient client, string requestId, CancellationToken ct)
    {
        var s = await client.Login.StatusAsync(requestId, ct).ConfigureAwait(false);
        var state = s.Status == "PENDING" && s.RequiresPasskey ? "passkey_required" : StateMap.GetValueOrDefault(s.Status, "waiting");
        return new Step { State = state, RequestId = requestId, Assurance = state == "approved" ? s.Assurance : null };
    }

    public static async Task<Approval> CompleteAsync(TouchQueClient client, string requestId, CompleteExpectations expect, CancellationToken ct)
    {
        var res = await client.Login.ConsumeAsync(requestId, ct).ConfigureAwait(false);
        var sameUser = string.Equals(res.ExternalUsername, expect.User, StringComparison.OrdinalIgnoreCase);
        var sameDetails = TouchQue.Details.Digest(expect.Details) == TouchQue.Details.Digest(res.Details);
        var sameRef = (res.ReferenceId ?? null) == (expect.ReferenceId ?? null);
        if (!sameUser || res.Type != expect.Action || !sameDetails || !sameRef)
        {
            throw new TouchQueApprovalMismatchException("this approval is for a different user, action or transaction.");
        }
        return new Approval
        {
            RequestId = requestId,
            User = res.ExternalUsername,
            Action = res.Type,
            Assurance = res.Assurance,
            ConfirmedVia = res.ConfirmedVia,
            ApprovalProof = res.ApprovalProof,
            Provisional = res.Provisional,
            Revoked = res.Provisional is null ? null : res.Revoked,
            RevokeReason = res.RevokeReason,
            ReconfirmedAt = res.ReconfirmedAt,
        };
    }

    // ── Guard token ─────────────────────────────────────────────────────────
    // The browser echoes it back while it waits. Signed with a key derived from the
    // API secret, it binds the approval to one user, action and transaction.

    private static byte[] TokenKey(string apiSecret)
    {
        using var h = new HMACSHA256(Encoding.UTF8.GetBytes(apiSecret));
        return h.ComputeHash(Encoding.UTF8.GetBytes("touchque-guard-token-v1"));
    }

    public static string SignGuardToken(string apiSecret, JsonObject claims)
    {
        var body = Base64Url.Encode(claims.ToJsonString(Json.Options));
        using var h = new HMACSHA256(TokenKey(apiSecret));
        return "v1." + body + "." + Base64Url.Encode(h.ComputeHash(Encoding.ASCII.GetBytes(body)));
    }

    public static JsonObject? VerifyGuardToken(string apiSecret, string? token)
    {
        if (string.IsNullOrEmpty(token) || token.Length > 4096) return null;
        var parts = token.Split('.');
        if (parts.Length != 3 || parts[0] != "v1") return null;
        using var h = new HMACSHA256(TokenKey(apiSecret));
        var expected = Base64Url.Encode(h.ComputeHash(Encoding.ASCII.GetBytes(parts[1])));
        if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(parts[2]))) return null;
        if (!Base64Url.TryDecode(parts[1], out var bytes)) return null;
        var claims = Json.Parse(Encoding.UTF8.GetString(bytes)) as JsonObject;
        var exp = Json.Long(claims, "exp");
        if (claims is null || exp is null || exp.Value < DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) return null;
        return claims;
    }
}

/// <summary>Step serialization for the browser: the API's camelCase, nulls left out.</summary>
internal static class StepJson
{
    public static JsonNode? ToJson(Step step) => Json.ToNode(step);
}

// ─────────────────────────────────────────────────────────────
// From Flow/Guard.cs — Guard.RunAsync, the two-phase contract for any framework
// ─────────────────────────────────────────────────────────────

using System.Text.Json.Nodes;
using TouchQue.Internal;

namespace TouchQue;

/// <summary>Silent sign-ins for a guard or relay: off by default.</summary>
public sealed record SilentSignInOptions
{
    /// <summary>Your own limit on how long ago the last phone approval in that browser may be (0 = always ask).</summary>
    public int? MaxAgeSeconds { get; init; }
}

/// <summary>One request through the guard.</summary>
public sealed record GuardInput
{
    /// <summary>The signed-in user (null answers 401).</summary>
    public string? User { get; init; }
    public required string Action { get; init; }
    public IReadOnlyList<LoginDetail>? Details { get; init; }
    public string? ReferenceId { get; init; }
    /// <summary>The end user's IP.</summary>
    public string? Ip { get; init; }
    public string? UserAgent { get; init; }
    /// <summary><c>X-TouchQue-Token</c>: the token from the last answer.</summary>
    public string? Token { get; init; }
    /// <summary><c>X-TouchQue-Offline: 1</c>: switch to offline approval.</summary>
    public bool Offline { get; init; }
    /// <summary><c>X-TouchQue-Code</c>: the code from the phone.</summary>
    public string? Code { get; init; }
    /// <summary><c>X-TouchQue-Code-Type</c>: totp for the rolling time-based code.</summary>
    public string? CodeType { get; init; }
    /// <summary>False: never show the first-time linking QR.</summary>
    public bool Enroll { get; init; } = true;
    /// <summary><c>X-TouchQue-Browser</c>: the browser's device-bound key proof.</summary>
    public string? BrowserProof { get; init; }
    /// <summary>Null: silent sign-ins off.</summary>
    public SilentSignInOptions? SilentSignIn { get; init; }
    /// <summary>For your TouchQue Actions only (<c>event.context</c>).</summary>
    public IReadOnlyDictionary<string, object?>? Context { get; init; }
}

/// <summary>
/// The guard's answer: either <see cref="Approved"/> (run your protected action once)
/// or <see cref="Status"/> and <see cref="Body"/> to send back as JSON.
/// </summary>
public sealed record GuardResult
{
    public int Status { get; init; }
    public Approval? Approved { get; init; }
    /// <summary><c>{"touchque": step, "token": "..."}</c> or an error.</summary>
    public JsonObject? Body { get; init; }
    public Step? Step { get; init; }

    /// <summary>Seconds for a Retry-After header (frozen, rate limited).</summary>
    public int? RetryAfter => Step?.RetryAfter is > 0 ? Step.RetryAfter : null;
}

/// <summary>
/// Framework-agnostic step-up guard (ASP.NET Core's <c>RequireTouchQue</c> is a thin
/// wrapper over it). Contract, the same in every TouchQue server SDK:
/// <list type="bullet">
/// <item>1st request → 202 <c>{"touchque": step, "token": ...}</c>: show the step in your UI;</item>
/// <item>repeat with the token (header <c>X-TouchQue-Token</c>) → 202 while waiting, then the protected action runs once;</item>
/// <item>refused → 403 / 408 / 423 / 429 <c>{"touchque": {"state": ...}}</c>.</item>
/// </list>
/// </summary>
public static class Guard
{
    public const string TokenHeader = "X-TouchQue-Token";
    public const string OfflineHeader = "X-TouchQue-Offline";
    public const string CodeHeader = "X-TouchQue-Code";
    public const string CodeTypeHeader = "X-TouchQue-Code-Type";
    public const string BrowserHeader = "X-TouchQue-Browser";

    private const long TokenTtlMs = 10 * 60 * 1000;
    /// <summary>A real proof is a few hundred characters; anything far larger is not one.</summary>
    private const int MaxBrowserProof = 4096;

    private static readonly Dictionary<string, int> StatusOf = new()
    {
        ["waiting"] = 202, ["enroll"] = 202, ["passkey_required"] = 202, ["offline"] = 202,
        ["approved"] = 200, ["rejected"] = 403, ["blocked"] = 403, ["expired"] = 408, ["frozen"] = 423, ["rate_limited"] = 429,
    };

    private static readonly HashSet<string> Waiting = new() { "waiting", "passkey_required", "offline" };

    /// <summary>
    /// True when this request only polls an approval already on its way: a valid token
    /// bound to this user/action/details, still waiting, and no offline switch or typed
    /// code. It can only read the status, so relays do not count it against the
    /// per-user push limit.
    /// </summary>
    public static bool IsStatusPoll(TouchQueClient client, GuardInput input)
    {
        if (string.IsNullOrEmpty(input.User) || string.IsNullOrEmpty(input.Token) || input.Offline || !string.IsNullOrEmpty(input.Code)) return false;
        var claims = Steps.VerifyGuardToken(client.ApiSecret, input.Token);
        if (claims is null || string.IsNullOrEmpty(Json.Str(claims, "rid"))) return false;
        return Bound(claims, input) && Waiting.Contains(Json.Str(claims, "st") ?? "");
    }

    private static bool Bound(JsonObject claims, GuardInput input) =>
        Json.Str(claims, "u") == input.User && Json.Str(claims, "a") == input.Action
        && Json.Str(claims, "d") == Details.Digest(input.Details) && Json.Str(claims, "r") == input.ReferenceId;

    /// <summary>
    /// Runs one step of the guard. Silent sign-ins: with <see cref="GuardInput.SilentSignIn"/>
    /// set, a new attempt that carries a browser proof first asks TouchQue
    /// (<c>Risk.CheckAsync</c>); when it answers exactly <c>prompt: false</c> the guard
    /// approves at once with no push (<c>assurance.method</c> silent, <c>ConfirmedVia</c>
    /// SILENT, <c>RequestId</c> silent). Otherwise, and on any error, the usual push starts.
    /// </summary>
    public static async Task<GuardResult> RunAsync(TouchQueClient client, GuardInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(input.User))
        {
            return Error(401, new Step { State = "blocked", Reason = "unauthenticated" }, "unauthenticated", "Sign in first.");
        }
        var user = input.User;
        var action = input.Action;
        var norm = Details.Normalize(input.Details);
        var details = norm.Count > 0 ? norm : null;
        var secret = client.ApiSecret;

        GuardResult Issue(Step step, JsonObject? extra = null)
        {
            if (details is not null && step.Details is null && step.State != "blocked") step = step with { Details = details };
            var claims = new JsonObject
            {
                ["u"] = user, ["a"] = action, ["d"] = Details.Digest(input.Details), ["r"] = input.ReferenceId,
                ["st"] = step.State, ["rid"] = step.RequestId, ["n"] = step.Number, ["oc"] = step.Offline?.ChallengeId,
                ["exp"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + TokenTtlMs,
            };
            if (step.CaseCode is not null) claims["cc"] = step.CaseCode;
            if (extra is not null)
            {
                foreach (var (k, v) in extra) claims[k] = v?.DeepClone();
            }
            var body = new JsonObject { ["touchque"] = Json.ToNode(step), ["token"] = Steps.SignGuardToken(secret, claims) };
            return new GuardResult { Status = StatusOf[step.State], Body = body, Step = step };
        }

        try
        {
            var claims = Steps.VerifyGuardToken(secret, input.Token);
            var bound = claims is not null && Bound(claims, input) ? claims : null;
            var rid = bound is null ? null : Json.Str(bound, "rid");
            var n = bound is null ? null : Json.Str(bound, "n");
            var oc = bound is null ? null : Json.Str(bound, "oc");
            var st = bound is null ? null : Json.Str(bound, "st");
            var keep = new JsonObject { ["oc"] = oc, ["rid"] = rid, ["n"] = n };

            // Offline: the user typed the code from the phone.
            if (bound is not null && !string.IsNullOrEmpty(input.Code) && (st == "offline" || input.CodeType == "totp"))
            {
                var isTotp = input.CodeType == "totp";
                var res = isTotp
                    ? await client.Offline.VerifyTotpAsync(user, input.Code, action, input.Ip, rid, ct).ConfigureAwait(false)
                    : await client.Offline.VerifyAsync(oc ?? "", input.Code, ct).ConfigureAwait(false);
                var forThis = (string.IsNullOrEmpty(res.ExternalUsername) || string.Equals(res.ExternalUsername, user, StringComparison.OrdinalIgnoreCase))
                    && (string.IsNullOrEmpty(res.Type) || res.Type == action);
                if (res.Approved && forThis)
                {
                    return new GuardResult
                    {
                        Status = 200,
                        Approved = new Approval
                        {
                            RequestId = oc ?? "offline-totp", User = user, Action = action,
                            Assurance = new Assurance { PhishingResistant = false, Method = isTotp ? "offline_totp" : "offline_code" },
                            ConfirmedVia = isTotp ? "OFFLINE_TOTP" : "OFFLINE_CODE",
                        },
                    };
                }
                if (res.Reason == "invalid_code" && !isTotp)
                {
                    return Issue(new Step { State = "offline", Offline = new StepOffline { ChallengeId = oc ?? "", AttemptsLeft = res.AttemptsLeft } }, keep);
                }
                if (res.Reason == "invalid_code") return Issue(new Step { State = "offline", Reason = "invalid_code" }, keep);
                // The phone rejected the push this QR belongs to: the whole sign-in is over.
                if (res.Reason == "request_rejected") return Issue(new Step { State = "rejected", RequestId = rid, Reason = "request_rejected" });
                // The push now waits for a passkey (Vishing Shield): no code may finish it.
                if (res.Reason == "passkey_required" && !string.IsNullOrEmpty(rid))
                {
                    return Issue(new Step { State = "passkey_required", RequestId = rid, Number = n }, new JsonObject { ["n"] = n });
                }
                return Issue(new Step { State = res.Reason == "expired" ? "expired" : "blocked", Reason = res.Reason ?? "offline_failed" });
            }

            if (input.Offline)
            {
                try
                {
                    // Tie the QR to the push it follows: a phone-side rejection kills it, and number matching carries over.
                    var ch = await client.Offline.ChallengeAsync(new OfflineChallengeOptions
                    {
                        ExternalUsername = user, Type = action, Details = details, ClientIp = input.Ip, UserAgent = input.UserAgent, RequestId = rid,
                    }, ct).ConfigureAwait(false);
                    var offline = new StepOffline
                    {
                        ChallengeId = ch.ChallengeId, QrDataUrl = ch.QrDataUrl, ExpiresAt = ch.ExpiresAt, TotpAvailable = ch.TotpAvailable,
                        ChallengeCode = string.IsNullOrEmpty(ch.ChallengeCode) ? null : ch.ChallengeCode,
                    };
                    return Issue(new Step { State = "offline", Offline = offline }, new JsonObject { ["rid"] = rid, ["n"] = offline.ChallengeCode ?? n });
                }
                catch (TouchQueApiException e)
                {
                    var code = e.Code ?? e.Error;
                    if (e.Status == 409 && code == "request_rejected") return Issue(new Step { State = "rejected", RequestId = rid, Reason = "request_rejected" });
                    // The push it would follow now waits for a passkey (Vishing Shield): no QR, run the passkey.
                    if (!string.IsNullOrEmpty(rid) && code == "passkey_required")
                    {
                        return Issue(new Step { State = "passkey_required", RequestId = rid, Number = n }, new JsonObject { ["n"] = n });
                    }
                    if (e.Status < 500) return Issue(new Step { State = "blocked", Reason = e.Code ?? e.Error ?? "offline_unavailable" });
                    throw;
                }
            }

            // Waiting on a push / passkey, or showing the offline QR next to a push still open: poll, run once approved.
            if (bound is not null && !string.IsNullOrEmpty(rid) && Waiting.Contains(st ?? ""))
            {
                var now = await Steps.CheckAsync(client, rid, ct).ConfigureAwait(false);
                if (now.State == "approved")
                {
                    try
                    {
                        var approval = await Steps.CompleteAsync(client, rid, new CompleteExpectations
                        {
                            User = user, Action = action, Details = input.Details, ReferenceId = input.ReferenceId,
                        }, ct).ConfigureAwait(false);
                        return new GuardResult { Status = 200, Approved = approval };
                    }
                    catch (TouchQueApiException e) when (e.Status == 409)
                    {
                        return Issue(new Step { State = "expired", Reason = e.Code ?? "already_used" });
                    }
                }
                // The push behind the QR moved to a passkey after a tap during a call: the QR's code would be refused now.
                if (st == "offline" && now.State == "passkey_required")
                {
                    return Issue(new Step { State = "passkey_required", RequestId = rid, Number = n }, new JsonObject { ["n"] = n });
                }
                if (st == "offline" && now.State is "waiting" or "expired")
                {
                    // Nothing changed for the user: keep showing the QR they have.
                    return Issue(new Step { State = "offline", Offline = new StepOffline { ChallengeId = oc ?? "" } }, keep);
                }
                if (now.State is "waiting" or "passkey_required")
                {
                    // "Why?": the case code stays on screen while it waits.
                    return Issue(new Step { State = now.State, RequestId = rid, Number = n, CaseCode = Json.Str(bound, "cc") }, new JsonObject { ["n"] = n });
                }
                return Issue(new Step { State = now.State, RequestId = rid });
            }

            // Anything else (no or foreign token, enrollment finished, new attempt): start.
            var proof = !string.IsNullOrEmpty(input.BrowserProof) && input.BrowserProof.Length <= MaxBrowserProof ? input.BrowserProof : null;
            if (proof is not null && input.SilentSignIn is not null)
            {
                var silent = await SilentApprovalAsync(client, input, proof, ct).ConfigureAwait(false);
                if (silent is not null) return new GuardResult { Status = 200, Approved = silent };
            }
            var step = await Steps.StartAsync(client, action, new StartOptions
            {
                User = user, Details = details, ReferenceId = input.ReferenceId, Ip = input.Ip, UserAgent = input.UserAgent,
                Enroll = input.Enroll, BrowserProof = proof, Context = input.Context,
            }, ct).ConfigureAwait(false);
            return Issue(step);
        }
        catch (TouchQueConfigException e)
        {
            client.Log.Error("[TouchQue] " + e.Message);
            return Error(500, new Step { State = "blocked", Reason = "misconfigured" }, "misconfigured", "Two-factor approval is not configured correctly.");
        }
        catch (Exception e) when (e is TouchQueNetworkException or TouchQueApiException)
        {
            client.Log.Error("[TouchQue] approval failed: " + SdkLog.Describe(e));
            return Error(503, new Step { State = "blocked", Reason = "unavailable" }, "unavailable", "Two-factor approval is temporarily unavailable.");
        }
    }

    private static GuardResult Error(int status, Step step, string code, string message) => new()
    {
        Status = status,
        Step = step,
        Body = new JsonObject { ["touchque"] = Json.ToNode(step), ["error"] = new JsonObject { ["code"] = code, ["message"] = message } },
    };

    /// <summary>
    /// Asks TouchQue whether this known browser may sign in without the phone. Fails
    /// closed: only an answer of exactly <c>prompt: false</c> approves.
    /// </summary>
    private static async Task<Approval?> SilentApprovalAsync(TouchQueClient client, GuardInput input, string proof, CancellationToken ct)
    {
        try
        {
            var res = await client.Risk.CheckAsync(new RiskCheckOptions
            {
                ExternalUsername = input.User!, Type = input.Action, ClientIp = input.Ip, UserAgent = input.UserAgent, BrowserProof = proof,
                Context = input.Context is { Count: > 0 } ? input.Context : null, MaxAgeSeconds = input.SilentSignIn?.MaxAgeSeconds,
            }, ct).ConfigureAwait(false);
            if (res.Prompt) return null;
            return new Approval
            {
                RequestId = "silent", User = input.User!, Action = input.Action,
                Assurance = new Assurance { PhishingResistant = false, Method = "silent" },
                ConfirmedVia = "SILENT",
                // Nothing was sent to the phone; why TouchQue let this known browser in.
                Reasons = res.Reasons,
            };
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            client.Log.Warn("[TouchQue] silent sign-in check failed, asking the phone: " + SdkLog.Describe(e));
            return null;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// From Crypto/ApprovalProof.cs — ApprovalProof.Verify (device proof, pin the key)
// ─────────────────────────────────────────────────────────────

using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using TouchQue.Internal;

namespace TouchQue;

/// <summary>Transaction details the way the API normalizes and digests them.</summary>
public static class Details
{
    /// <summary>Labels and values trimmed, in order.</summary>
    public static IReadOnlyList<LoginDetail> Normalize(IEnumerable<LoginDetail>? details) =>
        details is null ? Array.Empty<LoginDetail>() : details.Select(d => new LoginDetail((d.Label ?? "").Trim(), (d.Value ?? "").Trim())).ToList();

    /// <summary>Details from the API's JSON (a list of {label, value} or an object), normalized.</summary>
    public static IReadOnlyList<LoginDetail> FromJson(JsonNode? node)
    {
        var list = new List<LoginDetail>();
        if (node is JsonArray arr)
        {
            foreach (var d in arr)
            {
                list.Add(new LoginDetail(Text(d?["label"]), Text(d?["value"])));
            }
        }
        else if (node is JsonObject obj)
        {
            foreach (var (k, v) in obj) list.Add(new LoginDetail(k, Text(v)));
        }
        return Normalize(list);
    }

    /// <summary>
    /// SHA-256 (hex) over the normalized details joined as label US value RS label…;
    /// empty for no details. The phone signs this digest (<see cref="ApprovalProof"/>).
    /// </summary>
    public static string Digest(IEnumerable<LoginDetail>? details)
    {
        var pairs = Normalize(details);
        if (pairs.Count == 0) return "";
        var canonical = string.Join("\u001e", pairs.Select(p => p.Label + "\u001f" + p.Value));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    private static string Text(JsonNode? n) => n switch
    {
        null => "",
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        _ => n.ToJsonString(),
    };
}

/// <summary>What <see cref="ApprovalProof.Verify"/> checks the proof against.</summary>
public sealed record ApprovalProofOptions
{
    /// <summary>The id <c>Login.RequestAsync</c> returned.</summary>
    public required string RequestId { get; init; }
    /// <summary>The action type you sent, e.g. WITHDRAW.</summary>
    public required string Type { get; init; }
    /// <summary>The details you sent, exactly as you sent them.</summary>
    public IReadOnlyList<LoginDetail>? Details { get; init; }
    /// <summary>The number-match code, when used.</summary>
    public string? ChallengeCode { get; init; }
    /// <summary>
    /// Pin the device: the base64 public key you stored for this user (e.g. the
    /// <c>publicKey</c> of their first verified approval). Required unless
    /// <see cref="AllowUnpinnedKey"/> is true.
    /// </summary>
    public string? ExpectedPublicKey { get; init; }
    /// <summary>Accept whatever key the proof carries (trust on first use only: store the key, pin it after).</summary>
    public bool AllowUnpinnedKey { get; init; }
}

/// <summary>
/// Verifies the device-signed proof of an approval ("what you see is what you
/// sign"). When the phone holds a hardware key (Secure Enclave / Android Keystore),
/// every approval is signed over the request id, the action type, the number-match
/// code and a digest of the details the user was shown. The proof arrives in the
/// SUCCESS webhook (<c>approvalProof</c>) and in the consumed approval. Verifying it
/// does not require trusting TouchQue.
/// </summary>
public static class ApprovalProof
{
    private const string MessagePrefix = "touchque-approve:v2";

    /// <summary>True only if the proof was signed by the device key over exactly what you expect. Never throws.</summary>
    public static bool Verify(JsonObject? proof, ApprovalProofOptions options)
    {
        try
        {
            if (proof is null || Json.Str(proof, "version") != "v2" || Json.Str(proof, "algorithm") != "ECDSA-P256-SHA256") return false;
            var publicKey = Json.Str(proof, "publicKey");
            var message = Json.Str(proof, "message");
            var signature = Json.Str(proof, "signature");
            if (publicKey is null || message is null || signature is null) return false;
            if (!string.IsNullOrEmpty(options.ExpectedPublicKey))
            {
                if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(options.ExpectedPublicKey), Encoding.UTF8.GetBytes(publicKey))) return false;
            }
            else if (!options.AllowUnpinnedKey)
            {
                return false;
            }
            var expected = string.Join("\n", MessagePrefix, options.RequestId ?? "", options.Type ?? "", options.ChallengeCode ?? "", Details.Digest(options.Details));
            if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(message))) return false;
            var raw = Convert.FromBase64String(publicKey);
            if (raw.Length != 65 || raw[0] != 0x04) return false;
            var sig = Convert.FromBase64String(signature);
            if (sig.Length == 0) return false;
            using var ec = ECDsa.Create(new ECParameters
            {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = raw[1..33], Y = raw[33..65] },
            });
            return ec.VerifyData(Encoding.UTF8.GetBytes(message), sig, HashAlgorithmName.SHA256, DSASignatureFormat.Rfc3279DerSequence);
        }
        catch (Exception e) when (e is CryptographicException or FormatException or ArgumentException)
        {
            return false;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// From Resources/Login.cs — tq.Login (RequestAsync/StatusAsync/VerifyAsync/ReportFraudAsync)
// ─────────────────────────────────────────────────────────────

using System.Text.Json.Nodes;
using TouchQue.Internal;

namespace TouchQue;

/// <summary>Push approvals on the user's phone: request, status, wait, use once, report fraud.</summary>
public sealed class LoginResource
{
    /// <summary>Reasons accepted by <see cref="ReportFraudAsync"/>.</summary>
    public static readonly IReadOnlyList<string> FraudReasons = new[] { "chargeback", "account_takeover", "social_engineering", "other" };

    private readonly TouchQueHttp _http;

    internal LoginResource(TouchQueHttp http) => _http = http;

    /// <summary>A push to the user's phone (returns at once; see <see cref="VerifyAsync(LoginRequestOptions, CancellationToken)"/> to wait).</summary>
    public Task<LoginRequestResult> RequestAsync(string externalUsername, string type = "LOGIN", CancellationToken ct = default) =>
        RequestAsync(new LoginRequestOptions { ExternalUsername = externalUsername, Type = type }, ct);

    /// <summary>
    /// A push to the user's phone with every option: transaction details, the end
    /// user's IP and browser, number matching, the browser proof of silent sign-ins,
    /// context for your Actions, security changes, a destination.
    /// With behavioral biometrics on, the answer has <see cref="LoginRequestResult.TelemetryToken"/>
    /// for the <c>@touchque/web</c> widget.
    /// </summary>
    public Task<LoginRequestResult> RequestAsync(LoginRequestOptions options, CancellationToken ct = default) =>
        _http.PostAsync<LoginRequestResult>("/login/request", options.ToJson(), ct);

    /// <summary>Where a request is now: PENDING, CONFIRMED, REJECTED or EXPIRED.</summary>
    public Task<LoginStatus> StatusAsync(string requestId, CancellationToken ct = default) =>
        _http.GetAsync<LoginStatus>("/login/status/" + TouchQueHttp.Seg(requestId), null, ct);

    /// <summary>Asks the phone and waits for the answer.</summary>
    public Task<VerifyResult> VerifyAsync(string externalUsername, string type = "LOGIN", CancellationToken ct = default) =>
        VerifyAsync(new LoginRequestOptions { ExternalUsername = externalUsername, Type = type }, ct);

    /// <summary>
    /// Asks the phone and polls until the user approves or rejects. With number
    /// matching (your option, a workspace policy, a critical action or the risk
    /// engine) the user picks a number on the phone: <see cref="LoginRequestOptions.OnChallenge"/>
    /// runs right after the request exists and before any waiting. Show
    /// <c>ChallengeCode</c> to the user now; the phone asks for it.
    /// </summary>
    /// <exception cref="TouchQuePasskeyRequiredException">Only a passkey can approve (policy), or the user tapped Approve during a call (step_up).</exception>
    /// <exception cref="TouchQueRejectedException">The user rejected it.</exception>
    /// <exception cref="TouchQueTimeoutException">It expired or <see cref="LoginRequestOptions.Timeout"/> passed.</exception>
    public async Task<VerifyResult> VerifyAsync(LoginRequestOptions options, CancellationToken ct = default)
    {
        var sent = await RequestAsync(options with { ExpiresIn = null, ClientSignals = null }, ct).ConfigureAwait(false);
        if (sent.RequiresPasskey)
        {
            throw new TouchQuePasskeyRequiredException(sent.RequestId);
        }
        if (options.OnChallenge is { } onChallenge)
        {
            try
            {
                await onChallenge(new VerifyChallenge
                {
                    RequestId = sent.RequestId,
                    ChallengeCode = string.IsNullOrEmpty(sent.ChallengeCode) ? null : sent.ChallengeCode,
                    ExpiresAt = sent.ExpiresAt,
                    Reasons = sent.Reasons,
                    CaseCode = sent.CaseCode,
                }).ConfigureAwait(false);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // The caller's callback must not stop the wait.
                _http.Log.Warn("[TouchQue] OnChallenge failed: " + SdkLog.Describe(e));
            }
        }
        return await WaitAsync(sent.RequestId, sent.ChallengeCode, options.Timeout ?? TimeSpan.FromSeconds(30), options.PollInterval ?? TimeSpan.FromMilliseconds(400), ct).ConfigureAwait(false);
    }

    /// <summary>Waits for a request you already sent (e.g. with <see cref="RequestAsync(LoginRequestOptions, CancellationToken)"/>).</summary>
    public Task<VerifyResult> WaitForApprovalAsync(string requestId, TimeSpan? timeout = null, TimeSpan? pollInterval = null, CancellationToken ct = default) =>
        WaitAsync(requestId, null, timeout ?? TimeSpan.FromSeconds(30), pollInterval ?? TimeSpan.FromMilliseconds(400), ct);

    private async Task<VerifyResult> WaitAsync(string requestId, string? challengeCode, TimeSpan timeout, TimeSpan interval, CancellationToken ct)
    {
        var deadline = DateTimeOffset.UtcNow + timeout;
        while (true)
        {
            var s = await StatusAsync(requestId, ct).ConfigureAwait(false);
            switch (s.Status)
            {
                case "CONFIRMED":
                    return new VerifyResult
                    {
                        Approved = true,
                        Status = s.Status,
                        RequestId = requestId,
                        ChallengeCode = string.IsNullOrEmpty(challengeCode) ? null : challengeCode,
                        Assurance = s.Assurance,
                        ConfirmedVia = s.ConfirmedVia,
                        // Vishing Shield: approved during a call; critical actions wait for the phone to re-confirm.
                        Provisional = s.Provisional,
                    };
                case "REJECTED":
                    throw new TouchQueRejectedException(requestId);
                case "EXPIRED":
                    throw new TouchQueTimeoutException($"TouchQue: request '{requestId}' expired before it was approved.", requestId);
            }
            // Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
            if (s.Status == "PENDING" && s.RequiresPasskey)
            {
                throw new TouchQuePasskeyRequiredException(requestId, "step_up");
            }
            if (DateTimeOffset.UtcNow + interval > deadline)
            {
                throw new TouchQueTimeoutException(
                    $"TouchQue: request '{requestId}' was not approved within {timeout.TotalSeconds:0}s. The user did not respond in time.", requestId);
            }
            await Task.Delay(interval, ct).ConfigureAwait(false);
        }
    }

    /// <summary>Approves a pending request with one of the user's recovery codes (no phone).</summary>
    public Task<JsonObject> ApproveWithRecoveryCodeAsync(string requestId, string code, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>("/login/recovery", new JsonObject { ["requestId"] = requestId, ["code"] = code }, ct);

    /// <summary>
    /// Uses an approved request exactly once. The first call on a CONFIRMED request
    /// wins atomically; every later call (a replayed token, a retried form post)
    /// throws <see cref="TouchQueApiException"/> with code <c>already_used</c> (409).
    /// </summary>
    public Task<ConsumeResult> ConsumeAsync(string requestId, CancellationToken ct = default) =>
        _http.PostAsync<ConsumeResult>("/login/" + TouchQueHttp.Seg(requestId) + "/consume", new JsonObject(), ct);

    /// <summary>
    /// Reports a request you later learned was fraud (a chargeback, a confirmed
    /// account takeover, a scam the user was talked into). The risk engine learns
    /// from it and the report is kept in your audit log; the request's status does
    /// not change. A repeat answers <c>AlreadyReported = true</c>.
    /// </summary>
    /// <param name="reason">One of <see cref="FraudReasons"/> (default <c>other</c>).</param>
    /// <param name="note">Free text for your audit log, at most 500 characters.</param>
    public Task<FraudReport> ReportFraudAsync(string requestId, string? reason = null, string? note = null, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(requestId)) throw new TouchQueConfigException("ReportFraudAsync() needs the request id");
        var body = new JsonObject().Put("reason", reason).Put("note", note);
        return _http.PostAsync<FraudReport>("/login/" + TouchQueHttp.Seg(requestId) + "/report-fraud", body, ct);
    }
}

/// <summary>Every field of <c>POST /login/request</c>.</summary>
public sealed record LoginRequestOptions
{
    /// <summary>The user in YOUR system (email, id).</summary>
    public required string ExternalUsername { get; init; }

    /// <summary>The action type (default <c>LOGIN</c>).</summary>
    public string Type { get; init; } = "LOGIN";

    public string? ReferenceId { get; init; }

    /// <summary>The END USER's IP (shown as "City, Country" on the phone; Tor, travel and attack-tool checks).</summary>
    public string? ClientIp { get; init; }

    /// <summary>The end user's User-Agent (shown as browser and device).</summary>
    public string? UserAgent { get; init; }

    public bool RequireBiometric { get; init; }

    public bool RequireNumberMatch { get; init; }

    /// <summary>Digits of the matching number when one is shown: 2 or 3. The longer of this and the workspace policy wins.</summary>
    public int? ChallengeDigits { get; init; }

    /// <summary>How long the push waits for the person, in seconds: 30 (default) to 300.</summary>
    public int? ExpiresIn { get; init; }

    /// <summary>The end user's page check from <c>@touchque/web</c>, passed through untouched: a browser driven by software asks with number matching.</summary>
    public string? ClientSignals { get; init; }

    /// <summary>
    /// The page's device report from <c>@touchque/web</c> (<c>deviceRisk.collect({ purpose })</c>), passed through untouched.
    /// Used only when your workspace turned Device risk on: its signals only ever ask for more, and a device your
    /// admin marked "step up always" asks at once.
    /// </summary>
    public string? DeviceRisk { get; init; }
    /// <summary>The page's identification (<c>deviceRisk.identify()</c>), preferred over DeviceRisk; for this account only.</summary>
    public string? DeviceRiskRequestId { get; init; }

    /// <summary>
    /// A browser pairing by QR code (<see cref="TouchQueClient.QrPairings"/>), scanned and confirmed on the phone:
    /// only the phone that scanned it is asked, once, with number matching, for the user it scanned for.
    /// </summary>
    public string? QrPairing { get; init; }

    /// <summary>
    /// Ask the person to type back on the phone a sign-in code another service sent them; the phone
    /// encrypts it to <c>Reply.Key</c> and <see cref="LoginStatus.Reply"/> holds only the ciphertext
    /// (<see cref="CodeReply.Open"/>). Such a request lives 5 minutes. Not with <see cref="QrPairing"/>.
    /// </summary>
    public LoginReplyRequest? Reply { get; init; }

    /// <summary>Transaction context for the approval screen (at most 8 lines).</summary>
    public IReadOnlyList<LoginDetail>? Details { get; init; }

    /// <summary>
    /// Silent sign-ins: the browser's device-bound key proof exactly as the browser
    /// sent it (<c>X-TouchQue-Browser</c>). Once the user approves this request,
    /// TouchQue knows the browser.
    /// </summary>
    public string? BrowserProof { get; init; }

    /// <summary>For your TouchQue Actions only (<c>event.context</c>); never shown on the phone. Any JSON object up to 4 KB.</summary>
    public IReadOnlyDictionary<string, object?>? Context { get; init; }

    /// <summary>When the user's sign-in security last changed in your system.</summary>
    public SecurityChanges? SecurityChanges { get; init; }

    /// <summary>Where the action sends money or value (shown in full on the phone; do not repeat it in Details).</summary>
    public Destination? Destination { get; init; }

    /// <summary><c>tr</c> (default) or <c>en</c>: the language of the rows TouchQue adds.</summary>
    public string? Locale { get; init; }

    /// <summary>VerifyAsync only: how long to wait (default 30 seconds).</summary>
    public TimeSpan? Timeout { get; init; }

    /// <summary>VerifyAsync only: how often to ask (default 400 ms).</summary>
    public TimeSpan? PollInterval { get; init; }

    /// <summary>
    /// VerifyAsync only: called once, right after the request is created and before
    /// any waiting. Not called when only a passkey can approve. An exception it
    /// throws is logged and ignored.
    /// </summary>
    public Func<VerifyChallenge, Task>? OnChallenge { get; init; }

    internal JsonObject ToJson()
    {
        if (string.IsNullOrEmpty(ExternalUsername)) throw new TouchQueConfigException("A login request needs the user (ExternalUsername)");
        var body = new JsonObject { ["externalUsername"] = ExternalUsername, ["type"] = string.IsNullOrEmpty(Type) ? "LOGIN" : Type };
        body.Put("referenceId", ReferenceId).Put("clientIp", ClientIp).Put("userAgent", UserAgent);
        if (RequireBiometric) body["requireBiometric"] = true;
        if (RequireNumberMatch) body["requireNumberMatch"] = true;
        if (ChallengeDigits is 2 or 3) body["challengeDigits"] = ChallengeDigits.Value;
        body.Put("expiresIn", ExpiresIn).Put("clientSignals", ClientSignals).Put("deviceRisk", string.IsNullOrEmpty(DeviceRisk) ? null : DeviceRisk).Put("deviceRiskRequestId", string.IsNullOrEmpty(DeviceRiskRequestId) ? null : DeviceRiskRequestId).Put("qrPairing", string.IsNullOrEmpty(QrPairing) ? null : QrPairing);
        if (Details is { Count: > 0 }) body["details"] = DetailsJson(Details);
        body.Put("browserProof", BrowserProof);
        if (Context is { Count: > 0 }) body["context"] = Json.ToNode(Context);
        body.PutNode("securityChanges", SecurityChanges?.ToJson());
        if (Destination is not null) body["destination"] = Json.ToNode(Destination);
        body.Put("locale", Locale);
        if (Reply is not null)
        {
            body["reply"] = new JsonObject { ["kind"] = Reply.Kind, ["key"] = Reply.Key }.Put("channel", Reply.Channel).Put("target", Reply.Target);
        }
        return body;
    }

    internal static JsonArray DetailsJson(IEnumerable<LoginDetail> details)
    {
        var arr = new JsonArray();
        foreach (var d in details) arr.Add(new JsonObject { ["label"] = d.Label, ["value"] = d.Value });
        return arr;
    }
}

/// <summary>What <see cref="LoginRequestOptions.OnChallenge"/> receives as soon as the request exists.</summary>
public sealed record VerifyChallenge
{
    public string RequestId { get; init; } = "";
    /// <summary>The number to show when number matching is on, otherwise null.</summary>
    public string? ChallengeCode { get; init; }
    public string? ExpiresAt { get; init; }
    /// <summary>Why number matching is needed (a fixed list, never a score).</summary>
    public IReadOnlyList<RiskReason>? Reasons { get; init; }
    /// <summary>The "Why?" case code of this decision.</summary>
    public string? CaseCode { get; init; }
}

public sealed record LoginRequestResult : TouchQueObject
{
    public string RequestId { get; init; } = "";
    /// <summary>The number to show the user with number matching (null otherwise).</summary>
    public string? ChallengeCode { get; init; }
    public string? Message { get; init; }
    public string? ExpiresAt { get; init; }
    /// <summary>
    /// The "Why?" case code of this decision (<c>K7P-2QX</c>). Show it to the user;
    /// your team opens the whole decision by this code in the dashboard.
    /// </summary>
    public string? CaseCode { get; init; }
    /// <summary>Why number matching or a passkey is needed; empty for a plain push.</summary>
    public IReadOnlyList<RiskReason>? Reasons { get; init; }
    /// <summary>A phishing-resistant policy demands a passkey: no push was sent.</summary>
    public bool RequiresPasskey { get; init; }
    /// <summary>For the behavioral widget of <c>@touchque/web</c>, when the workspace collects it.</summary>
    public string? TelemetryToken { get; init; }
    public Canary? Canary { get; init; }
    public DestinationCheck? Destination { get; init; }
}

public sealed record LoginStatus : TouchQueObject
{
    /// <summary>PENDING, CONFIRMED, REJECTED or EXPIRED.</summary>
    public string Status { get; init; } = "";
    public string? ExternalUsername { get; init; }
    public string? Type { get; init; }
    public string? ReferenceId { get; init; }
    public IReadOnlyList<LoginDetail>? Details { get; init; }
    public bool Consumed { get; init; }
    public bool RequiresPasskey { get; init; }
    public string? ConfirmedVia { get; init; }
    public Assurance? Assurance { get; init; }
    /// <summary>Rejected: <c>user_reported_coached</c> and others.</summary>
    public string? RejectReason { get; init; }
    /// <summary>Vishing Shield: approved during a call, waiting for the phone to re-confirm.</summary>
    public bool Provisional { get; init; }
    public string? ReconfirmedAt { get; init; }
    public bool Revoked { get; init; }
    public string? RevokeReason { get; init; }
    /// <summary>A request made with Reply, once the person typed it back: the ciphertext only (<see cref="CodeReply.Open"/>).</summary>
    public LoginReply? Reply { get; init; }
}

public sealed record VerifyResult : TouchQueObject
{
    public bool Approved { get; init; }
    public string Status { get; init; } = "";
    public string RequestId { get; init; } = "";
    public string? ChallengeCode { get; init; }
    public Assurance? Assurance { get; init; }
    public string? ConfirmedVia { get; init; }
    /// <summary>Vishing Shield: approved during a call; critical actions wait for the phone to re-confirm.</summary>
    public bool Provisional { get; init; }
}

public sealed record ConsumeResult : TouchQueObject
{
    public bool Consumed { get; init; }
    public string RequestId { get; init; } = "";
    public string ExternalUsername { get; init; } = "";
    public string Type { get; init; } = "";
    public string? ReferenceId { get; init; }
    public IReadOnlyList<LoginDetail>? Details { get; init; }
    public string? ConfirmedVia { get; init; }
    public Assurance? Assurance { get; init; }
    /// <summary>The phone's signature over what it showed (<see cref="ApprovalProof"/>), or null.</summary>
    public JsonObject? ApprovalProof { get; init; }
    public bool? Provisional { get; init; }
    public string? ReconfirmedAt { get; init; }
    public bool Revoked { get; init; }
    public string? RevokeReason { get; init; }
}

public sealed record FraudReport : TouchQueObject
{
    public bool Reported { get; init; }
    public bool AlreadyReported { get; init; }
    public string RequestId { get; init; } = "";
}

// ─────────────────────────────────────────────────────────────
// From Relay/RelayHandler.cs — the relay routes @touchque/web calls (public part)
// ─────────────────────────────────────────────────────────────

using System.Text.Json.Nodes;
using TouchQue.Internal;

namespace TouchQue.Relay;

/// <summary>
/// What the relay wants sent back: a status, a JSON body and headers.
/// <c>OnAuthenticated</c> receives the pending success response and may change it
/// (e.g. add a Set-Cookie); the handler sets the body afterwards.
/// </summary>
public sealed class RelayResponse
{
    private readonly List<KeyValuePair<string, string>> _headers = new();

    public RelayResponse(int status = 200, JsonNode? body = null)
    {
        Status = status;
        Body = body ?? new JsonObject();
    }

    public int Status { get; set; }

    /// <summary>Always a JSON object on the wire.</summary>
    public JsonNode Body { get; set; }

    public IReadOnlyList<KeyValuePair<string, string>> Headers => _headers;

    /// <summary>Sets a header, replacing any value it had.</summary>
    public RelayResponse SetHeader(string name, string value)
    {
        _headers.RemoveAll(h => string.Equals(h.Key, name, StringComparison.OrdinalIgnoreCase));
        _headers.Add(new(name, value));
        return this;
    }

    /// <summary>Adds a header value, keeping existing ones (several Set-Cookie).</summary>
    public RelayResponse AddHeader(string name, string value)
    {
        _headers.Add(new(name, value));
        return this;
    }

    public string? GetHeader(string name) => _headers.FirstOrDefault(h => string.Equals(h.Key, name, StringComparison.OrdinalIgnoreCase)).Value;
}

/// <summary>One relay request, framework-neutral.</summary>
public sealed record RelayRequest<TRequest>
{
    /// <summary>HTTP method (HEAD is treated as GET).</summary>
    public required string Method { get; init; }
    /// <summary>The path relative to where the relay is mounted, e.g. <c>/login</c>.</summary>
    public required string Path { get; init; }
    /// <summary>The decoded JSON body (empty for none).</summary>
    public JsonObject Body { get; init; } = new();
    /// <summary>The real client IP ("" when unknown). Behind a proxy, resolve it from trusted proxy headers first.</summary>
    public string Ip { get; init; } = "";
    public string? UserAgent { get; init; }
    /// <summary>A case-insensitive request header getter.</summary>
    public required Func<string, string?> Header { get; init; }
    /// <summary>Your framework's request, passed to the option callbacks.</summary>
    public required TRequest Native { get; init; }
}

/// <summary>What <c>OnAuthenticated</c> learns: who signed in, and how.</summary>
public sealed record RelayAuthenticated(string ExternalUsername, string? RequestId, string Via);

/// <summary>Options of <see cref="RelayHandler{TRequest}"/>.</summary>
public sealed record RelayOptions<TRequest>
{
    /// <summary>The signed-in user, for the routes that need one (enrollment, passkey management).</summary>
    public required Func<TRequest, string?> GetUserId { get; init; }

    /// <summary>
    /// The user who passed YOUR first factor (password step). STRONGLY RECOMMENDED: /login
    /// and the offline routes then act for this user and ignore any username in the body
    /// (401 FIRST_FACTOR_REQUIRED when it returns nothing).
    /// </summary>
    public Func<TRequest, string?>? GetLoginUser { get; init; }

    /// <summary>Rate limits of the pre-auth routes; null turns them off (rate limit in front of the relay then).</summary>
    public RateLimitOptions? RateLimit { get; init; } = new();

    /// <summary>Let the offline routes trust the body's username (no <see cref="GetLoginUser"/>).</summary>
    public bool AllowOfflineWithoutFirstFactor { get; init; }

    /// <summary>Action type for /login and the offline routes (default LOGIN).</summary>
    public string ActionType { get; init; } = "LOGIN";

    /// <summary>Transaction context for the approval screen; build it from server-side state, never from the body.</summary>
    public Func<TRequest, IReadOnlyList<LoginDetail>?>? GetDetails { get; init; }

    /// <summary>
    /// Called right before a success answer: open your session here. Via is login,
    /// passkey, offline, offline-totp or silent. Change the response (headers, status);
    /// the handler sets the body.
    /// </summary>
    public Func<TRequest, RelayResponse, RelayAuthenticated, Task>? OnAuthenticated { get; init; }

    /// <summary>
    /// Silent sign-ins for /login (default off): a new sign-in whose browser sent its
    /// device-bound key proof (X-TouchQue-Browser) first asks TouchQue whether anything
    /// about it is new; if nothing is, it succeeds at once with no push.
    /// </summary>
    public SilentSignInOptions? SilentSignIn { get; init; }
}

/// <summary>
/// Framework-agnostic relay: the routes a frontend (<c>@touchque/web</c>) needs for push
/// 2FA, offline codes and passkeys, so you don't hand-write them. Same routes and
/// behaviour as the Node SDK's <c>touchqueRouter</c>:
/// <code>
/// POST   /enroll/start                  (signed in)   generateSecret response
/// GET    /enroll/status                 (signed in)   { linked, used, deviceId }
/// POST   /login                         (pre-auth)    202 { touchque: step, token } until approved
/// POST   /offline/challenge             (pre-auth)    QR for a phone with no internet
/// POST   /offline/verify                (pre-auth)    body.challengeId / code
/// POST   /offline/totp                  (pre-auth)    the time-based code
/// POST   /passkey/authenticate/options  (pre-auth)    body.email; none = any passkey (autofill)
/// POST   /passkey/authenticate/verify   (pre-auth)    body.attemptId / response
/// POST   /passkey/login/options         (pre-auth)    body.requestId: approve a pending request
/// POST   /passkey/login/verify          (pre-auth)    body.requestId / response
/// POST   /passkey/register/options      (signed in)   the phone approves adding a passkey first
/// POST   /passkey/register/verify       (signed in)
/// GET    /passkey/credentials           (signed in)
/// DELETE /passkey/credentials/{id}      (signed in)
/// </code>
/// </summary>
public sealed class RelayHandler<TRequest>
{
    /// <summary>A 1.5 s poll for a 2-minute push is 80 requests: one attempt's worth of polls.</summary>
    private const int PollsPerAttempt = 10;
    /// <summary>Reserved action: the approval on the phone that unlocks adding a passkey.</summary>
    private const string PasskeyEnrollAction = "PASSKEY_ENROLL";

    private static int _warned;

    private readonly TouchQueClient _tq;
    private readonly RelayOptions<TRequest> _o;
    private readonly FixedWindowLimiter? _limiter;
    private readonly bool _offlineEnabled;

    public RelayHandler(TouchQueClient client, RelayOptions<TRequest> options)
    {
        _tq = client;
        _o = options;
        _limiter = options.RateLimit is null ? null : new FixedWindowLimiter(options.RateLimit);
        _offlineEnabled = options.GetLoginUser is not null || options.AllowOfflineWithoutFirstFactor;
        if (options.GetLoginUser is null && Interlocked.Exchange(ref _warned, 1) == 0)
        {
            client.Log.Warn("[TouchQue] RelayHandler: POST /login takes the username from the request body"
                + (_offlineEnabled ? ", and so do the offline routes" : "; the offline routes are disabled until you set it")
                + ". Set GetLoginUser to bind them to your first factor (password step) so they cannot be used against arbitrary users.");
        }
    }

    /// <summary>Handles one relay request; null when no relay route matches (answer 404 yourself).</summary>
    public async Task<RelayResponse?> HandleAsync(RelayRequest<TRequest> req, CancellationToken ct = default)
    {
        var method = req.Method.ToUpperInvariant();
        if (method == "HEAD") method = "GET";
        var path = "/" + req.Path.Split('?')[0].Trim('/');
        switch (method + " " + path.ToLowerInvariant())
        {
            case "POST /enroll/start": return await EnrollStartAsync(req, ct).ConfigureAwait(false);
            case "GET /enroll/status": return await EnrollStatusAsync(req, ct).ConfigureAwait(false);
            case "POST /login": return await LoginAsync(req, ct).ConfigureAwait(false);
            case "POST /offline/challenge": return await OfflineChallengeAsync(req, ct).ConfigureAwait(false);
            case "POST /offline/verify": return await OfflineVerifyAsync(req, ct).ConfigureAwait(false);
            case "POST /offline/totp": return await OfflineTotpAsync(req, ct).ConfigureAwait(false);
            case "POST /passkey/authenticate/options": return await PasskeyAuthenticateOptionsAsync(req, ct).ConfigureAwait(false);
            case "POST /passkey/authenticate/verify": return await PasskeyAuthenticateVerifyAsync(req, ct).ConfigureAwait(false);
            case "POST /passkey/login/options": return await PasskeyLoginOptionsAsync(req, ct).ConfigureAwait(false);
            case "POST /passkey/login/verify": return await PasskeyLoginVerifyAsync(req, ct).ConfigureAwait(false);
            case "POST /passkey/register/options": return await PasskeyRegisterOptionsAsync(req, ct).ConfigureAwait(false);
            case "POST /passkey/register/verify": return await PasskeyRegisterVerifyAsync(req, ct).ConfigureAwait(false);
            case "GET /passkey/credentials": return await PasskeyCredentialsAsync(req, ct).ConfigureAwait(false);
        }
        const string prefix = "/passkey/credentials/";
        if (method == "DELETE" && path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && path.Length > prefix.Length && !path[prefix.Length..].Contains('/'))
        {
            return await DeleteCredentialAsync(req, Uri.UnescapeDataString(path[prefix.Length..]), ct).ConfigureAwait(false);
        }
        return null;
    }

    // ... private route handlers omitted
}

// ─────────────────────────────────────────────────────────────
// From TouchQue.AspNetCore/ServiceCollectionExtensions.cs — services.AddTouchQue()
// ─────────────────────────────────────────────────────────────

using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace TouchQue.AspNetCore;

/// <summary>Registers TouchQue in an ASP.NET Core (or any Microsoft.Extensions.Hosting) app.</summary>
public static class TouchQueServiceCollectionExtensions
{
    /// <summary>The named HttpClient the client uses (IHttpClientFactory).</summary>
    public const string HttpClientName = "TouchQue";

    /// <summary>
    /// Registers <see cref="TouchQueClient"/> as a singleton, its options (from
    /// <paramref name="configure"/>, then the environment: TQ_API_KEY, TQ_API_SECRET,
    /// TQ_API_URL), an in-process <see cref="IWebhookReplayCache"/>, and the named
    /// HttpClient <c>TouchQue</c> (never following redirects; connections recycled every 5
    /// minutes). The returned builder adds handlers (logging, a proxy). Do not add a retry
    /// handler: every request is signed with a one-time nonce, so a replay is refused;
    /// retry <see cref="TouchQueNetworkException"/> at the call site instead.
    /// </summary>
    public static IHttpClientBuilder AddTouchQue(this IServiceCollection services, Action<TouchQueOptions>? configure = null)
    {
        var options = services.AddOptions<TouchQueOptions>();
        if (configure is not null) options.Configure(configure);
        services.TryAddSingleton<IWebhookReplayCache, MemoryReplayCache>();
        services.TryAddSingleton(sp =>
        {
            var o = sp.GetRequiredService<IOptions<TouchQueOptions>>().Value;
            var http = sp.GetRequiredService<IHttpClientFactory>().CreateClient(HttpClientName);
            http.Timeout = Timeout.InfiniteTimeSpan; // the client applies TouchQueOptions.Timeout per request
            return new TouchQueClient(o, http);
        });
        return services.AddHttpClient(HttpClientName)
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
            });
    }
}

/// <summary>Helpers shared by the ASP.NET Core integrations.</summary>
public static class TouchQueHttpContextExtensions
{
    internal const string ApprovalKey = "TouchQue.Approval";
    internal const string McpClaimsKey = "TouchQue.McpClaims";

    /// <summary>The approval of the current request (set by <c>RequireTouchQue</c>), or null.</summary>
    public static Approval? GetTouchQueApproval(this HttpContext context) =>
        context.Items.TryGetValue(ApprovalKey, out var a) ? a as Approval : null;

    /// <summary>The checked MCP token of the current request (set by <c>RequireTouchQueMcp</c>), or null.</summary>
    public static McpAuthClaims? GetTouchQueMcpClaims(this HttpContext context) =>
        context.Items.TryGetValue(McpClaimsKey, out var c) ? c as McpAuthClaims : null;

    /// <summary>
    /// The signed-in user as TouchQue knows them: the email claim, else the name
    /// identifier (sub), else the name.
    /// </summary>
    public static string? TouchQueUser(this ClaimsPrincipal? user)
    {
        if (user?.Identity?.IsAuthenticated != true) return null;
        return First(user, "email", ClaimTypes.Email) ?? First(user, "sub", ClaimTypes.NameIdentifier) ?? First(user, "name", ClaimTypes.Name) ?? user.Identity?.Name;
    }

    private static string? First(ClaimsPrincipal user, params string[] types)
    {
        foreach (var t in types)
        {
            var v = user.FindFirst(t)?.Value;
            if (!string.IsNullOrEmpty(v)) return v;
        }
        return null;
    }

    /// <summary>
    /// The END user's IP (IPv4-mapped addresses as IPv4). Behind a proxy, add
    /// <c>app.UseForwardedHeaders()</c> with your proxy as a known proxy first.
    /// </summary>
    public static string? TouchQueClientIp(this HttpContext context)
    {
        var ip = context.Connection.RemoteIpAddress;
        if (ip is null) return null;
        if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
        return ip.ToString();
    }

    internal static string? Header(this HttpRequest request, string name)
    {
        var v = request.Headers[name];
        return v.Count == 0 ? null : v.ToString();
    }
}

// ─────────────────────────────────────────────────────────────
// From TouchQue.AspNetCore/RequireTouchQue.cs — .RequireTouchQue("ACTION") / [RequireTouchQue("ACTION")]
// ─────────────────────────────────────────────────────────────

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;

namespace TouchQue.AspNetCore;

/// <summary>What a guard callback sees: the request and, on a minimal API endpoint, its bound arguments.</summary>
public sealed class TouchQueGuardContext
{
    internal TouchQueGuardContext(HttpContext httpContext, IReadOnlyList<object?> arguments)
    {
        HttpContext = httpContext;
        Arguments = arguments;
    }

    public HttpContext HttpContext { get; }

    /// <summary>The endpoint's bound arguments (minimal APIs) or action arguments (MVC).</summary>
    public IReadOnlyList<object?> Arguments { get; }

    /// <summary>The first bound argument of type <typeparamref name="T"/>, e.g. the request body.</summary>
    public T? Argument<T>() => Arguments.OfType<T>().FirstOrDefault();
}

/// <summary>Options of <c>RequireTouchQue</c>.</summary>
public sealed class TouchQueGuardOptions
{
    /// <summary>Who approves (default: the signed-in user's email, else sub, else name). For a login route, return whoever just passed your password check.</summary>
    public Func<TouchQueGuardContext, string?>? User { get; set; }

    /// <summary>Transaction details shown on the phone. Build them from server-side state or validated input.</summary>
    public Func<TouchQueGuardContext, IReadOnlyList<LoginDetail>?>? Details { get; set; }

    public Func<TouchQueGuardContext, string?>? ReferenceId { get; set; }

    /// <summary>For your TouchQue Actions only (<c>event.context</c>): roles, plan, amount… Never shown on the phone.</summary>
    public Func<TouchQueGuardContext, IReadOnlyDictionary<string, object?>?>? Context { get; set; }

    /// <summary>
    /// Silent sign-ins (default off): a new attempt whose browser sent its device-bound
    /// key proof (<c>X-TouchQue-Browser</c>) first asks TouchQue whether anything is new;
    /// if nothing is, the endpoint runs at once with no push.
    /// </summary>
    public SilentSignInOptions? SilentSignIn { get; set; }

    /// <summary>False: never show the first-time linking QR.</summary>
    public bool Enroll { get; set; } = true;
}

/// <summary>
/// One line per protected endpoint. Until the user approves on their phone this answers
/// <c>202 {"touchque": step, "token": "..."}</c>; your page shows the step in its own
/// design and sends the same request again with header <c>X-TouchQue-Token</c>. Once
/// approved the endpoint runs ONCE, with <c>HttpContext.GetTouchQueApproval()</c> set.
/// <code>
/// app.MapPost("/transfer", (Transfer t, HttpContext http) => …)
///    .RequireAuthorization()
///    .RequireTouchQue("SEND_MONEY", o => o.Details = c => [("Amount", c.Argument&lt;Transfer&gt;()!.Amount)]);
/// </code>
/// </summary>
public static class RequireTouchQueExtensions
{
    public static TBuilder RequireTouchQue<TBuilder>(this TBuilder builder, string action, Action<TouchQueGuardOptions>? configure = null)
        where TBuilder : IEndpointConventionBuilder
    {
        var options = new TouchQueGuardOptions();
        configure?.Invoke(options);
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var guardContext = new TouchQueGuardContext(ctx.HttpContext, ctx.Arguments.ToList());
            var result = await TouchQueGuardRunner.RunAsync(guardContext, action, options).ConfigureAwait(false);
            return result is null ? await next(ctx).ConfigureAwait(false) : result;
        });
        return builder;
    }
}

internal static class TouchQueGuardRunner
{
    /// <summary>Null: approved, run the endpoint. Otherwise the answer to send.</summary>
    public static async Task<IResult?> RunAsync(TouchQueGuardContext context, string action, TouchQueGuardOptions options)
    {
        var http = context.HttpContext;
        var client = http.RequestServices.GetRequiredService<TouchQueClient>();
        var req = http.Request;
        var result = await Guard.RunAsync(client, new GuardInput
        {
            User = options.User is null ? http.User.TouchQueUser() : options.User(context),
            Action = action,
            Details = options.Details?.Invoke(context),
            ReferenceId = options.ReferenceId?.Invoke(context),
            Ip = http.TouchQueClientIp(),
            UserAgent = req.Header("User-Agent"),
            Token = req.Header(Guard.TokenHeader),
            Offline = req.Header(Guard.OfflineHeader) is "1" or "true",
            Code = req.Header(Guard.CodeHeader),
            CodeType = req.Header(Guard.CodeTypeHeader),
            Enroll = options.Enroll,
            BrowserProof = options.SilentSignIn is null ? null : req.Header(Guard.BrowserHeader),
            SilentSignIn = options.SilentSignIn,
            Context = options.Context?.Invoke(context),
        }, http.RequestAborted).ConfigureAwait(false);
        if (result.Approved is not null)
        {
            http.Items[TouchQueHttpContextExtensions.ApprovalKey] = result.Approved;
            return null;
        }
        http.Response.Headers.CacheControl = "no-store";
        if (result.RetryAfter is { } ra) http.Response.Headers.RetryAfter = ra.ToString(System.Globalization.CultureInfo.InvariantCulture);
        return Results.Json(result.Body, statusCode: result.Status);
    }
}

/// <summary>
/// MVC: <c>[RequireTouchQue("SEND_MONEY")]</c> on a controller action. Until the user
/// approves on the phone it answers 202 with the step; once approved the action runs
/// once with <c>HttpContext.GetTouchQueApproval()</c> set. For details, a login user or
/// silent sign-ins, register a named <see cref="TouchQueGuardOptions"/> with
/// <c>services.Configure&lt;TouchQueGuardOptions&gt;("SEND_MONEY", o => …)</c> (the name is the action).
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false)]
public sealed class RequireTouchQueAttribute : Attribute, IAsyncActionFilter
{
    public RequireTouchQueAttribute(string action) => Action = action;

    public string Action { get; }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var options = context.HttpContext.RequestServices.GetService<Microsoft.Extensions.Options.IOptionsMonitor<TouchQueGuardOptions>>()?.Get(Action)
            ?? new TouchQueGuardOptions();
        var guardContext = new TouchQueGuardContext(context.HttpContext, context.ActionArguments.Values.ToList());
        var result = await TouchQueGuardRunner.RunAsync(guardContext, Action, options).ConfigureAwait(false);
        if (result is null)
        {
            await next().ConfigureAwait(false);
            return;
        }
        context.Result = new TouchQueResultAdapter(result);
    }

    private sealed class TouchQueResultAdapter : IActionResult
    {
        private readonly IResult _result;

        public TouchQueResultAdapter(IResult result) => _result = result;

        public Task ExecuteResultAsync(ActionContext context) => _result.ExecuteAsync(context.HttpContext);
    }
}

// ─────────────────────────────────────────────────────────────
// From TouchQue.AspNetCore/TouchQueRelayEndpoints.cs — app.MapTouchQueRelay("/touchque", options)
// ─────────────────────────────────────────────────────────────

using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using TouchQue.Relay;

namespace TouchQue.AspNetCore;

/// <summary>
/// Every relay route a frontend (<c>@touchque/web</c>) needs: POST /login, enrollment,
/// offline codes and the passkey ceremonies. See <see cref="RelayHandler{TRequest}"/> for the
/// routes and security rules.
/// <code>
/// app.MapTouchQueRelay("/touchque", new RelayOptions&lt;HttpContext&gt;
/// {
///     GetUserId = http => http.User.TouchQueUser(),
///     GetLoginUser = http => http.Session.GetString("password_verified_user"),
///     OnAuthenticated = async (http, response, info) => { /* sign the user in */ },
///     SilentSignIn = new(),
/// });
/// </code>
/// The client IP is <c>HttpContext.Connection.RemoteIpAddress</c>: behind a load balancer,
/// add <c>app.UseForwardedHeaders()</c> with your proxy as a known proxy first.
/// </summary>
public static class TouchQueRelayEndpoints
{
    private const int MaxBodyBytes = 64 * 1024;

    public static RouteGroupBuilder MapTouchQueRelay(this IEndpointRouteBuilder endpoints, string prefix, RelayOptions<HttpContext>? options = null)
    {
        var client = endpoints.ServiceProvider.GetRequiredService<TouchQueClient>();
        var handler = new RelayHandler<HttpContext>(client, options ?? new RelayOptions<HttpContext> { GetUserId = http => http.User.TouchQueUser() });
        var group = endpoints.MapGroup(prefix);
        var mount = "/" + prefix.Trim('/');
        RequestDelegate run = http => HandleAsync(handler, mount, http);
        foreach (var path in new[]
        {
            "/enroll/start", "/login", "/offline/challenge", "/offline/verify", "/offline/totp", "/passkey/authenticate/options",
            "/passkey/authenticate/verify", "/passkey/login/options", "/passkey/login/verify", "/passkey/register/options", "/passkey/register/verify",
        })
        {
            group.MapPost(path, run);
        }
        group.MapGet("/enroll/status", run);
        group.MapGet("/passkey/credentials", run);
        group.MapDelete("/passkey/credentials/{id}", run);
        return group;
    }

    private static async Task HandleAsync(RelayHandler<HttpContext> handler, string mount, HttpContext http)
    {
        var request = http.Request;
        var body = new JsonObject();
        if (request.ContentLength is > MaxBodyBytes)
        {
            await WriteAsync(http, new RelayResponse(413, new JsonObject { ["error"] = "body_too_large" })).ConfigureAwait(false);
            return;
        }
        if (HttpMethods.IsPost(request.Method) && request.HasJsonContentType())
        {
            try
            {
                body = await JsonSerializer.DeserializeAsync<JsonNode>(request.Body, cancellationToken: http.RequestAborted).ConfigureAwait(false) as JsonObject ?? new JsonObject();
            }
            catch (JsonException)
            {
                await WriteAsync(http, new RelayResponse(400, new JsonObject { ["error"] = "invalid_json" })).ConfigureAwait(false);
                return;
            }
        }
        var path = request.Path.Value ?? "/";
        if (mount != "/" && path.StartsWith(mount, StringComparison.OrdinalIgnoreCase)) path = path[mount.Length..];
        var response = await handler.HandleAsync(new RelayRequest<HttpContext>
        {
            Method = request.Method,
            Path = path,
            Body = body,
            Ip = http.TouchQueClientIp() ?? "",
            UserAgent = request.Header("User-Agent"),
            Header = request.Header,
            Native = http,
        }, http.RequestAborted).ConfigureAwait(false);
        await WriteAsync(http, response ?? new RelayResponse(404, new JsonObject { ["error"] = "not_found" })).ConfigureAwait(false);
    }

    internal static async Task WriteAsync(HttpContext http, RelayResponse response)
    {
        http.Response.StatusCode = response.Status;
        foreach (var (name, value) in response.Headers) http.Response.Headers.Append(name, value);
        http.Response.ContentType = "application/json; charset=utf-8";
        await http.Response.WriteAsync(response.Body.ToJsonString(TouchQue.Internal.Json.Options), http.RequestAborted).ConfigureAwait(false);
    }
}
