// Touchque Go SDK — bundled type/API reference for AI assistants.
// Concatenation of touchque-go/touchque/{config.go,types.go,client.go,steps.go,offline.go,login.go,
// http_middleware.go,approval_proof.go} plus the public part of relay.go (NewRelayHandler).
// Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

package touchque

import (
	"log/slog"
	"net/url"
	"os"
	"strings"
)

// DefaultBaseURL is used when Config.BaseURL and TQ_API_URL are both unset.
const DefaultBaseURL = "https://api.touchque.com"

// Config holds the configuration options for the Touchque SDK.
type Config struct {
	APIKey    string
	APISecret string
	BaseURL   string
	TimeoutMs int
	// Logger receives the SDK's own problems: a misconfigured guard, a
	// failed OnChallenge, a relay without LoginUser. nil (the default) logs
	// nothing. Lines carry an error's type and text, never request data.
	Logger *slog.Logger
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

import "time"

// GenerateSecretResponse represents the response from generating a new secret
type GenerateSecretResponse struct {
	Secret           string `json:"secret"`
	ExternalUsername string `json:"externalUsername"`
	ExpiresAt        string `json:"expiresAt"`
	TTLMs            int    `json:"ttlMs"`
	// QRCodeDataURL is a ready-to-render `data:image/png;base64,...` encoding
	// Secret for the Touchque mobile app to scan.
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
	TTLMs            int      `json:"ttlMs"`
	QRCodeDataURL    string   `json:"qrCodeDataUrl"`
	RecoveryCodes    []string `json:"recoveryCodes"`
}

// LoginRequestResponse represents the response from initiating a login request
type LoginRequestResponse struct {
	RequestID     string `json:"requestId"`
	ChallengeCode string `json:"challengeCode"`
	Message       string `json:"message"`
	ExpiresAt     string `json:"expiresAt"`
	// CaseCode is the "Why?" case code of this decision (K7P-2QX). Show it to
	// the user ("Tell your support team: K7P-2QX"); your team opens the whole
	// decision (each check, the rule that matched, what would have let it
	// through) by this code in the dashboard (Logs → Look up a case).
	CaseCode string `json:"caseCode,omitempty"`
	// Reasons say why number matching or a passkey is needed (a fixed list,
	// never a score); empty for a plain push.
	Reasons []RiskReason `json:"reasons,omitempty"`
	// RequiresPasskey is true when a phishing-resistant policy demands a
	// passkey approval — no push was sent for this request.
	RequiresPasskey bool `json:"requiresPasskey,omitempty"`
	// TelemetryToken is set only when the integration has behavioral biometrics
	// enabled (TenantPolicy.behavioralBiometricsEnabled). Pass it plus RequestID
	// to your frontend to initialize the @touchque/web behavioral widget
	// (tq.behavioral.attach(...)). There is no widget in this server SDK.
	TelemetryToken string `json:"telemetryToken,omitempty"`
	// Canary is the Mirror Alarm probe: the page that shows this sign-in loads
	// its URL and sends a beacon to it (@touchque/web does both), so a
	// real-time phishing proxy in front of your site gets the approval refused
	// (webhook reason phishing_origin). Allow its host in your CSP.
	Canary *Canary `json:"canary,omitempty"`
	// Destination is set only when the request had one: whether the user used
	// it before and the earlier destinations it looks like.
	Destination *DestinationCheck `json:"destination,omitempty"`
}

// SecurityChanges says when the user's sign-in security last changed in your
// own system. A zero time is left out. Touchque adds what it saw itself;
// access rules and Actions read the minutes since each
// (minutesSince.mfaChange, .deviceChange, ...), e.g. refuse PAYOUT_CHANGE
// within 24 hours of a 2FA change.
type SecurityChanges struct {
	Password time.Time
	MFA      time.Time
	Device   time.Time
	Email    time.Time
	Phone    time.Time
}

// Destination is where an action sends money or value. The phone shows it in
// full in groups of four, with a warning when it looks like one the user used
// before but is not the same. Do not repeat it in Details.
type Destination struct {
	// Kind is iban, account, wallet, address or payee.
	Kind string `json:"kind"`
	// Value is the IBAN (its check digits must pass), account number, wallet
	// address, delivery address or payee name.
	Value string `json:"value"`
	// Known lists destinations of this kind the user already uses in your
	// system (saved payees, addresses); at most 50.
	Known []string `json:"known,omitempty"`
}

// DestinationLookalike is an earlier destination the request's one resembles.
type DestinationLookalike struct {
	Field string `json:"field"`
	// Reason is same_start_and_end, confusable, near_miss or mixed_script.
	Reason string `json:"reason"`
	// SimilarTo is the known destination, masked (TR33…1326).
	SimilarTo string `json:"similarTo,omitempty"`
}

// DestinationCheck is what Touchque made of a request's Destination.
type DestinationCheck struct {
	Known     bool                   `json:"known"`
	Lookalike []DestinationLookalike `json:"lookalike"`
}

// Canary is the Mirror Alarm probe of one login request.
type Canary struct {
	URL string `json:"url"`
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
	// Device is the linked phone's posture, or nil before a phone is linked.
	Device *DevicePosture `json:"device"`
}

// DevicePosture is what the Touchque app last reported about the phone it runs
// on, for device trust (GetUserResponse.Device). It is self-reported by the
// app; Signed says the phone's hardware approval key signed the latest report.
// An empty string means "not reported" (the API sends null).
//
// State is "compromised" (jailbroken/rooted or tampered), "unknown" (no report,
// or one older than 14 days), "at_risk" (no screen lock, approval keys
// destroyed, no hardware key, debugger or developer mode) or "healthy". Issues
// lists the reasons: jailbroken, tampered, integrity_failed, no_report,
// stale_report, no_screen_lock, keys_lost, no_hardware_key, debugger,
// developer_mode.
type DevicePosture struct {
	// Platform is "ios" or "android".
	Platform string `json:"platform,omitempty"`
	// Model is the hardware model, e.g. "iPhone15,3" or "Pixel 8".
	Model string `json:"model,omitempty"`
	// OSVersion is e.g. "18.1" or "15".
	OSVersion string `json:"osVersion,omitempty"`
	// SecurityPatch is the Android security patch level (YYYY-MM-DD); empty on iOS.
	SecurityPatch string `json:"securityPatch,omitempty"`
	AppVersion    string `json:"appVersion,omitempty"`
	// ScreenLock is nil when the phone did not say whether a passcode, PIN,
	// pattern or password is set.
	ScreenLock *bool `json:"screenLock"`
	// Biometrics is "face", "touch", "fingerprint", "iris" or "none".
	Biometrics string `json:"biometrics,omitempty"`
	// Jailbroken: jailbroken or rooted, by the app's checks.
	Jailbroken bool `json:"jailbroken"`
	// Compromised: jailbroken/rooted or tampered; sticky until the phone
	// reports clean for a cool-down.
	Compromised bool `json:"compromised"`
	// HardwareKey: approvals are signed by a Secure Enclave / Keystore key that
	// still works.
	HardwareKey bool `json:"hardwareKey"`
	// Attestation is "apple-appattest" or "android-key", how the hardware key
	// was proven genuine; empty when it was not attested.
	Attestation string `json:"attestation,omitempty"`
	// Signed: the latest report was signed by the phone's hardware key.
	Signed bool `json:"signed"`
	// ReportedAt is the ISO date-time of the latest report.
	ReportedAt string   `json:"reportedAt,omitempty"`
	LastSeenAt string   `json:"lastSeenAt,omitempty"`
	LinkedAt   string   `json:"linkedAt,omitempty"`
	State      string   `json:"state"`
	Issues     []string `json:"issues"`
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
	// reported by Touchque (never by the browser). Empty on older APIs.
	ExternalUsername string `json:"externalUsername,omitempty"`
	// RequestID is the approved login request, when Touchque reports it.
	RequestID string `json:"requestId,omitempty"`
}

// WebAuthnPrimaryOptionsResponse is returned by WebAuthn.PrimaryOptions.
// WebAuthnPrimaryAvailability is returned by WebAuthn.PrimaryAvailability:
// whether passkey sign-in is on for your workspace. UserVerification is
// "required" or "preferred", or empty when Enabled is false.
type WebAuthnPrimaryAvailability struct {
	Enabled          bool   `json:"enabled"`
	UserVerification string `json:"userVerification"`
}

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
	// RequiresPasskey: only a passkey can approve it — a phishing-resistant
	// policy, or the Vishing Shield moved it to a passkey at the phone tap
	// because the user was on a call (it is still PENDING then).
	RequiresPasskey bool       `json:"requiresPasskey,omitempty"`
	ConfirmedVia    string     `json:"confirmedVia,omitempty"`
	Assurance       *Assurance `json:"assurance,omitempty"`
	// ExpiresAt is the request's live expiry (ISO 8601): a Vishing Shield
	// escalation to a passkey extends it.
	ExpiresAt string `json:"expiresAt,omitempty"`
	// Reply: a request made with Reply, once the person typed it back (the
	// ciphertext only; OpenCodeReply opens it). nil for a CONFIRMED request
	// approved without typing (an older app).
	Reply *LoginReply `json:"reply,omitempty"`
	ShieldFields
}

// ShieldFields are the Vishing Shield fields of an approval. Provisional: it
// was given on the phone during a call; it stays CONFIRMED, but the user's
// critical actions are refused (blocked / provisional) until the phone
// re-confirms it after the call (ReconfirmedAt) or the user takes it back
// (Revoked, RevokeReason "COACHED" or "UNDO"). End what was built on a
// revoked approval.
type ShieldFields struct {
	Provisional   bool   `json:"provisional,omitempty"`
	ReconfirmedAt string `json:"reconfirmedAt,omitempty"`
	Revoked       bool   `json:"revoked,omitempty"`
	RevokeReason  string `json:"revokeReason,omitempty"`
}

// VerifyResponse represents the response from verifying a login request.
type VerifyResponse struct {
	Approved      bool       `json:"approved"`
	Status        string     `json:"status"`
	RequestID     string     `json:"requestId,omitempty"`
	ChallengeCode string     `json:"challengeCode,omitempty"`
	Assurance     *Assurance `json:"assurance,omitempty"`
	ConfirmedVia  string     `json:"confirmedVia,omitempty"`
	// Provisional: approved during a call (Vishing Shield); critical actions
	// wait until the phone re-confirms it.
	Provisional bool `json:"provisional,omitempty"`
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
	ShieldFields
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

import "log/slog"

// Client is the main entry point for the Touchque Go SDK.
type Client struct {
	Auth     *AuthResource
	Login    *LoginResource
	WebAuthn *WebAuthnResource
	Webhook  *WebhookResource
	Offline  *OfflineResource
	// ActionTypes: what users approve (LOGIN, SEND_MONEY…). Was Actions before v4.
	ActionTypes *ActionTypesResource
	// Actions is Touchque Actions: your own code in the approval pipeline.
	Actions *ActionsResource
	// Risk is silent sign-ins: should this sign-in ask the phone, and which
	// browsers Touchque knows.
	Risk *RiskResource
	// Recovery is Never Locked Out: move a user whose phone is gone to a new
	// phone, with colleagues vouching.
	Recovery *RecoveryResource
	// Assist is the help desk: IT working on a person's account in the open,
	// and checks on their phone before sensitive actions.
	Assist *AssistResource
	// Agents manages AI agents as identities of their own: register (public
	// key), suspend, revoke, kill switch. The agent itself uses NewAgent.
	Agents *AgentsResource
	// Identity is the Touchque Login Management API: your customers' accounts,
	// roles, organizations, apps and connections.
	Identity *IdentityResource
	// Mobile is the Mobile SDK: your own iOS/Android app approves for your
	// users (enrollment tokens, devices, settings).
	Mobile *MobileResource
	// QRPairings pairs a browser by QR code: the phone that scans it is the
	// one asked to approve.
	QRPairings *QRPairingsResource
	// DeviceRisk is Device risk: the device on your sign-up, reset, sign-in
	// or approval page (a paid add-on).
	DeviceRisk *DeviceRiskResource
	// SafeGuard is Safe Guard: Safe transactions approved on the approver's
	// phone, for TouchqueSafeGuard.
	SafeGuard *SafeGuardResource

	apiSecret string
	logger    *slog.Logger
}

// NewClient initializes a new Touchque SDK Client with the given
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
		logger:      config.Logger,
		Auth:        newAuthResource(httpWrapper),
		Login:       newLoginResource(httpWrapper),
		WebAuthn:    newWebAuthnResource(httpWrapper),
		Webhook:     newWebhookResource(config),
		Offline:     newOfflineResource(httpWrapper),
		ActionTypes: newActionTypesResource(httpWrapper),
		Actions:     newActionsResource(httpWrapper),
		Risk:        newRiskResource(httpWrapper),
		Recovery:    newRecoveryResource(httpWrapper),
		Assist:      newAssistResource(httpWrapper),
		Agents:      newAgentsResource(httpWrapper),
		Identity:    newIdentityResource(httpWrapper),
		Mobile:      newMobileResource(httpWrapper),
		QRPairings:  newQRPairingsResource(httpWrapper),
		DeviceRisk:  newDeviceRiskResource(httpWrapper),
		SafeGuard:   newSafeGuardResource(httpWrapper),
		apiSecret:   config.APISecret,
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
	State     StepState     `json:"state"`
	RequestID string        `json:"requestId,omitempty"`
	Number    string        `json:"number,omitempty"`
	ExpiresAt string        `json:"expiresAt,omitempty"`
	Details   []LoginDetail `json:"details,omitempty"`
	Enroll    *EnrollStep   `json:"enroll,omitempty"`
	Offline   *OfflineStep  `json:"offline,omitempty"`
	Reason    string        `json:"reason,omitempty"`
	// CaseCode is the "Why?" case code of this decision (K7P-2QX): show it
	// with the step ("Tell your support team: K7P-2QX"). Safe for the browser.
	CaseCode string `json:"caseCode,omitempty"`
	// Reasons say why number matching, a passkey or a refusal (plain English,
	// a fixed list, never a score).
	Reasons    []RiskReason `json:"reasons,omitempty"`
	RetryAfter int          `json:"retryAfter,omitempty"`
	Assurance  *Assurance   `json:"assurance,omitempty"`
	// TelemetryToken is set only when the workspace collects behavioural
	// signals: it lets the browser post them for this one request
	// (@touchque/web does it when given `telemetry`). Not a credential.
	TelemetryToken string `json:"telemetryToken,omitempty"`
	// Canary (Mirror Alarm): the page showing this step loads it and beacons to
	// it (@touchque/web does it), so a phishing proxy in front of your site is
	// caught. Only on the first waiting step.
	Canary *Canary `json:"canary,omitempty"`
}

// EnrollStep is shown when the user has not linked a phone yet.
type EnrollStep struct {
	QRCodeDataURL string   `json:"qrCodeDataUrl,omitempty"`
	RecoveryCodes []string `json:"recoveryCodes,omitempty"`
	// ExpiresAt is when the QR stops working (ISO 8601). Until about 15 s
	// before it, the guard's polls answer {state: "enroll", expiresAt} without
	// Enroll: keep showing this QR. Then a poll brings a new QR with new
	// recovery codes, and the old QR and the old codes stop working.
	ExpiresAt string `json:"expiresAt,omitempty"`
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
	// Vishing Shield: Provisional means approved during a call. Let the user
	// in, but treat the session as limited: Touchque refuses their critical
	// actions until the phone re-confirms (EventApprovalReconfirmed), and
	// EventApprovalRevoked means end it.
	ShieldFields
	// Reasons is set on silent sign-ins only (Assurance.Method "silent",
	// ConfirmedVia "SILENT", RequestID "silent"): nothing was sent to the
	// phone, and these say why Touchque let this known browser in.
	Reasons []RiskReason `json:"reasons,omitempty"`
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
	// NoEnroll: set true to get Step{State: StepEnroll, Reason:
	// "enrollment_off"} (no QR) instead of issuing one, when the user has no
	// linked phone.
	NoEnroll bool
	// BrowserProof (silent sign-ins): the browser's device-bound key proof
	// (X-Touchque-Browser), passed through untouched. Once the user approves,
	// Touchque knows this browser.
	BrowserProof string
	// Context is for your Touchque Actions only (event.context). Never shown on the phone.
	Context map[string]interface{}
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

// NormalizeDetails trims each label and value the way the API does (nil in,
// nil out): the details a guard token and an approval are bound to.
func NormalizeDetails(details []LoginDetail) []LoginDetail { return normalizeDetails(details) }

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
		ClientIP: opts.IP, UserAgent: opts.UserAgent, Details: norm, BrowserProof: opts.BrowserProof,
		Context: opts.Context,
	})
	if err == nil {
		var canary *Canary
		if res.Canary != nil && res.Canary.URL != "" {
			canary = &Canary{URL: res.Canary.URL}
		}
		if res.RequiresPasskey {
			return &Step{State: StepPasskeyRequired, RequestID: res.RequestID, ExpiresAt: res.ExpiresAt, Details: norm, Canary: canary,
				CaseCode: res.CaseCode, Reasons: res.Reasons}, nil
		}
		return &Step{State: StepWaiting, RequestID: res.RequestID, Number: res.ChallengeCode, ExpiresAt: res.ExpiresAt, Details: norm, TelemetryToken: res.TelemetryToken, Canary: canary,
			CaseCode: res.CaseCode, Reasons: res.Reasons}, nil
	}

	apiErr, ok := err.(*APIError)
	if !ok {
		return nil, err
	}
	switch {
	case apiErr.StatusCode == 404 && (apiErr.Code == "device_not_linked" || strings.Contains(strings.ToLower(apiErr.Message), "linked device")):
		if opts.NoEnroll {
			// No phone, and this guard may not show a QR: say so, so the page stops polling.
			return &Step{State: StepEnroll, Reason: "enrollment_off"}, nil
		}
		return enrollStep(c, user)
	case apiErr.StatusCode == 423:
		return &Step{State: StepFrozen, RetryAfter: apiErr.RetryAfter, CaseCode: apiErr.CaseCode}, nil
	case apiErr.StatusCode == 429:
		return &Step{State: StepRateLimited, RetryAfter: apiErr.RetryAfter, CaseCode: apiErr.CaseCode}, nil
	case apiErr.StatusCode == 400 && (apiErr.Code == "unknown_action" || strings.Contains(strings.ToLower(apiErr.Message), "invalid action type")):
		return nil, &ConfigError{Message: "touchque: unknown action \"" + action + "\". Create it once with client.ActionTypes.Define(\"" + action + "\", ...) or in the Dashboard (Action Types)."}
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
		return &Step{State: StepBlocked, Reason: reason, CaseCode: apiErr.CaseCode}, nil
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
		return enrollQR(gen.QRCodeDataURL, gen.RecoveryCodes, gen.ExpiresAt, gen.TTLMs), nil
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
	return enrollQR(reset.QRCodeDataURL, reset.RecoveryCodes, reset.ExpiresAt, reset.TTLMs), nil
}

// enrollQR is the first-time QR step. Its ExpiresAt is the API's expiresAt
// when it is ISO 8601, else now + ttlMs when positive, else empty; the guard
// binds it to its token (claim Ee), so polls keep this QR instead of making
// a new one.
func enrollQR(qr string, recoveryCodes []string, expiresAt string, ttlMs int) *Step {
	if _, ok := isoMs(expiresAt); !ok {
		expiresAt = ""
		if ttlMs > 0 {
			expiresAt = isoFromMs(nowMs() + int64(ttlMs))
		}
	}
	return &Step{State: StepEnroll, Enroll: &EnrollStep{QRCodeDataURL: qr, RecoveryCodes: recoveryCodes, ExpiresAt: expiresAt}}
}

// isoMs reads an ISO 8601 date-time (no zone means UTC) as ms since the epoch.
func isoMs(s string) (int64, bool) {
	if s == "" {
		return 0, false
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UnixMilli(), true
		}
	}
	return 0, false
}

// isoFromMs writes ms since the epoch as ISO 8601 in UTC, like JavaScript's toISOString().
func isoFromMs(ms int64) string {
	return time.UnixMilli(ms).UTC().Format("2006-01-02T15:04:05.000Z")
}

var stepStateMap = map[string]StepState{
	"PENDING": StepWaiting, "CONFIRMED": StepApproved, "REJECTED": StepRejected, "EXPIRED": StepExpired,
}

// Check reports where a started approval is now, with the request's live
// ExpiresAt when the API gives it (a Vishing Shield escalation to a passkey
// extends it).
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
	step := &Step{State: state, RequestID: requestID, ExpiresAt: s.ExpiresAt}
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
		ShieldFields: res.ShieldFields,
	}, nil
}

// ── Guard token ──────────────────────────────────────────────────────────
// The browser echoes this back while it waits. It is signed with a key
// derived from the API secret and binds the approval to one user, action and
// transaction, so it cannot be replayed for another user, amount or route.

// GuardTokenClaims are what a guard token carries (SignGuardToken /
// VerifyGuardToken): the user, action, details and reference id it is bound
// to, the step it was issued for and the request behind it.
type GuardTokenClaims struct {
	U   string `json:"u"`             // user
	A   string `json:"a"`             // action
	D   string `json:"d"`             // details digest (DetailsDigest)
	R   string `json:"r"`             // reference id
	St  string `json:"st"`            // step state (StepWaiting …)
	Rid string `json:"rid,omitempty"` // request id
	N   string `json:"n,omitempty"`   // matching number
	Oc  string `json:"oc,omitempty"`  // offline challenge id
	Cc  string `json:"cc,omitempty"`  // "Why?" case code, shown while waiting
	Ee  int64  `json:"ee,omitempty"`  // the first-time QR's expiry, ms since the epoch (enroll steps)
	Rx  int64  `json:"rx,omitempty"`  // the request's expiry, ms since the epoch (waiting / passkey_required steps)
	Exp int64  `json:"exp"`           // expiry, ms since the epoch
}

// guardClaims is the guard's own name for GuardTokenClaims.
type guardClaims = GuardTokenClaims

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

// SignGuardToken signs claims into a guard token ("v1.<body>.<mac>") with a
// key derived from apiSecret, for a guard you build yourself (RunGuard and
// Require issue their own). Set Exp: RunGuard's tokens live 10 minutes.
func SignGuardToken(apiSecret string, claims GuardTokenClaims) string {
	return signGuardToken(apiSecret, claims)
}

// VerifyGuardToken returns the claims of a guard token signed with apiSecret,
// or nil when it is malformed, signed with another key or expired. Compare U,
// A, D and R with the current request before you trust it.
func VerifyGuardToken(apiSecret, token string) *GuardTokenClaims {
	return verifyGuardToken(apiSecret, token)
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
	"context"
	"log/slog"
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
	// ChallengeDigits: digits of the matching number when one is shown, 3
	// for 100-999 (0 leaves it to the workspace policy). The longer of this
	// and the workspace policy wins: a request can lengthen the number,
	// never shorten it.
	ChallengeDigits int
	// ExpiresIn: how long the push waits for the person, in seconds: 30
	// (default when 0) to 300. Longer suits a request the person has to read
	// first, such as an AI agent asking on their behalf.
	ExpiresIn int
	// QRPairing: a browser pairing by QR code (Client.QRPairings), scanned and
	// confirmed on the phone. Only the phone that scanned it is asked, once,
	// with number matching, for the user it scanned for.
	QRPairing string
	// Reply asks the person to type back on the phone a sign-in code another
	// service sent them; the phone encrypts it to Reply.Key and Status hands
	// back only the ciphertext (open it with OpenCodeReply). Such a request
	// lives 5 minutes. Not with QRPairing.
	Reply *LoginReplyRequest
	// ClientSignals: the end user's page check from @touchque/web
	// (startClientSignals().encode()), passed through untouched. A browser
	// driven by software asks with number matching, or is refused where the
	// workspace blocks it (403 automated_client).
	ClientSignals string
	// DeviceRisk: the page's device report from @touchque/web
	// (deviceRisk.collect({ purpose })), passed through untouched. Used only
	// when your workspace turned Device risk on: its signals only ever ask
	// for more, and a device your admin marked "step up always" asks at once.
	DeviceRisk string
	// DeviceRiskRequestID: the page's identification (deviceRisk.identify()), preferred over DeviceRisk.
	DeviceRiskRequestID string
	// Details: transaction context for the approval screen. At most 8
	// entries, labels <= 40 and values <= 120 characters; the API rejects
	// (never truncates) anything outside those limits. Build it from
	// server-side state, never from browser input.
	Details []LoginDetail
	// BrowserProof (silent sign-ins): the browser's device-bound key proof,
	// exactly as the browser sent it (the X-Touchque-Browser header, made by
	// @touchque/web). When the user approves this request on the phone (or
	// with a passkey), Touchque remembers the browser, so a later Risk.Check
	// can let the same browser in without asking. Pass it through untouched;
	// an invalid proof only means "a browser Touchque does not know".
	BrowserProof string
	// Context is for your Touchque Actions only (event.context): roles, plan,
	// amount… Any JSON object up to 4 KB. Never shown on the phone.
	Context map[string]interface{}
	// SecurityChanges: when the user's sign-in security last changed in your system.
	SecurityChanges *SecurityChanges
	// Destination: where the action sends money or value (shown in full on the phone).
	Destination *Destination
	// Locale: "tr" (default) or "en", the language of the rows Touchque adds.
	Locale string
	// OnChallenge (VerifyWithOptions only) is called once, right after the
	// request is created and before any waiting: show ChallengeCode to the
	// user now; with number matching the phone asks for it. Not called when
	// only a passkey can approve. A panic in it is recovered and logged:
	// VerifyWithOptions keeps waiting.
	OnChallenge func(VerifyChallenge)
}

// VerifyChallenge is what OnChallenge receives as soon as the request exists.
type VerifyChallenge struct {
	RequestID string
	// ChallengeCode is the number to show when number matching is on ("" otherwise).
	ChallengeCode string
	ExpiresAt     string
	// Reasons say why number matching is needed (empty for a plain push).
	Reasons []RiskReason
	// CaseCode is the "Why?" case code of this decision.
	CaseCode string
}

// callOnChallenge runs the caller's callback; its panic goes to Config.Logger and never stops the wait.
func callOnChallenge(l *slog.Logger, fn func(VerifyChallenge), c VerifyChallenge) {
	defer func() {
		if r := recover(); r != nil {
			sdkLog(l, slog.LevelWarn, "[Touchque] OnChallenge failed", "error", errorText(r))
		}
	}()
	fn(c)
}

// securityChangesBody sends each known change as RFC 3339 UTC.
func securityChangesBody(c *SecurityChanges) map[string]string {
	out := map[string]string{}
	if c == nil {
		return out
	}
	for kind, at := range map[string]time.Time{"password": c.Password, "mfa": c.MFA, "device": c.Device, "email": c.Email, "phone": c.Phone} {
		if !at.IsZero() {
			out[kind] = at.UTC().Format(time.RFC3339)
		}
	}
	return out
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
	if opts.ChallengeDigits == 2 || opts.ChallengeDigits == 3 {
		payload["challengeDigits"] = opts.ChallengeDigits
	}
	if opts.ExpiresIn != 0 {
		payload["expiresIn"] = opts.ExpiresIn
	}
	if opts.QRPairing != "" {
		payload["qrPairing"] = opts.QRPairing
	}
	if opts.Reply != nil {
		payload["reply"] = opts.Reply
	}
	if len(opts.Details) > 0 {
		payload["details"] = opts.Details
	}
	if opts.BrowserProof != "" {
		payload["browserProof"] = opts.BrowserProof
	}
	if opts.ClientSignals != "" {
		payload["clientSignals"] = opts.ClientSignals
	}
	if opts.DeviceRisk != "" {
		payload["deviceRisk"] = opts.DeviceRisk
	}
	if opts.DeviceRiskRequestID != "" {
		payload["deviceRiskRequestId"] = opts.DeviceRiskRequestID
	}
	if len(opts.Context) > 0 {
		payload["context"] = opts.Context
	}
	if changes := securityChangesBody(opts.SecurityChanges); len(changes) > 0 {
		payload["securityChanges"] = changes
	}
	if opts.Destination != nil {
		payload["destination"] = opts.Destination
	}
	if opts.Locale != "" {
		payload["locale"] = opts.Locale
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
	if canary, ok := res["canary"].(map[string]interface{}); ok {
		if u, ok := canary["url"].(string); ok && u != "" {
			resp.Canary = &Canary{URL: u}
		}
	}
	// "Why?": the decision's case code and, for a step-up, its plain reasons.
	if cc, ok := res["caseCode"].(string); ok {
		resp.CaseCode = cc
	}
	if d, ok := res["destination"].(map[string]interface{}); ok {
		check := &DestinationCheck{}
		if decodeInto(d, check) == nil {
			resp.Destination = check
		}
	}
	if list, ok := res["reasons"].([]interface{}); ok {
		for _, item := range list {
			if m, ok := item.(map[string]interface{}); ok {
				if code, ok := m["code"].(string); ok {
					text, _ := m["text"].(string)
					resp.Reasons = append(resp.Reasons, RiskReason{Code: code, Text: text})
				}
			}
		}
	}

	return resp, nil
}

// parseShieldFields reads the Vishing Shield fields of a status or consume
// answer (absent from servers before it: all zero).
func parseShieldFields(res map[string]interface{}) ShieldFields {
	var f ShieldFields
	f.Provisional, _ = res["provisional"].(bool)
	f.ReconfirmedAt, _ = res["reconfirmedAt"].(string)
	f.Revoked, _ = res["revoked"].(bool)
	f.RevokeReason, _ = res["revokeReason"].(string)
	return f
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
	return l.statusCtx(context.Background(), requestID)
}

// statusCtx is Status bound to ctx: cancelling ctx aborts the request.
func (l *LoginResource) statusCtx(ctx context.Context, requestID string) (*LoginStatusResponse, error) {
	res, err := l.http.getWithQueryCtx(ctx, "/login/status/"+url.PathEscape(requestID), nil)
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
	if v, ok := res["expiresAt"].(string); ok {
		resp.ExpiresAt = v
	}
	resp.Assurance = parseAssurance(res)
	resp.ShieldFields = parseShieldFields(res)
	if r, ok := res["reply"].(map[string]interface{}); ok {
		if ct, ok := r["ct"].(string); ok && ct != "" {
			at, _ := r["at"].(string)
			resp.Reply = &LoginReply{CT: ct, At: at}
		}
	}

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
	resp.ShieldFields = parseShieldFields(res)
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

// VerifyWithOptions is Verify with every request option, including Details
// and OnChallenge. With number matching (your RequireNumberMatch, a workspace
// policy or the risk engine can turn it on) the user must pick a number on
// the phone: show it from OnChallenge, which runs before the wait.
//
//	client.Login.VerifyWithOptions(touchque.LoginRequestOptions{
//		ExternalUsername: user, Type: "SEND_MONEY",
//		OnChallenge: func(c touchque.VerifyChallenge) {
//			if c.ChallengeCode != "" { show("Pick " + c.ChallengeCode + " on your phone") }
//		},
//	}, 30000)
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
	// The number to show, before waiting: the phone asks the user for it.
	if opts.OnChallenge != nil {
		callOnChallenge(l.http.config.Logger, opts.OnChallenge, VerifyChallenge{
			RequestID: reqID, ChallengeCode: reqResult.ChallengeCode, ExpiresAt: reqResult.ExpiresAt,
			Reasons: reqResult.Reasons, CaseCode: reqResult.CaseCode,
		})
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
				Provisional:   statusResult.Provisional,
			}, nil
		case "PENDING":
			// Vishing Shield: tapped during a call, the request now waits for a
			// passkey in the browser; polling would only run into the timeout.
			if statusResult.RequiresPasskey {
				return nil, &PasskeyRequiredError{RequestID: reqID, Reason: "step_up"}
			}
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

// WaitForApproval polls a request you already sent (Request or
// RequestWithOptions) until the user answers on the phone: the approval, a
// *RejectedError when they said no, a *TimeoutError when it expired or timeout
// (0 = 30 seconds) ran out, or a *PasskeyRequiredError (Reason "step_up") when
// the Vishing Shield moved it to a passkey. pollInterval 0 is 400 ms.
//
//	sent, _ := client.Login.RequestWithOptions(touchque.LoginRequestOptions{ExternalUsername: user, Type: "SEND_MONEY"})
//	done, err := client.Login.WaitForApproval(ctx, sent.RequestID, 30*time.Second, 0)
func (l *LoginResource) WaitForApproval(ctx context.Context, requestID string, timeout, pollInterval time.Duration) (*VerifyResponse, error) {
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	if pollInterval == 0 {
		pollInterval = 400 * time.Millisecond
	}
	start := time.Now()
	for {
		status, err := l.statusCtx(ctx, requestID)
		if err != nil {
			return nil, err
		}
		switch status.Status {
		case "CONFIRMED":
			return &VerifyResponse{
				Approved:     true,
				Status:       status.Status,
				RequestID:    requestID,
				Assurance:    status.Assurance,
				ConfirmedVia: status.ConfirmedVia,
				Provisional:  status.Provisional,
			}, nil
		case "PENDING":
			// Vishing Shield: tapped during a call, the request now waits for a
			// passkey in the browser; polling would only run into the timeout.
			if status.RequiresPasskey {
				return nil, &PasskeyRequiredError{RequestID: requestID, Reason: "step_up"}
			}
		case "REJECTED":
			return nil, &RejectedError{Message: "Request " + requestID + " was rejected by the user."}
		case "EXPIRED":
			return nil, &TimeoutError{Message: "Request " + requestID + " expired before it was approved."}
		}
		if time.Since(start) > timeout {
			return nil, &TimeoutError{Message: "Login approval timed out after " + strconv.FormatInt(timeout.Milliseconds(), 10) + "ms"}
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(pollInterval):
		}
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
// a confirmed account takeover, a scam the user was talked into. Touchque's
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
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
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
	// SilentSignIn (default off): a new attempt whose browser sent its
	// device-bound key proof (X-Touchque-Browser, added by @touchque/web with
	// browserKey: true) first asks Touchque whether anything about it is new.
	// If nothing is, next runs at once with no push (the approval's
	// Assurance.Method is "silent", with Reasons). Otherwise, and on any
	// error, the usual push starts and its approval makes the browser known.
	SilentSignIn bool
	// SilentSignInMaxAgeSeconds is your own limit on how long ago the last
	// phone approval in that browser may be (0 = always ask). nil leaves it
	// to Touchque, which never goes beyond its own limit (7 days).
	SilentSignInMaxAgeSeconds *int
	// Context is for your Touchque Actions only (event.context): roles,
	// plan, amount… Never shown on the phone.
	Context func(*http.Request) map[string]interface{}
	// ErrorBody: your app's own error shape for the refusals Require sends
	// (401, 403, 408, 423, 429, 500, 503), e.g.
	//
	//	ErrorBody: func(r touchque.GuardRefusal) any {
	//	    return map[string]string{"message": r.Message, "code": r.Code}
	//	}
	//
	// A value that encodes to a JSON object is sent with "touchque" set to
	// the step (so @touchque/web still sees the state; no token is added),
	// anything else (a string, a number, a slice, nil) as it is. Status and
	// headers stay, and every refusal carries X-Touchque-State (and
	// X-Touchque-Reason). A panic, or a value that does not encode, sends the
	// default body and is logged. Never called for a 202 step or an approval.
	ErrorBody func(GuardRefusal) any
	// Logger receives Require's own lines (TQ_API_KEY / TQ_API_SECRET not set,
	// once per process; an ErrorBody that failed) and, with a nil client, the
	// guard's lines on this route (an API error). nil: the client's
	// Config.Logger; with a nil client, the default client's (see
	// SetDefaultClient), and nothing for the one built from the environment.
	Logger *slog.Logger
}

// GuardRefusal is what RequireOptions.ErrorBody gets for an answer with
// status 400 or above.
type GuardRefusal struct {
	// Status is what Require sends: 401, 403, 408, 423, 429, 500 or 503.
	Status int `json:"status"`
	// Code is the guard's error code when it set one (unauthenticated,
	// misconfigured, unavailable), else the step's Reason, else its State.
	Code string `json:"code"`
	// Message is the guard's error message when it set one, else "The
	// approval was rejected.", "The approval expired. Try again.", "Too many
	// rejected approvals. Try again later.", "Too many attempts. Try again
	// later." or "The approval was refused.", by state.
	Message string `json:"message"`
	// Touchque is a copy of the step as it would be sent.
	Touchque Step `json:"touchque"`
}

var refusalMessages = map[StepState]string{
	StepRejected:    "The approval was rejected.",
	StepExpired:     "The approval expired. Try again.",
	StepFrozen:      "Too many rejected approvals. Try again later.",
	StepRateLimited: "Too many attempts. Try again later.",
}

// copyStep is a deep copy of s (its slices and pointers too), for code that
// must not change the step that is sent.
func copyStep(s Step) Step {
	raw, err := json.Marshal(s)
	if err != nil {
		return s
	}
	var out Step
	if json.Unmarshal(raw, &out) != nil {
		return s
	}
	return out
}

// setGuardHeaders sets the headers of a result that is not an approval:
// Cache-Control: no-store, Retry-After when the step has RetryAfter (423,
// 429), and on a refusal (status >= 400) X-Touchque-State and
// X-Touchque-Reason (when the step has a reason). @touchque/web builds the
// step from them when the body has no "touchque" (an ErrorBody that is not
// an object).
func setGuardHeaders(h http.Header, result GuardResult) {
	h.Set("Content-Type", "application/json")
	h.Set("Cache-Control", "no-store")
	if result.Body == nil {
		return
	}
	step := result.Body.Touchque
	if step.RetryAfter > 0 {
		h.Set("Retry-After", strconv.Itoa(step.RetryAfter))
	}
	if result.Status >= 400 {
		if step.State != "" {
			h.Set("X-Touchque-State", string(step.State))
		}
		if step.Reason != "" {
			h.Set("X-Touchque-Reason", step.Reason)
		}
	}
}

func guardRefusal(result GuardResult) GuardRefusal {
	step := result.Body.Touchque
	ref := GuardRefusal{Status: result.Status, Touchque: copyStep(step)}
	if result.Body.Error != nil {
		ref.Code, ref.Message = result.Body.Error.Code, result.Body.Error.Message
	}
	if ref.Code == "" {
		ref.Code = step.Reason
	}
	if ref.Code == "" {
		ref.Code = string(step.State)
	}
	if ref.Message == "" {
		ref.Message = refusalMessages[step.State]
	}
	if ref.Message == "" {
		ref.Message = "The approval was refused."
	}
	return ref
}

// WriteGuardResult sends a RunGuard result that is not an approval, exactly
// as Require does: the headers (Content-Type: application/json,
// Cache-Control: no-store, Retry-After on 423 and 429, and on a refusal
// X-Touchque-State and X-Touchque-Reason), res.Status and the JSON body. Use
// it only when res.Approved is nil (an approval writes nothing: run your
// action instead).
//
// errorBody (nil: the guard's own body) is RequireOptions.ErrorBody: your
// app's error shape for a refusal (status 400 and above), never called for a
// 202 step. A value that encodes to a JSON object is sent with "touchque" set
// to the step, anything else as it is. A panic, or a value encoding/json
// cannot encode (a cycle, nesting deeper than encoding/json reads), sends
// the default body and logs [Touchque] ErrorBody failed to the client's
// Config.Logger. The body is encoded before anything is written, so a status
// is never sent without it.
func WriteGuardResult(w http.ResponseWriter, res GuardResult, errorBody func(GuardRefusal) any) {
	if res.Approved != nil {
		return
	}
	var out bytes.Buffer
	if err := json.NewEncoder(&out).Encode(responseBody(res, errorBody, res.logger)); err != nil {
		sdkLog(res.logger, slog.LevelError, "[Touchque] ErrorBody failed", "error", errorText(err))
		out.Reset()
		_ = json.NewEncoder(&out).Encode(res.Body)
	}
	setGuardHeaders(w.Header(), res)
	w.WriteHeader(res.Status)
	_, _ = w.Write(out.Bytes())
}

// responseBody is what WriteGuardResult sends for a result that is not an
// approval: result.Body, or for a refusal what errorBody makes of it.
func responseBody(result GuardResult, errorBody func(GuardRefusal) any, logger *slog.Logger) (body any) {
	if errorBody == nil || result.Status < 400 || result.Body == nil {
		return result.Body
	}
	defer func() {
		if r := recover(); r != nil {
			sdkLog(logger, slog.LevelError, "[Touchque] ErrorBody failed", "error", errorText(r))
			body = result.Body
		}
	}()
	custom, err := json.Marshal(errorBody(guardRefusal(result)))
	if err != nil {
		sdkLog(logger, slog.LevelError, "[Touchque] ErrorBody failed", "error", errorText(err))
		return result.Body
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(custom, &fields) != nil || fields == nil {
		return json.RawMessage(custom) // not an object: sent as it is
	}
	step, err := json.Marshal(result.Body.Touchque)
	if err != nil {
		return result.Body
	}
	fields["touchque"] = step
	return fields
}

// defaultClient is the client Require(nil, …), RunGuard(ctx, nil, …) and
// IsStatusPoll(nil, …) share: built from TQ_API_KEY / TQ_API_SECRET /
// TQ_API_URL (New) on first use and kept once built; until then every call
// tries again. SetDefaultClient replaces or forgets it.
var defaultClient envClient

// SetDefaultClient replaces the default client that Require(nil, …),
// RunGuard(ctx, nil, …) and IsStatusPoll(nil, …) share. The default one is
// built from the environment once per process; nil forgets it, so the next
// call builds it again from TQ_API_KEY / TQ_API_SECRET / TQ_API_URL (a test
// that changes them, a rotated key).
//
// The startup check, to fail fast instead of answering 500 misconfigured:
//
//	tq, err := touchque.New() // or touchque.New(cfg)
//	if err != nil {
//	    log.Fatal(err) // the ConfigError names the missing keys
//	}
//	touchque.SetDefaultClient(tq)
//
// It is also how the null-client path gets a logger: the client built from
// the environment has none, so build yours with New(cfg), cfg from
// ConfigFromEnv with cfg.Logger set. Safe for concurrent use.
func SetDefaultClient(c *Client) {
	defaultClient.mu.Lock()
	defer defaultClient.mu.Unlock()
	defaultClient.client.Store(c)
}

// envClient is a client built from the environment on first use and kept
// once built. Safe for concurrent use; the zero value is ready.
type envClient struct {
	mu     sync.Mutex
	client atomic.Pointer[Client]
}

// warnedUnconfigured: the missing keys are logged once per process.
var warnedUnconfigured atomic.Bool

// get returns the client, building it when there is none yet, or nil while
// it cannot be built; logger, when not nil, hears why (once per process).
func (e *envClient) get(logger *slog.Logger) *Client {
	if c := e.client.Load(); c != nil {
		return c
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	if c := e.client.Load(); c != nil {
		return c
	}
	c, err := New()
	if err != nil {
		if logger != nil && warnedUnconfigured.CompareAndSwap(false, true) {
			if os.Getenv("TQ_API_KEY") == "" || os.Getenv("TQ_API_SECRET") == "" {
				sdkLog(logger, slog.LevelError, "[Touchque] TQ_API_KEY and TQ_API_SECRET are not set: routes guarded by Touchque answer 500 misconfigured.")
			} else {
				sdkLog(logger, slog.LevelError, "[Touchque] misconfigured", "error", errorText(err))
			}
		}
		return nil
	}
	e.client.Store(c)
	return c
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
// "X-Touchque-Token: <token>". Once approved, next runs exactly once, with
// the approval available via ApprovalFromContext(r.Context()).
//
// A nil client is the default client, shared with RunGuard(ctx, nil, …):
// built from TQ_API_KEY / TQ_API_SECRET on the first request (New) and kept
// once built (SetDefaultClient replaces or forgets it). While it cannot be
// built, Require answers 500 misconfigured
// (401 when nobody is signed in) and next never runs; it never panics for it.
// Require panics only without RequireOptions.User. Its answers are written
// by WriteGuardResult.
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
	// With a nil client, the guard's own lines (the missing keys, an API error) go to opts.Logger as well.
	var guardLogger *slog.Logger
	if client == nil {
		guardLogger = opts.Logger
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

		in := withSilentSignIn(GuardInput{
			User: userOf(r), Action: action, Details: details, ReferenceID: referenceID,
			IP: ipOf(r), UserAgent: r.UserAgent(),
			Token: token, Offline: offline == "1", Code: code, CodeType: codeType,
		}, r.Header.Get, opts.SilentSignIn, opts.SilentSignInMaxAgeSeconds)
		if opts.Context != nil {
			in.Context = opts.Context(r)
		}
		// A nil client is the default one; 500 misconfigured while TQ_API_KEY / TQ_API_SECRET are not set.
		result := runGuardContext(r.Context(), client, in, guardLogger)

		if result.Approved != nil {
			ctx := context.WithValue(r.Context(), approvalContextKey{}, result.Approved)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		if opts.Logger != nil {
			result.logger = opts.Logger // Require's own lines (an ErrorBody that failed) go to its Logger
		}
		WriteGuardResult(w, result, opts.ErrorBody)
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
// Touchque: it proves the enrolled phone signed exactly these details.
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
	"log/slog"
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
//	POST   /login                         (pre-auth) -> 202 {"touchque": step, "token"} until approved (same contract as Require;
//	                                      with SilentSignIn, a known browser is approved at once)
//	POST   /offline/challenge             (pre-auth, body.externalUsername) -> QR for a phone with no internet
//	POST   /offline/verify                (pre-auth, body.challengeId/code)
//	POST   /offline/totp                  (pre-auth, body.externalUsername/code) -> time-based code fallback
//	POST   /passkey/authenticate/options  (pre-auth, body.email; none = any passkey, for autofill)
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
// (RateLimit), and Touchque itself caps approval pushes per user. Set
// LoginUser so POST /login and the offline routes only work for a user who
// already passed YOUR first factor (password step): then nobody can make
// Touchque push to, or lock out, an arbitrary user through your server. The
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
			sdkLog(client.logger, slog.LevelWarn, "[Touchque] NewRelayHandler: POST /login takes the username from the request body"+tail+"."+
				" Set RelayOptions.LoginUser to bind them to your first factor (password step) so they cannot be used against arbitrary users.")
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
	// POST /passkey/login/verify then only open a session when Touchque's
	// user matches it. Without it, anyone can type any user's email and make
	// Touchque push to that user's phone (push-bombing) or spend that user's
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

	// SilentSignIn for POST /login (default off): a new sign-in whose browser
	// sent its device-bound key proof (X-Touchque-Browser, added by
	// @touchque/web with browserKey: true) first asks Touchque whether
	// anything about it is new. If nothing is, it succeeds at once with no
	// push (OnAuthenticated gets Via ViaSilent; the answer's assurance.method
	// is "silent"). Otherwise, and on any error, the usual push starts and its
	// approval makes the browser known. Set LoginUser too: the user must have
	// passed your password step.
	SilentSignIn bool
	// SilentSignInMaxAgeSeconds is your own limit on how long ago the last
	// phone approval in that browser may be (0 = always ask). nil leaves it
	// to Touchque, which never goes beyond its own limit (7 days).
	SilentSignInMaxAgeSeconds *int
}

// AuthenticatedVia says which relay route authenticated the user.
type AuthenticatedVia string

const (
	ViaLogin       AuthenticatedVia = "login"
	ViaPasskey     AuthenticatedVia = "passkey"
	ViaOffline     AuthenticatedVia = "offline"
	ViaOfflineTotp AuthenticatedVia = "offline-totp"
	// ViaSilent: a silent sign-in (RelayOptions.SilentSignIn) — a known
	// browser, nothing sent to the phone; RequestID is "silent".
	ViaSilent AuthenticatedVia = "silent"
)

// AuthenticatedInfo is passed to RelayOptions.OnAuthenticated.
// ExternalUsername always comes from Touchque or your LoginUser func, never
// from the request body.
type AuthenticatedInfo struct {
	ExternalUsername string
	RequestID        string
	Via              AuthenticatedVia
}

const relayMaxBodyBytes = 100 << 10

var warnRelayPreAuth sync.Once

// ... private route handlers omitted

// ─────────────────────────────────────────────────────────────
// From touchque/cross_app_access.go — Cross App Access: ID-JAG request/redeem/verify, DPoP binding
// ─────────────────────────────────────────────────────────────

package touchque

// Cross App Access: Identity Assertion JWT Authorization Grants (ID-JAG,
// draft-ietf-oauth-identity-assertion-authz-grant, an open standard). An
// organization's identity provider (Touchque SSO) decides which of its apps
// may reach which other service for its members; the app trades a member's ID
// token for an ID-JAG there, then the ID-JAG for an access token at the other
// service's authorization server, with no consent screen per member.
//
// Your app, signed in with Touchque SSO (an OpenID Connect app with a secret):
//
//	jag, err := touchque.RequestIDJAG(ctx, touchque.RequestIDJAGParams{Issuer: "https://sso.touchque.com",
//		ClientID: clientID, ClientSecret: secret, IDToken: idToken, Audience: "https://auth.files.example"})
//	tokens, err := touchque.RedeemIDJAG(ctx, touchque.RedeemIDJAGParams{TokenEndpoint: "https://auth.files.example/token",
//		ClientID: "acme", ClientSecret: filesSecret, Assertion: jag.Assertion})
//
// Your own authorization server, taking ID-JAGs from an organization's identity provider; build
// the verifier once (it keeps the used jtis and the identity provider's keys):
//
//	v, _ := touchque.NewIDJAGVerifier(touchque.IDJAGVerifierConfig{Issuer: "https://sso.touchque.com", Audience: "https://auth.files.example"})
//	claims, err := v.Verify(r.Context(), r.PostFormValue("assertion"), authenticatedClientID) // per request
//
// Sender-constrained with DPoP (RFC 9449), optional: give the same key to both calls. The
// ID-JAG is then bound to it (cnf.jkt) and is useless to anyone who copies it without the key.
// A token endpoint that asks for a DPoP nonce (use_dpop_nonce, with a DPoP-Nonce header of valid
// nonce syntax) gets the request once more with it.
//
//	key, err := touchque.NewIDJAGDPoPKey()
//	jag, err := touchque.RequestIDJAG(ctx, touchque.RequestIDJAGParams{ /* as above */ DPoPKey: key}) // jag.DPoPBound
//	tokens, err := touchque.RedeemIDJAG(ctx, touchque.RedeemIDJAGParams{ /* as above */ Assertion: jag.Assertion, DPoPKey: key})
//
// When the other service's authorization server supports DPoP, the access token is DPoP-bound
// too (token_type DPoP): each call to its API sends it with a proof for that call. One without
// DPoP support issues a Bearer token, sent as Authorization: Bearer <token> with no proof.
//
//	proof, err := touchque.IDJAGDPoPProofWith(key, "GET", apiURL, touchque.IDJAGDPoPProofOptions{AccessToken: accessToken})
//	req.Header.Set("Authorization", "DPoP "+accessToken)
//	req.Header.Set("DPoP", proof)
//
// An authorization server that checks DPoP proofs passes the proof key's thumbprint; a bound
// ID-JAG without it is refused. It verifies the proof (and the nonce, when it asks for one)
// before this call, since the verifier uses up the ID-JAG's jti:
//
//	claims, err := v.VerifyWithDPoP(ctx, assertion, authenticatedClientID, proofJKT)

import (
	"bytes"
	"context"
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	IDJAGTokenType     = "urn:ietf:params:oauth:token-type:id-jag"
	IDTokenTokenType   = "urn:ietf:params:oauth:token-type:id_token"
	TokenExchangeGrant = "urn:ietf:params:oauth:grant-type:token-exchange"
	JWTBearerGrant     = "urn:ietf:params:oauth:grant-type:jwt-bearer"
	idJagTyp           = "oauth-id-jag+jwt"
)

// IDJAGError is a refused ID-JAG or exchange; Code is the OAuth error (invalid_grant for a bad
// ID-JAG; temporarily_unavailable when RequestIDJAG or RedeemIDJAG got no readable answer from
// the token endpoint, or the verifier could not read the identity provider's keys).
type IDJAGError struct {
	Code    string
	Message string
	// Status is the token endpoint's HTTP status; 0 when there was no answer (temporarily_unavailable)
	// or the error is the verifier's.
	Status int
	// DPoPNonce is the latest valid DPoP-Nonce (RFC 9449 section 8) the token endpoint sent in
	// any answer during this call (also the answer before an invalid_response or a body that
	// broke off): from the answer to the retry when that had one, else from the first answer; ""
	// when none was of valid syntax. With a DPoPKey, a token endpoint that asked for a nonce
	// (use_dpop_nonce) already got the request once more with a valid one; this field is for
	// diagnostics, and for resource requests (a proof's nonce is IDJAGDPoPProofOptions.Nonce).
	DPoPNonce string
	// Err is net/http's error when the token endpoint could not be reached or its answer read
	// (Code temporarily_unavailable); Unwrap returns it, for errors.Is and errors.As. nil otherwise.
	Err error
}

func (e *IDJAGError) Error() string { return fmt.Sprintf("touchque: %s (%s)", e.Message, e.Code) }

// Unwrap returns Err, the transport error behind a temporarily_unavailable (nil otherwise).
func (e *IDJAGError) Unwrap() error { return e.Err }

// IDJAGVerifierConfig configures a verifier at your authorization server.
type IDJAGVerifierConfig struct {
	// Issuer is the identity provider, e.g. https://sso.touchque.com.
	Issuer string
	// Audience is your authorization server's issuer identifier (the ID-JAG's aud).
	Audience string
	// JWKSURI, when not found from the issuer's /.well-known/openid-configuration.
	JWKSURI string
	// ClockSkew allowed (default 60 s).
	ClockSkew time.Duration
	// FirstUse records an ID-JAG's jti and says whether it is new (each is used
	// once). Defaults to memory in this process; give a shared store (Redis SET
	// NX) when several processes take ID-JAGs.
	FirstUse   func(jti string, expiresAt int64) bool
	HTTPClient *http.Client
}

// IDJAGClaims is a checked ID-JAG.
type IDJAGClaims struct {
	Iss       string
	Sub       string // the member at the identity provider
	Aud       string
	ClientID  string // your client_id of the app that presented it
	JTI       string
	IssuedAt  int64
	ExpiresAt int64
	Scopes    []string
	Resource  string
	Tenant    string
	Email     string
	AuthTime  int64
	AMR       []string
	// CnfJKT is the DPoP key thumbprint the ID-JAG is bound to (cnf.jkt), when it is.
	CnfJKT string
	Claims map[string]interface{}
}

// IDJAGDPoPKey is a DPoP key (RFC 9449, P-256) that binds an ID-JAG to its holder; keep it in
// this process. Make it with NewIDJAGDPoPKey or NewIDJAGDPoPKeyFrom. The private key is
// unexported (PrivateKey returns a copy), so encoding/json, fmt and log/slog never print it.
type IDJAGDPoPKey struct {
	// PublicJWK is the public key (kty, crv, x, y) each proof carries; proofs make it from the
	// private key, never from this map.
	PublicJWK map[string]interface{}
	// Thumbprint is the RFC 7638 thumbprint: the ID-JAG's cnf.jkt.
	Thumbprint string
	priv       *ecdsa.PrivateKey
}

// NewIDJAGDPoPKey makes a fresh DPoP key for RequestIDJAG and RedeemIDJAG.
func NewIDJAGDPoPKey() (*IDJAGDPoPKey, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	return idJagDPoPKey(priv), nil
}

// NewIDJAGDPoPKeyFrom makes a DPoP key from a P-256 private key you keep yourself, for example
// to call with the DPoP-bound access token from another process. Any other key is a
// *ConfigError.
func NewIDJAGDPoPKeyFrom(priv *ecdsa.PrivateKey) (*IDJAGDPoPKey, error) {
	bad := &ConfigError{Message: "touchque: a DPoP key must be an EC P-256 private key"}
	if priv == nil || priv.Curve != elliptic.P256() {
		return nil, bad
	}
	raw, err := ecdsaScalar(priv)
	if err != nil {
		return nil, bad
	}
	// A copy of its own, with the public half made from the scalar.
	clean, err := ecdsa.ParseRawPrivateKey(elliptic.P256(), raw)
	if err != nil {
		return nil, bad
	}
	return idJagDPoPKey(clean), nil
}

// ecdsaScalar is priv.Bytes(), with an error where crypto/ecdsa panics: a half-built key (no
// scalar or point).
func ecdsaScalar(priv *ecdsa.PrivateKey) (raw []byte, err error) {
	defer func() {
		if recover() != nil {
			raw, err = nil, errors.New("touchque: an incomplete EC private key")
		}
	}()
	return priv.Bytes()
}

func idJagDPoPKey(priv *ecdsa.PrivateKey) *IDJAGDPoPKey {
	public := ecPublicJWK(&priv.PublicKey)
	return &IDJAGDPoPKey{PublicJWK: public, Thumbprint: JWKThumbprint(public), priv: priv}
}

// PrivateKey returns a copy of the private key, to keep it yourself (NewIDJAGDPoPKeyFrom takes it
// back); nil for a key not made by NewIDJAGDPoPKey or NewIDJAGDPoPKeyFrom.
func (k *IDJAGDPoPKey) PrivateKey() *ecdsa.PrivateKey {
	if k == nil || k.priv == nil {
		return nil
	}
	raw, err := k.priv.Bytes()
	if err != nil {
		return nil
	}
	priv, _ := ecdsa.ParseRawPrivateKey(elliptic.P256(), raw)
	return priv
}

// signer signs the key's proofs; a key not made by NewIDJAGDPoPKey or NewIDJAGDPoPKeyFrom (nil,
// the zero value) is a *ConfigError.
func (k *IDJAGDPoPKey) signer() (*Agent, error) {
	if k == nil || k.priv == nil || k.priv.Curve != elliptic.P256() {
		return nil, &ConfigError{Message: "touchque: the DPoP key is empty: make it with NewIDJAGDPoPKey or NewIDJAGDPoPKeyFrom"}
	}
	return signerFor(k.priv, nil), nil
}

// IDJAGDPoPProofOptions are a DPoP proof's optional claims; "" leaves a claim out.
type IDJAGDPoPProofOptions struct {
	// AccessToken: a request that sends a DPoP-bound access token (Authorization: DPoP <token>)
	// carries its hash in the proof (ath).
	AccessToken string
	// Nonce: the DPoP-Nonce the server this request goes to asked for (RFC 9449 sections 8 and 9),
	// put in the proof as given (its syntax is not checked).
	Nonce string
}

// IDJAGDPoPProof is a DPoP proof for one POST to target (htu without query or fragment): the
// token-endpoint proof, IDJAGDPoPProofWith(key, "POST", target, IDJAGDPoPProofOptions{}).
func IDJAGDPoPProof(key *IDJAGDPoPKey, target string) (string, error) {
	return IDJAGDPoPProofWith(key, "POST", target, IDJAGDPoPProofOptions{})
}

// IDJAGDPoPProofWith is a DPoP proof made with the key for one request: method to target, with
// the access token's hash (ath) and the server's nonce when opts has them. Each proof has a
// fresh jti and iat, and its header's jwk is the key's public half only (kty, crv, x, y). For a
// call with the DPoP-bound access token RedeemIDJAG returned (token_type DPoP), send
// Authorization: DPoP <token> and DPoP: a proof for that call's method and URL with
// AccessToken set.
//
// htm is method with ASCII blanks (space, \t, \r, \n, \v, \f) trimmed, then uppercased; "" (or
// only those blanks) is POST, and a method with anything but RFC 9110 token characters left is a
// *ConfigError (a NUL or a non-ASCII space is not trimmed).
//
// htu is target's scheme, host and path: scheme and host lowercased, the default port dropped,
// "/" for an empty path, no query or fragment. The path is the one Go's HTTP client sends,
// URL.EscapedPath: as written when that is a valid percent-encoding, otherwise re-escaped (a
// space becomes %20), never decoded, and with its "." and ".." segments kept as written (net/http
// sends them so). A target that is not an absolute http or https URL with a host, or has an
// invalid port, is a *ConfigError.
func IDJAGDPoPProofWith(key *IDJAGDPoPKey, method, target string, opts IDJAGDPoPProofOptions) (string, error) {
	signer, err := key.signer()
	if err != nil {
		return "", err
	}
	htm, err := dpopHTM(method)
	if err != nil {
		return "", err
	}
	htu, err := dpopHTU(target)
	if err != nil {
		return "", err
	}
	claims := map[string]interface{}{"htm": htm, "htu": htu, "iat": time.Now().Unix(), "jti": randomID()}
	if opts.AccessToken != "" {
		sum := sha256.Sum256([]byte(opts.AccessToken))
		claims["ath"] = b64url(sum[:])
	}
	if opts.Nonce != "" {
		claims["nonce"] = opts.Nonce
	}
	// signer.publicJWK is made from the private key, never taken from key.PublicJWK.
	return signer.sign(map[string]interface{}{"typ": "dpop+jwt", "jwk": signer.publicJWK}, claims)
}

// dpopHTM is a proof's htm: method with ASCII blanks trimmed, then uppercased; POST when nothing
// is left. A method with anything but RFC 9110 token characters is a *ConfigError (checked before
// uppercasing, so no non-ASCII letter turns into an ASCII one).
func dpopHTM(method string) (string, error) {
	m := strings.Trim(method, " \t\r\n\v\f")
	if m == "" {
		return "POST", nil
	}
	for i := 0; i < len(m); i++ {
		if !isTChar(m[i]) {
			return "", &ConfigError{Message: fmt.Sprintf("touchque: a DPoP proof's method must be an HTTP method (RFC 9110 token characters), not %q", method)}
		}
	}
	return strings.ToUpper(m), nil
}

// isTChar says whether c is an RFC 9110 token character (tchar).
func isTChar(c byte) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || strings.IndexByte("!#$%&'*+-.^_`|~", c) >= 0
}

// htuDefaultPorts are the ports htu leaves out.
var htuDefaultPorts = map[string]string{"http": "80", "https": "443"}

// dpopHTU is a proof's htu for target (see IDJAGDPoPProofWith). The path is EscapedPath, the one
// net/http sends in the request line (RequestURI), dot segments and all.
func dpopHTU(target string) (string, error) {
	u, err := url.Parse(target)
	if err != nil {
		return "", &ConfigError{Message: "touchque: a DPoP proof needs an absolute http or https URL: " + err.Error()}
	}
	scheme := strings.ToLower(u.Scheme)
	if (scheme != "http" && scheme != "https") || u.Hostname() == "" {
		return "", &ConfigError{Message: fmt.Sprintf("touchque: a DPoP proof needs an absolute http or https URL, not %q", target)}
	}
	host, port := strings.TrimSuffix(u.Host, ":"), u.Port()
	if port != "" {
		host = strings.TrimSuffix(host, ":"+port)
		n, err := strconv.Atoi(port)
		if err != nil || n > 65535 {
			return "", &ConfigError{Message: fmt.Sprintf("touchque: %q has an invalid port", target)}
		}
		if port = strconv.Itoa(n); port != htuDefaultPorts[scheme] {
			host += ":" + port
		}
	}
	path := u.EscapedPath()
	if path == "" {
		path = "/"
	}
	return scheme + "://" + strings.ToLower(host) + path, nil
}

// IDJAGVerifier checks the ID-JAG an authenticated client presents (jwt-bearer grant).
type IDJAGVerifier struct {
	cfg     IDJAGVerifierConfig
	mu      sync.Mutex
	jwksURI string
	keys    map[string]crypto.PublicKey
	keysAt  time.Time
	triedAt time.Time
	seen    map[string]int64
}

// NewIDJAGVerifier needs Issuer and Audience.
func NewIDJAGVerifier(cfg IDJAGVerifierConfig) (*IDJAGVerifier, error) {
	if cfg.Issuer == "" || cfg.Audience == "" {
		return nil, errors.New("touchque: IDJAGVerifier needs Issuer (the identity provider) and Audience (your authorization server's issuer)")
	}
	if cfg.ClockSkew == 0 {
		cfg.ClockSkew = 60 * time.Second
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	return &IDJAGVerifier{cfg: cfg, jwksURI: cfg.JWKSURI, seen: map[string]int64{}}, nil
}

func xaaGetJSON(ctx context.Context, client *http.Client, target string) (map[string]interface{}, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("%s answered %d", target, resp.StatusCode)
	}
	out := map[string]interface{}{}
	return out, json.NewDecoder(resp.Body).Decode(&out)
}

func xaaDiscover(ctx context.Context, client *http.Client, issuer string) (map[string]interface{}, error) {
	meta, err := xaaGetJSON(ctx, client, strings.TrimRight(issuer, "/")+"/.well-known/openid-configuration")
	if err != nil {
		return nil, err
	}
	if meta["issuer"] != issuer {
		return nil, errors.New("the identity provider's metadata does not match its issuer")
	}
	return meta, nil
}

func (v *IDJAGVerifier) loadKeys(ctx context.Context) error {
	if v.jwksURI == "" {
		meta, err := xaaDiscover(ctx, v.cfg.HTTPClient, v.cfg.Issuer)
		if err != nil {
			return err
		}
		uri, _ := meta["jwks_uri"].(string)
		if uri == "" {
			return errors.New("the identity provider names no jwks_uri")
		}
		v.jwksURI = uri
	}
	jwks, err := xaaGetJSON(ctx, v.cfg.HTTPClient, v.jwksURI)
	if err != nil {
		return err
	}
	keys := map[string]crypto.PublicKey{}
	list, _ := jwks["keys"].([]interface{})
	for _, raw := range list {
		k, _ := raw.(map[string]interface{})
		kid, _ := k["kid"].(string)
		if pub, err := mcpPublicKey(k); err == nil && kid != "" {
			keys[kid] = pub
		}
	}
	v.keys = keys
	v.keysAt = time.Now()
	return nil
}

func (v *IDJAGVerifier) keyFor(ctx context.Context, kid string) (crypto.PublicKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.keysAt.IsZero() || time.Since(v.keysAt) > 10*time.Minute {
		if err := v.loadKeys(ctx); err != nil {
			return nil, err
		}
	}
	if _, ok := v.keys[kid]; !ok && time.Since(v.triedAt) > time.Minute {
		v.triedAt = time.Now()
		if err := v.loadKeys(ctx); err != nil {
			return nil, err
		}
	}
	return v.keys[kid], nil
}

func (v *IDJAGVerifier) rememberOnce(jti string, exp int64) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	now := time.Now().Unix()
	for k, until := range v.seen {
		if until < now {
			delete(v.seen, k)
		}
	}
	if _, ok := v.seen[jti]; ok {
		return false
	}
	v.seen[jti] = exp + int64(v.cfg.ClockSkew/time.Second)
	return true
}

// Verify checks the ID-JAG and uses it once: its claims, or *IDJAGError (Code invalid_grant).
// An ID-JAG bound to a DPoP key (cnf.jkt) is refused: use VerifyWithDPoP for those.
func (v *IDJAGVerifier) Verify(ctx context.Context, assertion, clientID string) (*IDJAGClaims, error) {
	return v.VerifyWithDPoP(ctx, assertion, clientID, "")
}

// VerifyWithDPoP is Verify with dpopJKT, the thumbprint of the DPoP proof you verified on this
// request ("" when none): an ID-JAG bound to a key (cnf.jkt) is refused without a matching one.
// Verify the proof, and the nonce when your server requires one, before calling it: a verified
// ID-JAG's jti is used up, so one spent on a request whose proof then fails cannot come again.
func (v *IDJAGVerifier) VerifyWithDPoP(ctx context.Context, assertion, clientID, dpopJKT string) (*IDJAGClaims, error) {
	bad := func(m string) error { return &IDJAGError{Code: "invalid_grant", Message: m} }
	parts := strings.Split(assertion, ".")
	if len(parts) != 3 {
		return nil, bad("assertion is not a JWT")
	}
	head, err1 := mcpJSONPart(parts[0])
	c, err2 := mcpJSONPart(parts[1])
	if err1 != nil || err2 != nil {
		return nil, bad("assertion is not a JWT")
	}
	if head["typ"] != idJagTyp {
		return nil, bad("not an ID-JAG (typ oauth-id-jag+jwt)")
	}
	alg, _ := head["alg"].(string)
	kid, _ := head["kid"].(string)
	if (alg != "RS256" && alg != "ES256" && alg != "EdDSA") || kid == "" {
		return nil, bad("unsupported signature")
	}
	key, err := v.keyFor(ctx, kid)
	if err != nil {
		return nil, &IDJAGError{Code: "temporarily_unavailable", Message: "the identity provider's keys could not be read: " + err.Error()}
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[2])
	if key == nil || err != nil || !mcpVerifySignature(parts[0]+"."+parts[1], sig, alg, key) {
		return nil, bad("signature does not verify")
	}
	now := time.Now().Unix()
	skew := int64(v.cfg.ClockSkew / time.Second)
	var auds []interface{}
	if list, ok := c["aud"].([]interface{}); ok {
		auds = list
	} else {
		auds = []interface{}{c["aud"]}
	}
	exp, _ := c["exp"].(float64)
	iat, _ := c["iat"].(float64)
	sub, _ := c["sub"].(string)
	jti, _ := c["jti"].(string)
	switch {
	case c["iss"] != v.cfg.Issuer:
		return nil, bad("another issuer")
	case len(auds) != 1 || auds[0] != v.cfg.Audience:
		return nil, bad("not for this authorization server")
	case c["client_id"] != clientID || clientID == "":
		return nil, bad("issued to another client")
	case exp == 0 || int64(exp)+skew < now:
		return nil, bad("expired")
	case iat == 0 || int64(iat)-skew > now:
		return nil, bad("issued in the future")
	case sub == "" || jti == "":
		return nil, bad("sub and jti are required")
	}
	// Before the jti is spent: a copy without the key cannot use the ID-JAG up.
	cnfJKT := ""
	if raw, ok := c["cnf"]; ok {
		cnf, _ := raw.(map[string]interface{})
		jkt, ok := cnf["jkt"].(string)
		if !ok {
			return nil, bad("unsupported confirmation method (only DPoP cnf.jkt)")
		}
		if dpopJKT == "" {
			return nil, bad("bound to a DPoP key: a DPoP proof with that key is required")
		}
		if dpopJKT != jkt {
			return nil, bad("the DPoP proof was made with another key")
		}
		cnfJKT = jkt
	}
	first := v.cfg.FirstUse
	if first == nil {
		first = v.rememberOnce
	}
	if !first(jti, int64(exp)) {
		return nil, bad("already used")
	}
	out := &IDJAGClaims{Iss: v.cfg.Issuer, Sub: sub, Aud: v.cfg.Audience, ClientID: clientID, JTI: jti, IssuedAt: int64(iat), ExpiresAt: int64(exp), Scopes: []string{}, CnfJKT: cnfJKT, Claims: c}
	if s, _ := c["scope"].(string); s != "" {
		out.Scopes = strings.Split(s, " ")
	}
	out.Resource, _ = c["resource"].(string)
	out.Tenant, _ = c["tenant"].(string)
	out.Email, _ = c["email"].(string)
	if at, ok := c["auth_time"].(float64); ok {
		out.AuthTime = int64(at)
	}
	if amr, ok := c["amr"].([]interface{}); ok {
		for _, a := range amr {
			if s, ok := a.(string); ok {
				out.AMR = append(out.AMR, s)
			}
		}
	}
	return out, nil
}

func xaaSafeURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	host := u.Hostname()
	return u.Scheme == "https" || (u.Scheme == "http" && (host == "localhost" || host == "127.0.0.1" || host == "::1"))
}

// xaaMaxAnswer is the most of a token endpoint's answer that is read: 1 MiB.
const xaaMaxAnswer = 1 << 20

// xaaPostForm posts form to a token endpoint with the client's authentication and, with a key,
// a DPoP proof; it returns the answer and the latest valid DPoP-Nonce the call saw. Only a 2xx
// answer whose body is one JSON object (at most 1 MiB) is an answer: any other status is an
// *IDJAGError with that status and the body's error (server_error without a valid one), a 2xx
// without such a body an *IDJAGError invalid_response, and no readable answer an *IDJAGError
// temporarily_unavailable (xaaNoAnswer). Every *IDJAGError carries the call's latest valid nonce.
func xaaPostForm(ctx context.Context, client *http.Client, target string, form url.Values, id, secret string, dpopKey *IDJAGDPoPKey) (map[string]interface{}, string, error) {
	if !xaaSafeURL(target) {
		return nil, "", fmt.Errorf("touchque: %s must be an https URL", target)
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	body := form.Encode()
	// nonce is the latest valid DPoP-Nonce of any answer in this call: the retry's proof carries
	// it, and every *IDJAGError has it.
	nonce := ""
	// post sends the form with the client's authentication and, with a key, a fresh proof (new
	// jti and iat) that carries nonce when it is set, then reads the answer: data is the JSON
	// object its body starts with (nil when it starts with none), whole whether that object is
	// all of the body.
	post := func() (resp *http.Response, data map[string]interface{}, whole bool, err error) {
		req, err := http.NewRequestWithContext(ctx, "POST", target, strings.NewReader(body))
		if err != nil {
			return nil, nil, false, err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("Accept", "application/json")
		if dpopKey != nil {
			proof, err := IDJAGDPoPProofWith(dpopKey, "POST", target, IDJAGDPoPProofOptions{Nonce: nonce})
			if err != nil {
				return nil, nil, false, err
			}
			req.Header.Set("DPoP", proof)
		}
		if secret != "" {
			req.SetBasicAuth(url.QueryEscape(id), url.QueryEscape(secret))
		}
		if resp, err = client.Do(req); err != nil {
			return nil, nil, false, xaaNoAnswer(ctx, target, err, nonce)
		}
		defer resp.Body.Close()
		// The answer's nonce counts as soon as its headers are in, also when its body breaks off.
		if n := xaaDPoPNonce(resp.Header); n != "" {
			nonce = n
		}
		raw, err := io.ReadAll(io.LimitReader(resp.Body, xaaMaxAnswer+1))
		if err != nil {
			return nil, nil, false, xaaNoAnswer(ctx, target, err, nonce)
		}
		data, whole = xaaJSONObject(raw)
		return resp, data, whole, nil
	}
	resp, data, whole, err := post()
	if err != nil {
		return nil, nonce, err
	}
	// The server wants its nonce in the proof (RFC 9449 section 8): the same request once more
	// with a new proof that carries it, never a loop, and only with a nonce of valid syntax (so
	// far, nonce is the first answer's).
	if dpopKey != nil && nonce != "" && xaaNonceAsked(resp, data) {
		if resp, data, whole, err = post(); err != nil {
			return nil, nonce, err
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		msg, _ := data["error_description"].(string)
		if msg == "" {
			msg = fmt.Sprintf("%s answered %d", target, resp.StatusCode)
		}
		return nil, nonce, &IDJAGError{Code: xaaErrorCode(data), Message: msg, Status: resp.StatusCode, DPoPNonce: nonce}
	}
	if data == nil || !whole {
		return nil, nonce, &IDJAGError{Code: "invalid_response", Message: fmt.Sprintf("%s answered %d without a JSON object of at most 1 MiB", target, resp.StatusCode),
			Status: resp.StatusCode, DPoPNonce: nonce}
	}
	return data, nonce, nil
}

// xaaNoAnswer is the error for a token-endpoint POST without a readable answer: not reached,
// reset, the HTTP client's timeout, an answer net/http refuses (a malformed or too long header
// section, say) or a body that breaks off. That is an *IDJAGError temporarily_unavailable with no
// Status, the call's latest valid nonce, and err as Err. When ctx has ended (cancelled by the
// caller, or past its deadline), it is err itself, so errors.Is(err, context.Canceled) or
// context.DeadlineExceeded holds; net/http reports context.Cause(ctx), so when that is another
// error, ctx.Err() is wrapped in too.
func xaaNoAnswer(ctx context.Context, target string, err error, nonce string) error {
	if done := ctx.Err(); done != nil {
		if !errors.Is(err, done) {
			err = fmt.Errorf("%w (%w)", err, done)
		}
		return err
	}
	why := err
	var ue *url.Error
	if errors.As(err, &ue) {
		why = ue.Err // the URL is in the message already
	}
	return &IDJAGError{Code: "temporarily_unavailable", Message: fmt.Sprintf("no readable answer from %s: %v", target, why), DPoPNonce: nonce, Err: err}
}

// xaaErrorCode is an error answer's OAuth error code: the body's "error" when it is a string of 1
// to 128 RFC 6749 error characters (%x20-21 / %x23-5B / %x5D-7E: printable ASCII and space, but
// not a double quote or backslash), else server_error. It never comes from WWW-Authenticate.
func xaaErrorCode(data map[string]interface{}) string {
	code, _ := data["error"].(string)
	if code == "" || len(code) > 128 {
		return "server_error"
	}
	for i := 0; i < len(code); i++ {
		if c := code[i]; c < 0x20 || c > 0x7e || c == '"' || c == '\\' {
			return "server_error"
		}
	}
	return code
}

// xaaJSONObject is the JSON object an answer's body starts with, nil when it starts with none (no
// body, null, an array or other value, cut off, not JSON), and whether that object is all of the
// body, blanks aside. Only the first 1 MiB is read: a longer body is never whole.
func xaaJSONObject(body []byte) (map[string]interface{}, bool) {
	whole := len(body) <= xaaMaxAnswer
	if !whole {
		body = body[:xaaMaxAnswer]
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	var data map[string]interface{}
	if err := dec.Decode(&data); err != nil || data == nil {
		return nil, false
	}
	_, err := dec.Token()
	return data, whole && err == io.EOF
}

// xaaDPoPNonce is the answer's DPoP-Nonce when it is one nonce of valid syntax (RFC 9449:
// 1*NQCHAR, printable ASCII but space, double quote and backslash); "" when the header is
// missing, empty or invalid. Sent more than once (on several lines, or joined with ", " on one
// line, as HTTP libraries and proxies combine lines), it counts only when every value is the same.
func xaaDPoPNonce(h http.Header) string {
	nonce, first := "", true
	for _, line := range h.Values("DPoP-Nonce") {
		for _, v := range strings.Split(line, ", ") {
			if first {
				nonce, first = v, false
			} else if v != nonce {
				return ""
			}
		}
	}
	if nonce == "" {
		return ""
	}
	for i := 0; i < len(nonce); i++ {
		if c := nonce[i]; c < 0x21 || c > 0x7e || c == '"' || c == '\\' {
			return ""
		}
	}
	return nonce
}

// xaaNonceAsked says whether an answer asks for a DPoP nonce: a 400 or 401 with error
// use_dpop_nonce, or a 401 whose WWW-Authenticate DPoP challenge has error="use_dpop_nonce".
func xaaNonceAsked(resp *http.Response, data map[string]interface{}) bool {
	if resp.StatusCode != 400 && resp.StatusCode != 401 {
		return false
	}
	return data["error"] == "use_dpop_nonce" || (resp.StatusCode == 401 && xaaNonceChallenge(resp.Header))
}

// xaaNonceChallenge says whether WWW-Authenticate (RFC 9110 section 11.6.1) has a DPoP challenge
// whose own error parameter is exactly use_dpop_nonce. Several lines are one list, joined with
// ", " (RFC 9110 section 5.3). Items split at commas outside quoted strings; one that is not
// name=value starts a challenge (its scheme, then maybe its first parameter). Scheme and parameter
// names match in any case; a quoted value has its quoted-pairs undone and needs its closing quote.
// A few passes over the header: linear time.
func xaaNonceChallenge(h http.Header) bool {
	dpop := false
	for _, item := range splitUnquoted(strings.Join(h.Values("WWW-Authenticate"), ", ")) {
		name, rest := authToken(item)
		if name == "" && rest == "" {
			continue // an empty list element
		}
		if !strings.HasPrefix(rest, "=") {
			dpop = strings.EqualFold(name, "DPoP")
			name, rest = authToken(rest)
		}
		if dpop && strings.EqualFold(name, "error") && strings.HasPrefix(rest, "=") {
			if v, ok := authParamValue(rest[1:]); ok && v == "use_dpop_nonce" {
				return true
			}
		}
	}
	return false
}

// splitUnquoted splits a header list at the commas outside quoted strings (in a quoted string, a
// backslash escapes the character after it).
func splitUnquoted(s string) []string {
	var out []string
	start, quoted := 0, false
	for i := 0; i < len(s); i++ {
		switch {
		case quoted && s[i] == '\\':
			i++
		case s[i] == '"':
			quoted = !quoted
		case !quoted && s[i] == ',':
			out = append(out, s[start:i])
			start = i + 1
		}
	}
	return append(out, s[start:])
}

// authToken is s's leading token (RFC 9110 tchar) and the rest, blanks trimmed.
func authToken(s string) (string, string) {
	s = strings.TrimLeft(s, " \t")
	i := 0
	for i < len(s) && isTChar(s[i]) {
		i++
	}
	return s[:i], strings.TrimLeft(s[i:], " \t")
}

// authParamValue is an auth-param's value (RFC 9110 section 11.2), from what follows its "=": a
// token, or a quoted string's content with its quoted-pairs (a backslash and the character after
// it) undone. ok is false for anything else: no value, a quoted string without its closing quote,
// or more than blanks after the value.
func authParamValue(s string) (value string, ok bool) {
	s = strings.TrimLeft(s, " \t")
	if !strings.HasPrefix(s, `"`) {
		v, rest := authToken(s)
		return v, v != "" && rest == ""
	}
	var b strings.Builder
	for i := 1; i < len(s); i++ {
		switch s[i] {
		case '\\':
			if i++; i == len(s) {
				return "", false
			}
			b.WriteByte(s[i])
		case '"':
			return b.String(), strings.TrimLeft(s[i+1:], " \t") == ""
		default:
			b.WriteByte(s[i])
		}
	}
	return "", false // no closing quote
}

// RequestIDJAGParams: the identity provider (Issuer, or TokenEndpoint), your app there and its
// secret, the member's ID token, and the other service's authorization server (Audience).
type RequestIDJAGParams struct {
	Issuer        string
	TokenEndpoint string
	ClientID      string
	ClientSecret  string
	IDToken       string
	Audience      string
	Resource      string
	Scope         string
	// DPoPKey binds the ID-JAG to this key (DPoP, RFC 9449); redeem it with the same key.
	DPoPKey    *IDJAGDPoPKey
	HTTPClient *http.Client
}

// IDJAG is the grant the identity provider issued.
type IDJAG struct {
	Assertion string
	ExpiresIn int
	Scope     string
	// DPoPBound: with a DPoPKey, whether the returned ID-JAG carries that key's thumbprint
	// (cnf.jkt); an identity provider without DPoP support ignores the proof.
	DPoPBound bool
}

// RequestIDJAG trades a member's ID token for an ID-JAG (token exchange, client_secret_basic).
// A token endpoint answer other than a 2xx with an ID-JAG is an *IDJAGError: a non-2xx (a 3xx
// too; redirects are not followed with the default client) with its Status and the body's error
// (server_error without a valid one), a 2xx without an ID-JAG invalid_response. No readable
// answer (not reached, reset, the HTTP client's timeout, an answer net/http refuses, a body that
// breaks off) is temporarily_unavailable with no Status and net/http's error as Err; when ctx
// ends (cancelled or past its deadline), its error comes back instead, for errors.Is. Every such
// *IDJAGError has the call's latest valid DPoPNonce.
func RequestIDJAG(ctx context.Context, p RequestIDJAGParams) (*IDJAG, error) {
	var signer *Agent
	if p.DPoPKey != nil {
		var err error
		if signer, err = p.DPoPKey.signer(); err != nil { // before the identity provider is asked anything
			return nil, err
		}
	}
	endpoint := p.TokenEndpoint
	if endpoint == "" {
		if p.Issuer == "" {
			return nil, errors.New("touchque: RequestIDJAG needs Issuer or TokenEndpoint")
		}
		client := p.HTTPClient
		if client == nil {
			client = &http.Client{Timeout: 5 * time.Second}
		}
		meta, err := xaaDiscover(ctx, client, p.Issuer)
		if err != nil {
			return nil, err
		}
		endpoint, _ = meta["token_endpoint"].(string)
		if endpoint == "" {
			return nil, errors.New("touchque: the identity provider names no token_endpoint")
		}
	}
	form := url.Values{"grant_type": {TokenExchangeGrant}, "requested_token_type": {IDJAGTokenType}, "subject_token": {p.IDToken},
		"subject_token_type": {IDTokenTokenType}, "audience": {p.Audience}}
	if p.Resource != "" {
		form.Set("resource", p.Resource)
	}
	if p.Scope != "" {
		form.Set("scope", p.Scope)
	}
	data, nonce, err := xaaPostForm(ctx, p.HTTPClient, endpoint, form, p.ClientID, p.ClientSecret, p.DPoPKey)
	if err != nil {
		return nil, err
	}
	assertion, _ := data["access_token"].(string)
	if data["issued_token_type"] != IDJAGTokenType || assertion == "" {
		return nil, &IDJAGError{Code: "invalid_response", Message: "the identity provider did not answer with an ID-JAG", DPoPNonce: nonce}
	}
	out := &IDJAG{Assertion: assertion}
	if n, ok := data["expires_in"].(float64); ok {
		out.ExpiresIn = int(n)
	}
	out.Scope, _ = data["scope"].(string)
	if signer != nil {
		if parts := strings.Split(assertion, "."); len(parts) == 3 {
			if c, err := mcpJSONPart(parts[1]); err == nil {
				cnf, _ := c["cnf"].(map[string]interface{})
				jkt, _ := cnf["jkt"].(string)
				// The thumbprint of the key the proof was signed with, not the editable field.
				out.DPoPBound = jkt != "" && jkt == JWKThumbprint(signer.publicJWK)
			}
		}
	}
	return out, nil
}

// RedeemIDJAGParams: the other service's token endpoint, your client there, the ID-JAG.
type RedeemIDJAGParams struct {
	TokenEndpoint string
	ClientID      string
	ClientSecret  string
	Assertion     string
	Resource      string
	Scope         string
	// DPoPKey is the key the ID-JAG is bound to: a DPoP proof goes along. An authorization server
	// that supports DPoP binds the access token to the key too (token_type DPoP); one that does
	// not issues a Bearer token.
	DPoPKey    *IDJAGDPoPKey
	HTTPClient *http.Client
}

// RedeemIDJAG trades an ID-JAG for an access token at the other service (jwt-bearer): the token
// endpoint's JSON answer. A refusal, any other non-2xx answer (redirects are not followed with
// the default client) and a 2xx whose body is not a JSON object are an *IDJAGError, and so is no
// readable answer (temporarily_unavailable with net/http's error as Err), as in RequestIDJAG; when
// ctx ends (cancelled or past its deadline), its error comes back instead, for errors.Is.
func RedeemIDJAG(ctx context.Context, p RedeemIDJAGParams) (map[string]interface{}, error) {
	form := url.Values{"grant_type": {JWTBearerGrant}, "assertion": {p.Assertion}}
	if p.ClientSecret == "" {
		form.Set("client_id", p.ClientID)
	}
	if p.Resource != "" {
		form.Set("resource", p.Resource)
	}
	if p.Scope != "" {
		form.Set("scope", p.Scope)
	}
	data, _, err := xaaPostForm(ctx, p.HTTPClient, p.TokenEndpoint, form, p.ClientID, p.ClientSecret, p.DPoPKey)
	if err != nil {
		return nil, err
	}
	return data, nil
}
