// Touchque .NET SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-dotnet/src/Touchque/{TouchqueOptions.cs,TouchqueClient.cs,Flow/Steps.cs,Flow/Guard.cs,
// Crypto/ApprovalProof.cs,Resources/Login.cs} plus the public part of Relay/RelayHandler.cs, and
// src/Touchque.AspNetCore/{ServiceCollectionExtensions.cs,RequireTouchque.cs,TouchqueRelayEndpoints.cs}.
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

using Microsoft.Extensions.Logging;

namespace Touchque;

/// <summary>
/// Settings of a <see cref="TouchqueClient"/>. Anything left null falls back to the
/// environment: <c>TQ_API_KEY</c>, <c>TQ_API_SECRET</c> and <c>TQ_API_URL</c>
/// (default <c>https://api.touchque.com</c>).
/// </summary>
public sealed class TouchqueOptions
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
        var (apiKey, apiSecret) = Keys();
        var baseUrl = BaseUrl ?? Environment.GetEnvironmentVariable("TQ_API_URL");
        if (string.IsNullOrEmpty(baseUrl)) baseUrl = DefaultBaseUrl;
        if (string.IsNullOrEmpty(apiKey) || string.IsNullOrEmpty(apiSecret))
        {
            throw new TouchqueConfigException("Set TQ_API_KEY and TQ_API_SECRET (or ApiKey and ApiSecret in TouchqueOptions).");
        }
        if (!apiKey.StartsWith("tq_", StringComparison.Ordinal))
        {
            throw new TouchqueConfigException("ApiKey must start with \"tq_\". Did you accidentally swap ApiKey and ApiSecret?");
        }
        AssertSafeBaseUrl(baseUrl, "BaseUrl");
        return new ResolvedOptions(apiKey, apiSecret, baseUrl.TrimEnd('/'), Timeout, new Internal.SdkLog(Logger, Debug));
    }

    /// <summary>The key and secret: these options, else TQ_API_KEY / TQ_API_SECRET.</summary>
    private (string? ApiKey, string? ApiSecret) Keys() =>
        (ApiKey ?? Environment.GetEnvironmentVariable("TQ_API_KEY"), ApiSecret ?? Environment.GetEnvironmentVariable("TQ_API_SECRET"));

    /// <summary>No API key or secret here or in the environment: no client can be built.</summary>
    internal bool KeysMissing()
    {
        var (apiKey, apiSecret) = Keys();
        return string.IsNullOrEmpty(apiKey) || string.IsNullOrEmpty(apiSecret);
    }

    /// <summary>Allow plaintext http only for localhost / loopback (local development).</summary>
    internal static void AssertSafeBaseUrl(string url, string name)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            throw new TouchqueConfigException($"{name} is not a valid URL: {url}");
        }
        if (uri.Scheme == Uri.UriSchemeHttps) return;
        if (uri.Scheme == Uri.UriSchemeHttp)
        {
            if (IsLoopback(uri.Host)) return;
            throw new TouchqueConfigException(
                $"Refusing a plaintext http:// {name} for \"{uri.Host}\". The API key and request signature would be sent in the clear: use https://.");
        }
        throw new TouchqueConfigException($"{name} must be http(s): {url}");
    }

    internal static bool IsLoopback(string host)
    {
        var h = host.ToLowerInvariant();
        return h is "localhost" or "127.0.0.1" or "::1" or "[::1]";
    }
}

internal sealed record ResolvedOptions(string ApiKey, string ApiSecret, string BaseUrl, TimeSpan Timeout, Internal.SdkLog Log);

// ─────────────────────────────────────────────────────────────
// From TouchqueClient.cs — the client (StartAsync/CheckAsync/CompleteAsync and the resources)
// ─────────────────────────────────────────────────────────────

using Touchque.Internal;

namespace Touchque;

/// <summary>
/// The Touchque client. Every call is signed with your API secret, so it belongs on
/// your server; browser pieces relay through it.
/// <code>
/// // TQ_API_KEY=tq_…  TQ_API_SECRET=…
/// var tq = new TouchqueClient();
/// var step = await tq.StartAsync("SEND_MONEY", new StartOptions { User = "jane@acme.com", Details = [("Amount", "250 EUR")] });
/// </code>
/// Thread-safe; create one and reuse it (in ASP.NET Core, <c>services.AddTouchque()</c>).
/// </summary>
public sealed class TouchqueClient
{
    public const string DefaultBaseUrl = TouchqueOptions.DefaultBaseUrl;

    private readonly TouchqueHttp _http;

    /// <summary>A client from the environment (<c>TQ_API_KEY</c>, <c>TQ_API_SECRET</c>, <c>TQ_API_URL</c>).</summary>
    public TouchqueClient() : this(new TouchqueOptions()) { }

    /// <param name="options">Anything left null falls back to the environment.</param>
    /// <param name="httpClient">
    /// Your own HttpClient (e.g. from IHttpClientFactory). Configure it NOT to follow
    /// redirects: a redirect could replay the signed headers to another host.
    /// </param>
    public TouchqueClient(TouchqueOptions options, HttpClient? httpClient = null)
    {
        var resolved = options.Resolve();
        _http = new TouchqueHttp(resolved, httpClient);
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
        SafeGuard = new SafeGuardResource(_http);
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

    /// <summary>Touchque Actions: your own code in the approval pipeline (deploy, test, dry run, logs).</summary>
    public ActionsResource Actions { get; }

    /// <summary>Silent sign-ins: should this sign-in ask the phone, and which browsers Touchque knows.</summary>
    public RiskResource Risk { get; }

    /// <summary>Never Locked Out: move a user whose phone is gone to a new phone, with colleagues vouching.</summary>
    public RecoveryResource Recovery { get; }

    /// <summary>Help desk: IT working on a person's account in the open, and checks on their phone before sensitive actions.</summary>
    public AssistResource Assist { get; }

    /// <summary>AI agents as identities of their own. The agent itself uses <see cref="TouchqueAgent"/>.</summary>
    public AgentsResource Agents { get; }

    /// <summary>Touchque Login: your customers' accounts, roles, organizations, apps, connections (Management API).</summary>
    public IdentityResource Identity { get; }

    /// <summary>Mobile SDK: your own iOS/Android app approves for your users.</summary>
    public MobileResource Mobile { get; }

    /// <summary>Pairing a browser by QR code: the phone that scans it is the one asked to approve.</summary>
    public QrPairingsResource QrPairings { get; }

    /// <summary>Safe Guard: Safe transactions approved on the approver's phone, for TouchqueSafeGuard.</summary>
    public SafeGuardResource SafeGuard { get; }

    internal string ApiSecret => _http.ApiSecret;

    internal SdkLog Log => _http.Log;

    internal string BaseUrl => _http.BaseUrl;

    /// <summary>
    /// Starts an approval and returns at once: show the step in your UI. <c>waiting</c>
    /// with <c>Number</c>: show the number, the user picks it on the phone. <c>enroll</c>:
    /// show <c>Enroll.QrCodeDataUrl</c> so the user links the Touchque app first.
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
    /// <exception cref="TouchqueApprovalMismatchException">The approval is for a different user, action or transaction.</exception>
    /// <exception cref="TouchqueApiException">409 already_used, not_approved, rejected, expired or revoked.</exception>
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

using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Touchque.Internal;

namespace Touchque;

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
    /// <summary>When the QR stops working (ISO 8601).</summary>
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
    /// <summary>The phone's signature over what it showed (<see cref="Touchque.ApprovalProof"/>).</summary>
    public JsonObject? ApprovalProof { get; init; }
    /// <summary>
    /// Vishing Shield: approved during a call. Let the user in, but treat the session as
    /// limited: critical actions are refused until APPROVAL_RECONFIRMED, and APPROVAL_REVOKED means end it.
    /// </summary>
    public bool? Provisional { get; init; }
    public bool? Revoked { get; init; }
    public string? RevokeReason { get; init; }
    public string? ReconfirmedAt { get; init; }
    /// <summary>Silent sign-ins: why Touchque let this known browser in (nothing went to the phone).</summary>
    public IReadOnlyList<RiskReason>? Reasons { get; init; }
}

/// <summary>What to start an approval for.</summary>
public sealed record StartOptions
{
    /// <summary>The user in YOUR system.</summary>
    public required string User { get; init; }
    public IReadOnlyList<LoginDetail>? Details { get; init; }
    public string? ReferenceId { get; init; }
    /// <summary>The end user's IP: sent with the push, and with a first-time QR (the phone shows where it was asked for).</summary>
    public string? Ip { get; init; }
    /// <summary>The end user's User-Agent, sent like <see cref="Ip"/>.</summary>
    public string? UserAgent { get; init; }
    /// <summary>Silent sign-ins: the <c>X-Touchque-Browser</c> header, passed through untouched.</summary>
    public string? BrowserProof { get; init; }
    /// <summary>For your Touchque Actions only (<c>event.context</c>).</summary>
    public IReadOnlyDictionary<string, object?>? Context { get; init; }
    /// <summary>
    /// False: never show the first-time linking QR (a typed username proves nothing). A user with no
    /// phone then gets <c>enroll</c> with reason <c>enrollment_off</c>.
    /// </summary>
    public bool Enroll { get; init; } = true;
}

/// <summary>What an approved request must be for (checked by <see cref="TouchqueClient.CompleteAsync"/>).</summary>
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

    public static async Task<Step> StartAsync(TouchqueClient client, string action, StartOptions o, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(o.User)) throw new TouchqueConfigException("StartAsync() needs the user id");
        var norm = Touchque.Details.Normalize(o.Details);
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
        catch (TouchqueApiException e)
        {
            var code = e.Code ?? e.Error;
            var caseCode = e.CaseCode;
            if (e.Status == 404 && (code == "device_not_linked" || e.Message.Contains("linked device", StringComparison.OrdinalIgnoreCase)))
            {
                // No QR may be shown here: say why, so a page stops instead of polling a step it cannot finish.
                return o.Enroll ? await EnrollStepAsync(client, o, ct).ConfigureAwait(false) : new Step { State = "enroll", Reason = "enrollment_off" };
            }
            if (e.Status == 423) return new Step { State = "frozen", RetryAfter = e.RetryAfter, CaseCode = caseCode };
            if (e.Status == 429) return new Step { State = "rate_limited", RetryAfter = e.RetryAfter, CaseCode = caseCode };
            if (e.Status == 400 && (code == "unknown_action" || e.Message.Contains("invalid action type", StringComparison.OrdinalIgnoreCase)))
            {
                throw new TouchqueConfigException($"Unknown action \"{action}\". Create it once with client.ActionTypes.DefineAsync(\"{action}\") or in the dashboard (Action Types).");
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

    /// <summary>
    /// First-time linking. Never unlinks a phone: a secret is only re-issued when the account is confirmed NOT linked.
    /// The QR is asked for with the end user's IP and User-Agent the login request carried, so the phone shows where it was asked for.
    /// </summary>
    private static async Task<Step> EnrollStepAsync(TouchqueClient client, StartOptions o, CancellationToken ct)
    {
        var user = o.User;
        try
        {
            var gen = await client.Auth.GenerateSecretAsync(user, clientIp: o.Ip, userAgent: o.UserAgent, ct).ConfigureAwait(false);
            return new Step { State = "enroll", Enroll = new StepEnroll { QrCodeDataUrl = gen.QrCodeDataUrl, RecoveryCodes = gen.RecoveryCodes, ExpiresAt = QrExpiresAt(gen.ExpiresAt, gen.TtlMs) } };
        }
        catch (TouchqueApiException e) when (e.Status == 409)
        {
            TouchqueUser? current = null;
            try
            {
                current = await client.Auth.GetUserAsync(user, ct).ConfigureAwait(false);
            }
            catch (TouchqueApiException)
            {
                // unknown user: reset below
            }
            if (current is not null && (current.Used || !string.IsNullOrEmpty(current.DeviceId)))
            {
                return new Step { State = "enroll", Reason = "already_linked" };
            }
            var reset = await client.Auth.ResetSecretAsync(user, clientIp: o.Ip, userAgent: o.UserAgent, ct).ConfigureAwait(false);
            return new Step { State = "enroll", Enroll = new StepEnroll { QrCodeDataUrl = reset.QrCodeDataUrl, RecoveryCodes = reset.RecoveryCodes, ExpiresAt = QrExpiresAt(reset.ExpiresAt, reset.TtlMs) } };
        }
    }

    /// <summary>When a first-time QR stops working: the API's expiresAt when it is ISO 8601, else now + ttlMs, else unknown.</summary>
    private static string? QrExpiresAt(string? expiresAt, long? ttlMs)
    {
        if (EpochMillis(expiresAt) is not null) return expiresAt;
        return ttlMs is > 0 ? Iso(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + ttlMs.Value) : null;
    }

    private static readonly string[] IsoFormats = { "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF'Z'", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFFzzz" };

    /// <summary>An ISO 8601 date-time with an offset (<c>Z</c> or <c>+03:00</c>) in ms since the epoch, or null.</summary>
    internal static long? EpochMillis(string? iso) =>
        !string.IsNullOrEmpty(iso) && DateTimeOffset.TryParseExact(iso, IsoFormats, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var at)
            ? at.ToUnixTimeMilliseconds()
            : null;

    /// <summary>ms since the epoch as ISO 8601 in UTC with milliseconds, like JavaScript's toISOString.</summary>
    internal static string Iso(long epochMillis) =>
        DateTimeOffset.FromUnixTimeMilliseconds(epochMillis).UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    public static async Task<Step> CheckAsync(TouchqueClient client, string requestId, CancellationToken ct)
    {
        var s = await client.Login.StatusAsync(requestId, ct).ConfigureAwait(false);
        var state = s.Status == "PENDING" && s.RequiresPasskey ? "passkey_required" : StateMap.GetValueOrDefault(s.Status, "waiting");
        // The request's live expiry: a Vishing Shield escalation to a passkey extends it.
        return new Step
        {
            State = state, RequestId = requestId, ExpiresAt = string.IsNullOrEmpty(s.ExpiresAt) ? null : s.ExpiresAt,
            Assurance = state == "approved" ? s.Assurance : null,
        };
    }

    public static async Task<Approval> CompleteAsync(TouchqueClient client, string requestId, CompleteExpectations expect, CancellationToken ct)
    {
        var res = await client.Login.ConsumeAsync(requestId, ct).ConfigureAwait(false);
        var sameUser = string.Equals(res.ExternalUsername, expect.User, StringComparison.OrdinalIgnoreCase);
        var sameDetails = Touchque.Details.Digest(expect.Details) == Touchque.Details.Digest(res.Details);
        // An empty reference is no reference: StartAsync does not send one, so Touchque keeps null.
        var sameRef = (string.IsNullOrEmpty(res.ReferenceId) ? null : res.ReferenceId) == (string.IsNullOrEmpty(expect.ReferenceId) ? null : expect.ReferenceId);
        if (!sameUser || res.Type != expect.Action || !sameDetails || !sameRef)
        {
            throw new TouchqueApprovalMismatchException("this approval is for a different user, action or transaction.");
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

using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Touchque.Internal;

namespace Touchque;

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
    /// <summary><c>X-Touchque-Token</c>: the token from the last answer.</summary>
    public string? Token { get; init; }
    /// <summary><c>X-Touchque-Offline: 1</c>: switch to offline approval.</summary>
    public bool Offline { get; init; }
    /// <summary><c>X-Touchque-Code</c>: the code from the phone.</summary>
    public string? Code { get; init; }
    /// <summary><c>X-Touchque-Code-Type</c>: totp for the rolling time-based code.</summary>
    public string? CodeType { get; init; }
    /// <summary>
    /// False: never show the first-time linking QR. A user with no phone then gets 202
    /// <c>{"state": "enroll", "reason": "enrollment_off"}</c>.
    /// </summary>
    public bool Enroll { get; init; } = true;
    /// <summary><c>X-Touchque-Browser</c>: the browser's device-bound key proof.</summary>
    public string? BrowserProof { get; init; }
    /// <summary>Null: silent sign-ins off.</summary>
    public SilentSignInOptions? SilentSignIn { get; init; }
    /// <summary>For your Touchque Actions only (<c>event.context</c>).</summary>
    public IReadOnlyDictionary<string, object?>? Context { get; init; }

    /// <summary>
    /// Called at most once, only for the token of a first-time QR (<c>enroll</c> with its expiry),
    /// right before the guard starts something instead of answering "keep the QR": a silent check
    /// or a push once the phone is linked, or a new QR once the old one expired, is about to, or is
    /// gone. A result is answered as it is and nothing starts. Relays charge the start here like a
    /// fresh attempt, so a status poll never starts anything on the poll budget.
    /// </summary>
    public Func<Task<GuardResult?>>? BeforeStart { get; init; }
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

    /// <summary>
    /// The headers of a refused answer (status 400 or more): <c>X-Touchque-State</c>, and
    /// <c>X-Touchque-Reason</c> when the step has a reason; none otherwise. <c>@touchque/web</c>
    /// reads the step from them when a body has no <c>touchque</c> (an ErrorBody's string, say).
    /// </summary>
    public IReadOnlyDictionary<string, string> RefusalHeaders
    {
        get
        {
            var headers = new Dictionary<string, string>();
            if (Status < 400 || string.IsNullOrEmpty(Step?.State)) return headers;
            headers[Guard.StateHeader] = Step.State;
            if (!string.IsNullOrEmpty(Step.Reason)) headers[Guard.ReasonHeader] = Step.Reason;
            return headers;
        }
    }
}

/// <summary>A refused answer (status 400 or more), as an adapter's <c>ErrorBody</c> callback sees it.</summary>
public sealed record GuardRefusal
{
    public int Status { get; init; }
    /// <summary><c>error.code</c> when the guard set one, else the step's reason, else its state.</summary>
    public string Code { get; init; } = "";
    /// <summary><c>error.message</c> when set, else a sentence for the state.</summary>
    public string Message { get; init; } = "";
    /// <summary>The step as it would be sent (<c>touchque</c>).</summary>
    public JsonObject Touchque { get; init; } = new();

    /// <summary>The refusal in a guard's answer, or null for a 202 step or an approval.</summary>
    public static GuardRefusal? From(GuardResult result)
    {
        if (result.Approved is not null || result.Status < 400 || result.Body is null) return null;
        var step = Guard.StepOf(result) as JsonObject;
        var error = result.Body["error"];
        var state = Json.Str(step, "state");
        var code = Json.Str(error, "code");
        if (string.IsNullOrEmpty(code)) code = Json.Str(step, "reason");
        if (string.IsNullOrEmpty(code)) code = state;
        var message = Json.Str(error, "message");
        if (string.IsNullOrEmpty(message))
        {
            message = state switch
            {
                "rejected" => "The approval was rejected.",
                "expired" => "The approval expired. Try again.",
                "frozen" => "Too many rejected approvals. Try again later.",
                "rate_limited" => "Too many attempts. Try again later.",
                _ => "The approval was refused.",
            };
        }
        return new GuardRefusal { Status = result.Status, Code = code ?? "", Message = message, Touchque = (step?.DeepClone() as JsonObject) ?? new JsonObject() };
    }
}

/// <summary>
/// A guard result that is not an approval, as every adapter sends it: the status, the headers
/// (<c>Cache-Control: no-store</c>, <c>Retry-After</c> on 423 and 429, <c>X-Touchque-State</c> and
/// <c>X-Touchque-Reason</c> on a refusal) and the JSON body (null: JSON <c>null</c>).
/// </summary>
internal sealed record GuardAnswer(int Status, IReadOnlyList<KeyValuePair<string, string>> Headers, JsonNode? Body);

/// <summary>
/// Framework-agnostic step-up guard (ASP.NET Core's <c>RequireTouchque</c> is a thin
/// wrapper over it). Contract, the same in every Touchque server SDK:
/// <list type="bullet">
/// <item>1st request → 202 <c>{"touchque": step, "token": ...}</c>: show the step in your UI;</item>
/// <item>repeat with the token (header <c>X-Touchque-Token</c>) → 202 while waiting, then the protected action runs once;
/// a waiting poll repeats the request's <c>expiresAt</c>;</item>
/// <item>while the first-time linking QR is up → 202 <c>{"touchque": {"state": "enroll", "expiresAt": ...}}</c> without
/// <c>enroll</c>: keep showing that QR; a new one comes with <c>enroll.qrCodeDataUrl</c> about 15 s before it expires;</item>
/// <item>refused → 403 / 408 / 423 / 429 <c>{"touchque": {"state": ...}}</c>.</item>
/// </list>
/// </summary>
public static class Guard
{
    public const string TokenHeader = "X-Touchque-Token";
    public const string OfflineHeader = "X-Touchque-Offline";
    public const string CodeHeader = "X-Touchque-Code";
    public const string CodeTypeHeader = "X-Touchque-Code-Type";
    public const string BrowserHeader = "X-Touchque-Browser";
    /// <summary>On every refused answer (status 400 or more): the step's state.</summary>
    public const string StateHeader = "X-Touchque-State";
    /// <summary>On a refused answer whose step has a reason: that reason.</summary>
    public const string ReasonHeader = "X-Touchque-Reason";

    private const long TokenTtlMs = 10 * 60 * 1000;
    /// <summary>A first-time QR this close to its expiry is replaced instead of kept: the user could not scan it in time.</summary>
    private const long EnrollRenewMs = 15 * 1000;
    /// <summary>A real proof is a few hundred characters; anything far larger is not one.</summary>
    private const int MaxBrowserProof = 4096;

    private static readonly Dictionary<string, int> StatusOf = new()
    {
        ["waiting"] = 202, ["enroll"] = 202, ["passkey_required"] = 202, ["offline"] = 202,
        ["approved"] = 200, ["rejected"] = 403, ["blocked"] = 403, ["expired"] = 408, ["frozen"] = 423, ["rate_limited"] = 429,
    };

    private static readonly HashSet<string> Waiting = new() { "waiting", "passkey_required", "offline" };

    /// <summary>The client of <c>RunAsync(null, …)</c>: built on first use, then kept (or set with <see cref="SetDefaultClient"/>).</summary>
    private static TouchqueClient? _sharedClient;
    private static readonly object SharedClientLock = new();

    /// <summary>An ErrorBody's result is written with these when the app gives none.</summary>
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// True when this request only reads a state: it polls an approval already on its way (a
    /// valid token bound to this user/action/details, still waiting) or a first-time linking
    /// QR still up (a bound <c>enroll</c> token whose QR expires in more than 15 s), with no
    /// offline switch or typed code. Relays do not count it against the per-user push limit. A
    /// start such a poll leads to (a push once the phone is linked, a new QR) goes through
    /// <see cref="GuardInput.BeforeStart"/>, where relays charge it like a fresh attempt: every
    /// start is counted. A null <paramref name="client"/> is <see cref="DefaultClient"/>; while that
    /// cannot be built, false.
    /// </summary>
    public static bool IsStatusPoll(TouchqueClient? client, GuardInput input)
    {
        if (string.IsNullOrEmpty(input.User) || string.IsNullOrEmpty(input.Token) || input.Offline || !string.IsNullOrEmpty(input.Code)) return false;
        client ??= DefaultClientOrNull();
        if (client is null) return false;
        var claims = Steps.VerifyGuardToken(client.ApiSecret, input.Token);
        if (claims is null || !Bound(claims, input)) return false;
        var st = Json.Str(claims, "st");
        if (st == "enroll") return QrStillUp(Json.Long(claims, "ee"));
        return !string.IsNullOrEmpty(Json.Str(claims, "rid")) && Waiting.Contains(st ?? "");
    }

    /// <summary>A first-time QR that expires at <paramref name="ee"/> (ms since the epoch) can still be scanned: more than 15 s left.</summary>
    private static bool QrStillUp(long? ee) => ee is not null && DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() < ee - EnrollRenewMs;

    /// <summary>
    /// The guard's answer when no client can be built (TQ_API_KEY / TQ_API_SECRET missing): 401
    /// <c>unauthenticated</c> without a user, else 500 <c>misconfigured</c>. An adapter that
    /// builds its client on first use answers this instead of throwing.
    /// </summary>
    public static GuardResult WithoutClient(GuardInput input) => string.IsNullOrEmpty(input.User) ? Unauthenticated() : Misconfigured();

    /// <summary>
    /// The client <see cref="RunAsync"/> and <see cref="IsStatusPoll"/> use when you pass null: the
    /// one <see cref="SetDefaultClient"/> set, else one built from <c>TQ_API_KEY</c>,
    /// <c>TQ_API_SECRET</c> and <c>TQ_API_URL</c> on first use and kept. A build that fails is not
    /// kept: the next call tries again. Thread-safe. It is not the client
    /// <c>services.AddTouchque(…)</c> registers: that one also reads its options. Call it at startup
    /// to fail fast: the guard's null-client path answers 500 <c>misconfigured</c> and logs nothing,
    /// while this throws and names the problem.
    /// </summary>
    /// <exception cref="TouchqueConfigException">It cannot be built (no key or secret, say).</exception>
    public static TouchqueClient DefaultClient()
    {
        var client = Volatile.Read(ref _sharedClient);
        if (client is not null) return client;
        lock (SharedClientLock)
        {
            return _sharedClient ??= new TouchqueClient();
        }
    }

    /// <summary>
    /// Replaces the client <c>RunAsync(null, …)</c> and <c>IsStatusPoll(null, …)</c> use,
    /// process-wide: a client built with a <see cref="TouchqueOptions.Logger"/> gives that path its
    /// log lines. Null forgets it, so the next call builds one from the environment again.
    /// </summary>
    public static void SetDefaultClient(TouchqueClient? client)
    {
        lock (SharedClientLock)
        {
            Volatile.Write(ref _sharedClient, client);
        }
    }

    /// <summary><see cref="DefaultClient"/>, or null while it cannot be built.</summary>
    private static TouchqueClient? DefaultClientOrNull()
    {
        try
        {
            return DefaultClient();
        }
        catch (TouchqueConfigException)
        {
            return null;
        }
    }

    /// <summary>The step a result answers: its body's <c>touchque</c>, else its <see cref="GuardResult.Step"/> (a hook's result may carry only that).</summary>
    internal static JsonNode? StepOf(GuardResult result) =>
        result.Body?["touchque"] ?? (result.Step is null ? null : Json.ToNode(result.Step));

    /// <summary>
    /// What to send for a result that is not an approval, exactly as every adapter sends it: the
    /// guard's body, or for a refusal (400 or more) what <paramref name="errorBody"/> makes of it,
    /// written with <paramref name="jsonOptions"/> (the app's) and read back case-sensitively. A JSON
    /// object gets <c>touchque</c> set to the step (no other spelling of the key is left), anything
    /// else is sent as it is; a callback that throws, or a result that cannot be written, sends the
    /// guard's own body and logs why.
    /// </summary>
    internal static GuardAnswer Answer(GuardResult result, Func<GuardRefusal, object?>? errorBody = null, JsonSerializerOptions? jsonOptions = null, SdkLog? log = null)
    {
        if (result.Approved is not null) throw new ArgumentException("A guard answer is a step or a refusal; on approval, run your action.", nameof(result));
        var headers = new List<KeyValuePair<string, string>> { new("Cache-Control", "no-store") };
        if (result.RetryAfter is { } ra) headers.Add(new("Retry-After", ra.ToString(CultureInfo.InvariantCulture)));
        headers.AddRange(result.RefusalHeaders);
        return new GuardAnswer(result.Status, headers, AnswerBody(result, errorBody, jsonOptions, log));
    }

    private static JsonNode? AnswerBody(GuardResult result, Func<GuardRefusal, object?>? errorBody, JsonSerializerOptions? jsonOptions, SdkLog? log)
    {
        var refusal = errorBody is null ? null : GuardRefusal.From(result);
        if (refusal is null) return result.Body;
        try
        {
            // An object is decided by its JSON encoding with the app's options; what they cannot write falls back below.
            var value = errorBody!(refusal);
            var node = value is null ? null : JsonNode.Parse(JsonSerializer.SerializeToUtf8Bytes(value, value.GetType(), jsonOptions ?? WebJson));
            if (node is JsonObject o && StepOf(result) is { } step)
            {
                // The SDK's key wins, so @touchque/web still sees the state: no other spelling of it is left.
                foreach (var key in o.Select(p => p.Key).Where(k => string.Equals(k, "touchque", StringComparison.OrdinalIgnoreCase)).ToList()) o.Remove(key);
                o["touchque"] = step.DeepClone();
            }
            return node;
        }
        catch (Exception e)
        {
            log?.Error("[Touchque] errorBody failed: " + e.Message);
            return result.Body;
        }
    }

    private static bool Bound(JsonObject claims, GuardInput input) =>
        Json.Str(claims, "u") == input.User && Json.Str(claims, "a") == input.Action
        && Json.Str(claims, "d") == Details.Digest(input.Details) && Json.Str(claims, "r") == input.ReferenceId;

    /// <summary>
    /// Runs one step of the guard. Silent sign-ins: with <see cref="GuardInput.SilentSignIn"/>
    /// set, a new attempt that carries a browser proof first asks Touchque
    /// (<c>Risk.CheckAsync</c>); when it answers exactly <c>prompt: false</c> the guard
    /// approves at once with no push (<c>assurance.method</c> silent, <c>ConfirmedVia</c>
    /// SILENT, <c>RequestId</c> silent). Otherwise, and on any error, the usual push starts.
    /// First-time linking: a poll with the token of an <c>enroll</c> step only reads the link
    /// state (<c>Auth.GetUserAsync</c>). Not linked yet and the QR good for more than 15 s: 202
    /// <c>{"state": "enroll", "expiresAt": ...}</c> without <c>enroll</c>, so the page keeps its
    /// QR. Linked: the push starts. Expired or about to (15 s before): a new QR, with new recovery
    /// codes. Waiting: every poll carries the request's <c>expiresAt</c>: the status answer's (a
    /// Vishing Shield escalation extends it), else the one the token kept.
    /// A null <paramref name="client"/> is <see cref="DefaultClient"/>. While that cannot be built:
    /// 401 <c>unauthenticated</c> without a user, else 500 <c>misconfigured</c>; nothing is logged
    /// then, since the SDK's logger belongs to a client (call <see cref="DefaultClient"/> at startup to
    /// fail fast).
    /// </summary>
    public static async Task<GuardResult> RunAsync(TouchqueClient? client, GuardInput input, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(input.User)) return Unauthenticated();
        client ??= DefaultClientOrNull();
        if (client is null) return Misconfigured();
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
            // A push or passkey on its way: its polls repeat when the request expires (rx, ms since the epoch).
            if (step.State is "waiting" or "passkey_required" && Steps.EpochMillis(step.ExpiresAt) is { } requestExpiry) claims["rx"] = requestExpiry;
            // A first-time QR: its polls keep it until it expires (ee, ms since the epoch).
            if (!string.IsNullOrEmpty(step.Enroll?.QrCodeDataUrl) && Steps.EpochMillis(step.Enroll.ExpiresAt) is { } qrExpiry) claims["ee"] = qrExpiry;
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
            // When the push or passkey request expires (rx, ms since the epoch): its polls repeat it.
            var rx = bound is null ? null : Json.Long(bound, "rx");
            var requestExpiresAt = rx is { } x ? Steps.Iso(x) : null;
            var keep = new JsonObject { ["oc"] = oc, ["rid"] = rid, ["n"] = n };
            if (rx is not null) keep["rx"] = rx;

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
                    return Issue(new Step { State = "passkey_required", RequestId = rid, Number = n, ExpiresAt = requestExpiresAt }, new JsonObject { ["n"] = n });
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
                    var extra = new JsonObject { ["rid"] = rid, ["n"] = offline.ChallengeCode ?? n };
                    if (rx is not null) extra["rx"] = rx;
                    return Issue(new Step { State = "offline", Offline = offline }, extra);
                }
                catch (TouchqueApiException e)
                {
                    var code = e.Code ?? e.Error;
                    if (e.Status == 409 && code == "request_rejected") return Issue(new Step { State = "rejected", RequestId = rid, Reason = "request_rejected" });
                    // The push it would follow now waits for a passkey (Vishing Shield): no QR, run the passkey.
                    if (!string.IsNullOrEmpty(rid) && code == "passkey_required")
                    {
                        return Issue(new Step { State = "passkey_required", RequestId = rid, Number = n, ExpiresAt = requestExpiresAt }, new JsonObject { ["n"] = n });
                    }
                    if (e.Status < 500) return Issue(new Step { State = "blocked", Reason = e.Code ?? e.Error ?? "offline_unavailable" });
                    throw;
                }
            }

            // Waiting on a push / passkey, or showing the offline QR next to a push still open: poll, run once approved.
            if (bound is not null && !string.IsNullOrEmpty(rid) && Waiting.Contains(st ?? ""))
            {
                var now = await Steps.CheckAsync(client, rid, ct).ConfigureAwait(false);
                // The live expiry: the status answer's when it parses (an escalation to a passkey extends it), else rx.
                // The token re-issued below keeps the one used.
                if (Steps.EpochMillis(now.ExpiresAt) is { } live)
                {
                    requestExpiresAt = now.ExpiresAt;
                    keep["rx"] = live;
                }
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
                    catch (TouchqueApiException e) when (e.Status == 409)
                    {
                        return Issue(new Step { State = "expired", Reason = e.Code ?? "already_used" });
                    }
                }
                // The push behind the QR moved to a passkey after a tap during a call: the QR's code would be refused now.
                if (st == "offline" && now.State == "passkey_required")
                {
                    return Issue(new Step { State = "passkey_required", RequestId = rid, Number = n, ExpiresAt = requestExpiresAt }, new JsonObject { ["n"] = n });
                }
                if (st == "offline" && now.State is "waiting" or "expired")
                {
                    // Nothing changed for the user: keep showing the QR they have.
                    return Issue(new Step { State = "offline", Offline = new StepOffline { ChallengeId = oc ?? "" } }, keep);
                }
                if (now.State is "waiting" or "passkey_required")
                {
                    // "Why?": the case code stays on screen while it waits.
                    return Issue(new Step { State = now.State, RequestId = rid, Number = n, CaseCode = Json.Str(bound, "cc"), ExpiresAt = requestExpiresAt },
                        new JsonObject { ["n"] = n });
                }
                return Issue(new Step { State = now.State, RequestId = rid });
            }

            // The first-time linking QR is up (its token carries the QR's expiry, ee): one QR per enrollment, not one per poll.
            if (st == "enroll" && Json.Long(bound, "ee") is { } ee)
            {
                TouchqueUser? current;
                try
                {
                    current = await client.Auth.GetUserAsync(user, ct).ConfigureAwait(false);
                }
                catch (TouchqueApiException e) when (e.Status == 404)
                {
                    current = null; // no such user: the QR is gone, a new one below
                }
                var linked = current is not null && (current.Used || !string.IsNullOrEmpty(current.DeviceId));
                if (current is not null && !linked && QrStillUp(ee))
                {
                    // Nothing changed for the user: the page keeps the QR and recovery codes it shows.
                    return Issue(new Step { State = "enroll", ExpiresAt = Steps.Iso(ee) }, new JsonObject { ["ee"] = ee });
                }
                // Linked: the push starts below. Not linked, and the QR expired or is about to: a new QR below.
                // Either way something starts: the caller may charge it, or answer instead.
                if (input.BeforeStart is not null && await input.BeforeStart().ConfigureAwait(false) is { } instead) return instead;
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
        catch (TouchqueConfigException e)
        {
            client.Log.Error("[Touchque] " + e.Message);
            return Misconfigured();
        }
        // A mismatch here means Touchque holds another transaction than this request: fail closed, never a 500.
        catch (Exception e) when (e is TouchqueNetworkException or TouchqueApiException or TouchqueApprovalMismatchException)
        {
            client.Log.Error("[Touchque] approval failed: " + SdkLog.Describe(e));
            return Error(503, new Step { State = "blocked", Reason = "unavailable" }, "unavailable", "Two-factor approval is temporarily unavailable.");
        }
    }

    private static GuardResult Error(int status, Step step, string code, string message) => new()
    {
        Status = status,
        Step = step,
        Body = new JsonObject { ["touchque"] = Json.ToNode(step), ["error"] = new JsonObject { ["code"] = code, ["message"] = message } },
    };

    private static GuardResult Unauthenticated() =>
        Error(401, new Step { State = "blocked", Reason = "unauthenticated" }, "unauthenticated", "Sign in first.");

    private static GuardResult Misconfigured() =>
        Error(500, new Step { State = "blocked", Reason = "misconfigured" }, "misconfigured", "Two-factor approval is not configured correctly.");

    /// <summary>
    /// Asks Touchque whether this known browser may sign in without the phone. Fails
    /// closed: only an answer of exactly <c>prompt: false</c> approves.
    /// </summary>
    private static async Task<Approval?> SilentApprovalAsync(TouchqueClient client, GuardInput input, string proof, CancellationToken ct)
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
                // Nothing was sent to the phone; why Touchque let this known browser in.
                Reasons = res.Reasons,
            };
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            client.Log.Warn("[Touchque] silent sign-in check failed, asking the phone: " + SdkLog.Describe(e));
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
using Touchque.Internal;

namespace Touchque;

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
/// does not require trusting Touchque.
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
using Touchque.Internal;

namespace Touchque;

/// <summary>Push approvals on the user's phone: request, status, wait, use once, report fraud.</summary>
public sealed class LoginResource
{
    /// <summary>Reasons accepted by <see cref="ReportFraudAsync"/>.</summary>
    public static readonly IReadOnlyList<string> FraudReasons = new[] { "chargeback", "account_takeover", "social_engineering", "other" };

    private readonly TouchqueHttp _http;

    internal LoginResource(TouchqueHttp http) => _http = http;

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
        _http.GetAsync<LoginStatus>("/login/status/" + TouchqueHttp.Seg(requestId), null, ct);

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
    /// <exception cref="TouchquePasskeyRequiredException">Only a passkey can approve (policy), or the user tapped Approve during a call (step_up).</exception>
    /// <exception cref="TouchqueRejectedException">The user rejected it.</exception>
    /// <exception cref="TouchqueTimeoutException">It expired or <see cref="LoginRequestOptions.Timeout"/> passed.</exception>
    public async Task<VerifyResult> VerifyAsync(LoginRequestOptions options, CancellationToken ct = default)
    {
        var sent = await RequestAsync(options, ct).ConfigureAwait(false);
        if (sent.RequiresPasskey)
        {
            throw new TouchquePasskeyRequiredException(sent.RequestId);
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
                _http.Log.Warn("[Touchque] OnChallenge failed: " + SdkLog.Describe(e));
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
                    throw new TouchqueRejectedException(requestId);
                case "EXPIRED":
                    throw new TouchqueTimeoutException($"Touchque: request '{requestId}' expired before it was approved.", requestId);
            }
            // Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
            if (s.Status == "PENDING" && s.RequiresPasskey)
            {
                throw new TouchquePasskeyRequiredException(requestId, "step_up");
            }
            if (DateTimeOffset.UtcNow + interval > deadline)
            {
                throw new TouchqueTimeoutException(
                    $"Touchque: request '{requestId}' was not approved within {timeout.TotalSeconds:0}s. The user did not respond in time.", requestId);
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
    /// throws <see cref="TouchqueApiException"/> with code <c>already_used</c> (409).
    /// </summary>
    public Task<ConsumeResult> ConsumeAsync(string requestId, CancellationToken ct = default) =>
        _http.PostAsync<ConsumeResult>("/login/" + TouchqueHttp.Seg(requestId) + "/consume", new JsonObject(), ct);

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
        if (string.IsNullOrEmpty(requestId)) throw new TouchqueConfigException("ReportFraudAsync() needs the request id");
        var body = new JsonObject().Put("reason", reason).Put("note", note);
        return _http.PostAsync<FraudReport>("/login/" + TouchqueHttp.Seg(requestId) + "/report-fraud", body, ct);
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
    /// The Touchque Device Risk report (from the Device Risk SDK's <c>collect</c> call), passed through untouched; optional.
    /// Used only when your workspace turned Device risk on: its signals only ever ask for more.
    /// </summary>
    public string? DeviceRisk { get; init; }
    /// <summary>
    /// The Touchque Device Risk identification (from the Device Risk SDK's tag or identify call); optional.
    /// Preferred over <see cref="DeviceRisk"/>; for this account only.
    /// </summary>
    public string? DeviceRiskRequestId { get; init; }

    /// <summary>
    /// A browser pairing by QR code (<see cref="TouchqueClient.QrPairings"/>), scanned and confirmed on the phone:
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
    /// sent it (<c>X-Touchque-Browser</c>). Once the user approves this request,
    /// Touchque knows the browser.
    /// </summary>
    public string? BrowserProof { get; init; }

    /// <summary>For your Touchque Actions only (<c>event.context</c>); never shown on the phone. Any JSON object up to 4 KB.</summary>
    public IReadOnlyDictionary<string, object?>? Context { get; init; }

    /// <summary>When the user's sign-in security last changed in your system.</summary>
    public SecurityChanges? SecurityChanges { get; init; }

    /// <summary>Where the action sends money or value (shown in full on the phone; do not repeat it in Details).</summary>
    public Destination? Destination { get; init; }

    /// <summary><c>tr</c> (default) or <c>en</c>: the language of the rows Touchque adds.</summary>
    public string? Locale { get; init; }

    /// <summary>VerifyAsync only: how long to wait (default 30 seconds; with a longer <see cref="ExpiresIn"/>, set it to match).</summary>
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
        if (string.IsNullOrEmpty(ExternalUsername)) throw new TouchqueConfigException("A login request needs the user (ExternalUsername)");
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

public sealed record LoginRequestResult : TouchqueObject
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

public sealed record LoginStatus : TouchqueObject
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
    /// <summary>When the request expires (ISO 8601; a Vishing Shield escalation to a passkey extends it), null when the API did not say or sent no string.</summary>
    [System.Text.Json.Serialization.JsonConverter(typeof(LenientStringConverter))]
    public string? ExpiresAt { get; init; }
}

public sealed record VerifyResult : TouchqueObject
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

public sealed record ConsumeResult : TouchqueObject
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

public sealed record FraudReport : TouchqueObject
{
    public bool Reported { get; init; }
    public bool AlreadyReported { get; init; }
    public string RequestId { get; init; } = "";
}

// ─────────────────────────────────────────────────────────────
// From Relay/RelayHandler.cs — the relay routes @touchque/web calls (public part)
// ─────────────────────────────────────────────────────────────

using System.Text.Json.Nodes;
using Touchque.Internal;

namespace Touchque.Relay;

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
    /// device-bound key proof (X-Touchque-Browser) first asks Touchque whether anything
    /// about it is new; if nothing is, it succeeds at once with no push.
    /// </summary>
    public SilentSignInOptions? SilentSignIn { get; init; }
}

/// <summary>
/// Framework-agnostic relay: the routes a frontend (<c>@touchque/web</c>) needs for push
/// 2FA, offline codes and passkeys, so you don't hand-write them. Same routes and
/// behaviour as the Node SDK's <c>touchqueRouter</c>:
/// <code>
/// POST   /enroll/start                  (signed in)   generateSecret response (asked with the browser's IP and User-Agent)
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

    private readonly TouchqueClient _tq;
    private readonly RelayOptions<TRequest> _o;
    private readonly FixedWindowLimiter? _limiter;
    private readonly bool _offlineEnabled;

    public RelayHandler(TouchqueClient client, RelayOptions<TRequest> options)
    {
        _tq = client;
        _o = options;
        _limiter = options.RateLimit is null ? null : new FixedWindowLimiter(options.RateLimit);
        _offlineEnabled = options.GetLoginUser is not null || options.AllowOfflineWithoutFirstFactor;
        if (options.GetLoginUser is null && Interlocked.Exchange(ref _warned, 1) == 0)
        {
            client.Log.Warn("[Touchque] RelayHandler: POST /login takes the username from the request body"
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
// From Touchque.AspNetCore/ServiceCollectionExtensions.cs — services.AddTouchque()
// ─────────────────────────────────────────────────────────────

using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Touchque.AspNetCore;

/// <summary>Registers Touchque in an ASP.NET Core (or any Microsoft.Extensions.Hosting) app.</summary>
public static class TouchqueServiceCollectionExtensions
{
    /// <summary>The named HttpClient the client uses (IHttpClientFactory).</summary>
    public const string HttpClientName = "Touchque";

    /// <summary>
    /// Registers <see cref="TouchqueClient"/> as a singleton, its options (from
    /// <paramref name="configure"/>, then the environment: TQ_API_KEY, TQ_API_SECRET,
    /// TQ_API_URL), an in-process <see cref="IWebhookReplayCache"/>, and the named
    /// HttpClient <c>Touchque</c> (never following redirects; connections recycled every 5
    /// minutes). The returned builder adds handlers (logging, a proxy). Do not add a retry
    /// handler: every request is signed with a one-time nonce, so a replay is refused;
    /// retry <see cref="TouchqueNetworkException"/> at the call site instead.
    /// </summary>
    public static IHttpClientBuilder AddTouchque(this IServiceCollection services, Action<TouchqueOptions>? configure = null)
    {
        var options = services.AddOptions<TouchqueOptions>();
        if (configure is not null) options.Configure(configure);
        services.TryAddSingleton<IWebhookReplayCache, MemoryReplayCache>();
        services.TryAddSingleton(sp =>
        {
            var o = sp.GetRequiredService<IOptions<TouchqueOptions>>().Value;
            var http = sp.GetRequiredService<IHttpClientFactory>().CreateClient(HttpClientName);
            http.Timeout = Timeout.InfiniteTimeSpan; // the client applies TouchqueOptions.Timeout per request
            return new TouchqueClient(o, http);
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
public static class TouchqueHttpContextExtensions
{
    internal const string ApprovalKey = "Touchque.Approval";
    internal const string McpClaimsKey = "Touchque.McpClaims";

    /// <summary>The approval of the current request (set by <c>RequireTouchque</c>), or null.</summary>
    public static Approval? GetTouchqueApproval(this HttpContext context) =>
        context.Items.TryGetValue(ApprovalKey, out var a) ? a as Approval : null;

    /// <summary>The checked MCP token of the current request (set by <c>RequireTouchqueMcp</c>), or null.</summary>
    public static McpAuthClaims? GetTouchqueMcpClaims(this HttpContext context) =>
        context.Items.TryGetValue(McpClaimsKey, out var c) ? c as McpAuthClaims : null;

    /// <summary>
    /// The signed-in user as Touchque knows them: the email claim, else the name
    /// identifier (sub), else the name.
    /// </summary>
    public static string? TouchqueUser(this ClaimsPrincipal? user)
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
    public static string? TouchqueClientIp(this HttpContext context)
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
// From Touchque.AspNetCore/RequireTouchque.cs — .RequireTouchque("ACTION") / [RequireTouchque("ACTION")]
// ─────────────────────────────────────────────────────────────

using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Touchque.Internal;
using HttpJsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;
using MvcJsonOptions = Microsoft.AspNetCore.Mvc.JsonOptions;

namespace Touchque.AspNetCore;

/// <summary>What a guard callback sees: the request and, on a minimal API endpoint, its bound arguments.</summary>
public sealed class TouchqueGuardContext
{
    internal TouchqueGuardContext(HttpContext httpContext, IReadOnlyList<object?> arguments)
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

/// <summary>Options of <c>RequireTouchque</c>.</summary>
public sealed class TouchqueGuardOptions
{
    /// <summary>Who approves (default: the signed-in user's email, else sub, else name). For a login route, return whoever just passed your password check.</summary>
    public Func<TouchqueGuardContext, string?>? User { get; set; }

    /// <summary>Transaction details shown on the phone. Build them from server-side state or validated input.</summary>
    public Func<TouchqueGuardContext, IReadOnlyList<LoginDetail>?>? Details { get; set; }

    public Func<TouchqueGuardContext, string?>? ReferenceId { get; set; }

    /// <summary>For your Touchque Actions only (<c>event.context</c>): roles, plan, amount… Never shown on the phone.</summary>
    public Func<TouchqueGuardContext, IReadOnlyDictionary<string, object?>?>? Context { get; set; }

    /// <summary>
    /// Silent sign-ins (default off): a new attempt whose browser sent its device-bound
    /// key proof (<c>X-Touchque-Browser</c>) first asks Touchque whether anything is new;
    /// if nothing is, the endpoint runs at once with no push.
    /// </summary>
    public SilentSignInOptions? SilentSignIn { get; set; }

    /// <summary>
    /// False: never show the first-time linking QR. A user with no phone then gets 202
    /// <c>{"state": "enroll", "reason": "enrollment_off"}</c>.
    /// </summary>
    public bool Enroll { get; set; } = true;

    /// <summary>
    /// Your app's own JSON body for refused answers (status 400 or more: 401, 403, 408, 423,
    /// 429, 500, 503); never called for a 202 step or on approval. What it returns is written
    /// with your app's JSON options (MVC's for <c>[RequireTouchque]</c>). When that gives a JSON
    /// object (an anonymous object, a record, a dictionary, a <c>JsonObject</c>), it is sent with
    /// <c>touchque</c> set to the step, so <c>@touchque/web</c> still sees the state; no token is
    /// added. Anything else (a string, a number, an array, null) is sent as it is. Status and
    /// headers stay the same (<c>Cache-Control: no-store</c>, <c>Retry-After</c>,
    /// <c>X-Touchque-State</c>, <c>X-Touchque-Reason</c>). When it throws, or returns what the
    /// serializer cannot write, the default body is sent and <c>[Touchque] errorBody failed:
    /// &lt;message&gt;</c> is logged. It gets a copy of the step.
    /// </summary>
    public Func<GuardRefusal, object?>? ErrorBody { get; set; }
}

/// <summary>
/// One line per protected endpoint. Until the user approves on their phone this answers
/// <c>202 {"touchque": step, "token": "..."}</c>; your page shows the step in its own
/// design and sends the same request again with header <c>X-Touchque-Token</c>. Once
/// approved the endpoint runs ONCE, with <c>HttpContext.GetTouchqueApproval()</c> set.
/// <code>
/// app.MapPost("/transfer", (Transfer t, HttpContext http) => …)
///    .RequireAuthorization()
///    .RequireTouchque("SEND_MONEY", o => o.Details = c => [("Amount", c.Argument&lt;Transfer&gt;()!.Amount)]);
/// </code>
/// </summary>
public static class RequireTouchqueExtensions
{
    public static TBuilder RequireTouchque<TBuilder>(this TBuilder builder, string action, Action<TouchqueGuardOptions>? configure = null)
        where TBuilder : IEndpointConventionBuilder
    {
        var options = new TouchqueGuardOptions();
        configure?.Invoke(options);
        builder.AddEndpointFilter(async (ctx, next) =>
        {
            var guardContext = new TouchqueGuardContext(ctx.HttpContext, ctx.Arguments.ToList());
            var result = await TouchqueGuardRunner.RunAsync(guardContext, action, options, mvc: false).ConfigureAwait(false);
            return result is null ? await next(ctx).ConfigureAwait(false) : result;
        });
        return builder;
    }
}

/// <summary>
/// The guard for one request. The client is built on the first guarded request and kept (a
/// singleton); while it cannot be built (no API key or secret) the endpoint answers 500
/// <c>misconfigured</c> (401 without a signed-in user) and never runs.
/// </summary>
internal static class TouchqueGuardRunner
{
    /// <summary>Why guarded endpoints answer 500 is logged once per process.</summary>
    private static int _noClientLogged;

    /// <summary>Null: approved, run the endpoint. Otherwise the answer to send. <paramref name="mvc"/>: a controller action.</summary>
    public static async Task<IResult?> RunAsync(TouchqueGuardContext context, string action, TouchqueGuardOptions options, bool mvc)
    {
        var http = context.HttpContext;
        var req = http.Request;
        var input = new GuardInput
        {
            User = options.User is null ? http.User.TouchqueUser() : options.User(context),
            Action = action,
            Details = options.Details?.Invoke(context),
            ReferenceId = options.ReferenceId?.Invoke(context),
            Ip = http.TouchqueClientIp(),
            UserAgent = req.Header("User-Agent"),
            Token = req.Header(Guard.TokenHeader),
            Offline = req.Header(Guard.OfflineHeader) is "1" or "true",
            Code = req.Header(Guard.CodeHeader),
            CodeType = req.Header(Guard.CodeTypeHeader),
            Enroll = options.Enroll,
            BrowserProof = options.SilentSignIn is null ? null : req.Header(Guard.BrowserHeader),
            SilentSignIn = options.SilentSignIn,
            Context = options.Context?.Invoke(context),
        };
        var client = Client(http);
        var result = client is null ? Guard.WithoutClient(input) : await Guard.RunAsync(client, input, http.RequestAborted).ConfigureAwait(false);
        if (result.Approved is not null)
        {
            http.Items[TouchqueHttpContextExtensions.ApprovalKey] = result.Approved;
            return null;
        }
        return Answer(http, result, options.ErrorBody, client, mvc);
    }

    /// <summary>The registered client (built once, then kept). Null while it cannot be built for a setup error (logged once).</summary>
    private static TouchqueClient? Client(HttpContext http)
    {
        try
        {
            return http.RequestServices.GetRequiredService<TouchqueClient>();
        }
        catch (TouchqueConfigException e)
        {
            if (Interlocked.Exchange(ref _noClientLogged, 1) == 0)
            {
                var o = http.RequestServices.GetService<IOptions<TouchqueOptions>>()?.Value ?? new TouchqueOptions();
                Log(http, null).Error(o.KeysMissing()
                    ? "[Touchque] TQ_API_KEY and TQ_API_SECRET are not set: routes guarded by Touchque answer 500 misconfigured."
                    : "[Touchque] " + e.Message);
            }
            return null;
        }
    }

    /// <summary>
    /// The answer of a result that is not an approval, shared by <c>RequireTouchque</c>,
    /// <c>[RequireTouchque]</c> and <c>GuardResult.ToResult</c>: sets its headers and returns its
    /// body, the guard's or for a refusal (400 or more) the ErrorBody's, written with the app's JSON
    /// options.
    /// </summary>
    internal static IResult Answer(HttpContext http, GuardResult result, Func<GuardRefusal, object?>? errorBody, TouchqueClient? client, bool mvc)
    {
        var answer = Guard.Answer(result, errorBody, errorBody is null ? null : SerializerOptions(http, mvc), errorBody is null ? null : Log(http, client));
        foreach (var (name, value) in answer.Headers) http.Response.Headers[name] = value;
        return answer.Body is null ? Results.Text("null", "application/json", Encoding.UTF8, answer.Status) : Results.Json(answer.Body, statusCode: answer.Status);
    }

    /// <summary>The request runs a controller action (or a Razor page): MVC's JSON options apply.</summary>
    internal static bool IsMvc(HttpContext http) =>
        http.GetEndpoint()?.Metadata.GetMetadata<Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor>() is not null;

    /// <summary>The app's JSON options: MVC's for a controller action, else the minimal APIs' ones.</summary>
    private static JsonSerializerOptions SerializerOptions(HttpContext http, bool mvc) =>
        (mvc ? http.RequestServices.GetService<IOptions<MvcJsonOptions>>()?.Value.JsonSerializerOptions : null)
        ?? http.RequestServices.GetService<IOptions<HttpJsonOptions>>()?.Value.SerializerOptions
        ?? new JsonSerializerOptions(JsonSerializerDefaults.Web);

    /// <summary>The SDK's logger: the client's, or without one, the one TouchqueOptions.Logger / Debug set.</summary>
    private static SdkLog Log(HttpContext http, TouchqueClient? client)
    {
        if (client is not null) return client.Log;
        var o = http.RequestServices.GetService<IOptions<TouchqueOptions>>()?.Value;
        return new SdkLog(o?.Logger, o?.Debug ?? false);
    }
}

/// <summary>
/// A guard result that is not an approval as its HTTP answer, exactly as <c>RequireTouchque</c>,
/// <c>[RequireTouchque]</c> and <c>MapTouchqueRelay</c> send it (they share the code): the status,
/// <c>Cache-Control: no-store</c>, <c>Retry-After</c> on 423 and 429, <c>X-Touchque-State</c> and
/// <c>X-Touchque-Reason</c> on a refusal, and the JSON body. For a guard inside your handler:
/// <code>
/// if (r.Approved is null) return r.ToResult();
/// </code>
/// </summary>
public static class TouchqueGuardResultExtensions
{
    /// <summary>
    /// The answer as an <see cref="IResult"/>. <paramref name="errorBody"/> (null: the guard's body)
    /// shapes refusals (400 or more) like <see cref="TouchqueGuardOptions.ErrorBody"/>, written with
    /// the app's JSON options: MVC's in a controller action, else the minimal APIs' ones. A callback
    /// that throws, or a result the serializer cannot write, sends the default body and logs
    /// <c>[Touchque] errorBody failed: &lt;message&gt;</c> through <see cref="TouchqueOptions.Logger"/>.
    /// </summary>
    /// <exception cref="ArgumentException">The result is an approval: run your action instead.</exception>
    public static IResult ToResult(this GuardResult result, Func<GuardRefusal, object?>? errorBody = null)
    {
        if (result.Approved is not null) throw new ArgumentException("A guard answer is a step or a refusal; on approval, run your action.", nameof(result));
        return new GuardHttpResult(result, errorBody);
    }

    /// <summary>Writes <see cref="ToResult"/>'s answer to <paramref name="http"/>'s response.</summary>
    /// <exception cref="ArgumentException">The result is an approval: run your action instead.</exception>
    public static Task WriteAsync(this GuardResult result, HttpContext http, Func<GuardRefusal, object?>? errorBody = null) =>
        result.ToResult(errorBody).ExecuteAsync(http);

    private sealed class GuardHttpResult : IResult
    {
        private readonly GuardResult _result;
        private readonly Func<GuardRefusal, object?>? _errorBody;

        public GuardHttpResult(GuardResult result, Func<GuardRefusal, object?>? errorBody)
        {
            _result = result;
            _errorBody = errorBody;
        }

        public Task ExecuteAsync(HttpContext httpContext) =>
            TouchqueGuardRunner.Answer(httpContext, _result, _errorBody, client: null, TouchqueGuardRunner.IsMvc(httpContext)).ExecuteAsync(httpContext);
    }
}

/// <summary>
/// MVC: <c>[RequireTouchque("SEND_MONEY")]</c> on a controller action. Until the user
/// approves on the phone it answers 202 with the step; once approved the action runs
/// once with <c>HttpContext.GetTouchqueApproval()</c> set. For details, a login user or
/// silent sign-ins, register a named <see cref="TouchqueGuardOptions"/> with
/// <c>services.Configure&lt;TouchqueGuardOptions&gt;("SEND_MONEY", o => …)</c> (the name is the action).
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = false)]
public sealed class RequireTouchqueAttribute : Attribute, IAsyncActionFilter
{
    public RequireTouchqueAttribute(string action) => Action = action;

    public string Action { get; }

    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var options = context.HttpContext.RequestServices.GetService<Microsoft.Extensions.Options.IOptionsMonitor<TouchqueGuardOptions>>()?.Get(Action)
            ?? new TouchqueGuardOptions();
        var guardContext = new TouchqueGuardContext(context.HttpContext, context.ActionArguments.Values.ToList());
        var result = await TouchqueGuardRunner.RunAsync(guardContext, Action, options, mvc: true).ConfigureAwait(false);
        if (result is null)
        {
            await next().ConfigureAwait(false);
            return;
        }
        context.Result = new TouchqueResultAdapter(result);
    }

    private sealed class TouchqueResultAdapter : IActionResult
    {
        private readonly IResult _result;

        public TouchqueResultAdapter(IResult result) => _result = result;

        public Task ExecuteResultAsync(ActionContext context) => _result.ExecuteAsync(context.HttpContext);
    }
}

// ─────────────────────────────────────────────────────────────
// From Touchque.AspNetCore/TouchqueRelayEndpoints.cs — app.MapTouchqueRelay("/touchque", options)
// ─────────────────────────────────────────────────────────────

using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Touchque.Relay;

namespace Touchque.AspNetCore;

/// <summary>
/// Every relay route a frontend (<c>@touchque/web</c>) needs: POST /login, enrollment,
/// offline codes and the passkey ceremonies. See <see cref="RelayHandler{TRequest}"/> for the
/// routes and security rules.
/// <code>
/// app.MapTouchqueRelay("/touchque", new RelayOptions&lt;HttpContext&gt;
/// {
///     GetUserId = http => http.User.TouchqueUser(),
///     GetLoginUser = http => http.Session.GetString("password_verified_user"),
///     OnAuthenticated = async (http, response, info) => { /* sign the user in */ },
///     SilentSignIn = new(),
/// });
/// </code>
/// The client IP is <c>HttpContext.Connection.RemoteIpAddress</c>: behind a load balancer,
/// add <c>app.UseForwardedHeaders()</c> with your proxy as a known proxy first.
/// </summary>
public static class TouchqueRelayEndpoints
{
    private const int MaxBodyBytes = 64 * 1024;

    public static RouteGroupBuilder MapTouchqueRelay(this IEndpointRouteBuilder endpoints, string prefix, RelayOptions<HttpContext>? options = null)
    {
        var client = endpoints.ServiceProvider.GetRequiredService<TouchqueClient>();
        var handler = new RelayHandler<HttpContext>(client, options ?? new RelayOptions<HttpContext> { GetUserId = http => http.User.TouchqueUser() });
        var group = endpoints.MapGroup(prefix);
        // Each route hands the relay its own path: request.Path also holds the prefixes of the
        // groups this one is mapped on (app.MapGroup("/api").MapTouchqueRelay("/touchque")).
        foreach (var path in new[]
        {
            "/enroll/start", "/login", "/offline/challenge", "/offline/verify", "/offline/totp", "/passkey/authenticate/options",
            "/passkey/authenticate/verify", "/passkey/login/options", "/passkey/login/verify", "/passkey/register/options", "/passkey/register/verify",
        })
        {
            group.MapPost(path, http => HandleAsync(handler, path, http));
        }
        group.MapGet("/enroll/status", http => HandleAsync(handler, "/enroll/status", http));
        group.MapGet("/passkey/credentials", http => HandleAsync(handler, "/passkey/credentials", http));
        group.MapDelete("/passkey/credentials/{id}", http => HandleAsync(handler, "/passkey/credentials/" + http.Request.RouteValues["id"], http));
        return group;
    }

    private static async Task HandleAsync(RelayHandler<HttpContext> handler, string path, HttpContext http)
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
        var response = await handler.HandleAsync(new RelayRequest<HttpContext>
        {
            Method = request.Method,
            Path = path,
            Body = body,
            Ip = http.TouchqueClientIp() ?? "",
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
        await http.Response.WriteAsync(response.Body.ToJsonString(Touchque.Internal.Json.Options), http.RequestAborted).ConfigureAwait(false);
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Touchque/Agents/CrossAppAccess.cs — Cross App Access: ID-JAG, DPoP binding
// ─────────────────────────────────────────────────────────────

using System.Collections.Concurrent;
using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Touchque.Internal;

namespace Touchque;

/// <summary>
/// A refused ID-JAG or exchange (Cross App Access). <see cref="Error"/> is the OAuth error:
/// <c>invalid_grant</c> for a bad ID-JAG. From a token endpoint: the <c>error</c> its non-2xx answer
/// names (an RFC 6749 error code of at most 128 characters), else <c>server_error</c>;
/// <c>invalid_response</c> for a 2xx answer that is not a JSON object (or, from
/// <see cref="CrossAppAccess.RequestIdJagAsync"/>, not an ID-JAG); <c>temporarily_unavailable</c> when
/// the token endpoint could not be reached or its answer read (no <see cref="Status"/>; the cause is
/// the <see cref="Exception.InnerException"/>).
/// </summary>
public class TouchqueIdJagException : TouchqueException
{
    public TouchqueIdJagException(string error, string message, int? status = null) : base(message)
    {
        Error = error;
        Status = status;
    }

    /// <summary>The same, with the exception that caused it as <see cref="Exception.InnerException"/>.</summary>
    public TouchqueIdJagException(string error, string message, int? status, Exception? innerException) : base(message, innerException)
    {
        Error = error;
        Status = status;
    }

    public string Error { get; }

    /// <summary>
    /// The HTTP status of the token endpoint answer that gave the error: a non-2xx answer, or a 2xx that is not
    /// a JSON object. Null otherwise: no answer (<c>temporarily_unavailable</c>), a JSON object that is not an
    /// ID-JAG, or an <see cref="IdJagVerifier"/> error.
    /// </summary>
    public int? Status { get; }

    /// <summary>
    /// The latest valid <c>DPoP-Nonce</c> the token endpoint sent during the call (RFC 9449 section 8), in
    /// any of its answers, a 2xx included: the nonce retry's answer's when it had one, else the first
    /// answer's. Every error <see cref="CrossAppAccess.RequestIdJagAsync"/> and
    /// <see cref="CrossAppAccess.RedeemIdJagAsync"/> throw carries it (<c>invalid_response</c> and
    /// <c>temporarily_unavailable</c> too). Only a valid nonce (1*NQCHAR: printable ASCII except space,
    /// <c>"</c> and <c>\</c>, the same value each time the header repeats); otherwise null. A request you
    /// send again yourself carries it in a new proof (<c>CrossAppAccess.IdJagDpopProof(key, url, nonce: e.DpopNonce)</c>).
    /// </summary>
    public string? DpopNonce { get; init; }
}

/// <summary>What <see cref="CrossAppAccess.RequestIdJagAsync"/> needs.</summary>
public sealed record RequestIdJagOptions
{
    /// <summary>The identity provider's issuer (its token endpoint is discovered), or give <see cref="TokenEndpoint"/>.</summary>
    public string? Issuer { get; init; }
    public string? TokenEndpoint { get; init; }
    /// <summary>Your app at the identity provider (tqapp_… at Touchque SSO) and its secret.</summary>
    public required string ClientId { get; init; }
    public required string ClientSecret { get; init; }
    /// <summary>The member's ID token the identity provider issued to your app.</summary>
    public required string IdToken { get; init; }
    /// <summary>The other service's authorization server (its issuer).</summary>
    public required string Audience { get; init; }
    public string? Resource { get; init; }
    public string? Scope { get; init; }
    /// <summary>
    /// Binds the ID-JAG to this key (DPoP, RFC 9449); redeem it with the same key. A server that asks
    /// for a DPoP nonce (<c>use_dpop_nonce</c> with a valid <c>DPoP-Nonce</c>) gets the request once more,
    /// with a proof that carries it.
    /// </summary>
    public IdJagDpopKey? DpopKey { get; init; }
}

/// <summary>An ID-JAG the identity provider issued.</summary>
public sealed record IdJagGrant(string Assertion, int? ExpiresIn, string? Scope)
{
    /// <summary>
    /// With a <see cref="RequestIdJagOptions.DpopKey"/>: whether the returned ID-JAG carries that key's
    /// thumbprint (cnf.jkt); an identity provider without DPoP support ignores the proof. Null without one.
    /// </summary>
    public bool? DpopBound { get; init; }
}

/// <summary>
/// A DPoP key (RFC 9449, P-256) that binds an ID-JAG, and the access token redeemed with it, to its
/// holder; keep it in this process. Make one with <see cref="CrossAppAccess.CreateIdJagDpopKey"/>.
/// </summary>
public sealed class IdJagDpopKey : IDisposable
{
    internal IdJagDpopKey(SigningKey key)
    {
        Key = key;
        Thumbprint = AgentKeys.Thumbprint(key.PublicJwk);
    }

    internal SigningKey Key { get; }

    /// <summary>kty, crv, x, y: the public key only.</summary>
    public JsonObject PublicJwk => (JsonObject)Key.PublicJwk.DeepClone();

    /// <summary>RFC 7638 thumbprint: the ID-JAG's cnf.jkt.</summary>
    public string Thumbprint { get; }

    public void Dispose() => Key.Dispose();
}

/// <summary>What <see cref="CrossAppAccess.RedeemIdJagAsync"/> needs.</summary>
public sealed record RedeemIdJagOptions
{
    public required string TokenEndpoint { get; init; }
    public required string ClientId { get; init; }
    public string? ClientSecret { get; init; }
    public required string Assertion { get; init; }
    public string? Resource { get; init; }
    public string? Scope { get; init; }
    /// <summary>
    /// The key the ID-JAG is bound to: a DPoP proof goes along, and the access token is then DPoP-bound
    /// too (each call with it needs a proof: <see cref="CrossAppAccess.IdJagDpopProof"/> with the method and
    /// the token). A server that asks for a DPoP nonce (with a valid <c>DPoP-Nonce</c>) gets the request once
    /// more, with a proof that carries it.
    /// </summary>
    public IdJagDpopKey? DpopKey { get; init; }
}

/// <summary>
/// Cross App Access: Identity Assertion JWT Authorization Grants (ID-JAG,
/// draft-ietf-oauth-identity-assertion-authz-grant, an open standard). An
/// organization's identity provider (Touchque SSO) decides which of its apps may
/// reach which other service for its members; the app trades a member's ID token
/// for an ID-JAG there, then the ID-JAG for an access token at the other
/// service's authorization server, with no consent screen per member. Your own
/// authorization server takes them with <see cref="IdJagVerifier"/>.
/// <code>
/// var jag = await CrossAppAccess.RequestIdJagAsync(new() { Issuer = "https://sso.touchque.com", ClientId = id, ClientSecret = secret,
///     IdToken = idToken, Audience = "https://auth.files.example" });
/// var tokens = await CrossAppAccess.RedeemIdJagAsync(new() { TokenEndpoint = "https://auth.files.example/token", ClientId = "acme",
///     ClientSecret = filesSecret, Assertion = jag.Assertion });
/// </code>
/// Sender-constrained with DPoP (RFC 9449), optional: give the same key to both calls. The ID-JAG is
/// then bound to it (cnf.jkt) and is useless to anyone who copies it without the key.
/// <code>
/// using var dpopKey = CrossAppAccess.CreateIdJagDpopKey();
/// var jag = await CrossAppAccess.RequestIdJagAsync(new() { /* as above */ DpopKey = dpopKey });   // jag.DpopBound
/// var tokens = await CrossAppAccess.RedeemIdJagAsync(new() { /* as above */ Assertion = jag.Assertion, DpopKey = dpopKey });
/// // A call with the DPoP-bound access token: a proof for the exact URI and method it sends.
/// using var call = new HttpRequestMessage(HttpMethod.Get, "https://api.files.example/v1/files");
/// call.Headers.Authorization = new AuthenticationHeaderValue("DPoP", (string)tokens["access_token"]!);
/// call.Headers.Add("DPoP", CrossAppAccess.IdJagDpopProof(dpopKey, call.RequestUri!.AbsoluteUri, call.Method.Method, (string)tokens["access_token"]!));
/// </code>
/// </summary>
public static class CrossAppAccess
{
    public const string IdJagTokenType = "urn:ietf:params:oauth:token-type:id-jag";
    public const string IdTokenType = "urn:ietf:params:oauth:token-type:id_token";
    public const string TokenExchangeGrant = "urn:ietf:params:oauth:grant-type:token-exchange";
    public const string JwtBearerGrant = "urn:ietf:params:oauth:grant-type:jwt-bearer";

    /// <summary>
    /// Reads up to 256 KB of response headers (SocketsHttpHandler's default is 64 KB): a token endpoint's
    /// long <c>WWW-Authenticate</c> or <c>DPoP-Nonce</c> header still gives its answer or a <see cref="TouchqueIdJagException"/>
    /// (more is <c>temporarily_unavailable</c>). Never follows a redirect; a request takes at most 10 s.
    /// </summary>
    private static readonly Lazy<HttpClient> SharedClient = new(() => TouchqueHttp.CreateClient(TimeSpan.FromSeconds(10), maxResponseHeadersKb: 256));
    private static readonly char[] C0OrSpace = Enumerable.Range(0, 0x21).Select(c => (char)c).ToArray();

    /// <summary>
    /// What a proof's method is trimmed of: ASCII whitespace (space, tab, LF, VT, FF, CR). Not string.Trim()'s
    /// Unicode whitespace (U+0085, U+00A0, U+2000…), and not NUL: those are not RFC 9110 token characters.
    /// </summary>
    private static readonly char[] AsciiWhitespace = { ' ', '\t', '\n', '\v', '\f', '\r' };

    /// <summary>Makes a fresh DPoP key for <see cref="RequestIdJagAsync"/> and <see cref="RedeemIdJagAsync"/>.</summary>
    public static IdJagDpopKey CreateIdJagDpopKey() => new(SigningKey.NewEs256());

    /// <summary>
    /// A DPoP proof (RFC 9449) with <paramref name="key"/> for one request: by default a POST to a token
    /// endpoint. For a call with the DPoP-bound access token, give the call's method and the token (the
    /// proof carries its hash, ath) and send <c>Authorization: DPoP &lt;token&gt;</c> with
    /// <c>DPoP: &lt;proof&gt;</c>. <paramref name="nonce"/>: the server's <c>DPoP-Nonce</c>, when it asked
    /// for one; it goes in as given, unchecked. A null or empty <paramref name="accessToken"/> or
    /// <paramref name="nonce"/> is left out (no ath, no nonce). Each proof has a fresh jti and iat, and its
    /// jwk is the key's public part only (kty, crv, x, y).
    /// <para>
    /// htm is <paramref name="method"/> without leading and trailing ASCII whitespace (space, tab, CR, LF, VT,
    /// FF; not NUL or U+00A0), POST when that leaves nothing, uppercased; a method with anything but RFC 9110
    /// token characters throws <see cref="TouchqueConfigException"/>.
    /// </para>
    /// <para>
    /// htu is <paramref name="url"/> as System.Uri parses it (it must be an absolute http or https URL, else
    /// <see cref="TouchqueConfigException"/>): scheme and host lowercased (an IDN host in punycode), user info
    /// and the default port dropped, "/" for an empty path, no query or fragment. The path is kept as given,
    /// percent-escapes included, except that "\" counts as "/", "." and ".." segments are resolved, and a
    /// character a URL path cannot hold as it is (a space, non-ASCII, <c>" &lt; &gt; ^ ` { }</c>) is
    /// percent-encoded as UTF-8. HttpClient sends a URL in System.Uri's form (%7E as ~, | as %7C): make the
    /// proof from the exact URI you send, <c>request.RequestUri.AbsoluteUri</c>, so that htu matches.
    /// </para>
    /// </summary>
    public static string IdJagDpopProof(IdJagDpopKey key, string url, string method = "POST", string? accessToken = null, string? nonce = null)
    {
        ArgumentNullException.ThrowIfNull(key);
        var claims = new JsonObject
        {
            ["htm"] = DpopHtm(method), ["htu"] = DpopHtu(url), ["iat"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            ["jti"] = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant(),
        };
        claims.Put("ath", string.IsNullOrEmpty(accessToken) ? null : AgentKeys.AccessTokenHash(accessToken)).Put("nonce", nonce);
        // The jwk is rebuilt for each proof from the key's public point: exactly kty, crv, x and y.
        var pub = key.Key.PublicJwk;
        var jwk = new JsonObject { ["kty"] = Json.Str(pub, "kty"), ["crv"] = Json.Str(pub, "crv"), ["x"] = Json.Str(pub, "x"), ["y"] = Json.Str(pub, "y") };
        return key.Key.Jws(new JsonObject { ["typ"] = "dpop+jwt", ["jwk"] = jwk }, claims);
    }

    /// <summary>
    /// A proof's htm: <paramref name="method"/> trimmed of ASCII whitespace, POST when empty, uppercased. An
    /// HTTP method is an RFC 9110 token, checked before uppercasing (ToUpperInvariant turns "poſt" into POST).
    /// </summary>
    internal static string DpopHtm(string? method)
    {
        var m = (method ?? "").Trim(AsciiWhitespace);
        if (m.Length == 0) return "POST";
        foreach (var c in m)
        {
            if (!IsTchar(c)) throw new TouchqueConfigException($"IdJagDpopProof: \"{method}\" is not an HTTP method (RFC 9110 token characters only)");
        }
        return m.ToUpperInvariant();
    }

    /// <summary>An RFC 9110 tchar: an ASCII letter or digit, or one of !#$%&amp;'*+-.^_`|~.</summary>
    private static bool IsTchar(char c) =>
        c is (>= 'a' and <= 'z') or (>= 'A' and <= 'Z') or (>= '0' and <= '9')
            or '!' or '#' or '$' or '%' or '&' or '\'' or '*' or '+' or '-' or '.' or '^' or '_' or '`' or '|' or '~';

    /// <summary>
    /// A proof's htu: scheme://host[:port]/path of <paramref name="url"/> as System.Uri parses it, without
    /// user info, query or fragment: scheme and host lowercased (an IDN host in punycode), no default port,
    /// "/" for an empty path. The path keeps its own percent-escapes as given (<see cref="Uri"/> would decode
    /// %7E and the like); only "\" (as "/"), "." and ".." segments (also as %2e), and characters a path
    /// cannot hold as they are (percent-encoded as UTF-8) change.
    /// </summary>
    internal static string DpopHtu(string url)
    {
        // No leading or trailing C0 control or space, no tab or newline anywhere.
        var s = (url ?? "").Trim(C0OrSpace).Replace("\t", "").Replace("\n", "").Replace("\r", "");
        if (!Uri.TryCreate(s, UriKind.Absolute, out var u) || u.Scheme is not ("https" or "http") || u.Host.Length == 0)
        {
            throw new TouchqueConfigException($"{url} must be an absolute https or http URL");
        }
        var host = (u.HostNameType == UriHostNameType.Dns ? u.IdnHost : u.Host).ToLowerInvariant();
        // The path as written: after the scheme, the slashes and the authority, up to the query or fragment.
        var at = s.IndexOf(':') + 1;
        while (at < s.Length && s[at] is '/' or '\\') at++;
        var start = s.IndexOfAny(new[] { '/', '\\', '?', '#' }, at);
        start = start < 0 ? s.Length : start;
        var end = s.IndexOfAny(new[] { '?', '#' }, start);
        var path = s[start..(end < 0 ? s.Length : end)];
        // Segment by segment: \ is /, "." and ".." segments (also as %2e) go, other code points are kept or
        // UTF-8 percent-encoded (space, controls, non-ASCII and " # < > ? ^ ` { }), and a % stays as written.
        var segments = new List<string>();
        var segment = new StringBuilder();
        Span<byte> utf8 = stackalloc byte[4];
        var i = path.Length > 0 && path[0] is '/' or '\\' ? 1 : 0;
        while (true)
        {
            if (i < path.Length && path[i] is not ('/' or '\\'))
            {
                Rune.DecodeFromUtf16(path.AsSpan(i), out var rune, out var used);
                i += used;
                if (rune.Value is > 0x20 and < 0x7F and not ('"' or '#' or '<' or '>' or '?' or '^' or '`' or '{' or '}'))
                {
                    segment.Append((char)rune.Value);
                    continue;
                }
                var n = rune.EncodeToUtf8(utf8);
                for (var k = 0; k < n; k++) segment.Append('%').Append(utf8[k].ToString("X2", CultureInfo.InvariantCulture));
                continue;
            }
            var last = i >= path.Length;
            var text = segment.ToString();
            var dots = text.Replace("%2e", ".", StringComparison.OrdinalIgnoreCase);
            if (dots == "..")
            {
                if (segments.Count > 0) segments.RemoveAt(segments.Count - 1);
                if (last) segments.Add("");
            }
            else if (dots == ".")
            {
                if (last) segments.Add("");
            }
            else
            {
                segments.Add(text);
            }
            if (last) break;
            segment.Clear();
            i++;
        }
        return u.Scheme + "://" + host + (u.IsDefaultPort ? "" : ":" + u.Port.ToString(CultureInfo.InvariantCulture)) + "/" + string.Join('/', segments);
    }

    /// <summary>https, or http on this machine (tests).</summary>
    internal static bool SafeUrl(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var u) && (u.Scheme == "https" || (u.Scheme == "http" && u.IsLoopback));

    internal static async Task<JsonObject> GetJsonAsync(string url, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Get, url);
        req.Headers.Accept.ParseAdd("application/json");
        using var res = await SharedClient.Value.SendAsync(req, ct).ConfigureAwait(false);
        if ((int)res.StatusCode >= 400) throw new InvalidOperationException($"{url} answered {(int)res.StatusCode}");
        return Json.ParseObject(await res.Content.ReadAsStringAsync(ct).ConfigureAwait(false));
    }

    /// <summary>The identity provider's OpenID configuration, checked against its issuer.</summary>
    internal static async Task<JsonObject> DiscoverAsync(string issuer, Func<string, CancellationToken, Task<JsonObject>> fetch, CancellationToken ct)
    {
        var meta = await fetch(issuer.TrimEnd('/') + "/.well-known/openid-configuration", ct).ConfigureAwait(false);
        if (Json.Str(meta, "issuer") != issuer) throw new TouchqueConfigException("the identity provider's metadata does not match its issuer");
        return meta;
    }

    /// <summary>
    /// Whether a DPoP challenge in <c>WWW-Authenticate</c> asks for a nonce: its own <c>error</c> parameter is
    /// exactly <c>use_dpop_nonce</c> (RFC 9449 section 9). It only decides the nonce retry, never the error.
    /// One pass over each header value, linear in its length, that never throws (RFC 9110 section 11.6.1): a
    /// token followed by "=" is an auth-param of the current challenge, any other token starts a new one;
    /// scheme and parameter names are case-insensitive. A value is a token or a quoted-string: a comma inside
    /// quotes does not split, a quoted-pair (\ and a character) is that character, and a quoted-string without
    /// its closing quote has no value (the rest of the field value is inside it).
    /// </summary>
    internal static bool DpopChallengeAsksForNonce(IEnumerable<string> wwwAuthenticate)
    {
        foreach (var v in wwwAuthenticate)
        {
            var dpop = false;
            var i = 0;
            while (i < v.Length)
            {
                if (!IsTchar(v[i]))
                {
                    i++; // "," or a space between elements, or a stray character
                    continue;
                }
                var start = i;
                while (i < v.Length && IsTchar(v[i])) i++;
                var name = v.AsSpan(start, i - start);
                var j = i;
                while (j < v.Length && v[j] is ' ' or '\t') j++;
                if (j == v.Length || v[j] != '=')
                {
                    // An auth-scheme (or a token68 after one, which no DPoP challenge has).
                    dpop = name.Equals("DPoP", StringComparison.OrdinalIgnoreCase);
                    i = j;
                    continue;
                }
                j++;
                while (j < v.Length && v[j] is ' ' or '\t') j++;
                var wanted = dpop && name.Equals("error", StringComparison.OrdinalIgnoreCase);
                string? value = null;
                if (j < v.Length && v[j] == '"')
                {
                    var text = wanted ? new StringBuilder() : null;
                    var closed = false;
                    for (j++; j < v.Length; j++)
                    {
                        if (v[j] == '"')
                        {
                            closed = true;
                            break;
                        }
                        if (v[j] == '\\' && j + 1 < v.Length) j++;
                        text?.Append(v[j]);
                    }
                    if (!closed) break;
                    j++; // the closing quote
                    value = text?.ToString();
                }
                else
                {
                    var from = j;
                    while (j < v.Length && IsTchar(v[j])) j++;
                    if (wanted) value = v[from..j];
                }
                i = j;
                if (value == "use_dpop_nonce") return true;
            }
        }
        return false;
    }

    /// <summary>
    /// <paramref name="error"/> when it is an OAuth error code as RFC 6749 section 5.2 writes one
    /// (%x20-21 / %x23-5B / %x5D-7E: printable ASCII or space, but no <c>"</c> or <c>\</c>), 1 to 128
    /// characters; otherwise null.
    /// </summary>
    internal static string? OAuthErrorCode(string? error)
    {
        if (error is not { Length: > 0 and <= 128 }) return null;
        foreach (var c in error)
        {
            if (c is not ('\x20' or '\x21' or (>= '\x23' and <= '\x5B') or (>= '\x5D' and <= '\x7E'))) return null;
        }
        return error;
    }

    /// <summary>
    /// The <c>DPoP-Nonce</c> of an answer when it is one valid nonce (RFC 9449: 1*NQCHAR, printable ASCII
    /// except space, " and \); null when the header is missing, empty or invalid, or repeats with another value.
    /// </summary>
    internal static string? ValidDpopNonce(IEnumerable<string> values)
    {
        string? nonce = null;
        foreach (var v in values)
        {
            if (v.Length == 0 || (nonce is not null && v != nonce)) return null;
            foreach (var c in v)
            {
                if (c is not ('\x21' or (>= '\x23' and <= '\x5B') or (>= '\x5D' and <= '\x7E'))) return null;
            }
            nonce = v;
        }
        return nonce;
    }

    /// <summary>
    /// No answer to read: the token endpoint was not reached, reset the connection or timed out (the shared
    /// client's 10 s), or HttpClient refused its answer (a malformed or oversized header section, a body it
    /// could not read). A cancellation the caller asked for with <paramref name="ct"/> is not one: it stays
    /// an OperationCanceledException.
    /// </summary>
    private static bool NoAnswer(Exception e, CancellationToken ct) =>
        (e is HttpRequestException or IOException or OperationCanceledException) && !ct.IsCancellationRequested;

    private static TouchqueIdJagException Unavailable(string url, Exception e, string? latestNonce) =>
        new("temporarily_unavailable", $"{url} could not be reached or read: {e.Message}", null, e) { DpopNonce = latestNonce };

    /// <summary>
    /// POSTs a form to a token endpoint: a 2xx answer that is a JSON object, and the latest valid
    /// <c>DPoP-Nonce</c> the server sent during the call. Anything else is a <see cref="TouchqueIdJagException"/>
    /// that carries that nonce: another status (a redirect too: none is followed) gives its status and the
    /// body's OAuth error, else server_error; a 2xx without a JSON object, invalid_response; no answer,
    /// temporarily_unavailable (<see cref="NoAnswer"/>), with its cause as the InnerException.
    /// </summary>
    private static async Task<(JsonObject Data, string? DpopNonce)> PostFormAsync(string url, Dictionary<string, string?> form, (string Id, string Secret)? basic, IdJagDpopKey? dpopKey, CancellationToken ct)
    {
        if (!SafeUrl(url)) throw new TouchqueConfigException($"{url} must be an https URL");
        // The proof names the URL as HttpClient sends it (System.Uri's form: %7E as ~, | as %7C).
        var sent = new Uri(url).AbsoluteUri;
        string? nonce = null;
        // The latest valid DPoP-Nonce the server sent during this call, in any answer: every error carries it.
        string? latestNonce = null;
        while (true)
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new FormUrlEncodedContent(form.Where(kv => kv.Value is not null).Select(kv => new KeyValuePair<string, string>(kv.Key, kv.Value!))),
            };
            req.Headers.Accept.ParseAdd("application/json");
            // A fresh proof (jti, iat) for each request; the second one carries the server's nonce.
            if (dpopKey is not null) req.Headers.TryAddWithoutValidation("DPoP", IdJagDpopProof(dpopKey, sent, nonce: nonce));
            if (basic is { } b)
            {
                var raw = Uri.EscapeDataString(b.Id) + ":" + Uri.EscapeDataString(b.Secret);
                req.Headers.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(raw)));
            }
            HttpResponseMessage answer;
            try
            {
                answer = await SharedClient.Value.SendAsync(req, ct).ConfigureAwait(false);
            }
            catch (Exception e) when (NoAnswer(e, ct))
            {
                throw Unavailable(url, e, latestNonce);
            }
            using var res = answer;
            var answerNonce = res.Headers.NonValidated.TryGetValues("DPoP-Nonce", out var nonces) ? ValidDpopNonce(nonces) : null;
            latestNonce = answerNonce ?? latestNonce;
            string text;
            try
            {
                // JSON is UTF-8 (RFC 8259): a charset in Content-Type, even one .NET does not know, changes nothing.
                text = Encoding.UTF8.GetString(await res.Content.ReadAsByteArrayAsync(ct).ConfigureAwait(false));
            }
            catch (Exception e) when (NoAnswer(e, ct))
            {
                throw Unavailable(url, e, latestNonce);
            }
            if (text.StartsWith('\uFEFF')) text = text[1..];
            var status = (int)res.StatusCode;
            // JSON that repeats a member name or holds a lone surrogate would throw ArgumentException or
            // InvalidOperationException on its first read: it is not read at all.
            var json = Json.Parse(text);
            var data = json is JsonObject o && Json.IsIJson(text) ? o : null;
            if (status is >= 200 and <= 299)
            {
                if (data is not null) return (data, latestNonce);
                var why = json is JsonObject ? "JSON that repeats a member name or holds a lone surrogate" : "something other than a JSON object";
                throw new TouchqueIdJagException("invalid_response", $"{url} answered {status} with {why}", status) { DpopNonce = latestNonce };
            }
            // Any other status is a refusal. Its error is the body's (RFC 6749 section 5.2), never WWW-Authenticate's.
            var error = OAuthErrorCode(Json.Str(data, "error"));
            // RFC 9449 section 8: the server wants its nonce in the proof, in the body or, for a 401, in a DPoP
            // challenge. Once per call (nonce is still null), never in a loop.
            if (dpopKey is not null && nonce is null && answerNonce is not null && status is 400 or 401
                && (error == "use_dpop_nonce" || (status == 401 && res.Headers.NonValidated.TryGetValues("WWW-Authenticate", out var www) && DpopChallengeAsksForNonce(www))))
            {
                nonce = answerNonce;
                continue;
            }
            throw new TouchqueIdJagException(error ?? "server_error", Json.Str(data, "error_description") ?? $"{url} answered {status}", status)
            {
                DpopNonce = latestNonce,
            };
        }
    }

    /// <summary>
    /// Trades a member's ID token for an ID-JAG at the identity provider (token exchange, client_secret_basic).
    /// A refusal, an answer that is not an ID-JAG, or a token endpoint that cannot be reached or read throws
    /// <see cref="TouchqueIdJagException"/>.
    /// </summary>
    public static async Task<IdJagGrant> RequestIdJagAsync(RequestIdJagOptions o, CancellationToken ct = default)
    {
        var endpoint = o.TokenEndpoint;
        if (string.IsNullOrEmpty(endpoint))
        {
            if (string.IsNullOrEmpty(o.Issuer)) throw new TouchqueConfigException("RequestIdJagAsync needs Issuer or TokenEndpoint");
            endpoint = Json.Str(await DiscoverAsync(o.Issuer, GetJsonAsync, ct).ConfigureAwait(false), "token_endpoint")
                ?? throw new TouchqueConfigException("the identity provider names no token_endpoint");
        }
        var (data, nonce) = await PostFormAsync(endpoint, new()
        {
            ["grant_type"] = TokenExchangeGrant, ["requested_token_type"] = IdJagTokenType, ["subject_token"] = o.IdToken,
            ["subject_token_type"] = IdTokenType, ["audience"] = o.Audience, ["resource"] = o.Resource, ["scope"] = o.Scope,
        }, (o.ClientId, o.ClientSecret), o.DpopKey, ct).ConfigureAwait(false);
        var assertion = Json.Str(data, "access_token");
        if (Json.Str(data, "issued_token_type") != IdJagTokenType || string.IsNullOrEmpty(assertion))
        {
            throw new TouchqueIdJagException("invalid_response", "the identity provider did not answer with an ID-JAG") { DpopNonce = nonce };
        }
        bool? dpopBound = null;
        if (o.DpopKey is not null)
        {
            // An identity provider without DPoP support ignores the proof: say so instead of guessing.
            var claims = JwsVerify.Split(assertion)?.Claims;
            dpopBound = claims?["cnf"] is JsonObject cnf && Json.Str(cnf, "jkt") is { } jkt && jkt == o.DpopKey.Thumbprint;
        }
        return new IdJagGrant(assertion, (int?)Json.Long(data, "expires_in"), Json.Str(data, "scope")) { DpopBound = dpopBound };
    }

    /// <summary>
    /// Trades an ID-JAG for an access token at the other service's authorization server (jwt-bearer): its 2xx
    /// answer, a JSON object. A refusal, any other answer, or a token endpoint that cannot be reached or read
    /// throws <see cref="TouchqueIdJagException"/>.
    /// </summary>
    public static async Task<JsonObject> RedeemIdJagAsync(RedeemIdJagOptions o, CancellationToken ct = default) =>
        (await PostFormAsync(o.TokenEndpoint, new()
        {
            ["grant_type"] = JwtBearerGrant, ["assertion"] = o.Assertion, ["resource"] = o.Resource, ["scope"] = o.Scope,
            ["client_id"] = string.IsNullOrEmpty(o.ClientSecret) ? o.ClientId : null,
        }, string.IsNullOrEmpty(o.ClientSecret) ? null : (o.ClientId, o.ClientSecret), o.DpopKey, ct).ConfigureAwait(false)).Data;
}

/// <summary>Settings of <see cref="IdJagVerifier"/>.</summary>
public sealed record IdJagVerifierOptions
{
    /// <summary>The identity provider, e.g. https://sso.touchque.com.</summary>
    public required string Issuer { get; init; }
    /// <summary>Your authorization server's issuer identifier (the ID-JAG's aud).</summary>
    public required string Audience { get; init; }
    /// <summary>Its JWKS, when not found from the issuer's /.well-known/openid-configuration.</summary>
    public string? JwksUri { get; init; }
    public TimeSpan ClockSkew { get; init; } = TimeSpan.FromSeconds(60);
    /// <summary>
    /// Records an ID-JAG's jti and says whether it is new (each is used once). Defaults to memory
    /// in this process; give a shared store (Redis SET NX) when several processes take ID-JAGs.
    /// </summary>
    public Func<string, long, bool>? FirstUse { get; init; }
    /// <summary>For tests: how JSON documents are fetched.</summary>
    public Func<string, CancellationToken, Task<JsonObject>>? Fetch { get; init; }
}

/// <summary>A checked ID-JAG.</summary>
public sealed record IdJagClaims
{
    public string Iss { get; init; } = "";
    /// <summary>The member at the identity provider.</summary>
    public string Sub { get; init; } = "";
    public string Aud { get; init; } = "";
    /// <summary>Your client_id of the app that presented it.</summary>
    public string ClientId { get; init; } = "";
    public string Jti { get; init; } = "";
    public long IssuedAt { get; init; }
    public long ExpiresAt { get; init; }
    public IReadOnlyList<string> Scopes { get; init; } = Array.Empty<string>();
    public string? Resource { get; init; }
    public string? Tenant { get; init; }
    public string? Email { get; init; }
    public long? AuthTime { get; init; }
    public IReadOnlyList<string> Amr { get; init; } = Array.Empty<string>();
    /// <summary>The DPoP key thumbprint the ID-JAG is bound to (cnf.jkt), when it is.</summary>
    public string? CnfJkt { get; init; }
    public JsonObject Claims { get; init; } = new();
}

/// <summary>
/// Your authorization server, taking ID-JAGs from an organization's identity provider:
/// checks the one an authenticated client presents (jwt-bearer grant) and uses it once.
/// Build one and keep it (a singleton): its used-once jti store and key cache live in the instance.
/// <code>
/// var verifier = new IdJagVerifier(new() { Issuer = "https://sso.touchque.com", Audience = "https://auth.files.example" });
/// // Per token request:
/// var claims = await verifier.VerifyAsync(form["assertion"], authenticatedClientId);
/// // An authorization server that checks DPoP proofs passes the proof key's thumbprint:
/// var bound = await verifier.VerifyAsync(form["assertion"], authenticatedClientId, dpopJkt);
/// </code>
/// </summary>
public sealed class IdJagVerifier
{
    private readonly IdJagVerifierOptions _o;
    private readonly Func<string, CancellationToken, Task<JsonObject>> _fetch;
    private readonly SemaphoreSlim _keysLock = new(1, 1);
    private readonly ConcurrentDictionary<string, long> _seen = new();
    private Dictionary<string, JsonObject> _keys = new();
    private string? _jwksUri;
    private DateTimeOffset _keysAt;
    private DateTimeOffset _triedAt;

    public IdJagVerifier(IdJagVerifierOptions options)
    {
        if (string.IsNullOrEmpty(options.Issuer) || string.IsNullOrEmpty(options.Audience))
        {
            throw new TouchqueConfigException("IdJagVerifier needs Issuer (the identity provider) and Audience (your authorization server's issuer)");
        }
        _o = options;
        _jwksUri = options.JwksUri;
        _fetch = options.Fetch ?? CrossAppAccess.GetJsonAsync;
    }

    private bool RememberOnce(string jti, long exp)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        foreach (var (k, until) in _seen)
        {
            if (until < now) _seen.TryRemove(k, out _);
        }
        return _seen.TryAdd(jti, exp + (long)_o.ClockSkew.TotalSeconds);
    }

    private async Task LoadKeysAsync(CancellationToken ct)
    {
        if (string.IsNullOrEmpty(_jwksUri))
        {
            _jwksUri = Json.Str(await CrossAppAccess.DiscoverAsync(_o.Issuer, _fetch, ct).ConfigureAwait(false), "jwks_uri")
                ?? throw new InvalidOperationException("the identity provider names no jwks_uri");
        }
        var keys = new Dictionary<string, JsonObject>();
        if ((await _fetch(_jwksUri, ct).ConfigureAwait(false))["keys"] is JsonArray list)
        {
            foreach (var k in list.OfType<JsonObject>())
            {
                var kid = Json.Str(k, "kid");
                if (!string.IsNullOrEmpty(kid)) keys[kid] = k;
            }
        }
        _keys = keys;
        _keysAt = DateTimeOffset.UtcNow;
    }

    private async Task<JsonObject?> KeyForAsync(string kid, CancellationToken ct)
    {
        await _keysLock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (_keysAt == default || DateTimeOffset.UtcNow - _keysAt > TimeSpan.FromMinutes(10)) await LoadKeysAsync(ct).ConfigureAwait(false);
            if (!_keys.ContainsKey(kid) && DateTimeOffset.UtcNow - _triedAt > TimeSpan.FromMinutes(1))
            {
                _triedAt = DateTimeOffset.UtcNow;
                await LoadKeysAsync(ct).ConfigureAwait(false);
            }
            return _keys.GetValueOrDefault(kid);
        }
        finally
        {
            _keysLock.Release();
        }
    }

    /// <summary>
    /// The ID-JAG, checked and used once; throws <see cref="TouchqueIdJagException"/> (Error invalid_grant).
    /// An ID-JAG bound to a DPoP key (cnf.jkt) is refused: pass the proof's thumbprint for those.
    /// </summary>
    public Task<IdJagClaims> VerifyAsync(string assertion, string clientId, CancellationToken ct = default) =>
        VerifyAsync(assertion, clientId, null, ct);

    /// <summary>
    /// The ID-JAG, checked and used once. <paramref name="dpopJkt"/>: the thumbprint of the key of the DPoP
    /// proof you verified on this request (<see cref="AgentKeys.Thumbprint"/> of its jwk), if any; an ID-JAG
    /// bound to a key (cnf.jkt) is refused without a matching one. The proof itself (typ, its signature
    /// with its jwk, htm, htu, iat, each jti once) is yours to check.
    /// </summary>
    public async Task<IdJagClaims> VerifyAsync(string assertion, string clientId, string? dpopJkt, CancellationToken ct = default)
    {
        static TouchqueIdJagException Bad(string m) => new("invalid_grant", m);
        var parts = JwsVerify.Split(assertion ?? "") ?? throw Bad("assertion is not a JWT");
        var (head, c, input, sig) = parts;
        if (Json.Str(head, "typ") != "oauth-id-jag+jwt") throw Bad("not an ID-JAG (typ oauth-id-jag+jwt)");
        var alg = Json.Str(head, "alg");
        var kid = Json.Str(head, "kid");
        if (alg is not ("RS256" or "ES256" or "EdDSA") || string.IsNullOrEmpty(kid)) throw Bad("unsupported signature");
        JsonObject? key;
        try
        {
            key = await KeyForAsync(kid, ct).ConfigureAwait(false);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            throw new TouchqueIdJagException("temporarily_unavailable", "the identity provider's keys could not be read: " + e.Message);
        }
        if (key is null || !JwsVerify.Verify(alg, key, input, sig)) throw Bad("signature does not verify");
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var skew = (long)_o.ClockSkew.TotalSeconds;
        var auds = c["aud"] is JsonArray a ? a.Select(x => x?.GetValueKind() == System.Text.Json.JsonValueKind.String ? x.GetValue<string>() : null).ToList() : new List<string?> { Json.Str(c, "aud") };
        var exp = Json.Long(c, "exp");
        var iat = Json.Long(c, "iat");
        var sub = Json.Str(c, "sub");
        var jti = Json.Str(c, "jti");
        if (Json.Str(c, "iss") != _o.Issuer) throw Bad("another issuer");
        if (auds.Count != 1 || auds[0] != _o.Audience) throw Bad("not for this authorization server");
        if (string.IsNullOrEmpty(clientId) || Json.Str(c, "client_id") != clientId) throw Bad("issued to another client");
        if (exp is null || exp.Value + skew < now) throw Bad("expired");
        if (iat is null || iat.Value - skew > now) throw Bad("issued in the future");
        if (string.IsNullOrEmpty(sub) || string.IsNullOrEmpty(jti)) throw Bad("sub and jti are required");
        // Before the jti is spent: a copy without the key cannot use the ID-JAG up.
        string? cnfJkt = null;
        if (c.ContainsKey("cnf"))
        {
            if (c["cnf"] is not JsonObject cnf || Json.Str(cnf, "jkt") is not { } jkt) throw Bad("unsupported confirmation method (only DPoP cnf.jkt)");
            if (string.IsNullOrEmpty(dpopJkt)) throw Bad("bound to a DPoP key: a DPoP proof with that key is required");
            if (dpopJkt != jkt) throw Bad("the DPoP proof was made with another key");
            cnfJkt = jkt;
        }
        if (!(_o.FirstUse ?? RememberOnce)(jti, exp.Value)) throw Bad("already used");
        var scope = Json.Str(c, "scope");
        return new IdJagClaims
        {
            Iss = _o.Issuer, Sub = sub, Aud = _o.Audience, ClientId = clientId, Jti = jti, IssuedAt = iat.Value, ExpiresAt = exp.Value,
            Scopes = string.IsNullOrEmpty(scope) ? Array.Empty<string>() : scope.Split(' '),
            Resource = Json.Str(c, "resource"), Tenant = Json.Str(c, "tenant"), Email = Json.Str(c, "email"), AuthTime = Json.Long(c, "auth_time"),
            Amr = c["amr"] is JsonArray amr ? amr.Select(x => x?.ToString() ?? "").ToList() : Array.Empty<string>(),
            CnfJkt = cnfJkt,
            Claims = c,
        };
    }
}

// ─────────────────────────────────────────────────────────────
// From src/Touchque/Resources/Auth.cs — client.Auth: first-time QR with the browser's IP and User-Agent, setup context
// ─────────────────────────────────────────────────────────────

using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Touchque.Internal;

namespace Touchque;

/// <summary>Setup secrets (the QR code the Touchque app scans) and a user's link status.</summary>
public sealed class AuthResource
{
    private readonly TouchqueHttp _http;

    internal AuthResource(TouchqueHttp http) => _http = http;

    /// <summary>
    /// A new setup secret for a user: show <see cref="GenerateSecretResult.QrCodeDataUrl"/> so
    /// the Touchque app links the phone. 409 when an unscanned or used secret exists
    /// (<see cref="ResetSecretAsync(string, string, string, CancellationToken)"/> issues a new one).
    /// </summary>
    /// <param name="clientIp">
    /// The END user's IP, from the request that asks for the QR, as for a login request (sent only
    /// when not null or empty). Touchque keeps it with the secret, never in the QR: before linking,
    /// the phone shows where the QR was asked for (<see cref="ValidateSecretResult.SetupContext"/>).
    /// </param>
    /// <param name="userAgent">The end user's User-Agent, from the same request (sent only when not null or empty).</param>
    public Task<GenerateSecretResult> GenerateSecretAsync(string externalUsername, string? clientIp = null, string? userAgent = null, CancellationToken ct = default) =>
        _http.PostAsync<GenerateSecretResult>("/auth/generate-secret", SecretBody(externalUsername, clientIp, userAgent), ct);

    /// <summary>A new setup secret for a user, without the end user's IP and User-Agent.</summary>
    public Task<GenerateSecretResult> GenerateSecretAsync(string externalUsername, CancellationToken ct) =>
        GenerateSecretAsync(externalUsername, null, null, ct);

    /// <summary>Regenerates a user's secret.</summary>
    /// <param name="clientIp">
    /// The END user's IP, from the request that asks for the new QR, sent like
    /// <see cref="GenerateSecretAsync(string, string, string, CancellationToken)"/>'s: only when not null or empty.
    /// </param>
    /// <param name="userAgent">The end user's User-Agent, from the same request (sent only when not null or empty).</param>
    public Task<ResetSecretResult> ResetSecretAsync(string externalUsername, string? clientIp = null, string? userAgent = null, CancellationToken ct = default) =>
        _http.PostAsync<ResetSecretResult>("/auth/secret/reset", SecretBody(externalUsername, clientIp, userAgent), ct);

    /// <summary>Regenerates a user's secret, without the end user's IP and User-Agent.</summary>
    public Task<ResetSecretResult> ResetSecretAsync(string externalUsername, CancellationToken ct) =>
        ResetSecretAsync(externalUsername, null, null, ct);

    /// <summary>
    /// Checks a setup secret code. A valid one carries <see cref="ValidateSecretResult.SetupContext"/>:
    /// where its QR was asked for.
    /// </summary>
    public Task<ValidateSecretResult> ValidateSecretAsync(string secret, CancellationToken ct = default) =>
        _http.PostAsync<ValidateSecretResult>("/auth/secret/validate", new JsonObject { ["secret"] = secret }, ct);

    /// <summary>The user, and the end user's IP and User-Agent with the same rule as a login request: each only when not null or empty.</summary>
    private static JsonObject SecretBody(string externalUsername, string? clientIp, string? userAgent) =>
        new JsonObject { ["externalUsername"] = externalUsername }.Put("clientIp", clientIp).Put("userAgent", userAgent);

    /// <summary>
    /// A user's link status without sending a push: <see cref="TouchqueUser.Used"/> flips true and
    /// <see cref="TouchqueUser.DeviceId"/> is set once the app scans the secret.
    /// <see cref="TouchqueUser.Device"/> is the linked phone's self-reported posture (device trust).
    /// Throws <see cref="TouchqueApiException"/> (404) for an unknown user.
    /// </summary>
    public Task<TouchqueUser> GetUserAsync(string externalUsername, CancellationToken ct = default) =>
        _http.GetAsync<TouchqueUser>("/users/" + TouchqueHttp.Seg(externalUsername), null, ct);
}

public sealed record GenerateSecretResult : TouchqueObject
{
    public string Secret { get; init; } = "";
    public string ExternalUsername { get; init; } = "";
    public string? ExpiresAt { get; init; }
    public long? TtlMs { get; init; }
    /// <summary>A ready-to-render <c>data:image/png;base64,…</c> QR code for the Touchque app.</summary>
    public string? QrCodeDataUrl { get; init; }
    public IReadOnlyList<string>? RecoveryCodes { get; init; }
}

public sealed record ResetSecretResult : TouchqueObject
{
    public string? Message { get; init; }
    public string? UserId { get; init; }
    public string Secret { get; init; } = "";
    public string ExternalUsername { get; init; } = "";
    public string? ExpiresAt { get; init; }
    public long? TtlMs { get; init; }
    public string? QrCodeDataUrl { get; init; }
    public IReadOnlyList<string>? RecoveryCodes { get; init; }
}

public sealed record ValidateSecretResult : TouchqueObject
{
    public bool Valid { get; init; }
    public string? ExternalUsername { get; init; }
    public string? IntegrationId { get; init; }
    public string? Message { get; init; }
    public string? Reason { get; init; }
    public string? UsedAt { get; init; }
    public string? ExpiredAt { get; init; }

    /// <summary>
    /// Where the QR of this secret was asked for, which the phone shows before it links: null for
    /// an older QR, an API before setup context, or a QR asked for without the end user's IP and
    /// User-Agent. Read leniently: an answer of another shape is null, never an error.
    /// </summary>
    [JsonConverter(typeof(LenientObjectConverter<SetupContext>))]
    public SetupContext? SetupContext { get; init; }
}

/// <summary>
/// 2FA setup context: where a first-time linking QR was asked for (the browser that asked for it,
/// as the API recorded it from that request), shown on the phone before it links. Someone tricked
/// into scanning an attacker's QR sees the attacker's place and device. Every field may be null;
/// one the API sends in another shape is null too.
/// </summary>
public sealed record SetupContext : TouchqueObject
{
    /// <summary>The IP address the QR was asked from, or null.</summary>
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Ip { get; init; }

    /// <summary>Where that address is (GeoIP), or null when unknown.</summary>
    [JsonConverter(typeof(LenientObjectConverter<SetupLocation>))]
    public SetupLocation? Location { get; init; }

    /// <summary>The browser and system from its User-Agent, or null when unknown.</summary>
    [JsonConverter(typeof(LenientObjectConverter<SetupDevice>))]
    public SetupDevice? Device { get; init; }

    /// <summary>When the QR was asked for (ISO 8601), as the API sent it.</summary>
    [JsonConverter(typeof(LenientStringConverter))]
    public string? RequestedAt { get; init; }

    /// <summary>True when the QR was asked for far from the phone that checks it, false when not, null when Touchque cannot tell.</summary>
    [JsonConverter(typeof(LenientBoolConverter))]
    public bool? FarFromPhone { get; init; }
}

/// <summary>Where a setup request came from (GeoIP).</summary>
public sealed record SetupLocation : TouchqueObject
{
    [JsonConverter(typeof(LenientStringConverter))]
    public string? City { get; init; }

    [JsonConverter(typeof(LenientStringConverter))]
    public string? Country { get; init; }

    /// <summary>ISO 3166-1 alpha-2, e.g. <c>DE</c>.</summary>
    [JsonConverter(typeof(LenientStringConverter))]
    public string? CountryCode { get; init; }
}

/// <summary>The browser and system a setup request came from (its User-Agent).</summary>
public sealed record SetupDevice : TouchqueObject
{
    /// <summary>E.g. <c>Chrome</c>, <c>Safari</c>.</summary>
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Browser { get; init; }

    /// <summary>E.g. <c>macOS</c>, <c>iOS</c>, <c>Windows</c>.</summary>
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Os { get; init; }

    /// <summary>E.g. <c>iPhone</c>, when the User-Agent names one.</summary>
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Model { get; init; }
}

/// <summary>A user as Touchque knows them.</summary>
public sealed record TouchqueUser : TouchqueObject
{
    public string ExternalUsername { get; init; } = "";
    public string? DeviceId { get; init; }
    public bool Used { get; init; }
    public bool Frozen { get; init; }
    public string? CreatedAt { get; init; }
    public string? ExpireAt { get; init; }
    /// <summary>The linked phone's posture, or null before a phone is linked.</summary>
    public DevicePosture? Device { get; init; }
}

/// <summary>The linked phone's posture for device trust. Self-reported by the app.</summary>
public sealed record DevicePosture : TouchqueObject
{
    /// <summary><c>ios</c>, <c>android</c> or null.</summary>
    public string? Platform { get; init; }
    public string? Model { get; init; }
    public string? OsVersion { get; init; }
    /// <summary>Android security patch level (YYYY-MM-DD).</summary>
    public string? SecurityPatch { get; init; }
    public string? AppVersion { get; init; }
    public bool? ScreenLock { get; init; }
    /// <summary><c>face</c>, <c>touch</c>, <c>fingerprint</c>, <c>iris</c>, <c>none</c> or null.</summary>
    public string? Biometrics { get; init; }
    public bool Jailbroken { get; init; }
    public bool Compromised { get; init; }
    public bool HardwareKey { get; init; }
    /// <summary><c>apple-appattest</c>, <c>android-key</c> or null.</summary>
    public string? Attestation { get; init; }
    /// <summary>The latest report was signed by the phone's hardware key.</summary>
    public bool Signed { get; init; }
    public string? ReportedAt { get; init; }
    public string? LastSeenAt { get; init; }
    public string? LinkedAt { get; init; }
    /// <summary><c>healthy</c>, <c>at_risk</c>, <c>compromised</c> or <c>unknown</c>.</summary>
    public string State { get; init; } = "unknown";
    /// <summary>jailbroken, tampered, integrity_failed, no_report, stale_report, no_screen_lock, keys_lost, no_hardware_key, debugger, developer_mode.</summary>
    public IReadOnlyList<string> Issues { get; init; } = Array.Empty<string>();
}

// ─────────────────────────────────────────────────────────────
// From src/Touchque/Resources/Identity.cs — client.Identity: Touchque Login admin: passkey domain, user store, custom domains
// ─────────────────────────────────────────────────────────────

using System.Globalization;
using System.Text.Json.Nodes;
using Touchque.Internal;

namespace Touchque;

/// <summary>
/// Touchque Login Management API: your customers' accounts, roles,
/// business-customer organizations, apps, APIs, connections and the tenant
/// itself, from your server with your workspace key. Bodies are any object
/// (anonymous, dictionary, JsonObject) with the API's camelCase fields; answers
/// are the API's JSON.
/// <code>
/// var found = await tq.Identity.Users.ListAsync(new { q = "ayse" });
/// await tq.Identity.Users.BlockAsync(userId, "chargeback");
/// var job = await tq.Identity.Imports.StartAsync(new { users = new[] { new { email, passwordHash = "$2b$10$…" } } });
/// </code>
/// </summary>
public sealed class IdentityResource
{
    private readonly TouchqueHttp _http;

    internal IdentityResource(TouchqueHttp http)
    {
        _http = http;
        Users = new IdentityUsers(http);
        Imports = new IdentityJobs(http, "imports");
        Exports = new IdentityJobs(http, "exports");
        Roles = new IdentityCrud(http, "/identity/roles", "roles");
        Organizations = new IdentityOrganizations(http);
        Clients = new IdentityClients(http);
        Apis = new IdentityCrud(http, "/identity/apis", "apis");
        Connections = new IdentityCrud(http, "/identity/connections", "connections");
        CustomDomains = new IdentityCustomDomains(http);
    }

    public IdentityUsers Users { get; }
    public IdentityJobs Imports { get; }
    public IdentityJobs Exports { get; }
    public IdentityCrud Roles { get; }
    public IdentityOrganizations Organizations { get; }
    public IdentityClients Clients { get; }
    public IdentityCrud Apis { get; }
    public IdentityCrud Connections { get; }

    /// <summary>Your own sign-in domains (<c>login.acme.com</c>): list, overview, get, create, verify, update (primary), delete.</summary>
    public IdentityCustomDomains CustomDomains { get; }

    /// <summary>The tenant (404 not_enabled until it is set up).</summary>
    public Task<JsonObject> GetTenantAsync(CancellationToken ct = default) => _http.GetAsync<JsonObject>("/identity/tenant", null, ct);

    /// <summary>Turns Touchque Login on (slug, displayName) or changes its settings.</summary>
    public Task<JsonObject> UpdateTenantAsync(object body, CancellationToken ct = default) => _http.PutAsync<JsonObject>("/identity/tenant", Json.ToNode(body), ct);

    /// <summary>Retires the tenant's signing key and makes a new one active.</summary>
    public Task<JsonObject> RotateSigningKeyAsync(CancellationToken ct = default) => _http.PostAsync<JsonObject>("/identity/tenant/signing-keys/rotate", new JsonObject(), ct);

    /// <summary>
    /// The phone app the hosted pages tell customers to approve on ("Approve on the Acme app").
    /// null: your brand name when the Mobile SDK is set up, else Touchque (<c>approverApp</c> in the tenant shows which).
    /// </summary>
    public Task<JsonObject> SetApproverAppNameAsync(string? name, CancellationToken ct = default) =>
        _http.PutAsync<JsonObject>("/identity/tenant", new JsonObject { ["branding"] = new JsonObject { ["approverAppName"] = name } }, ct);

    /// <summary>
    /// Serve sign-in only on the primary custom domain: {slug}.login.touchque.com redirects page loads there and
    /// refuses other calls. Turning it on needs a verified primary domain with a working certificate.
    /// </summary>
    public Task<JsonObject> SetCustomDomainOnlyAsync(bool on, CancellationToken ct = default) =>
        _http.PutAsync<JsonObject>("/identity/tenant", new JsonObject { ["customDomainOnly"] = on }, ct);

    /// <summary>
    /// The domain customer passkeys are made for (their relying party ID): null or "" for none (a passkey belongs to the
    /// host it was made on), one of your verified custom domains, or a domain above one of them that your organization
    /// verified (Organization → Domains: <c>acme.com</c> for <c>login.acme.com</c>), so passkeys keep working when
    /// sign-in moves to another host under it. Answers the tenant (<c>passkeyDomain</c>). Refusals are <see cref="TouchqueApiException"/>
    /// with the code in <see cref="TouchqueApiException.Error"/> and the field in <c>Body["field"]</c>: 400
    /// <c>invalid_request</c> (field <c>passkeyDomain</c>) for a value that is not a domain; 409 <c>not_your_domain</c>;
    /// 409 <c>organization_unavailable</c> (your organization's domains could not be read: try again); 409
    /// <c>passkeys_exist</c> (<c>Body["count"]</c> customer passkeys would stop working: set it before customers make
    /// passkeys). Before Touchque Login is set up for the workspace: 400 <c>invalid_request</c> with field <c>slug</c>
    /// (set it up with <see cref="UpdateTenantAsync"/> first).
    /// </summary>
    public Task<JsonObject> SetPasskeyDomainAsync(string? domain, CancellationToken ct = default) =>
        _http.PutAsync<JsonObject>("/identity/tenant", new JsonObject { ["passkeyDomain"] = domain }, ct);

    /// <summary>
    /// An alias of <see cref="IdentityCustomDomains.OverviewAsync"/> (<c>CustomDomains.OverviewAsync()</c>): the
    /// custom-domain list as Touchque answers it, the domains with <c>VerifiedDomains</c> and <c>SlugPasskeys</c>.
    /// </summary>
    public Task<CustomDomainsOverview> GetCustomDomainsAsync(CancellationToken ct = default) => CustomDomains.OverviewAsync(ct);

    /// <summary>Checks a verified custom domain's certificate at the sign-in edge now (<c>certificate</c>: pending | active | error).</summary>
    public Task<JsonObject> CheckDomainCertificateAsync(string domainId, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>("/identity/custom-domains/" + TouchqueHttp.Seg(domainId) + "/check-certificate", new JsonObject(), ct);

    /// <summary>The delivery log. Message text only in the local dev inbox.</summary>
    public Task<JsonObject> OutboxAsync(object? query = null, CancellationToken ct = default) => _http.GetAsync<JsonObject>("/identity/outbox", IdentityQuery.Of(query), ct);

    /// <summary>Wrong passwords, suspicious addresses, bot challenge, breached passwords, new-browser notices, the risk engine.</summary>
    public Task<JsonObject> GetAttackProtectionAsync(CancellationToken ct = default) => _http.GetAsync<JsonObject>("/identity/attack-protection", null, ct);

    /// <summary>Partial; the bot challenge's secret is write-only.</summary>
    public Task<JsonObject> SetAttackProtectionAsync(object settings, CancellationToken ct = default) => _http.PutAsync<JsonObject>("/identity/attack-protection", Json.ToNode(settings), ct);

    /// <summary>What attack protection caught lately.</summary>
    public Task<JsonObject> AttackEventsAsync(object? query = null, CancellationToken ct = default) => _http.GetAsync<JsonObject>("/identity/attack-protection/events", IdentityQuery.Of(query), ct);

    /// <summary>The email and SMS providers; secrets never come back (secretsSet).</summary>
    public Task<JsonObject> GetDeliveryAsync(CancellationToken ct = default) => _http.GetAsync<JsonObject>("/identity/delivery", null, ct);

    /// <summary>
    /// Your own provider: email smtp, ses, postmark, sendgrid; sms twilio, netgsm, e.g.
    /// <c>new { provider = "postmark", from = "login@acme.com", serverToken }</c>. A secret left out keeps its stored value.
    /// </summary>
    public Task<JsonObject> SetDeliveryAsync(string channel, object provider, CancellationToken ct = default) =>
        _http.PutAsync<JsonObject>("/identity/delivery/" + TouchqueHttp.Seg(channel), Json.ToNode(provider), ct);

    /// <summary>Back to Touchque's transport.</summary>
    public Task<JsonObject> RemoveDeliveryAsync(string channel, CancellationToken ct = default) =>
        _http.DeleteAsync<JsonObject>("/identity/delivery/" + TouchqueHttp.Seg(channel), ct);

    /// <summary>One test message through the provider in use.</summary>
    public Task<JsonObject> TestDeliveryAsync(string channel, string to, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>("/identity/delivery/" + TouchqueHttp.Seg(channel) + "/test", new JsonObject { ["to"] = to }, ct);

    /// <summary>
    /// Moving your customers in from your own user database: <c>url</c>, <c>enabled</c>, <c>active</c> (asked only
    /// while it is enabled and passwords are on), <c>movedIn</c> (accounts made from it so far), <c>lastCall</c> ({ at, event, ok, status,
    /// ms, error } or null), <c>paused</c> (5 failed calls in a row pause it for a minute), <c>updatedAt</c>. Touchque
    /// POSTs <c>user_store.verify_password</c> { email, password } and <c>user_store.get_user</c> { email } to <c>url</c>,
    /// signed like its webhooks: check each with <see cref="WebhookResource.VerifyAsync"/> (or <c>MapTouchqueWebhook</c>),
    /// then answer 200 { "user": { "id", "email", … } } or { "user": null } (the same for an unknown address and a wrong
    /// password; 404 counts as null) within 5 seconds.
    /// </summary>
    public Task<JsonObject> GetUserStoreAsync(CancellationToken ct = default) =>
        _http.GetAsync<JsonObject>("/identity/user-store", null, ct);

    /// <summary>
    /// Sets the endpoint and whether it is asked. A null argument is left out: the endpoint set stays, and
    /// <paramref name="enabled"/> stays as it is (on for a new one). Answers like <see cref="GetUserStoreAsync"/>.
    /// Refusals (<see cref="TouchqueApiException.Error"/>): 409 <c>passwords_off</c> (turning it on while passwords are off),
    /// 400 <c>invalid_request</c> with <c>field</c> url (not a full https URL, a user name or password in it, a local address,
    /// over 500 characters, or none given and none set).
    /// </summary>
    public Task<JsonObject> SetUserStoreAsync(string? url = null, bool? enabled = null, CancellationToken ct = default)
    {
        var body = new JsonObject();
        if (url != null) body["url"] = url;
        if (enabled != null) body["enabled"] = enabled;
        return _http.PutAsync<JsonObject>("/identity/user-store", body, ct);
    }

    /// <summary>
    /// One signed <c>user_store.ping</c> to <paramref name="url"/> (null or "": the endpoint set, sent as <c>{}</c>):
    /// { ok, error, ms }. An endpoint that fails is an answer (<c>ok</c> false, <c>error</c> says why), not an exception,
    /// and it never pauses the endpoint.
    /// </summary>
    public Task<JsonObject> TestUserStoreAsync(string? url = null, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>("/identity/user-store/test", string.IsNullOrEmpty(url) ? new JsonObject() : new JsonObject { ["url"] = url }, ct);

    /// <summary>
    /// Stops asking your user database and forgets the endpoint; accounts already moved in stay. Answers an empty object
    /// (204), also when none is set; 404 <c>not_enabled</c> means Touchque Login is not set up.
    /// </summary>
    public Task<JsonObject> RemoveUserStoreAsync(CancellationToken ct = default) =>
        _http.DeleteAsync<JsonObject>("/identity/user-store", ct);
}

internal static class IdentityQuery
{
    /// <summary>A query from any object: its fields as strings (booleans lower-case), nulls left out.</summary>
    public static Dictionary<string, string?>? Of(object? query)
    {
        if (query is null) return null;
        var node = Json.ToNode(query) as JsonObject;
        if (node is null) return null;
        var d = new Dictionary<string, string?>();
        foreach (var (k, v) in node)
        {
            d[k] = v switch
            {
                null => null,
                JsonValue jv when jv.TryGetValue<string>(out var s) => s,
                JsonValue jv when jv.TryGetValue<bool>(out var b) => b ? "true" : "false",
                _ => v.ToJsonString(),
            };
        }
        return d;
    }
}

/// <summary>List, get, create, update and delete for one kind of Touchque Login object.</summary>
public class IdentityCrud
{
    private protected readonly TouchqueHttp Http;
    private protected readonly string Base;
    private readonly string _listKey;

    internal IdentityCrud(TouchqueHttp http, string basePath, string listKey)
    {
        Http = http;
        Base = basePath;
        _listKey = listKey;
    }

    public async Task<JsonArray> ListAsync(object? query = null, CancellationToken ct = default)
    {
        var res = await Http.GetAsync(Base, IdentityQuery.Of(query), ct).ConfigureAwait(false);
        return res?[_listKey]?.DeepClone() as JsonArray ?? new JsonArray();
    }

    public virtual Task<JsonObject> GetAsync(string id, CancellationToken ct = default) => Http.GetAsync<JsonObject>(Base + "/" + TouchqueHttp.Seg(id), null, ct);

    public Task<JsonObject> CreateAsync(object body, CancellationToken ct = default) => Http.PostAsync<JsonObject>(Base, Json.ToNode(body), ct);

    public Task<JsonObject> UpdateAsync(string id, object body, CancellationToken ct = default) => Http.PatchAsync<JsonObject>(Base + "/" + TouchqueHttp.Seg(id), Json.ToNode(body), ct);

    public Task<JsonObject> DeleteAsync(string id, CancellationToken ct = default) => Http.DeleteAsync<JsonObject>(Base + "/" + TouchqueHttp.Seg(id), ct);
}

/// <summary>
/// Your own sign-in domains (<c>login.acme.com</c>). <see cref="IdentityCrud.ListAsync"/> answers the domains, each
/// with <c>dns</c> (what its DNS said at the last check) and <c>autoCheckUntil</c>; <see cref="OverviewAsync"/> the
/// whole answer. The API has no read by id: <see cref="GetAsync"/> finds the domain in the list.
/// </summary>
public sealed class IdentityCustomDomains : IdentityCrud
{
    internal IdentityCustomDomains(TouchqueHttp http) : base(http, "/identity/custom-domains", "domains") { }

    /// <summary>
    /// The list as Touchque answers it: the domains (what <see cref="IdentityCrud.ListAsync"/> returns), your
    /// organization's verified domains and <c>slugPasskeys</c>. <see cref="IdentityResource.GetCustomDomainsAsync"/>
    /// is an alias.
    /// </summary>
    public Task<CustomDomainsOverview> OverviewAsync(CancellationToken ct = default) =>
        Http.GetAsync<CustomDomainsOverview>(Base, null, ct);

    /// <summary>
    /// The domain with this id, found in <see cref="IdentityCrud.ListAsync"/>. None: a <see cref="TouchqueApiException"/>
    /// shaped like the API's 404 (<see cref="TouchqueApiException.Status"/> 404, <see cref="TouchqueApiException.Error"/>
    /// <c>not_found</c>).
    /// </summary>
    public override async Task<JsonObject> GetAsync(string id, CancellationToken ct = default)
    {
        foreach (var domain in await ListAsync(null, ct).ConfigureAwait(false))
        {
            if (domain is JsonObject found && Json.Str(found, "id") == id) return (JsonObject)found.DeepClone();
        }
        throw new TouchqueApiException(404, new JsonObject { ["error"] = "not_found", ["message"] = "No custom domain with this id" });
    }

    /// <summary>
    /// Checks the domain's DNS TXT record now (a domain on one your organization verified needs none, only its CNAME)
    /// and looks at its DNS (<c>dns</c>); answers the domain (<c>status</c> verified once it is). Touchque also checks a
    /// new domain by itself every 5 minutes until <c>autoCheckUntil</c>, 72 hours after it was added.
    /// </summary>
    public Task<JsonObject> VerifyAsync(string id, CancellationToken ct = default) =>
        Http.PostAsync<JsonObject>(Base + "/" + TouchqueHttp.Seg(id) + "/verify", new JsonObject(), ct);
}

/// <summary>Your custom domains as <c>GET /identity/custom-domains</c> answers them (<see cref="IdentityCustomDomains.OverviewAsync"/>).</summary>
public sealed record CustomDomainsOverview : TouchqueObject
{
    /// <summary>
    /// The domains, what <see cref="IdentityCrud.ListAsync"/> returns: each the API's JSON (<c>id</c>, <c>domain</c>,
    /// <c>status</c>, <c>primary</c>, <c>proof</c>, <c>records</c>, <c>certificate</c>, <c>dns</c>, <c>autoCheckUntil</c>…).
    /// </summary>
    public JsonArray Domains { get; init; } = new();

    /// <summary>
    /// Your organization's verified domains (Organization → Domains): a passkey domain above a custom domain must be one
    /// of them. Null when they could not be read.
    /// </summary>
    public IReadOnlyList<string>? VerifiedDomains { get; init; }

    /// <summary>Customer passkeys made on <c>{slug}.login.touchque.com</c>: they belong to that name and do not work on a custom domain.</summary>
    public int SlugPasskeys { get; init; }
}

/// <summary>Business customers, their members and invitations.</summary>
public sealed class IdentityOrganizations : IdentityCrud
{
    internal IdentityOrganizations(TouchqueHttp http) : base(http, "/identity/organizations", "organizations") { }

    public Task<JsonObject> MembersAsync(string orgId, CancellationToken ct = default) => Http.GetAsync<JsonObject>(Org(orgId) + "/members", null, ct);

    public Task<JsonObject> AddMembersAsync(string orgId, IEnumerable<string> userIds, CancellationToken ct = default) =>
        Http.PostAsync<JsonObject>(Org(orgId) + "/members", new JsonObject { ["userIds"] = new JsonArray(userIds.Select(u => (JsonNode)u).ToArray()) }, ct);

    public Task<JsonObject> RemoveMemberAsync(string orgId, string userId, CancellationToken ct = default) =>
        Http.DeleteAsync<JsonObject>(Org(orgId) + "/members/" + TouchqueHttp.Seg(userId), ct);

    public Task<JsonObject> SetConnectionsAsync(string orgId, object connections, CancellationToken ct = default) =>
        Http.PutAsync<JsonObject>(Org(orgId) + "/connections", new JsonObject { ["connections"] = Json.ToNode(connections) }, ct);

    public Task<JsonObject> InvitationsAsync(string orgId, CancellationToken ct = default) => Http.GetAsync<JsonObject>(Org(orgId) + "/invitations", null, ct);

    /// <summary>The link opens the app's sign-in route (initiateLoginUri) with organization and invitation.</summary>
    public Task<JsonObject> InviteAsync(string orgId, object invitation, CancellationToken ct = default) =>
        Http.PostAsync<JsonObject>(Org(orgId) + "/invitations", Json.ToNode(invitation), ct);

    public Task<JsonObject> RevokeInvitationAsync(string orgId, string invitationId, CancellationToken ct = default) =>
        Http.DeleteAsync<JsonObject>(Org(orgId) + "/invitations/" + TouchqueHttp.Seg(invitationId), ct);

    private string Org(string orgId) => Base + "/" + TouchqueHttp.Seg(orgId);
}

/// <summary>Your customers' apps (OpenID Connect clients).</summary>
public sealed class IdentityClients : IdentityCrud
{
    internal IdentityClients(TouchqueHttp http) : base(http, "/identity/clients", "clients") { }

    /// <summary>A new client secret: it is in the answer, this once.</summary>
    public Task<JsonObject> RotateSecretAsync(string clientId, CancellationToken ct = default) =>
        Http.PostAsync<JsonObject>(Base + "/" + TouchqueHttp.Seg(clientId) + "/rotate-secret", new JsonObject(), ct);
}

/// <summary>Bulk user imports and exports, running in the background.</summary>
public sealed class IdentityJobs
{
    private readonly TouchqueHttp _http;
    private readonly string _kind;

    internal IdentityJobs(TouchqueHttp http, string kind)
    {
        _http = http;
        _kind = kind;
    }

    /// <summary>Imports: <c>{ users, upsert }</c>; exports: <c>{ format = "csv" | "json" }</c>.</summary>
    public Task<JsonObject> StartAsync(object body, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>("/identity/users-" + _kind, Json.ToNode(body), ct);

    public Task<JsonObject> GetAsync(string jobId, CancellationToken ct = default) =>
        _http.GetAsync<JsonObject>("/identity/users-" + _kind + "/" + TouchqueHttp.Seg(jobId), null, ct);

    /// <summary>Exports: the finished file (CSV or JSON text).</summary>
    public Task<string> FileAsync(string jobId, CancellationToken ct = default) =>
        _http.GetTextAsync("/identity/users-" + _kind + "/" + TouchqueHttp.Seg(jobId) + "/file", ct);

    /// <summary>Polls until the job is done or failed (or the timeout passes: the last state).</summary>
    public async Task<JsonObject> WaitAsync(string jobId, TimeSpan? interval = null, TimeSpan? timeout = null, CancellationToken ct = default)
    {
        var end = DateTimeOffset.UtcNow + (timeout ?? TimeSpan.FromMinutes(10));
        while (true)
        {
            var job = await GetAsync(jobId, ct).ConfigureAwait(false);
            if (Json.Str(job, "status") != "running" || DateTimeOffset.UtcNow > end) return job;
            await Task.Delay(interval ?? TimeSpan.FromSeconds(1), ct).ConfigureAwait(false);
        }
    }
}

/// <summary>A tenant's customer accounts.</summary>
public sealed class IdentityUsers
{
    private readonly TouchqueHttp _http;

    internal IdentityUsers(TouchqueHttp http) => _http = http;

    private static string U(string userId) => "/identity/users/" + TouchqueHttp.Seg(userId);

    /// <summary>Query fields: q, blocked, emailVerified, connection, organization, limit, cursor.</summary>
    public Task<JsonObject> ListAsync(object? query = null, CancellationToken ct = default) => _http.GetAsync<JsonObject>("/identity/users", IdentityQuery.Of(query), ct);

    public Task<JsonObject> GetAsync(string userId, CancellationToken ct = default) => _http.GetAsync<JsonObject>(U(userId), null, ct);

    /// <summary>
    /// email and: password, passwordHash (bcrypt/argon2), customPasswordHash, emailVerified, name,
    /// givenName, familyName, phone, locale, userMetadata, appMetadata, sendVerificationEmail.
    /// </summary>
    public Task<JsonObject> CreateAsync(object user, CancellationToken ct = default) => _http.PostAsync<JsonObject>("/identity/users", Json.ToNode(user), ct);

    /// <summary>Metadata is merged; a key set to null is removed.</summary>
    public Task<JsonObject> UpdateAsync(string userId, object changes, CancellationToken ct = default) =>
        _http.PatchAsync<JsonObject>(U(userId), JsonNodeWithNulls(changes), ct);

    /// <summary>Erasure (KVKK/GDPR): the account and every workspace row that names it.</summary>
    public Task<JsonObject> DeleteAsync(string userId, CancellationToken ct = default) => _http.DeleteAsync<JsonObject>(U(userId), ct);

    public Task<JsonObject> BlockAsync(string userId, string? reason = null, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>(U(userId) + "/block", reason is null ? new JsonObject() : new JsonObject { ["reason"] = reason }, ct);

    public Task<JsonObject> UnblockAsync(string userId, CancellationToken ct = default) => _http.PostAsync<JsonObject>(U(userId) + "/unblock", new JsonObject(), ct);

    /// <summary>Everything about the person (KVKK/GDPR access request); never hashes.</summary>
    public Task<JsonObject> ExportAsync(string userId, CancellationToken ct = default) => _http.GetAsync<JsonObject>(U(userId) + "/export", null, ct);

    public Task<JsonObject> SessionsAsync(string userId, CancellationToken ct = default) => _http.GetAsync<JsonObject>(U(userId) + "/sessions", null, ct);

    /// <summary>Ends one of the user's sessions.</summary>
    public Task<JsonObject> EndSessionAsync(string userId, string sessionId, CancellationToken ct = default) =>
        _http.DeleteAsync<JsonObject>(U(userId) + "/sessions/" + TouchqueHttp.Seg(sessionId), ct);

    public Task<JsonObject> SignOutEverywhereAsync(string userId, CancellationToken ct = default) => _http.DeleteAsync<JsonObject>(U(userId) + "/sessions", ct);

    /// <summary>Removes passkeys, unlinks the Touchque app, turns email codes off, signs out everywhere.</summary>
    public Task<JsonObject> ResetMfaAsync(string userId, CancellationToken ct = default) => _http.DeleteAsync<JsonObject>(U(userId) + "/mfa", ct);

    /// <summary>Accounts at providers whose tokens the vault keeps for the user (connections with tokenVault on).</summary>
    public Task<JsonObject> ConnectedAccountsAsync(string userId, CancellationToken ct = default) => _http.GetAsync<JsonObject>(U(userId) + "/connected-accounts", null, ct);

    /// <summary>Deletes the stored tokens: apps stop using the account for the user; signing in with it stays.</summary>
    public Task<JsonObject> DisconnectAccountAsync(string userId, string accountId, CancellationToken ct = default) =>
        _http.DeleteAsync<JsonObject>(U(userId) + "/connected-accounts/" + TouchqueHttp.Seg(accountId), ct);

    public Task<JsonObject> UnlinkIdentityAsync(string userId, string identityId, bool force = false, CancellationToken ct = default) =>
        _http.DeleteAsync<JsonObject>(U(userId) + "/identities/" + TouchqueHttp.Seg(identityId) + (force ? "?force=true" : ""), ct);

    public Task<JsonObject> SendVerificationEmailAsync(string userId, string? returnTo = null, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>(U(userId) + "/verification-email", new JsonObject().Put("returnTo", returnTo), ct);

    /// <summary><paramref name="sendEmail"/> false: the link comes back for you to deliver.</summary>
    public Task<JsonObject> PasswordResetAsync(string userId, bool sendEmail = true, int? ttlSec = null, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>(U(userId) + "/password-reset", new JsonObject { ["sendEmail"] = sendEmail }.Put("ttlSec", ttlSec), ct);

    public Task<JsonObject> RolesAsync(string userId, CancellationToken ct = default) => _http.GetAsync<JsonObject>(U(userId) + "/roles", null, ct);

    public Task<JsonObject> AddRolesAsync(string userId, IEnumerable<string> roleIds, string? organizationId = null, CancellationToken ct = default) =>
        _http.PostAsync<JsonObject>(U(userId) + "/roles", new JsonObject { ["roleIds"] = new JsonArray(roleIds.Select(r => (JsonNode)r).ToArray()) }.Put("organizationId", organizationId), ct);

    public Task<JsonObject> RemoveRoleAsync(string userId, string roleId, string? organizationId = null, CancellationToken ct = default) =>
        _http.DeleteAsync<JsonObject>(U(userId) + "/roles/" + TouchqueHttp.Seg(roleId) + (organizationId is null ? "" : "?organizationId=" + TouchqueHttp.Seg(organizationId)), ct);

    public Task<JsonObject> LogsAsync(string userId, int? limit = null, CancellationToken ct = default) =>
        _http.GetAsync<JsonObject>(U(userId) + "/logs", new Dictionary<string, string?> { ["limit"] = limit?.ToString(CultureInfo.InvariantCulture) }, ct);

    private static readonly System.Text.Json.JsonSerializerOptions KeepNulls =
        new(Json.Options) { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never };

    /// <summary>A body that keeps explicit nulls (they remove metadata keys).</summary>
    private static JsonNode? JsonNodeWithNulls(object value) =>
        value is JsonNode n ? n.DeepClone() : System.Text.Json.JsonSerializer.SerializeToNode(value, KeepNulls);
}
