// TouchQue Go SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-go/touchque/{config.go,types.go,client.go,steps.go}.
// Regenerate by copying those files here whenever the SDK's public API changes.

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
		return &Step{State: StepWaiting, RequestID: res.RequestID, Number: res.ChallengeCode, ExpiresAt: res.ExpiresAt, Details: norm}, nil
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
