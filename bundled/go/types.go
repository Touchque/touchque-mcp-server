// TouchQue Go SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-go/touchque/{config.go,types.go,client.go,steps.go,offline.go,login.go,
// http_middleware.go,approval_proof.go} plus the public part of relay.go (NewRelayHandler).
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

package touchque

import (
	"net/url"
	"os"
	"strings"
)

// DefaultBaseURL is used when Config.BaseURL and TQ_API_URL are both unset.
const DefaultBaseURL = "https://api.touchque.com"

// Config holds the configuration options for the TouchQue SDK.
type Config struct {
	APIKey    string
	APISecret string
	BaseURL   string
	TimeoutMs int
}

// DefaultConfig creates a new Config with standard defaults.
func DefaultConfig(apiKey, apiSecret string) *Config {
	return &Config{
		APIKey:    apiKey,
		APISecret: apiSecret,
		BaseURL:   DefaultBaseURL,
		TimeoutMs: 10000,
	}
}

// ConfigFromEnv builds a Config from TQ_API_KEY / TQ_API_SECRET / TQ_API_URL.
func ConfigFromEnv() (*Config, error) {
	apiKey := os.Getenv("TQ_API_KEY")
	apiSecret := os.Getenv("TQ_API_SECRET")
	if apiKey == "" || apiSecret == "" {
		return nil, &ConfigError{Message: "touchque: set TQ_API_KEY and TQ_API_SECRET (or pass a *Config to NewClient)"}
	}
	baseURL := os.Getenv("TQ_API_URL")
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	cfg := &Config{APIKey: apiKey, APISecret: apiSecret, BaseURL: baseURL, TimeoutMs: 10000}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

var localHosts = map[string]bool{"localhost": true, "127.0.0.1": true, "::1": true}

// assertSafeBaseURL allows plaintext http only for localhost / loopback.
func assertSafeBaseURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return &ConfigError{Message: "touchque: BaseURL is not a valid URL: " + raw}
	}
	switch u.Scheme {
	case "https":
		return nil
	case "http":
		if localHosts[strings.ToLower(u.Hostname())] {
			return nil
		}
		return &ConfigError{Message: "touchque: refusing a plaintext http:// BaseURL for \"" + u.Hostname() +
			"\" — the API key and request signature would be sent in the clear; use https://"}
	default:
		return &ConfigError{Message: "touchque: BaseURL must be http(s): " + raw}
	}
}

// Validate checks the config and fills in defaults (BaseURL, TimeoutMs), without panicking.
func (c *Config) Validate() error {
	if !strings.HasPrefix(c.APIKey, "tq_") {
		return &ConfigError{Message: "touchque: APIKey must start with 'tq_'. Did you accidentally swap APIKey and APISecret?"}
	}
	if c.BaseURL == "" {
		c.BaseURL = DefaultBaseURL
	}
	c.BaseURL = strings.TrimRight(c.BaseURL, "/")
	if err := assertSafeBaseURL(c.BaseURL); err != nil {
		return err
	}
	if c.TimeoutMs <= 0 {
		c.TimeoutMs = 10000
	}
	return nil
}

// sanitize keeps NewClient's original panicking behavior for existing callers.
func (c *Config) sanitize() {
	if err := c.Validate(); err != nil {
		panic(err.Error())
	}
}

package touchque

// GenerateSecretResponse represents the response from generating a new secret
type GenerateSecretResponse struct {
	Secret           string `json:"secret"`
	ExternalUsername string `json:"externalUsername"`
	ExpiresAt        string `json:"expiresAt"`
	TTLMs            int    `json:"ttlMs"`
	// QRCodeDataURL is a ready-to-render `data:image/png;base64,...` encoding
	// Secret for the TouchQue mobile app to scan.
	QRCodeDataURL string   `json:"qrCodeDataUrl"`
	RecoveryCodes []string `json:"recoveryCodes"`
}

// ResetSecretResponse represents the response from resetting a secret
type ResetSecretResponse struct {
	Message          string   `json:"message"`
	UserID           string   `json:"userId"`
	Secret           string   `json:"secret"`
	ExternalUsername string   `json:"externalUsername"`
	ExpiresAt        string   `json:"expiresAt"`
	QRCodeDataURL    string   `json:"qrCodeDataUrl"`
	RecoveryCodes    []string `json:"recoveryCodes"`
}

// LoginRequestResponse represents the response from initiating a login request
type LoginRequestResponse struct {
	RequestID     string `json:"requestId"`
	ChallengeCode string `json:"challengeCode"`
	Message       string `json:"message"`
	ExpiresAt     string `json:"expiresAt"`
	// RequiresPasskey is true when a phishing-resistant policy demands a
	// passkey approval — no push was sent for this request.
	RequiresPasskey bool `json:"requiresPasskey,omitempty"`
	// TelemetryToken is set only when the integration has behavioral biometrics
	// enabled (TenantPolicy.behavioralBiometricsEnabled). Pass it plus RequestID
	// to your frontend to initialize the @touchque/web behavioral widget
	// (tq.behavioral.attach(...)). There is no widget in this server SDK.
	TelemetryToken string `json:"telemetryToken,omitempty"`
}

// GetUserResponse is the link status of a user (Auth.GetUser). used flips true
// and DeviceID is set once the mobile app scans the setup secret.
type GetUserResponse struct {
	ExternalUsername string `json:"externalUsername"`
	DeviceID         string `json:"deviceId,omitempty"`
	Used             bool   `json:"used"`
	Frozen           bool   `json:"frozen"`
	CreatedAt        string `json:"createdAt"`
	ExpireAt         string `json:"expireAt,omitempty"`
}

// WebAuthnRegisterVerifyResponse is returned by WebAuthn.RegisterVerify.
type WebAuthnRegisterVerifyResponse struct {
	Verified     bool   `json:"verified"`
	CredentialID string `json:"credentialId"`
}

// WebAuthnAuthenticateVerifyResponse is returned by WebAuthn.AuthenticateVerify.
type WebAuthnAuthenticateVerifyResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	// ExternalUsername is the user whose login request was approved, as
	// reported by TouchQue (never by the browser). Empty on older APIs.
	ExternalUsername string `json:"externalUsername,omitempty"`
	// RequestID is the approved login request, when TouchQue reports it.
	RequestID string `json:"requestId,omitempty"`
}

// WebAuthnPrimaryOptionsResponse is returned by WebAuthn.PrimaryOptions.
type WebAuthnPrimaryOptionsResponse struct {
	AttemptID string                 `json:"attemptId"`
	Options   map[string]interface{} `json:"options"`
}

// WebAuthnPrimaryVerifyResponse is returned by WebAuthn.PrimaryVerify. On
// Success the RequestID is a CONFIRMED LoginRequest; on !Success with
// RequiresStepUp, start the normal Login.Request / number-match flow instead.
type WebAuthnPrimaryVerifyResponse struct {
	Success          bool    `json:"success"`
	RequiresStepUp   bool    `json:"requiresStepUp,omitempty"`
	ExternalUsername string  `json:"externalUsername"`
	RiskScore        float64 `json:"riskScore"`
	RequestID        string  `json:"requestId,omitempty"`
}

// WebAuthnCredentialSummary is one entry from WebAuthn.ListCredentials.
type WebAuthnCredentialSummary struct {
	ID           string `json:"id"`
	CredentialID string `json:"credentialId"`
	DeviceType   string `json:"deviceType"`
	BackedUp     bool   `json:"backedUp"`
	Label        string `json:"label"`
	CreatedAt    string `json:"createdAt"`
	LastUsedAt   string `json:"lastUsedAt"`
}

// WebAuthnDeleteCredentialResponse is returned by WebAuthn.DeleteCredential.
type WebAuthnDeleteCredentialResponse struct {
	Deleted bool `json:"deleted"`
}

// LoginStatusResponse represents the response from checking login status.
type LoginStatusResponse struct {
	Status           string        `json:"status"`
	ExternalUsername string        `json:"externalUsername,omitempty"`
	Type             string        `json:"type,omitempty"`
	ReferenceID      string        `json:"referenceId,omitempty"`
	Details          []LoginDetail `json:"details,omitempty"`
	Consumed         bool          `json:"consumed,omitempty"`
	RequiresPasskey  bool          `json:"requiresPasskey,omitempty"`
	ConfirmedVia     string        `json:"confirmedVia,omitempty"`
	Assurance        *Assurance    `json:"assurance,omitempty"`
}

// VerifyResponse represents the response from verifying a login request.
type VerifyResponse struct {
	Approved      bool       `json:"approved"`
	Status        string     `json:"status"`
	RequestID     string     `json:"requestId,omitempty"`
	ChallengeCode string     `json:"challengeCode,omitempty"`
	Assurance     *Assurance `json:"assurance,omitempty"`
	ConfirmedVia  string     `json:"confirmedVia,omitempty"`
}

// Assurance describes how a request was approved. PhishingResistant is true
// only for a passkey approval.
type Assurance struct {
	PhishingResistant bool   `json:"phishingResistant"`
	Method            string `json:"method"`
}

// ConsumeResponse is returned by Login.Consume: the approval, used exactly once.
type ConsumeResponse struct {
	Consumed         bool          `json:"consumed"`
	RequestID        string        `json:"requestId"`
	ExternalUsername string        `json:"externalUsername"`
	Type             string        `json:"type"`
	ReferenceID      string        `json:"referenceId,omitempty"`
	Details          []LoginDetail `json:"details,omitempty"`
	ConfirmedVia     string        `json:"confirmedVia,omitempty"`
	Assurance        *Assurance    `json:"assurance,omitempty"`
	ApprovalProof    interface{}   `json:"approvalProof,omitempty"`
}

// UnlinkSecretResponse represents the response from unlinking a device
type UnlinkSecretResponse struct {
	Success          bool   `json:"success"`
	ExternalUsername string `json:"externalUsername"`
	Message          string `json:"message"`
}

// ValidateSecretResponse represents the response from validating a setup secret
type ValidateSecretResponse struct {
	Valid            bool   `json:"valid"`
	ExternalUsername string `json:"externalUsername,omitempty"`
	IntegrationID    string `json:"integrationId,omitempty"`
	Message          string `json:"message,omitempty"`
	Reason           string `json:"reason,omitempty"`
	UsedAt           string `json:"usedAt,omitempty"`
	ExpiredAt        string `json:"expiredAt,omitempty"`
}

// ─────────────────────────────────────────────────────────────
// From touchque/client.go
// ─────────────────────────────────────────────────────────────

package touchque

// Client is the main entry point for the TouchQue Go SDK.
type Client struct {
	Auth     *AuthResource
	Login    *LoginResource
	WebAuthn *WebAuthnResource
	Webhook  *WebhookResource
	Offline  *OfflineResource
	Actions  *ActionsResource

	apiSecret string
}

// NewClient initializes a new TouchQue SDK Client with the given
// configuration. Panics on invalid configuration (matches this SDK's
// long-standing behavior) — use New() for a version that returns an error instead.
func NewClient(config *Config) *Client {
	config.sanitize()
	return newClient(config)
}

// New builds a Client from TQ_API_KEY / TQ_API_SECRET / TQ_API_URL, or from
// config if given (config[0], at most one).
func New(config ...*Config) (*Client, error) {
	var cfg *Config
	if len(config) > 0 && config[0] != nil {
		cfg = config[0]
		if err := cfg.Validate(); err != nil {
			return nil, err
		}
	} else {
		c, err := ConfigFromEnv()
		if err != nil {
			return nil, err
		}
		cfg = c
	}
	return newClient(cfg), nil
}

func newClient(config *Config) *Client {
	httpWrapper := newHTTPClient(config)

	return &Client{
		Auth:      newAuthResource(httpWrapper),
		Login:     newLoginResource(httpWrapper),
		WebAuthn:  newWebAuthnResource(httpWrapper),
		Webhook:   newWebhookResource(config),
		Offline:   newOfflineResource(httpWrapper),
		Actions:   newActionsResource(httpWrapper),
		apiSecret: config.APISecret,
	}
}

// ─────────────────────────────────────────────────────────────
// From touchque/steps.go — the headless step-up flow
// ─────────────────────────────────────────────────────────────

package touchque

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

// StepState is the state a headless approval is in.
type StepState string

const (
	StepWaiting         StepState = "waiting" // push sent — show Number (if any) and wait
	StepApproved        StepState = "approved"
	StepRejected        StepState = "rejected"
	StepExpired         StepState = "expired"
	StepEnroll          StepState = "enroll"           // no phone linked yet — show Enroll.QRCodeDataURL
	StepPasskeyRequired StepState = "passkey_required" // policy: approve with a passkey (browser ceremony)
	StepOffline         StepState = "offline"          // offline approval started — show Offline.QRDataURL, ask for the code
	StepBlocked         StepState = "blocked"          // refused by policy / risk / action disabled — see Reason
	StepFrozen          StepState = "frozen"           // too many rejections — see RetryAfter
	StepRateLimited     StepState = "rate_limited"     // too many requests — see RetryAfter
)

// Step is what a headless approval currently looks like — safe to
// json.Marshal and send to the browser. It never contains API secrets.
type Step struct {
	State      StepState     `json:"state"`
	RequestID  string        `json:"requestId,omitempty"`
	Number     string        `json:"number,omitempty"`
	ExpiresAt  string        `json:"expiresAt,omitempty"`
	Details    []LoginDetail `json:"details,omitempty"`
	Enroll     *EnrollStep   `json:"enroll,omitempty"`
	Offline    *OfflineStep  `json:"offline,omitempty"`
	Reason     string        `json:"reason,omitempty"`
	RetryAfter int           `json:"retryAfter,omitempty"`
	Assurance  *Assurance    `json:"assurance,omitempty"`
	// TelemetryToken is set only when the workspace collects behavioural
	// signals: it lets the browser post them for this one request
	// (@touchque/web does it when given `telemetry`). Not a credential.
	TelemetryToken string `json:"telemetryToken,omitempty"`
}

// EnrollStep is shown when the user has not linked a phone yet.
type EnrollStep struct {
	QRCodeDataURL string   `json:"qrCodeDataUrl,omitempty"`
	RecoveryCodes []string `json:"recoveryCodes,omitempty"`
	ExpiresAt     string   `json:"expiresAt,omitempty"`
}

// OfflineStep is shown while the user types the code from an offline challenge.
type OfflineStep struct {
	ChallengeID   string `json:"challengeId,omitempty"`
	QRDataURL     string `json:"qrDataUrl,omitempty"`
	ExpiresAt     string `json:"expiresAt,omitempty"`
	TotpAvailable bool   `json:"totpAvailable,omitempty"`
	AttemptsLeft  int    `json:"attemptsLeft,omitempty"`
	// ChallengeCode is the number to print under the QR when number matching
	// applies: the phone offers it among two decoys and the user taps the match.
	ChallengeCode string `json:"challengeCode,omitempty"`
}

// Approval is a request that was approved and consumed exactly once.
type Approval struct {
	RequestID     string      `json:"requestId"`
	User          string      `json:"user"`
	Action        string      `json:"action"`
	Assurance     *Assurance  `json:"assurance,omitempty"`
	ConfirmedVia  string      `json:"confirmedVia,omitempty"`
	ApprovalProof interface{} `json:"approvalProof,omitempty"`
}

// StartOptions configures Start.
type StartOptions struct {
	// Details: shown on the phone and bound to the approval. Build it from server-side state.
	Details []LoginDetail
	// ReferenceID: your own transaction id, bound to the approval.
	ReferenceID string
	// IP / UserAgent: the end user's — shown on the phone.
	IP        string
	UserAgent string
	// NoEnroll: set true to get StepEnroll{} (no QR) instead of issuing one,
	// when the user has no linked phone.
	NoEnroll bool
}

// normalizeDetails matches the API's own normalization: nil in, nil out.
func normalizeDetails(details []LoginDetail) []LoginDetail {
	if len(details) == 0 {
		return nil
	}
	out := make([]LoginDetail, len(details))
	for i, d := range details {
		out[i] = LoginDetail{Label: strings.TrimSpace(d.Label), Value: strings.TrimSpace(d.Value)}
	}
	return out
}

func detailsDigest(details []LoginDetail) string {
	norm := normalizeDetails(details)
	if len(norm) == 0 {
		return ""
	}
	parts := make([]string, len(norm))
	for i, d := range norm {
		parts[i] = d.Label + "\x1f" + d.Value
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x1e")))
	return hex.EncodeToString(sum[:])
}

// Start starts an approval for action — never waits.
func (c *Client) Start(action, user string, opts StartOptions) (*Step, error) {
	if user == "" {
		return nil, &ConfigError{Message: "touchque: Start() needs the user id"}
	}
	norm := normalizeDetails(opts.Details)
	res, err := c.Login.RequestWithOptions(LoginRequestOptions{
		ExternalUsername: user, Type: action, ReferenceID: opts.ReferenceID,
		ClientIP: opts.IP, UserAgent: opts.UserAgent, Details: norm,
	})
	if err == nil {
		if res.RequiresPasskey {
			return &Step{State: StepPasskeyRequired, RequestID: res.RequestID, ExpiresAt: res.ExpiresAt, Details: norm}, nil
		}
		return &Step{State: StepWaiting, RequestID: res.RequestID, Number: res.ChallengeCode, ExpiresAt: res.ExpiresAt, Details: norm, TelemetryToken: res.TelemetryToken}, nil
	}

	apiErr, ok := err.(*APIError)
	if !ok {
		return nil, err
	}
	switch {
	case apiErr.StatusCode == 404 && (apiErr.Code == "device_not_linked" || strings.Contains(strings.ToLower(apiErr.Message), "linked device")):
		if opts.NoEnroll {
			return &Step{State: StepEnroll}, nil
		}
		return enrollStep(c, user)
	case apiErr.StatusCode == 423:
		return &Step{State: StepFrozen, RetryAfter: apiErr.RetryAfter}, nil
	case apiErr.StatusCode == 429:
		return &Step{State: StepRateLimited, RetryAfter: apiErr.RetryAfter}, nil
	case apiErr.StatusCode == 400 && (apiErr.Code == "unknown_action" || strings.Contains(strings.ToLower(apiErr.Message), "invalid action type")):
		return nil, &ConfigError{Message: "touchque: unknown action \"" + action + "\". Create it once with client.Actions.Define(\"" + action + "\", ...) or in the Dashboard (Action Types)."}
	case apiErr.StatusCode == 403:
		reason := apiErr.Reason
		if reason == "" && (apiErr.Code == "passkey_not_registered" || dataError(apiErr) == "phishing_resistant_required") {
			reason = "passkey_not_registered"
		}
		if reason == "" && apiErr.Code == "action_disabled" {
			reason = "action_disabled"
		}
		if reason == "" {
			reason = apiErr.Code
		}
		if reason == "" {
			reason = "blocked"
		}
		return &Step{State: StepBlocked, Reason: reason}, nil
	}
	return nil, err
}

func dataError(err *APIError) string {
	if err.Data == nil {
		return ""
	}
	if v, ok := err.Data["error"].(string); ok {
		return v
	}
	return ""
}

// enrollStep issues a first-time-linking QR. Never unlinks a phone: a secret
// is only re-issued when the account is confirmed NOT linked.
func enrollStep(c *Client, user string) (*Step, error) {
	gen, err := c.Auth.GenerateSecret(user)
	if err == nil {
		return &Step{State: StepEnroll, Enroll: &EnrollStep{QRCodeDataURL: gen.QRCodeDataURL, RecoveryCodes: gen.RecoveryCodes, ExpiresAt: gen.ExpiresAt}}, nil
	}
	apiErr, ok := err.(*APIError)
	if !ok || apiErr.StatusCode != 409 {
		return nil, err
	}
	current, cerr := c.Auth.GetUser(user)
	if cerr == nil && (current.Used || current.DeviceID != "") {
		return &Step{State: StepEnroll, Reason: "already_linked"}, nil
	}
	reset, err := c.Auth.ResetSecret(user)
	if err != nil {
		return nil, err
	}
	return &Step{State: StepEnroll, Enroll: &EnrollStep{QRCodeDataURL: reset.QRCodeDataURL, RecoveryCodes: reset.RecoveryCodes, ExpiresAt: reset.ExpiresAt}}, nil
}

var stepStateMap = map[string]StepState{
	"PENDING": StepWaiting, "CONFIRMED": StepApproved, "REJECTED": StepRejected, "EXPIRED": StepExpired,
}

// Check reports where a started approval is now.
func (c *Client) Check(requestID string) (*Step, error) {
	s, err := c.Login.Status(requestID)
	if err != nil {
		return nil, err
	}
	state := stepStateMap[s.Status]
	if state == "" {
		state = StepWaiting
	}
	if s.Status == "PENDING" && s.RequiresPasskey {
		state = StepPasskeyRequired
	}
	step := &Step{State: state, RequestID: requestID}
	if state == StepApproved && s.Assurance != nil {
		step.Assurance = s.Assurance
	}
	return step, nil
}

// CompleteExpect is what Complete checks the approval is for.
type CompleteExpect struct {
	Details     []LoginDetail
	ReferenceID string
}

// Complete uses an approved request exactly once, after checking it is for
// this user, action and transaction. Call it right before doing the
// protected thing.
func (c *Client) Complete(requestID, user, action string, expect CompleteExpect) (*Approval, error) {
	res, err := c.Login.Consume(requestID)
	if err != nil {
		return nil, err
	}
	sameUser := strings.EqualFold(res.ExternalUsername, user)
	sameDetails := detailsDigest(expect.Details) == detailsDigest(res.Details)
	sameRef := res.ReferenceID == expect.ReferenceID
	if !sameUser || res.Type != action || !sameDetails || !sameRef {
		return nil, &ConfigError{Message: "touchque: this approval is for a different user, action or transaction."}
	}
	return &Approval{
		RequestID: requestID, User: res.ExternalUsername, Action: res.Type,
		Assurance: res.Assurance, ConfirmedVia: res.ConfirmedVia, ApprovalProof: res.ApprovalProof,
	}, nil
}

// ── Guard token ──────────────────────────────────────────────────────────
// The browser echoes this back while it waits. It is signed with a key
// derived from the API secret and binds the approval to one user, action and
// transaction, so it cannot be replayed for another user, amount or route.

type guardClaims struct {
	U   string `json:"u"`
	A   string `json:"a"`
	D   string `json:"d"`
	R   string `json:"r"`
	St  string `json:"st"`
	Rid string `json:"rid,omitempty"`
	N   string `json:"n,omitempty"`
	Oc  string `json:"oc,omitempty"`
	Exp int64  `json:"exp"`
}

func nowMs() int64 { return time.Now().UnixMilli() }

func tokenKey(apiSecret string) []byte {
	mac := hmac.New(sha256.New, []byte(apiSecret))
	mac.Write([]byte("touchque-guard-token-v1"))
	return mac.Sum(nil)
}

func b64u(b []byte) string {
	return strings.TrimRight(base64.URLEncoding.EncodeToString(b), "=")
}

func fromB64u(s string) ([]byte, error) {
	if m := len(s) % 4; m != 0 {
		s += strings.Repeat("=", 4-m)
	}
	return base64.URLEncoding.DecodeString(s)
}

func signGuardToken(apiSecret string, claims guardClaims) string {
	body, _ := json.Marshal(claims)
	bodyB64 := b64u(body)
	mac := hmac.New(sha256.New, tokenKey(apiSecret))
	mac.Write([]byte(bodyB64))
	return "v1." + bodyB64 + "." + b64u(mac.Sum(nil))
}

func verifyGuardToken(apiSecret, token string) *guardClaims {
	if token == "" || len(token) > 4096 {
		return nil
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 || parts[0] != "v1" {
		return nil
	}
	mac := hmac.New(sha256.New, tokenKey(apiSecret))
	mac.Write([]byte(parts[1]))
	expected := b64u(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return nil
	}
	raw, err := fromB64u(parts[1])
	if err != nil {
		return nil
	}
	var claims guardClaims
	if err := json.Unmarshal(raw, &claims); err != nil {
		return nil
	}
	if claims.Exp < time.Now().UnixMilli() {
		return nil
	}
	return &claims
}

// ─────────────────────────────────────────────────────────────
// From touchque/offline.go — Offline Sign (QR + code)
// ─────────────────────────────────────────────────────────────

package touchque

// OfflineResource is Offline Sign — QR challenge / typed code approvals that
// work with the phone offline (no internet on the device).
type OfflineResource struct {
	http *httpClient
}

func newOfflineResource(http *httpClient) *OfflineResource {
	return &OfflineResource{http: http}
}

// OfflineChallengeOptions holds every POST /offline/challenge field.
type OfflineChallengeOptions struct {
	ExternalUsername string
	Type             string // defaults to "LOGIN"
	// Details: shown on the phone (see LoginRequestOptions.Details). REQUIRED
	// for critical action types.
	Details    []LoginDetail
	ClientIP   string
	UserAgent  string
	TTLSeconds int // 30-300, default 120
	// SkipQRImage: set true to omit the ready-made QR image (QRDataURL comes
	// back empty) when you only need the raw QR text.
	SkipQRImage bool
	// RequestID is the push this QR is a fallback for: once the phone REJECTS
	// it the QR is dead (no new QR is issued, a code for the old one is refused
	// with reason "request_rejected"), and a push with number matching makes the
	// QR show the same number. Always set it when the QR follows a push.
	RequestID string
	// RequireNumberMatch asks for number matching on a standalone QR (implied
	// when RequestID points at a push that has one).
	RequireNumberMatch bool
}

// OfflineChallengeResponse is returned by Challenge.
type OfflineChallengeResponse struct {
	ChallengeID string `json:"challengeId"`
	// QR is the raw challenge text (TQ2.… — encrypted for the user's phone);
	// draw it as a QR code yourself if you don't use QRDataURL.
	QR string `json:"qr"`
	// QRDataURL is `data:image/png;base64,…`, ready for an <img> src; empty
	// when IncludeQRImage is false.
	QRDataURL        string `json:"qrDataUrl"`
	ExpiresAt        string `json:"expiresAt"`
	ExpiresInSeconds int    `json:"expiresInSeconds"`
	// TotpAvailable is true when the workspace allows the time-based code
	// fallback (no camera).
	TotpAvailable bool `json:"totpAvailable"`
	// ChallengeCode is the number to print under the QR (number matching).
	// Empty when the QR needs no number matching.
	ChallengeCode string `json:"challengeCode,omitempty"`
}

// Challenge issues an offline QR challenge.
func (o *OfflineResource) Challenge(opts OfflineChallengeOptions) (*OfflineChallengeResponse, error) {
	loginType := opts.Type
	if loginType == "" {
		loginType = "LOGIN"
	}
	body := map[string]interface{}{"externalUsername": opts.ExternalUsername, "type": loginType}
	if len(opts.Details) > 0 {
		body["details"] = opts.Details
	}
	if opts.ClientIP != "" {
		body["clientIp"] = opts.ClientIP
	}
	if opts.UserAgent != "" {
		body["userAgent"] = opts.UserAgent
	}
	if opts.TTLSeconds > 0 {
		body["ttlSeconds"] = opts.TTLSeconds
	}
	if opts.SkipQRImage {
		body["includeQrImage"] = false
	}
	if opts.RequestID != "" {
		body["requestId"] = opts.RequestID
	}
	if opts.RequireNumberMatch {
		body["requireNumberMatch"] = true
	}
	res, err := o.http.post("/offline/challenge", body)
	if err != nil {
		return nil, err
	}
	resp := &OfflineChallengeResponse{}
	if v, ok := res["challengeId"].(string); ok {
		resp.ChallengeID = v
	}
	if v, ok := res["qr"].(string); ok {
		resp.QR = v
	}
	if v, ok := res["qrDataUrl"].(string); ok {
		resp.QRDataURL = v
	}
	if v, ok := res["expiresAt"].(string); ok {
		resp.ExpiresAt = v
	}
	if v, ok := res["expiresInSeconds"].(float64); ok {
		resp.ExpiresInSeconds = int(v)
	}
	if v, ok := res["totpAvailable"].(bool); ok {
		resp.TotpAvailable = v
	}
	if v, ok := res["challengeCode"].(string); ok {
		resp.ChallengeCode = v
	}
	return resp, nil
}

// OfflineVerifyResult is common to Verify and VerifyTotp: never an error for
// a wrong/expired/used code — check Approved. Reason is one of invalid_code |
// locked | expired | used | unknown_challenge | request_rejected | too_many_failures |
// device_not_enrolled.
type OfflineVerifyResult struct {
	Approved         bool   `json:"approved"`
	Reason           string `json:"reason,omitempty"`
	AttemptsLeft     int    `json:"attemptsLeft,omitempty"`
	ChallengeID      string `json:"challengeId,omitempty"`
	ExternalUsername string `json:"externalUsername,omitempty"`
	Type             string `json:"type,omitempty"`
}

// Verify checks the 7-character code shown on the phone.
func (o *OfflineResource) Verify(challengeID, code string) (*OfflineVerifyResult, error) {
	return o.notApprovedAsResult(func() (map[string]interface{}, error) {
		return o.http.post("/offline/verify", map[string]interface{}{"challengeId": challengeID, "code": code})
	})
}

// VerifyTotp checks the rolling time-based code (no QR scan needed). Refused
// for critical action types.
func (o *OfflineResource) VerifyTotp(externalUsername, code, loginType, clientIP string) (*OfflineVerifyResult, error) {
	return o.VerifyTotpFor(externalUsername, code, loginType, clientIP, "")
}

// VerifyTotpFor is VerifyTotp for a sign-in that started with a push: requestID
// is that push, and a code is refused (reason "request_rejected") once the phone
// rejected it.
func (o *OfflineResource) VerifyTotpFor(externalUsername, code, loginType, clientIP, requestID string) (*OfflineVerifyResult, error) {
	if loginType == "" {
		loginType = "LOGIN"
	}
	body := map[string]interface{}{"externalUsername": externalUsername, "code": code, "type": loginType}
	if clientIP != "" {
		body["clientIp"] = clientIP
	}
	if requestID != "" {
		body["requestId"] = requestID
	}
	return o.notApprovedAsResult(func() (map[string]interface{}, error) {
		return o.http.post("/offline/totp/verify", body)
	})
}

func (o *OfflineResource) notApprovedAsResult(call func() (map[string]interface{}, error)) (*OfflineVerifyResult, error) {
	res, err := call()
	if err != nil {
		if apiErr, ok := err.(*APIError); ok && apiErr.StatusCode < 500 {
			r := &OfflineVerifyResult{Approved: false, AttemptsLeft: apiErr.AttemptsLeft}
			if apiErr.Reason != "" {
				r.Reason = apiErr.Reason
			} else if apiErr.Code != "" {
				r.Reason = apiErr.Code
			} else if e, ok := apiErr.Data["error"].(string); ok {
				r.Reason = e
			}
			return r, nil
		}
		return nil, err
	}
	resp := &OfflineVerifyResult{}
	if v, ok := res["approved"].(bool); ok {
		resp.Approved = v
	}
	if v, ok := res["challengeId"].(string); ok {
		resp.ChallengeID = v
	}
	if v, ok := res["externalUsername"].(string); ok {
		resp.ExternalUsername = v
	}
	if v, ok := res["type"].(string); ok {
		resp.Type = v
	}
	return resp, nil
}

// ─────────────────────────────────────────────────────────────
// From touchque/login.go — tq.Login (Request/Status/Verify/ReportFraud)
// ─────────────────────────────────────────────────────────────

package touchque

import (
	"net/url"
	"strconv"
	"time"
)

// LoginResource handles sending 2FA requests and checking their status.
type LoginResource struct {
	http *httpClient
}

func newLoginResource(http *httpClient) *LoginResource {
	return &LoginResource{http: http}
}

// LoginDetail is one line of transaction context shown on the approval
// screen, e.g. {Label: "Amount", Value: "1,250.00 USD"}. Shown in order.
type LoginDetail struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// LoginRequestOptions holds every POST /login/request field. Use it with
// RequestWithOptions / VerifyWithOptions; Request and Verify keep their
// original positional signatures and cannot carry Details.
type LoginRequestOptions struct {
	ExternalUsername   string
	Type               string // defaults to "LOGIN"
	ReferenceID        string
	ClientIP           string // end user's IP: shown as "City, Country" on the phone
	UserAgent          string // end user's User-Agent: shown as browser + device
	RequireBiometric   bool
	RequireNumberMatch bool
	// Details: transaction context for the approval screen. At most 8
	// entries, labels <= 40 and values <= 120 characters; the API rejects
	// (never truncates) anything outside those limits. Build it from
	// server-side state, never from browser input.
	Details []LoginDetail
}

// Request sends a 2FA login/approval request to the user's mobile device.
func (l *LoginResource) Request(externalUsername string, loginType string, referenceID string, clientIP string, userAgent string, requireBiometric bool, requireNumberMatch bool) (*LoginRequestResponse, error) {
	return l.RequestWithOptions(LoginRequestOptions{
		ExternalUsername:   externalUsername,
		Type:               loginType,
		ReferenceID:        referenceID,
		ClientIP:           clientIP,
		UserAgent:          userAgent,
		RequireBiometric:   requireBiometric,
		RequireNumberMatch: requireNumberMatch,
	})
}

// RequestWithOptions sends a 2FA login/approval request with every option,
// including Details.
func (l *LoginResource) RequestWithOptions(opts LoginRequestOptions) (*LoginRequestResponse, error) {
	loginType := opts.Type
	if loginType == "" {
		loginType = "LOGIN"
	}
	payload := map[string]interface{}{
		"externalUsername": opts.ExternalUsername,
		"type":             loginType,
	}
	if opts.ReferenceID != "" {
		payload["referenceId"] = opts.ReferenceID
	}
	if opts.ClientIP != "" {
		payload["clientIp"] = opts.ClientIP
	}
	if opts.UserAgent != "" {
		payload["userAgent"] = opts.UserAgent
	}
	if opts.RequireBiometric {
		payload["requireBiometric"] = true
	}
	if opts.RequireNumberMatch {
		payload["requireNumberMatch"] = true
	}
	if len(opts.Details) > 0 {
		payload["details"] = opts.Details
	}
	res, err := l.http.post("/login/request", payload)
	if err != nil {
		return nil, err
	}

	resp := &LoginRequestResponse{}
	if reqID, ok := res["requestId"].(string); ok {
		resp.RequestID = reqID
	}
	if challenge, ok := res["challengeCode"].(string); ok {
		resp.ChallengeCode = challenge
	}
	if msg, ok := res["message"].(string); ok {
		resp.Message = msg
	}
	if expAt, ok := res["expiresAt"].(string); ok {
		resp.ExpiresAt = expAt
	}
	if tok, ok := res["telemetryToken"].(string); ok {
		resp.TelemetryToken = tok
	}
	if rp, ok := res["requiresPasskey"].(bool); ok {
		resp.RequiresPasskey = rp
	}

	return resp, nil
}

func parseAssurance(res map[string]interface{}) *Assurance {
	m, ok := res["assurance"].(map[string]interface{})
	if !ok {
		return nil
	}
	a := &Assurance{}
	if v, ok := m["phishingResistant"].(bool); ok {
		a.PhishingResistant = v
	}
	if v, ok := m["method"].(string); ok {
		a.Method = v
	}
	return a
}

func parseDetails(res map[string]interface{}) []LoginDetail {
	raw, ok := res["details"].([]interface{})
	if !ok {
		return nil
	}
	out := make([]LoginDetail, 0, len(raw))
	for _, item := range raw {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		d := LoginDetail{}
		if v, ok := m["label"].(string); ok {
			d.Label = v
		}
		if v, ok := m["value"].(string); ok {
			d.Value = v
		}
		out = append(out, d)
	}
	return out
}

// Status checks the current status of a login request.
func (l *LoginResource) Status(requestID string) (*LoginStatusResponse, error) {
	res, err := l.http.get("/login/status/" + url.PathEscape(requestID))
	if err != nil {
		return nil, err
	}

	resp := &LoginStatusResponse{}
	if status, ok := res["status"].(string); ok {
		resp.Status = status
	}
	if v, ok := res["externalUsername"].(string); ok {
		resp.ExternalUsername = v
	}
	if v, ok := res["type"].(string); ok {
		resp.Type = v
	}
	if v, ok := res["referenceId"].(string); ok {
		resp.ReferenceID = v
	}
	resp.Details = parseDetails(res)
	if v, ok := res["consumed"].(bool); ok {
		resp.Consumed = v
	}
	if v, ok := res["requiresPasskey"].(bool); ok {
		resp.RequiresPasskey = v
	}
	if v, ok := res["confirmedVia"].(string); ok {
		resp.ConfirmedVia = v
	}
	resp.Assurance = parseAssurance(res)

	return resp, nil
}

// Consume uses an approved request exactly once. The first call on a
// CONFIRMED request wins atomically; every later call (a replayed token, a
// retried form post) returns an *APIError with Code "already_used" (409).
func (l *LoginResource) Consume(requestID string) (*ConsumeResponse, error) {
	res, err := l.http.post("/login/"+url.PathEscape(requestID)+"/consume", map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	resp := &ConsumeResponse{}
	if v, ok := res["consumed"].(bool); ok {
		resp.Consumed = v
	}
	if v, ok := res["requestId"].(string); ok {
		resp.RequestID = v
	}
	if v, ok := res["externalUsername"].(string); ok {
		resp.ExternalUsername = v
	}
	if v, ok := res["type"].(string); ok {
		resp.Type = v
	}
	if v, ok := res["referenceId"].(string); ok {
		resp.ReferenceID = v
	}
	resp.Details = parseDetails(res)
	if v, ok := res["confirmedVia"].(string); ok {
		resp.ConfirmedVia = v
	}
	resp.Assurance = parseAssurance(res)
	resp.ApprovalProof = res["approvalProof"]
	return resp, nil
}

// Verify sends a request and waits (polls) until the user approves or rejects it.
func (l *LoginResource) Verify(externalUsername string, loginType string, referenceID string, clientIP string, userAgent string, requireBiometric bool, requireNumberMatch bool, timeoutMs int) (*VerifyResponse, error) {
	return l.VerifyWithOptions(LoginRequestOptions{
		ExternalUsername:   externalUsername,
		Type:               loginType,
		ReferenceID:        referenceID,
		ClientIP:           clientIP,
		UserAgent:          userAgent,
		RequireBiometric:   requireBiometric,
		RequireNumberMatch: requireNumberMatch,
	}, timeoutMs)
}

// VerifyWithOptions is Verify with every request option, including Details.
func (l *LoginResource) VerifyWithOptions(opts LoginRequestOptions, timeoutMs int) (*VerifyResponse, error) {
	reqResult, err := l.RequestWithOptions(opts)
	if err != nil {
		return nil, err
	}

	reqID := reqResult.RequestID
	if reqID == "" {
		return nil, &APIError{Message: "Missing requestId in response"}
	}
	if reqResult.RequiresPasskey {
		return nil, &PasskeyRequiredError{RequestID: reqID}
	}

	startTime := time.Now()
	pollInterval := 400 * time.Millisecond

	for {
		statusResult, err := l.Status(reqID)
		if err != nil {
			return nil, err
		}

		switch statusResult.Status {
		case "CONFIRMED":
			return &VerifyResponse{
				Approved:      true,
				Status:        statusResult.Status,
				RequestID:     reqID,
				ChallengeCode: reqResult.ChallengeCode,
				Assurance:     statusResult.Assurance,
				ConfirmedVia:  statusResult.ConfirmedVia,
			}, nil
		case "REJECTED":
			return nil, &RejectedError{Message: "Request " + reqID + " was rejected by the user."}
		case "EXPIRED":
			return nil, &TimeoutError{Message: "Request " + reqID + " expired before it was approved."}
		}

		if time.Since(startTime).Milliseconds() > int64(timeoutMs) {
			return nil, &TimeoutError{Message: "Login verification timed out after " + strconv.Itoa(timeoutMs) + "ms"}
		}

		time.Sleep(pollInterval)
	}
}

// ApproveWithRecoveryCodeResponse represents the response when approving a request via recovery code
type ApproveWithRecoveryCodeResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ApproveWithRecoveryCode approves a pending 2FA request using a Recovery Code (bypasses mobile device).
func (l *LoginResource) ApproveWithRecoveryCode(requestID string, code string) (*ApproveWithRecoveryCodeResponse, error) {
	payload := map[string]interface{}{
		"requestId": requestID,
		"code":      code,
	}
	res, err := l.http.post("/login/recovery", payload)
	if err != nil {
		return nil, err
	}

	resp := &ApproveWithRecoveryCodeResponse{}
	// BUG FIX (found while adding tests): the real API returns `success` as a
	// JSON boolean (matching the Node/Python/PHP SDKs) — this was previously
	// asserted as `.(string)`, which always fails against a real boolean
	// response, silently leaving Success as its zero value forever.
	if success, ok := res["success"].(bool); ok {
		resp.Success = success
	}
	if msg, ok := res["message"].(string); ok {
		resp.Message = msg
	}

	return resp, nil
}

// Fraud reasons accepted by ReportFraud.
const (
	FraudChargeback        = "chargeback"
	FraudAccountTakeover   = "account_takeover"
	FraudSocialEngineering = "social_engineering"
	FraudOther             = "other"
)

// ReportFraudOptions describes why a request is being reported.
type ReportFraudOptions struct {
	// Reason is one of the Fraud* constants (default FraudOther).
	Reason string
	// Note is free text for your audit log, at most 500 characters.
	Note string
}

// ReportFraudResponse is the answer to ReportFraud.
type ReportFraudResponse struct {
	Reported bool `json:"reported"`
	// AlreadyReported is true when this request had already been reported.
	AlreadyReported bool   `json:"alreadyReported"`
	RequestID       string `json:"requestId"`
}

// ReportFraud reports a request you later learned was fraud — a chargeback,
// a confirmed account takeover, a scam the user was talked into. TouchQue's
// risk engine learns from it (it is the strongest signal it gets) and the
// report is kept in your audit log. The request's status does not change.
// Safe to call more than once: a repeat answers AlreadyReported.
func (l *LoginResource) ReportFraud(requestID string, opts ReportFraudOptions) (*ReportFraudResponse, error) {
	if requestID == "" {
		return nil, &ConfigError{Message: "ReportFraud needs the request id"}
	}
	payload := map[string]interface{}{}
	if opts.Reason != "" {
		payload["reason"] = opts.Reason
	}
	if opts.Note != "" {
		payload["note"] = opts.Note
	}
	res, err := l.http.post("/login/"+url.PathEscape(requestID)+"/report-fraud", payload)
	if err != nil {
		return nil, err
	}
	resp := &ReportFraudResponse{}
	resp.Reported, _ = res["reported"].(bool)
	resp.AlreadyReported, _ = res["alreadyReported"].(bool)
	resp.RequestID, _ = res["requestId"].(string)
	return resp, nil
}

// ─────────────────────────────────────────────────────────────
// From touchque/http_middleware.go — touchque.Require (RequireOptions.User is REQUIRED)
// ─────────────────────────────────────────────────────────────

package touchque

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strconv"
)

// RequireOptions configures Require.
type RequireOptions struct {
	// User resolves who is approving from YOUR server-side state: the
	// signed-in session, or — for the login step — whoever just passed your
	// password check. Required: Require panics when it is nil. Never read it
	// from anything the client sends (a header, a form field): the client
	// could then name any user and trigger their approval.
	User func(*http.Request) string
	// Details: what the phone shows and the approval is bound to. Build it
	// from server-side state.
	Details func(*http.Request) []LoginDetail
	// ReferenceID: your own transaction id, bound to the approval.
	ReferenceID func(*http.Request) string
	// IP: end user's address (default: the host part of r.RemoteAddr — set
	// this explicitly behind a reverse proxy, from your trusted
	// X-Forwarded-For hop; never the leftmost hop, which the client controls).
	IP func(*http.Request) string
}

type approvalContextKey struct{}

// ApprovalFromContext returns the approval Require stored on the request
// context, once the protected handler is running.
func ApprovalFromContext(ctx context.Context) (*Approval, bool) {
	a, ok := ctx.Value(approvalContextKey{}).(*Approval)
	return a, ok
}

// defaultIP is the host part of r.RemoteAddr: "ip:port" is not an address,
// and the API would score your server instead of the user.
func defaultIP(r *http.Request) string {
	return hostOnly(r.RemoteAddr)
}

// hostOnly drops the port from "host:port" / "[v6]:port"; any other value
// is returned unchanged.
func hostOnly(addr string) string {
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
}

func guardInputFromRequest(r *http.Request) (token, offline, code, codeType string) {
	token = r.Header.Get(GuardTokenHeader)
	off := r.Header.Get(GuardOfflineHeader)
	offlineBool := off == "1" || off == "true"
	code = r.Header.Get(GuardCodeHeader)
	codeType = r.Header.Get(GuardCodeTypeHeader)
	if offlineBool {
		offline = "1"
	}
	return
}

// Require wraps next with a one-line step-up guard:
//
//	mux.Handle("/transfer", touchque.Require(client, "SEND_MONEY", transferHandler, touchque.RequireOptions{
//	    User: func(r *http.Request) string { return sessionUser(r) },
//	    Details: func(r *http.Request) []touchque.LoginDetail {
//	        return []touchque.LoginDetail{{Label: "Amount", Value: r.FormValue("amount") + " EUR"}}
//	    },
//	}))
//
// Until the user approves on their phone this answers
// 202 {"touchque": step, "token": "..."}. Your page shows the step in its own
// design and sends the same request again with header
// "X-TouchQue-Token: <token>". Once approved, next runs exactly once, with
// the approval available via ApprovalFromContext(r.Context()).
func Require(client *Client, action string, next http.Handler, opts RequireOptions) http.Handler {
	userOf := opts.User
	if userOf == nil {
		// Fail at wiring time, not per request: there is no safe default.
		// (Before 3.1.1 this fell back to a client-supplied header.)
		panic("touchque.Require: RequireOptions.User is required — resolve the user from your server-side session")
	}
	ipOf := opts.IP
	if ipOf == nil {
		ipOf = defaultIP
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var details []LoginDetail
		if opts.Details != nil {
			details = opts.Details(r)
		}
		var referenceID string
		if opts.ReferenceID != nil {
			referenceID = opts.ReferenceID(r)
		}
		token, offline, code, codeType := guardInputFromRequest(r)

		result := runGuard(client, GuardInput{
			User: userOf(r), Action: action, Details: details, ReferenceID: referenceID,
			IP: ipOf(r), UserAgent: r.UserAgent(),
			Token: token, Offline: offline == "1", Code: code, CodeType: codeType,
		})

		if result.Approved != nil {
			ctx := context.WithValue(r.Context(), approvalContextKey{}, result.Approved)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if result.Body.Touchque.RetryAfter > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(result.Body.Touchque.RetryAfter))
		}
		w.WriteHeader(result.Status)
		_ = json.NewEncoder(w).Encode(result.Body)
	})
}

// ─────────────────────────────────────────────────────────────
// From touchque/approval_proof.go — VerifyApprovalProof (device proof, pin the key)
// ─────────────────────────────────────────────────────────────

package touchque

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"strings"
)

// ApprovalProof is the device-signed proof of an approval ("what you see is
// what you sign"). When the user's phone holds a hardware key (Secure Enclave
// / Android Keystore), every approval is signed by it over the request id, the
// action type, the number-match code and a digest of the transaction details
// the user was shown. It arrives in the SUCCESS webhook ("approvalProof") and
// in the login status response. Verifying it does not require trusting
// TouchQue: it proves the enrolled phone signed exactly these details.
type ApprovalProof struct {
	Version   string `json:"version"`
	Algorithm string `json:"algorithm"`
	// Message is the exact text the device signed.
	Message string `json:"message"`
	// Signature is the base64 DER ECDSA signature.
	Signature string `json:"signature"`
	// PublicKey is the base64 X9.63 (uncompressed) P-256 key of the device.
	PublicKey string `json:"publicKey"`
}

// VerifyApprovalProofOptions describes the transaction you expect the proof
// to cover.
type VerifyApprovalProofOptions struct {
	// RequestID returned by the login request.
	RequestID string
	// Type is the action type you sent (e.g. "WITHDRAW").
	Type string
	// Details you sent, exactly as you sent them (nil when none).
	Details []LoginDetail
	// ChallengeCode is the number-match code, when number matching was used.
	ChallengeCode string
	// ExpectedPublicKey pins the device: the base64 public key you stored for
	// this user (e.g. PublicKey of their first verified approval). A proof
	// from any other key is rejected. Required unless AllowUnpinnedKey.
	ExpectedPublicKey string
	// AllowUnpinnedKey accepts whatever key the proof carries. Without a pin
	// the proof only shows that *some* key signed these details. Only for
	// trust-on-first-use: store PublicKey after this first check, pin it after.
	AllowUnpinnedKey bool
}

// DetailsDigest is the SHA-256 hex of the details as displayed on the phone
// ("" when there are none) — the last line of the signed message.
func DetailsDigest(details []LoginDetail) string { return detailsDigest(details) }

// VerifyApprovalProof reports whether proof was signed by the device key over
// exactly the request, action type, challenge code and details in opts.
// proof may be an ApprovalProof, *ApprovalProof, the decoded JSON value from a
// webhook or status response (map[string]interface{}), json.RawMessage or
// []byte. Fails closed (no pin and no AllowUnpinnedKey -> false) and returns
// false for any malformed input.
func VerifyApprovalProof(proof interface{}, opts VerifyApprovalProofOptions) bool {
	p, ok := toApprovalProof(proof)
	if !ok || p.Version != "v2" || p.Algorithm != "ECDSA-P256-SHA256" {
		return false
	}
	if opts.ExpectedPublicKey != "" {
		if subtle.ConstantTimeCompare([]byte(p.PublicKey), []byte(opts.ExpectedPublicKey)) != 1 {
			return false
		}
	} else if !opts.AllowUnpinnedKey {
		return false
	}

	expected := strings.Join([]string{
		"touchque-approve:v2", opts.RequestID, opts.Type, opts.ChallengeCode, detailsDigest(opts.Details),
	}, "\n")
	if subtle.ConstantTimeCompare([]byte(p.Message), []byte(expected)) != 1 {
		return false
	}

	raw, err := base64.StdEncoding.DecodeString(p.PublicKey)
	if err != nil || len(raw) != 65 || raw[0] != 0x04 {
		return false
	}
	key, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), raw)
	if err != nil {
		return false // not a point on P-256
	}
	sig, err := base64.StdEncoding.DecodeString(p.Signature)
	if err != nil || len(sig) == 0 {
		return false
	}
	digest := sha256.Sum256([]byte(p.Message))
	return ecdsa.VerifyASN1(key, digest[:], sig)
}

func toApprovalProof(v interface{}) (ApprovalProof, bool) {
	switch t := v.(type) {
	case nil:
		return ApprovalProof{}, false
	case ApprovalProof:
		return t, true
	case *ApprovalProof:
		if t == nil {
			return ApprovalProof{}, false
		}
		return *t, true
	case json.RawMessage:
		return decodeApprovalProof(t)
	case []byte:
		return decodeApprovalProof(t)
	default:
		b, err := json.Marshal(t)
		if err != nil {
			return ApprovalProof{}, false
		}
		return decodeApprovalProof(b)
	}
}

func decodeApprovalProof(b []byte) (ApprovalProof, bool) {
	var p ApprovalProof
	if err := json.Unmarshal(b, &p); err != nil {
		return ApprovalProof{}, false
	}
	return p, true
}

// ─────────────────────────────────────────────────────────────
// From touchque/relay.go — NewRelayHandler, the relay routes @touchque/web calls (public part)
// ─────────────────────────────────────────────────────────────

package touchque

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// NewRelayHandler serves the relay routes every partner backend needs for
// classic push 2FA, offline sign and passkeys — the routes @touchque/web
// calls — so you do not hand-write them. Nothing here is partner-specific
// except how you resolve the signed-in user (UserID) and what you do once
// someone is authenticated (OnAuthenticated).
//
//	mux.Handle("/touchque/", http.StripPrefix("/touchque", touchque.NewRelayHandler(tq, touchque.RelayOptions{
//	    UserID:    func(r *http.Request) string { return sessionUser(r) },
//	    LoginUser: func(r *http.Request) string { return passwordVerifiedUser(r) },
//	    OnAuthenticated: func(w http.ResponseWriter, r *http.Request, info touchque.AuthenticatedInfo) error {
//	        return startSession(w, info.ExternalUsername)
//	    },
//	})))
//
// Routes (relative to the mount point):
//
//	POST   /enroll/start                  (auth required) -> GenerateSecretResponse
//	GET    /enroll/status                 (auth required) -> {"linked", "used", "deviceId"}
//	POST   /login                         (pre-auth) -> 202 {"touchque": step, "token"} until approved (same contract as Require)
//	POST   /offline/challenge             (pre-auth, body.externalUsername) -> QR for a phone with no internet
//	POST   /offline/verify                (pre-auth, body.challengeId/code)
//	POST   /offline/totp                  (pre-auth, body.externalUsername/code) -> time-based code fallback
//	POST   /passkey/authenticate/options  (pre-auth, body.email)
//	POST   /passkey/authenticate/verify   (pre-auth, body.attemptId/response)
//	POST   /passkey/login/options         (pre-auth, body.requestId — approve a pending 2FA request)
//	POST   /passkey/login/verify          (pre-auth, body.requestId/response)
//	POST   /passkey/register/options      (auth required)
//	POST   /passkey/register/verify       (auth required, body.response/label)
//	GET    /passkey/credentials           (auth required)
//	DELETE /passkey/credentials/{id}      (auth required)
//
// "Auth required" routes answer 401 UNAUTHORIZED_FOR_2FA when UserID returns
// "" — put your own session middleware in front of the handler (or have
// UserID itself check and return "").
//
// Pre-auth routes are rate limited per IP and per username by default
// (RateLimit), and TouchQue itself caps approval pushes per user. Set
// LoginUser so POST /login and the offline routes only work for a user who
// already passed YOUR first factor (password step): then nobody can make
// TouchQue push to, or lock out, an arbitrary user through your server. The
// offline routes are OFF until you do (or explicitly opt out with
// AllowOfflineWithoutFirstFactor): with the username taken from the body,
// anyone could burn a user's offline attempts and lock them out.
//
// JSON request bodies are read only with Content-Type application/json and
// are limited to 100 KiB.
//
// NewRelayHandler panics when opts.UserID is nil.
func NewRelayHandler(client *Client, opts RelayOptions) http.Handler {
	if opts.UserID == nil {
		// Fail at wiring time, not per request: there is no safe default.
		panic("touchque.NewRelayHandler: RelayOptions.UserID is required — resolve the user from your server-side session")
	}
	h := &relayHandler{
		client:         client,
		opts:           opts,
		actionType:     opts.ActionType,
		ipOf:           opts.IP,
		offlineEnabled: opts.LoginUser != nil || opts.AllowOfflineWithoutFirstFactor,
	}
	if h.actionType == "" {
		h.actionType = "LOGIN"
	}
	if h.ipOf == nil {
		h.ipOf = defaultRelayIP
	}
	if opts.RateLimit == nil || !opts.RateLimit.Disabled {
		var rl RateLimitOptions
		if opts.RateLimit != nil {
			rl = *opts.RateLimit
		}
		h.limiter = newFixedWindowLimiter(rl)
	}

	if opts.LoginUser == nil {
		warnRelayPreAuth.Do(func() {
			tail := "; the offline routes are disabled until you set it"
			if h.offlineEnabled {
				tail = ", and so do the offline routes"
			}
			log.Printf("[TouchQue] NewRelayHandler: POST /login takes the username from the request body%s."+
				" Set RelayOptions.LoginUser to bind them to your first factor (password step) so they cannot be used against arbitrary users.", tail)
		})
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /enroll/start", h.withBody(h.enrollStart))
	mux.HandleFunc("GET /enroll/status", h.enrollStatus)
	mux.HandleFunc("POST /login", h.withBody(h.login))
	mux.HandleFunc("POST /offline/challenge", h.withBody(h.offlineChallenge))
	mux.HandleFunc("POST /offline/verify", h.withBody(h.offlineVerify))
	mux.HandleFunc("POST /offline/totp", h.withBody(h.offlineTotp))
	mux.HandleFunc("POST /passkey/authenticate/options", h.withBody(h.passkeyPrimaryOptions))
	mux.HandleFunc("POST /passkey/authenticate/verify", h.withBody(h.passkeyPrimaryVerify))
	mux.HandleFunc("POST /passkey/login/options", h.withBody(h.passkeyApproveOptions))
	mux.HandleFunc("POST /passkey/login/verify", h.withBody(h.passkeyApproveVerify))
	mux.HandleFunc("POST /passkey/register/options", h.withBody(h.passkeyRegisterOptions))
	mux.HandleFunc("POST /passkey/register/verify", h.withBody(h.passkeyRegisterVerify))
	mux.HandleFunc("GET /passkey/credentials", h.passkeyListCredentials)
	mux.HandleFunc("DELETE /passkey/credentials/{id}", h.withBody(h.passkeyDeleteCredential))
	return mux
}

// RelayOptions configures NewRelayHandler.
type RelayOptions struct {
	// UserID resolves the signed-in user's identifier for the "auth required"
	// routes (enrollment, passkey registration/management). Return "" when
	// there is no signed-in user — the route answers 401. Required:
	// NewRelayHandler panics when it is nil.
	UserID func(*http.Request) string

	// LoginUser is STRONGLY RECOMMENDED: the user who has already passed your
	// first factor (e.g. the password step stored in the session). When set,
	// POST /login, POST /offline/challenge and POST /offline/totp use this
	// user and IGNORE any username in the request body; when it returns ""
	// they answer 401 FIRST_FACTOR_REQUIRED. POST /offline/verify and
	// POST /passkey/login/verify then only open a session when TouchQue's
	// user matches it. Without it, anyone can type any user's email and make
	// TouchQue push to that user's phone (push-bombing) or spend that user's
	// offline attempts.
	LoginUser func(*http.Request) string

	// RateLimit configures the built-in limits for the pre-auth routes (per
	// client IP and per username, per route). nil means the defaults: 20
	// requests per IP and 5 per username per minute. Set Disabled to turn it
	// off if you already rate limit in front of this handler. The IP func
	// must return the real client address.
	RateLimit *RateLimitOptions

	// AllowOfflineWithoutFirstFactor: the offline routes (/offline/challenge,
	// /offline/verify, /offline/totp) answer 403 OFFLINE_REQUIRES_FIRST_FACTOR
	// unless LoginUser is set. Set this to true only if you really want them
	// to trust the username in the request body (e.g. your own gateway
	// already authenticated the user).
	AllowOfflineWithoutFirstFactor bool

	// ActionType is the action type used by POST /login and the offline
	// routes. Default "LOGIN".
	ActionType string

	// Details is optional transaction context for the POST /login push and
	// the offline QR, shown on the approval screen. Build it from your own
	// server-side state — anything read from the request body is
	// attacker-controlled.
	Details func(*http.Request) []LoginDetail

	// OnAuthenticated is called right before the handler writes its own
	// success response for POST /login (once approved), the offline routes
	// and the passkey sign-in routes (once verified) — the one place a
	// partner almost always needs to do something (open a session cookie,
	// etc.). Set cookies/headers on w here; do not write the body — the
	// handler does that right after. A non-nil error aborts the success
	// response and is answered as an error instead.
	OnAuthenticated func(w http.ResponseWriter, r *http.Request, info AuthenticatedInfo) error

	// IP is the end user's address, used for the per-IP rate limit and shown
	// on the phone (default: the host part of r.RemoteAddr — set this
	// explicitly behind a reverse proxy, from your trusted X-Forwarded-For
	// hop).
	IP func(*http.Request) string
}

// AuthenticatedVia says which relay route authenticated the user.
type AuthenticatedVia string

const (
	ViaLogin       AuthenticatedVia = "login"
	ViaPasskey     AuthenticatedVia = "passkey"
	ViaOffline     AuthenticatedVia = "offline"
	ViaOfflineTotp AuthenticatedVia = "offline-totp"
)

// AuthenticatedInfo is passed to RelayOptions.OnAuthenticated.
// ExternalUsername always comes from TouchQue or your LoginUser func, never
// from the request body.
type AuthenticatedInfo struct {
	ExternalUsername string
	RequestID        string
	Via              AuthenticatedVia
}

const relayMaxBodyBytes = 100 << 10

var warnRelayPreAuth sync.Once

// ... private route handlers omitted
