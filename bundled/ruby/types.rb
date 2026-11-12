# Touchque Ruby SDK — bundled type/API reference for AI assistants.
# Concatenation of touchque-ruby/lib/touchque/{client.rb,errors.rb,flow.rb,approvals.rb,resources/login.rb,
# rails/guard.rb,rack/relay.rb} plus the public part of relay.rb (RelayHandler).
# Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

# frozen_string_literal: true

module Touchque
  DEFAULT_BASE_URL = "https://api.touchque.com"

  # The Touchque client. Every call is signed with your API secret, so it belongs on
  # your server; browser pieces relay through it.
  #
  #   # TQ_API_KEY=tq_...  TQ_API_SECRET=...
  #   tq = Touchque::Client.new
  #   step = tq.start("SEND_MONEY", "jane@acme.com", details: { "Amount" => "250 EUR" })
  #
  # Thread-safe: create one and reuse it (in Rails, Touchque.client).
  class Client
    # @api private: the ConfigError message for a missing key or secret.
    MISSING_KEYS = "Set TQ_API_KEY and TQ_API_SECRET (or pass api_key: and api_secret:)."

    attr_reader :auth, :login, :webauthn, :webhook, :offline, :action_types, :actions, :risk, :recovery,
                :assist, :agents, :identity, :mobile, :qr_pairings, :device_risk, :safe_guard

    # Anything left nil falls back to the environment: TQ_API_KEY, TQ_API_SECRET and
    # TQ_API_URL (default https://api.touchque.com). +timeout+ is seconds per request.
    def initialize(api_key: nil, api_secret: nil, base_url: nil, timeout: 10)
      api_key ||= ENV.fetch("TQ_API_KEY", nil)
      api_secret ||= ENV.fetch("TQ_API_SECRET", nil)
      base_url ||= ENV["TQ_API_URL"].to_s.empty? ? DEFAULT_BASE_URL : ENV.fetch("TQ_API_URL")
      raise ConfigError, MISSING_KEYS if api_key.to_s.empty? || api_secret.to_s.empty?
      raise ConfigError, "api_key must start with \"tq_\". Did you accidentally swap api_key and api_secret?" unless api_key.start_with?("tq_")

      Util.assert_safe_url!(base_url, "base_url")
      @http = HTTP.new(api_key: api_key, api_secret: api_secret, base_url: base_url.chomp("/"), timeout: timeout)
      @auth = Resources::Auth.new(@http)
      @login = Resources::Login.new(@http)
      @webauthn = Resources::WebAuthn.new(@http)
      @webhook = Resources::Webhook.new(api_secret)
      @offline = Resources::Offline.new(@http)
      @action_types = Resources::ActionTypes.new(@http)
      @actions = Resources::Actions.new(@http)
      @risk = Resources::Risk.new(@http)
      @recovery = Resources::Recovery.new(@http)
      @assist = Resources::Assist.new(@http)
      @agents = Resources::Agents.new(@http)
      @identity = Resources::Identity.new(@http)
      @mobile = Resources::Mobile.new(@http)
      @qr_pairings = Resources::QrPairings.new(@http)
      @device_risk = Resources::DeviceRisk.new(@http)
      @safe_guard = Resources::SafeGuard.new(@http)
    end

    # @api private: signs the guard tokens.
    def api_secret
      @http.api_secret
    end

    # Starts an approval and returns at once: show the step in your UI. "waiting" with
    # "number": show the number, the user picks it on the phone. "enroll": show
    # step["enroll"]["qrCodeDataUrl"] so the user links the Touchque app first.
    # +browser_proof+ (silent sign-ins): the X-Touchque-Browser header, passed through.
    def start(action, user, details: nil, reference_id: nil, ip: nil, user_agent: nil, browser_proof: nil, context: nil)
      Steps.start(self, action, user, details: details, reference_id: reference_id, ip: ip, user_agent: user_agent,
                                      browser_proof: browser_proof, context: context)
    end

    # Where a started approval is now: waiting, approved, rejected, expired...
    def check(request_id)
      Steps.check(self, request_id)
    end

    # Uses an approved request exactly once, after checking it is for this user, action
    # and transaction. Call it right before doing the protected thing.
    def complete(request_id, user, action, details: nil, reference_id: nil)
      Steps.complete(self, request_id, user, action, details: details, reference_id: reference_id)
    end

    # Runs the block only after the user approved on the phone (a push and the wait of
    # login.verify).
    def protect(user, type: "LOGIN", **options)
      login.verify(user, type: type, **options)
      yield
    end
  end
end

# ─────────────────────────────────────────────────────────────
# From lib/touchque/errors.rb — the exceptions
# ─────────────────────────────────────────────────────────────

# frozen_string_literal: true

module Touchque
  # Base class of every error the SDK raises.
  class Error < StandardError; end

  # Touchque answered with an error (status 400 or more). +status+ is the HTTP
  # status, +code+ the machine-readable code (+device_not_linked+,
  # +unknown_action+, +already_used+...) and +data+ the decoded JSON body.
  class APIError < Error
    attr_reader :status, :data

    def initialize(status, data = nil, message = nil)
      @status = status
      @data = data.is_a?(Hash) ? data : {}
      super(message || @data["message"] || @data["error"] || "Touchque API error: HTTP #{status}")
    end

    # Machine-readable error code, e.g. "device_not_linked".
    def code
      @data["code"]
    end

    # The API's +error+ field.
    def error
      @data["error"]
    end

    # Why a request was refused (offline codes, blocked requests).
    def reason
      @data["reason"].is_a?(String) ? @data["reason"] : nil
    end

    # Offline sign: wrong codes left before the challenge locks.
    def attempts_left
      @data["attemptsLeft"]
    end

    # Seconds to wait before retrying (429 / 423).
    def retry_after
      @data["retryAfter"]
    end

    # "Why?" case code of a refusal (+K7P-2QX+): show it to the user ("Tell your
    # support team: K7P-2QX"); your team opens the decision by it in the dashboard.
    def case_code
      @data["caseCode"].is_a?(String) ? @data["caseCode"] : nil
    end

    # Where to send the person instead (help desk: +never_locked_out+).
    def route
      @data["route"]
    end

    # The error for an answer: a FeatureError subclass for the three feature
    # codes, else APIError.
    def self.for(status, data = nil, message = nil)
      klass = data.is_a?(Hash) ? FeatureError::BY_ERROR[data["error"]] : nil
      (klass || APIError).new(status, data, message)
    end
  end

  # The organization behind your workspace cannot use this feature here (HTTP
  # 403). +feature_reason+:
  # - +:not_in_plan+: not in its plan (+feature_not_in_plan+); an owner or admin
  #   adds it in the Touchque dashboard;
  # - +:read_only+: being turned off (+feature_read_only+); reads still work for
  #   14 days, changes are refused;
  # - +:off+: switched off on this Touchque deployment (+feature_off+).
  # +feature+ is the catalog id (+device_risk+, +ai_agents+, +mobile_sdk+,
  # +ciam+...). An APIError, so existing +rescue+ blocks still catch it; rescue
  # one of the three subclasses to tell them apart.
  class FeatureError < APIError
    REASON = nil

    # The catalog id of the feature, or nil.
    def feature
      @data["feature"].is_a?(String) ? @data["feature"] : nil
    end

    # +:not_in_plan+, +:read_only+ or +:off+.
    def feature_reason
      self.class::REASON
    end
  end

  # +feature_not_in_plan+: the feature is not in the organization's plan.
  class FeatureNotInPlanError < FeatureError
    REASON = :not_in_plan
  end

  # +feature_read_only+: the feature is being turned off; reads work, changes are refused.
  class FeatureReadOnlyError < FeatureError
    REASON = :read_only
  end

  # +feature_off+: the feature is switched off on this Touchque deployment.
  class FeatureOffError < FeatureError
    REASON = :off
  end

  FeatureError::BY_ERROR = {
    "feature_not_in_plan" => FeatureNotInPlanError,
    "feature_read_only" => FeatureReadOnlyError,
    "feature_off" => FeatureOffError,
  }.freeze

  # The request never reached Touchque (DNS, connection refused, timeout). Unlike
  # APIError, generally safe to retry.
  class NetworkError < Error
    def initialize(message)
      super("Touchque: network request failed: #{message}")
    end
  end

  # The user did not answer in time, or the request expired.
  class TimeoutError < Error
    attr_reader :request_id

    def initialize(message, request_id = nil)
      @request_id = request_id
      super(message)
    end
  end

  # The user rejected the request on their phone.
  class RejectedError < Error
    attr_reader :request_id

    def initialize(request_id)
      @request_id = request_id
      super("Touchque: request '#{request_id}' was rejected by the user.")
    end
  end

  # A webhook is not from Touchque, was changed, or is too old.
  class WebhookSignatureError < Error
    def initialize(message)
      super("Touchque: webhook rejected: #{message}")
    end
  end

  # A correctly signed webhook with this +jti+ was already accepted. Usually a
  # Touchque retry of a delivery you processed: answer 200 so it stops, but do not
  # run your side effects again. A WebhookSignatureError, so existing rescues
  # still reject it.
  class WebhookReplayError < WebhookSignatureError
    attr_reader :jti

    def initialize(jti)
      @jti = jti
      super("this webhook (jti) was already accepted")
    end
  end

  # Missing or invalid configuration, an undefined action type, or a wrong argument.
  class ConfigError < Error
    def initialize(message)
      super("Touchque config error: #{message}")
    end
  end

  # This request must be approved with a passkey. +reason+ is "policy" when a
  # phishing-resistant policy requires it (no push was sent), or "step_up" when
  # the user tapped Approve during a call (Vishing Shield) and the request, still
  # open, now waits for a passkey in the browser.
  class PasskeyRequiredError < Error
    attr_reader :request_id, :reason

    def initialize(request_id, reason = "policy")
      @request_id = request_id
      @reason = reason
      super(if reason == "step_up"
              "Touchque: request '#{request_id}' must now be approved with a passkey: the user approved on the phone during a call."
            else
              "Touchque: request '#{request_id}' must be approved with a passkey (phishing-resistant policy); no push was sent."
            end)
    end
  end

  # An AI agent's approval ended without a usable approval: +status+ is rejected,
  # blocked, revoked, expired, stale (approved too long ago) or redeemed (already used).
  class ApprovalError < Error
    attr_reader :approval_id, :status, :reason

    def initialize(approval_id, status, reason = nil)
      @approval_id = approval_id
      @status = status
      @reason = reason
      super("Touchque: approval '#{approval_id}' is #{status}#{reason ? " (#{reason})" : ""}.")
    end
  end

  # An approval does not say what you are about to execute (another person,
  # action type, amount, recipient...), or it is not a valid token from Touchque.
  # Do not execute.
  class ApprovalMismatchError < Error
    def initialize(message)
      super("Touchque: #{message}")
    end
  end

  # McpAuth refused a request: answer with +status+ (401, 403) and the
  # WWW-Authenticate header in +www_authenticate+. +error+ is missing_token,
  # invalid_token, invalid_dpop_proof or insufficient_scope.
  class McpAuthError < Error
    attr_reader :status, :error, :www_authenticate

    def initialize(status, error, message, www_authenticate)
      @status = status
      @error = error
      @www_authenticate = www_authenticate
      super(message)
    end
  end

  # A Touchque Login sign-in or token check failed; +error_code+ is machine-readable.
  class HostedLoginError < Error
    attr_reader :error_code, :description, :status

    def initialize(error_code, description = nil, status = nil)
      @error_code = error_code
      @description = description
      @status = status
      super(description ? "#{error_code}: #{description}" : error_code)
    end
  end

  # A My Account API call failed; step_up? means the sign-in is too old for it (RFC 9470).
  class MyAccountError < Error
    attr_reader :error_code, :status, :description, :max_age

    def initialize(error_code, status, description = nil, max_age = nil)
      @error_code = error_code
      @status = status
      @description = description
      @max_age = max_age
      super(description ? "#{error_code}: #{description}" : error_code)
    end

    # True when the person must sign in again (authorization_url with max_age: 0) before this change.
    def step_up?
      error_code == "insufficient_user_authentication"
    end
  end
end

# ─────────────────────────────────────────────────────────────
# From lib/touchque/flow.rb — the headless step-up flow and Touchque::Guard.run
# ─────────────────────────────────────────────────────────────

# frozen_string_literal: true

module Touchque
  # The headless step-up flow shared by every integration: start → show the step in
  # YOUR UI → check → complete exactly once. A "step" is a plain Hash, safe to send to
  # the browser as JSON: state (waiting | approved | rejected | expired | enroll |
  # passkey_required | offline | blocked | frozen | rate_limited) and whatever the user
  # has to see (the matching number, the enrollment QR, the offline QR). No secrets.
  module Steps
    STATE_MAP = { "PENDING" => "waiting", "CONFIRMED" => "approved", "REJECTED" => "rejected", "EXPIRED" => "expired" }.freeze

    module_function

    # Starts an approval for +action+; never waits.
    def start(client, action, user, details: nil, reference_id: nil, ip: nil, user_agent: nil, enroll: true, browser_proof: nil, context: nil)
      raise ConfigError, "start() needs the user id" if user.to_s.empty?

      norm = Details.normalize(details)
      norm = nil if norm.empty?
      begin
        res = client.login.request(user, type: action, reference_id: reference_id, client_ip: ip, user_agent: user_agent,
                                         details: norm, browser_proof: browser_proof, context: context)
        canary = res.dig("canary", "url").is_a?(String) ? { "url" => res.dig("canary", "url") } : nil
        if res["requiresPasskey"]
          step = { "state" => "passkey_required", "requestId" => res["requestId"], "expiresAt" => res["expiresAt"], "details" => norm }.merge(why(res))
          step["canary"] = canary if canary
          return step
        end
        step = { "state" => "waiting", "requestId" => res["requestId"], "number" => res["challengeCode"],
                 "expiresAt" => res["expiresAt"], "details" => norm }.merge(why(res))
        # Only when the workspace collects behavioural signals.
        step["telemetryToken"] = res["telemetryToken"] if res["telemetryToken"] && !res["telemetryToken"].empty?
        # Mirror Alarm: the page showing this first step loads the canary.
        step["canary"] = canary if canary
        step
      rescue APIError => e
        code = e.code || e.error
        why = e.case_code ? { "caseCode" => e.case_code } : {}
        if e.status == 404 && (code == "device_not_linked" || e.message.downcase.include?("linked device"))
          return enroll ? enroll_step(client, user) : { "state" => "enroll" }
        end
        return { "state" => "frozen", "retryAfter" => e.retry_after }.merge(why) if e.status == 423
        return { "state" => "rate_limited", "retryAfter" => e.retry_after }.merge(why) if e.status == 429
        if e.status == 400 && (code == "unknown_action" || e.message.downcase.include?("invalid action type"))
          raise ConfigError, "Unknown action \"#{action}\". Create it once with client.action_types.define(\"#{action}\") or in the dashboard (Action Types)."
        end
        if e.status == 403
          reason = (code == "blocked" ? e.reason : nil) ||
                   (code == "passkey_not_registered" || e.error == "phishing_resistant_required" ? "passkey_not_registered" : nil) ||
                   (code == "action_disabled" ? "action_disabled" : nil) || code || "blocked"
          return { "state" => "blocked", "reason" => reason }.merge(why)
        end
        raise
      end
    end

    # First-time linking. Never unlinks a phone: a secret is only re-issued when the
    # account is confirmed NOT linked.
    def enroll_step(client, user)
      enroll_qr(client.auth.generate_secret(user))
    rescue APIError => e
      raise unless e.status == 409

      current = begin
        client.auth.get_user(user)
      rescue APIError
        nil
      end
      return { "state" => "enroll", "reason" => "already_linked" } if current && (current["used"] || current["deviceId"])

      enroll_qr(client.auth.reset_secret(user))
    end

    # The enroll step for a new linking QR. "expiresAt" is when the QR stops working: the
    # API's expiresAt when it is an ISO 8601 date-time, else now + its ttlMs, else none.
    def enroll_qr(res)
      enroll = res.slice("qrCodeDataUrl", "recoveryCodes")
      if iso_ms(res["expiresAt"])
        enroll["expiresAt"] = res["expiresAt"]
      elsif res["ttlMs"].is_a?(Numeric) && res["ttlMs"].positive?
        enroll["expiresAt"] = iso_of(Util.now_ms + res["ttlMs"].to_i)
      end
      { "state" => "enroll", "enroll" => enroll }
    end

    ISO_8601 = /\A\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})\z/i

    # @api private: milliseconds since the epoch of an ISO 8601 date-time with a zone
    # ("2026-11-12T10:05:00.000Z"), or nil.
    def iso_ms(value)
      return nil unless value.is_a?(String) && value.match?(ISO_8601)

      require "time"
      time = Time.iso8601(value)
      time.to_i * 1000 + time.usec / 1000
    rescue ArgumentError
      nil
    end

    # @api private: milliseconds since the epoch as ISO 8601 in UTC, like JavaScript's toISOString().
    def iso_of(ms)
      Time.at(ms / 1000, ms % 1000, :millisecond).utc.strftime("%Y-%m-%dT%H:%M:%S.%LZ")
    end

    # "Why?": the case code and plain reasons of a login request's answer, for its step.
    def why(res)
      out = {}
      out["caseCode"] = res["caseCode"] if res["caseCode"].is_a?(String) && !res["caseCode"].empty?
      reasons = (res["reasons"].is_a?(Array) ? res["reasons"] : []).filter_map do |r|
        { "code" => r["code"], "text" => r["text"].is_a?(String) ? r["text"] : "" } if r.is_a?(Hash) && r["code"].is_a?(String)
      end
      out["reasons"] = reasons unless reasons.empty?
      out
    end

    # Where a started approval is now.
    def check(client, request_id)
      s = client.login.status(request_id)
      state = s["status"] == "PENDING" && s["requiresPasskey"] ? "passkey_required" : STATE_MAP.fetch(s["status"], "waiting")
      step = { "state" => state, "requestId" => request_id }
      step["assurance"] = s["assurance"] if state == "approved" && s["assurance"]
      step
    end

    # Uses an approved request exactly once and checks it is for THIS user, action and
    # transaction. ApprovalMismatchError when it is for something else.
    def complete(client, request_id, user, action, details: nil, reference_id: nil)
      res = client.login.consume(request_id)
      same_user = res["externalUsername"].to_s.downcase == user.to_s.downcase
      same_details = Details.digest(details) == Details.digest(res["details"])
      # No reference and an empty one are the same: the API answers null for both.
      same_ref = (res["referenceId"].to_s.empty? ? nil : res["referenceId"]) == (reference_id.to_s.empty? ? nil : reference_id)
      if !same_user || res["type"] != action || !same_details || !same_ref
        raise ApprovalMismatchError, "this approval is for a different user, action or transaction."
      end

      approval = {
        "requestId" => request_id, "user" => res["externalUsername"], "action" => res["type"],
        "assurance" => res["assurance"], "confirmedVia" => res["confirmedVia"], "approvalProof" => res["approvalProof"]
      }
      if res.key?("provisional")
        # Vishing Shield: approved during a call. Treat the session as limited: critical actions are
        # refused until APPROVAL_RECONFIRMED, and APPROVAL_REVOKED means end it.
        approval.merge!("provisional" => res["provisional"] ? true : false, "revoked" => res["revoked"] ? true : false,
                        "revokeReason" => res["revokeReason"], "reconfirmedAt" => res["reconfirmedAt"])
      end
      approval
    end

    # The browser echoes this token back while it waits. Signed with a key derived from
    # the API secret, it binds the approval to one user, action and transaction.
    def sign_guard_token(api_secret, claims)
      body = Util.b64url(Util.json(claims))
      "v1.#{body}.#{Util.b64url(Util.hmac(token_key(api_secret), body))}"
    end

    def verify_guard_token(api_secret, token)
      return nil if token.nil? || token.empty? || token.length > 4096

      parts = token.split(".", -1)
      return nil unless parts.length == 3 && parts[0] == "v1"
      return nil unless Util.secure_compare(Util.b64url(Util.hmac(token_key(api_secret), parts[1])), parts[2])

      claims = Util.parse_json(Util.b64url_decode(parts[1]).force_encoding("UTF-8"))
      return nil unless claims.is_a?(Hash) && claims["exp"].is_a?(Numeric) && claims["exp"] >= Util.now_ms

      claims
    rescue ArgumentError
      nil
    end

    def token_key(api_secret)
      Util.hmac(api_secret, "touchque-guard-token-v1")
    end
  end

  # Framework-agnostic step-up guard (the Rails concern is a thin wrapper over it).
  # Contract, the same in every Touchque server SDK:
  #   1st request            -> 202 {"touchque" => step, "token" => ...}  show the step in your UI
  #   repeat with the token   -> 202 while waiting, then the protected action runs once
  #   refused                 -> 403 / 408 / 423 / 429 {"touchque" => {"state" => ...}}
  #   first-time QR up        -> 202 {"touchque" => {"state" => "enroll", "expiresAt" => ...}} with no
  #                              "enroll": keep showing the QR; a new one comes with
  #                              "enroll" => {"qrCodeDataUrl"} once the old one expired
  # Request headers the browser sends back: X-Touchque-Token, X-Touchque-Offline: 1,
  # X-Touchque-Code (+ X-Touchque-Code-Type: totp), X-Touchque-Browser (silent sign-ins).
  module Guard
    TOKEN_HEADER = "X-Touchque-Token"
    OFFLINE_HEADER = "X-Touchque-Offline"
    CODE_HEADER = "X-Touchque-Code"
    CODE_TYPE_HEADER = "X-Touchque-Code-Type"
    BROWSER_HEADER = "X-Touchque-Browser"

    TOKEN_TTL_MS = 10 * 60 * 1000
    MAX_BROWSER_PROOF = 4096
    STATUS = { "waiting" => 202, "enroll" => 202, "passkey_required" => 202, "offline" => 202, "approved" => 200,
               "rejected" => 403, "blocked" => 403, "expired" => 408, "frozen" => 423, "rate_limited" => 429 }.freeze
    WAITING = %w[waiting passkey_required offline].freeze
    # A first-time QR this close to its expiry is replaced instead of kept on screen.
    ENROLL_MARGIN_MS = 15_000
    # The refusal message for a state when the guard set none (anything else: "The approval was refused.").
    REFUSAL_MESSAGES = {
      "rejected" => "The approval was rejected.",
      "expired" => "The approval expired. Try again.",
      "frozen" => "Too many rejected approvals. Try again later.",
      "rate_limited" => "Too many attempts. Try again later."
    }.freeze

    @unconfigured_logged = false

    class << self
      # @api private: the adapters logged once that the client cannot be built.
      attr_accessor :unconfigured_logged
    end

    module_function

    # The guard headers from a header getter (name => value or nil).
    def input_from_headers(get)
      {
        token: presence(get.call(TOKEN_HEADER)),
        offline: %w[1 true].include?(get.call(OFFLINE_HEADER)),
        code: presence(get.call(CODE_HEADER)),
        code_type: presence(get.call(CODE_TYPE_HEADER))
      }
    end

    # +silent_sign_in+: false/nil (default), true, or { max_age_seconds: Integer >= 0 }.
    def assert_silent_sign_in!(option, who)
      return if option.nil? || option == true || option == false

      if option.is_a?(Hash) && (option.keys.map(&:to_s) - ["max_age_seconds"]).empty?
        max = option[:max_age_seconds] || option["max_age_seconds"]
        return if max.nil? || (max.is_a?(Integer) && max >= 0)
      end
      raise ArgumentError, "#{who}: silent_sign_in must be true, false or { max_age_seconds: Integer >= 0 }."
    end

    def silent_on?(option)
      option == true || option.is_a?(Hash)
    end

    # True when this request only polls an approval already on its way: a valid token
    # bound to this user/action/details, still waiting, or showing the first-time QR while
    # it is up (more than 15 s before it expires), and no offline switch or code. Relays do
    # not count it against the per-user push limit. Such an enroll poll can still start
    # (the user linked, or the QR is gone): relays charge that through run's before_start.
    # Renewing an expiring QR counts.
    def status_poll?(client, user, action, details: nil, reference_id: nil, token: nil, offline: false, code: nil)
      return false if user.to_s.empty? || token.to_s.empty? || offline || !code.to_s.empty?

      claims = Steps.verify_guard_token(client.api_secret, token)
      return false unless claims && bound?(claims, user, action, details, reference_id)
      return claims["ee"].is_a?(Integer) && Util.now_ms < claims["ee"] - ENROLL_MARGIN_MS if claims["st"] == "enroll"

      claims["rid"] ? WAITING.include?(claims["st"]) : false
    end

    # The headers for a result that is not an approval: Cache-Control: no-store,
    # Retry-After when the step has one (423, 429) and, for status >= 400,
    # X-Touchque-State plus X-Touchque-Reason when the step has a reason. @touchque/web
    # rebuilds the step from them when a body has no "touchque" key; cross-origin pages
    # need them in Access-Control-Expose-Headers.
    def headers(result)
      step = result[:body].is_a?(Hash) && result[:body]["touchque"].is_a?(Hash) ? result[:body]["touchque"] : {}
      out = { "Cache-Control" => "no-store" }
      out["Retry-After"] = step["retryAfter"].to_s if step["retryAfter"]
      if result[:status] >= 400 && header_code?(step["state"])
        out["X-Touchque-State"] = step["state"]
        out["X-Touchque-Reason"] = step["reason"] if header_code?(step["reason"])
      end
      out
    end

    # A state or reason code that is safe as a header value.
    def header_code?(value)
      value.is_a?(String) && value.match?(/\A[A-Za-z0-9_.:-]{1,100}\z/)
    end

    def bound?(claims, user, action, details, reference_id)
      claims["u"] == user && claims["a"] == action && claims["d"] == Details.digest(details) && claims["r"] == reference_id
    end

    # Touchque.client for the per-route adapters: built on the request, kept once built.
    # nil when it cannot be built (TQ_API_KEY / TQ_API_SECRET missing, a bad key or URL),
    # logged once per process; the adapter then answers 500 misconfigured.
    def default_client
      Touchque.client
    rescue ConfigError => e
      unless Guard.unconfigured_logged
        Guard.unconfigured_logged = true
        line = if e.message.end_with?(Client::MISSING_KEYS)
                 "[Touchque] TQ_API_KEY and TQ_API_SECRET are not set: routes guarded by Touchque answer 500 misconfigured."
               else
                 "[Touchque] #{e.message}"
               end
        Touchque.log :error, line
      end
      nil
    end

    # The 401 for a request without a signed-in user.
    def unauthenticated
      error(401, { "state" => "blocked", "reason" => "unauthenticated" }, "unauthenticated", "Sign in first.")
    end

    # The 500 for a setup error: missing keys, an undefined action type.
    def misconfigured
      error(500, { "state" => "blocked", "reason" => "misconfigured" }, "misconfigured", "Two-factor approval is not configured correctly.")
    end

    # What an error_body callable gets for a result with status >= 400:
    # { status:, code:, message:, touchque: }. code: the error's code, else the step's
    # reason, else its state; message: the error's message, else one for the state ("The
    # approval was rejected." ...); touchque: a copy of the step as it would be sent.
    def refusal(result)
      body = Util.deep_copy(result[:body]) # the callable may change what it gets, never the answer
      step = body["touchque"] || {}
      error = body["error"] || {}
      { status: result[:status], code: error["code"] || step["reason"] || step["state"],
        message: error["message"] || REFUSAL_MESSAGES.fetch(step["state"], "The approval was refused."), touchque: step }
    end

    # Your own error shape for a result with status >= 400, as the JSON text to send: what
    # +callable+ returns for refusal(result). What it encodes to decides (a Struct or Data as
    # its Hash, to_hash, an as_json Hash, else to_json): a JSON object gets "touchque" set
    # to the step, replacing yours, so @touchque/web still sees the state (no token is
    # added); anything else is sent as it is. When the callable raises, or its result cannot
    # be encoded, this logs "[Touchque] errorBody failed: ..." and returns the default body.
    def error_body(result, callable)
      json = jsonable(callable.call(refusal(result))).to_json
      return json unless json.start_with?("{")

      JSON.parse(json).merge("touchque" => result[:body]["touchque"]).to_json
    rescue StandardError => e
      Touchque.log :error, "[Touchque] errorBody failed: #{e.message}"
      result[:body].to_json
    end

    # An error_body result in the form it is encoded in: a Struct or Data as its Hash, an
    # object with to_hash as that, one whose as_json is a Hash as that; anything else as it is.
    def jsonable(value)
      case value
      when Hash, Array, String, Numeric, Symbol, true, false, nil then value
      when Struct then value.to_h
      else
        return value.to_h if defined?(::Data) && value.is_a?(::Data)
        return value.to_hash if value.respond_to?(:to_hash)

        json = value.respond_to?(:as_json) ? value.as_json : nil
        json.is_a?(Hash) ? json : value
      end
    end

    # Runs one step of the guard: {status: 200, approved: approval} (run your protected
    # action once) or {status:, body: {"touchque" => step, "token" => ...}} to send back
    # with headers(result).
    # Silent sign-ins: with +silent_sign_in+ on, a new attempt that carries a browser
    # proof first asks Touchque (risk.check); only an answer of exactly prompt: false
    # approves at once with no push. Otherwise, and on any error, the usual push starts.
    # +before_start+ (for rate limiters): called at most once, only for a poll with a
    # first-time QR token, right before it would start instead of keeping the QR (the user
    # linked: the silent check or the push; the QR expired, is about to, or is gone: a new
    # QR). Return nil or false to go on, or a result ({status:, body:}) to answer instead;
    # anything else fails closed (503 unavailable), so nothing starts. A relay charges the
    # user's budget there, since status_poll? exempted that poll.
    def run(client, user, action, details: nil, reference_id: nil, ip: nil, user_agent: nil, token: nil, offline: false,
            code: nil, code_type: nil, enroll: true, browser_proof: nil, silent_sign_in: false, context: nil, before_start: nil)
      return unauthenticated if user.to_s.empty?

      norm = Details.normalize(details)
      norm = nil if norm.empty?
      base = { "u" => user, "a" => action, "d" => Details.digest(details), "r" => reference_id }
      secret = client.api_secret
      issue = lambda do |step, extra = {}|
        step = step.merge("details" => norm) if norm && step["details"].nil? && step["state"] != "blocked"
        claims = base.merge("st" => step["state"], "rid" => step["requestId"], "n" => step["number"],
                            "oc" => step.dig("offline", "challengeId"), "exp" => Util.now_ms + TOKEN_TTL_MS)
        claims["cc"] = step["caseCode"] if step["caseCode"]
        # A first-time QR: its token carries when the QR expires (ee), so polls keep it on screen.
        if step["state"] == "enroll" && step["enroll"].is_a?(Hash) && !step["enroll"]["qrCodeDataUrl"].to_s.empty?
          ee = Steps.iso_ms(step["enroll"]["expiresAt"])
          claims["ee"] = ee if ee
        end
        claims.merge!(extra)
        { status: STATUS.fetch(step["state"]), body: { "touchque" => step.compact, "token" => Steps.sign_guard_token(secret, claims) } }
      end

      begin
        claims = Steps.verify_guard_token(secret, token)
        bound = claims && bound?(claims, user, action, details, reference_id) ? claims : nil
        rid = bound && bound["rid"]
        n = bound && bound["n"]
        oc = bound && bound["oc"]
        st = bound && bound["st"]
        keep = { "oc" => oc, "rid" => rid, "n" => n }

        # Offline: the user typed the code from the phone.
        if bound && !code.to_s.empty? && (st == "offline" || code_type == "totp")
          totp = code_type == "totp"
          res = totp ? client.offline.verify_totp(user, code, type: action, client_ip: ip, request_id: rid) : client.offline.verify(oc.to_s, code)
          for_this = (res["externalUsername"].to_s.empty? || res["externalUsername"].downcase == user.downcase) &&
                     (res["type"].to_s.empty? || res["type"] == action)
          if res["approved"] && for_this
            return { status: 200, approved: {
              "requestId" => oc || "offline-totp", "user" => user, "action" => action,
              "assurance" => { "phishingResistant" => false, "method" => totp ? "offline_totp" : "offline_code" },
              "confirmedVia" => totp ? "OFFLINE_TOTP" : "OFFLINE_CODE", "approvalProof" => nil
            } }
          end
          if res["reason"] == "invalid_code" && !totp
            return issue.call({ "state" => "offline", "offline" => { "challengeId" => oc.to_s, "attemptsLeft" => res["attemptsLeft"] } }, keep)
          end
          return issue.call({ "state" => "offline", "reason" => "invalid_code" }, keep) if res["reason"] == "invalid_code"
          # The phone rejected the push this QR belongs to: the whole sign-in is over.
          return issue.call({ "state" => "rejected", "requestId" => rid, "reason" => "request_rejected" }) if res["reason"] == "request_rejected"
          # The push now waits for a passkey (Vishing Shield): no code may finish it.
          if res["reason"] == "passkey_required" && rid
            return issue.call({ "state" => "passkey_required", "requestId" => rid, "number" => n }, { "n" => n })
          end

          return issue.call({ "state" => res["reason"] == "expired" ? "expired" : "blocked", "reason" => res["reason"] || "offline_failed" })
        end

        if offline
          begin
            # Tie the QR to the push it follows: a phone-side rejection kills it; number matching carries over.
            ch = client.offline.challenge(user, type: action, details: norm, client_ip: ip, user_agent: user_agent, request_id: rid)
            offline_step = ch.slice("challengeId", "qrDataUrl", "expiresAt", "totpAvailable")
            offline_step["challengeCode"] = ch["challengeCode"] if ch["challengeCode"] && !ch["challengeCode"].empty?
            return issue.call({ "state" => "offline", "offline" => offline_step }, { "rid" => rid, "n" => ch["challengeCode"] || n })
          rescue APIError => e
            err = e.code || e.error
            return issue.call({ "state" => "rejected", "requestId" => rid, "reason" => "request_rejected" }) if e.status == 409 && err == "request_rejected"
            if rid && err == "passkey_required"
              return issue.call({ "state" => "passkey_required", "requestId" => rid, "number" => n }, { "n" => n })
            end
            return issue.call({ "state" => "blocked", "reason" => e.code || e.error || "offline_unavailable" }) if e.status < 500

            raise
          end
        end

        # Waiting on a push / passkey, or the offline QR next to a push still open: poll, run once approved.
        if bound && rid && WAITING.include?(st)
          now = Steps.check(client, rid)
          if now["state"] == "approved"
            begin
              return { status: 200, approved: Steps.complete(client, rid, user, action, details: details, reference_id: reference_id) }
            rescue APIError => e
              raise unless e.status == 409

              return issue.call({ "state" => "expired", "reason" => e.code || "already_used" })
            end
          end
          # The push behind the QR moved to a passkey after a tap during a call.
          if st == "offline" && now["state"] == "passkey_required"
            return issue.call({ "state" => "passkey_required", "requestId" => rid, "number" => n }, { "n" => n })
          end
          # Nothing changed for the user: keep showing the QR they have.
          return issue.call({ "state" => "offline", "offline" => { "challengeId" => oc.to_s } }, keep) if st == "offline" && %w[waiting expired].include?(now["state"])
          if %w[waiting passkey_required].include?(now["state"])
            waiting = { "state" => now["state"], "requestId" => rid, "number" => n }
            # "Why?": the case code stays on screen while it waits.
            waiting["caseCode"] = bound["cc"] if bound["cc"]
            return issue.call(waiting, { "n" => n })
          end
          return issue.call({ "state" => now["state"], "requestId" => rid })
        end

        # The first-time QR is up: while the phone is not linked and the QR lives, keep it on screen
        # (no new secret, no push); the page keeps the QR and recovery codes it shows. Linked,
        # expiring or gone: start.
        if bound && st == "enroll" && (ee = bound["ee"]).is_a?(Integer)
          if link_state(client, user) == false && Util.now_ms < ee - ENROLL_MARGIN_MS
            return issue.call({ "state" => "enroll", "expiresAt" => Steps.iso_of(ee) }, { "ee" => ee })
          end

          # This poll starts after all (a push, or a new QR): the caller may charge or refuse it first.
          # Anything truthy it returns is the answer; what is not a result fails closed (503).
          instead = before_start&.call
          if instead
            unless instead.is_a?(Hash) && instead[:status].is_a?(Integer) && instead[:body].is_a?(Hash)
              raise ArgumentError, "before_start must return nil or false to go on, or a result { status:, body: } to answer"
            end

            return instead
          end
        end

        # Anything else (no or foreign token, enrollment finished, new attempt): start.
        proof = browser_proof.is_a?(String) && !browser_proof.empty? && browser_proof.length <= MAX_BROWSER_PROOF ? browser_proof : nil
        if proof && silent_on?(silent_sign_in)
          silent = silent_approval(client, user, action, proof, ip, user_agent, silent_sign_in, context)
          return { status: 200, approved: silent } if silent
        end
        issue.call(Steps.start(client, action, user, details: norm, reference_id: reference_id, ip: ip, user_agent: user_agent,
                                                     enroll: enroll, browser_proof: proof, context: context))
      rescue ConfigError => e
        Touchque.log :error, "[Touchque] #{e.message}"
        misconfigured
      rescue StandardError => e
        # Anything else (Touchque unreachable, an approval for another transaction, a bug)
        # fails closed with the contract's 503, never a bare 500.
        Touchque.log :error, "[Touchque] approval failed: #{e.class}: #{e.message}"
        error(503, { "state" => "blocked", "reason" => "unavailable" }, "unavailable", "Two-factor approval is temporarily unavailable.")
      end
    end

    def error(status, step, code, message)
      { status: status, body: { "touchque" => step, "error" => { "code" => code, "message" => message } } }
    end

    # Whether a phone is linked to the user (used, or a deviceId); nil when Touchque does
    # not know the user (404: the QR is gone). Other errors raise.
    def link_state(client, user)
      current = client.auth.get_user(user)
      current["used"] || current["deviceId"] ? true : false
    rescue APIError => e
      raise unless e.status == 404

      nil
    end

    # Fails closed: only an answer of exactly prompt: false approves.
    def silent_approval(client, user, action, proof, ip, user_agent, option, context)
      max_age = option.is_a?(Hash) ? (option[:max_age_seconds] || option["max_age_seconds"]) : nil
      res = client.risk.check(user, type: action, client_ip: ip, user_agent: user_agent, browser_proof: proof,
                                    max_age_seconds: max_age, context: context)
      return nil unless res["prompt"] == false

      {
        "requestId" => "silent", "user" => user, "action" => action,
        "assurance" => { "phishingResistant" => false, "method" => "silent" },
        "confirmedVia" => "SILENT", "approvalProof" => nil,
        # Nothing was sent to the phone; why Touchque let this known browser in.
        "reasons" => res["reasons"]
      }
    rescue StandardError => e
      Touchque.log :warn, "[Touchque] silent sign-in check failed, asking the phone: #{e.class}: #{e.message}"
      nil
    end

    def presence(value)
      value.nil? || value.to_s.empty? ? nil : value.to_s
    end
  end
end

# ─────────────────────────────────────────────────────────────
# From lib/touchque/approvals.rb — details digest, Touchque::ApprovalProof.verify (pin the key)
# ─────────────────────────────────────────────────────────────

# frozen_string_literal: true

module Touchque
  # Transaction details the way the API normalizes and digests them.
  module Details
    # What JavaScript's trim removes, as the API trims: ASCII and Unicode spaces (U+00A0,
    # U+202F...), line separators and the BOM. String#strip knows only the ASCII ones.
    SPACE = "[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]"
    TRIM = /\A#{SPACE}+|#{SPACE}+\z/

    module_function

    # A Hash ({"Amount" => "250 EUR"}) or a list of {label:, value:} as
    # [{"label", "value"}] with trimmed strings.
    def normalize(details)
      return [] if details.nil? || details.empty?

      pairs = if details.is_a?(Hash)
                details.map { |label, value| [label.to_s, value.to_s] }
              else
                details.map do |d|
                  d = Util.stringify(d)
                  [d["label"].to_s, d["value"].to_s]
                end
              end
      pairs.map { |label, value| { "label" => trim(label), "value" => trim(value) } }
    end

    def trim(text)
      text.ascii_only? || text.encoding == Encoding::UTF_8 ? text.gsub(TRIM, "") : text.strip
    end

    # SHA-256 (hex) over the normalized details joined as label US value RS label...;
    # "" for no details. The phone signs this digest (ApprovalProof).
    def digest(details)
      pairs = normalize(details)
      return "" if pairs.empty?

      Util.sha256_hex(pairs.map { |p| "#{p["label"]}\u001f#{p["value"]}" }.join("\u001e"))
    end
  end

  # Verifies the device-signed proof of an approval ("what you see is what you sign").
  # When the phone holds a hardware key (Secure Enclave / Android Keystore), every
  # approval is signed over the request id, the action type, the number-match code and
  # a digest of the details the user was shown. The proof arrives in the SUCCESS webhook
  # ("approvalProof") and in the consumed approval. Verifying it does not require
  # trusting Touchque.
  module ApprovalProof
    PREFIX = "touchque-approve:v2"

    module_function

    # True only if +proof+ was signed by the device key over exactly the request, action
    # type, challenge code and details you expect. Pin the device with
    # +expected_public_key+ (the base64 key you stored for this user), or pass
    # allow_unpinned_key: true for trust on first use. Never raises.
    def verify(proof, request_id:, type:, details: nil, challenge_code: nil, expected_public_key: nil, allow_unpinned_key: false)
      return false unless proof.is_a?(Hash)

      proof = Util.stringify(proof)
      return false unless proof["version"] == "v2" && proof["algorithm"] == "ECDSA-P256-SHA256"

      public_key = proof["publicKey"]
      message = proof["message"]
      signature = proof["signature"]
      return false unless [public_key, message, signature].all?(String)

      if expected_public_key && !expected_public_key.empty?
        return false unless Util.secure_compare(expected_public_key, public_key)
      elsif allow_unpinned_key != true
        return false
      end
      expected = [PREFIX, request_id.to_s, type.to_s, challenge_code.to_s, Details.digest(details)].join("\n")
      return false unless Util.secure_compare(expected, message)

      raw = public_key.unpack1("m0")
      return false unless raw.bytesize == 65 && raw.getbyte(0) == 4

      sig = signature.unpack1("m0")
      return false if sig.empty?

      key = OpenSSL::PKey.read(AgentKeys::P256_SPKI + raw)
      key.verify(OpenSSL::Digest.new("SHA256"), sig, message)
    rescue StandardError
      false
    end
  end

  # What a partner's server checks before executing what an AI agent asked for: the
  # approval token's claims match the transaction (person, action type, authorization
  # details) and, offline, its ES256 signature against Touchque's keys
  # (GET /agents/jwks.json). Amounts compare as decimals ("500" = "500.00"), IBANs
  # without spaces in any case, currencies in any case; a Hash matches a token with
  # exactly one entry, an Array matches entry by entry.
  module ApprovalToken
    module_function

    # {"header", "claims"} WITHOUT checking the signature.
    def decode(token)
      parts = JWS.split(token)
      raise ApprovalMismatchError, "not an approval token" unless parts

      { "header" => parts[0], "claims" => parts[1] }
    end

    # Does +details+ (a token's authorization_details) say what +expected+ says?
    def matches?(details, expected)
      return false unless details.is_a?(Array)

      expected = Util.stringify(expected)
      if expected.is_a?(Array)
        return false unless details.length == expected.length

        return expected.each_with_index.all? { |e, i| partial(details[i], e) }
      end
      details.length == 1 && partial(details[0], expected)
    end

    # Raises ApprovalMismatchError unless the claims say what you expect.
    def assert_matches!(claims, user: nil, type: nil, authorization_details: nil)
      if user && claims["sub"] != user
        raise ApprovalMismatchError, "the approval is for another person"
      end
      if type && claims["type"] != type
        raise ApprovalMismatchError, "the approval is for another action type (#{claims["type"]})"
      end
      if authorization_details && !matches?(claims["authorization_details"], authorization_details)
        raise ApprovalMismatchError, "the approved details differ from what you are about to execute"
      end

      true
    end

    # Verifies an approval token offline: typ touchque-approval+jwt, ES256 by a key of
    # +jwks+, not expired (30 s leeway), aud equal to +audience+, then the expectation.
    # +audience+ is required: /agents/jwks.json is one key set for every Touchque
    # workspace, so without it a token Touchque signed for another workspace would pass.
    # Pass your own (tq.agents.approval_audience, touchque:workspace:<id>), or use
    # tq.agents.verify_approval_token, which fills it in.
    # Does NOT make it single-use: agents.redeem_approval does.
    def verify_with(token, jwks, audience: nil, user: nil, type: nil, authorization_details: nil, now: nil)
      if !audience.is_a?(String) || audience.empty?
        raise ApprovalMismatchError, "audience is required: your workspace's touchque:workspace:<id> (tq.agents.approval_audience)"
      end
      parts = JWS.split(token)
      raise ApprovalMismatchError, "not an approval token" unless parts

      header, claims, input, sig = parts
      unless header["typ"] == "touchque-approval+jwt" && header["alg"] == "ES256"
        raise ApprovalMismatchError, "not an approval token (typ/alg)"
      end

      jwk = (Util.stringify(jwks)["keys"] || []).reverse.find do |k|
        k["kid"] == header["kid"] && k["kty"] == "EC" && k["crv"] == "P-256"
      end
      raise ApprovalMismatchError, "signed by an unknown key" unless jwk
      raise ApprovalMismatchError, "the signature does not verify" unless JWS.verify("ES256", jwk, input, sig)

      exp = claims["exp"]
      raise ApprovalMismatchError, "the approval token expired" unless exp.is_a?(Numeric) && exp + 30 >= (now || Util.now)
      aud = claims["aud"]
      raise ApprovalMismatchError, "the approval token names no workspace" if !aud.is_a?(String) || aud.empty?
      raise ApprovalMismatchError, "the approval token is for another workspace" if aud != audience

      assert_matches!(claims, user: user, type: type, authorization_details: authorization_details)
      claims
    end

    def decimal(value)
      text = value.to_s.strip
      return nil unless text.match?(/\A\d+(\.\d+)?\z/)

      whole, frac = text.split(".", 2)
      whole = whole.sub(/\A0+/, "")
      whole = "0" if whole.empty?
      frac = (frac || "").sub(/0+\z/, "")
      frac.empty? ? whole : "#{whole}.#{frac}"
    end

    def same(key, actual, expected)
      return partial(actual, expected) if expected.is_a?(Hash) || expected.is_a?(Array)

      case key
      when "amount"
        !decimal(actual).nil? && decimal(actual) == decimal(expected)
      when "iban", "currency"
        actual.is_a?(String) && actual.gsub(/\s+/, "").upcase == expected.to_s.gsub(/\s+/, "").upcase
      else
        scalar_equal(actual, expected)
      end
    end

    def partial(actual, expected)
      if expected.is_a?(Array)
        return false unless actual.is_a?(Array) && actual.length == expected.length

        return expected.each_with_index.all? do |e, i|
          e.is_a?(Hash) || e.is_a?(Array) ? partial(actual[i], e) : scalar_equal(actual[i], e)
        end
      end
      return scalar_equal(actual, expected) unless expected.is_a?(Hash)
      return false unless actual.is_a?(Hash)

      expected.all? { |k, v| actual.key?(k) && same(k, actual[k], v) }
    end

    def scalar_equal(a, b)
      return a == b unless a.is_a?(Numeric) && b.is_a?(Numeric)

      a.to_r == b.to_r
    end
  end
end

# ─────────────────────────────────────────────────────────────
# From lib/touchque/resources/login.rb — tq.login (request/status/verify/report_fraud) and tq.offline
# ─────────────────────────────────────────────────────────────

# frozen_string_literal: true

module Touchque
  module Resources
    # Setup secrets (the QR code the Touchque app scans) and a user's link status.
    class Auth
      def initialize(http)
        @http = http
      end

      # A new setup secret: show +qrCodeDataUrl+ so the Touchque app links the phone.
      # 409 when an unscanned or used secret exists (reset_secret issues a new one).
      def generate_secret(external_username)
        @http.post("/auth/generate-secret", { "externalUsername" => external_username })
      end

      def reset_secret(external_username)
        @http.post("/auth/secret/reset", { "externalUsername" => external_username })
      end

      def validate_secret(secret)
        @http.post("/auth/secret/validate", { "secret" => secret })
      end

      # A user's link status without sending a push: +used+ flips true and +deviceId+ is
      # set once the app scans the secret. +device+ is the linked phone's self-reported
      # posture (device trust), nil before a phone is linked. APIError 404 for an unknown user.
      def get_user(external_username)
        @http.get("/users/#{Util.seg(external_username)}")
      end
    end

    # Push approvals on the user's phone: request, status, wait, use once, report fraud.
    class Login
      FRAUD_REASONS = %w[chargeback account_takeover social_engineering other].freeze

      def initialize(http)
        @http = http
      end

      # A push to the user's phone (returns at once).
      #
      # details: transaction context for the approval screen, {"Amount" => "250 EUR"} or
      # [{label:, value:}], at most 8 lines (labels <= 40, values <= 120 characters). Build
      # it from server-side state. browser_proof: the X-Touchque-Browser header (silent
      # sign-ins), passed through untouched. context: for your Touchque Actions only.
      # security_changes: {password:, mfa:, device:, email:, phone:} => Time / ISO 8601 /
      # epoch ms, when each last changed in your system. destination: {kind:, value:, known:}
      # where the action sends money (shown in full on the phone). locale: "tr" or "en".
      def request(external_username, type: "LOGIN", reference_id: nil, client_ip: nil, user_agent: nil,
                  require_biometric: false, require_number_match: false, details: nil, browser_proof: nil,
                  context: nil, challenge_digits: nil, expires_in: nil, client_signals: nil,
                  security_changes: nil, destination: nil, locale: nil, qr_pairing: nil, device_risk: nil, device_risk_request_id: nil, reply: nil)
        body = { "externalUsername" => external_username, "type" => type || "LOGIN" }
        # An empty reference is no reference (the API answers null for it).
        body["referenceId"] = reference_id unless reference_id.to_s.empty?
        body["clientIp"] = client_ip unless client_ip.nil?
        body["userAgent"] = user_agent unless user_agent.nil?
        body["requireBiometric"] = true if require_biometric
        body["requireNumberMatch"] = true if require_number_match
        body["challengeDigits"] = challenge_digits if [2, 3].include?(challenge_digits)
        # How long the push waits for the person: 30 (default) to 300 seconds.
        body["expiresIn"] = expires_in unless expires_in.nil?
        # A browser pairing by QR code (qr_pairings), confirmed on the phone: only that phone is asked, once.
        body["qrPairing"] = qr_pairing unless qr_pairing.to_s.empty?
        # Ask the person to type back on the phone a sign-in code another service sent them:
        # { kind: "code", key: Touchque::CodeReply.new_key["publicKey"], channel: "sms", target: "+**********26" }.
        # status(id)["reply"]["ct"] holds only the ciphertext: Touchque::CodeReply.open opens it. Not with qr_pairing.
        body["reply"] = Util.stringify(reply) if reply
        body["clientSignals"] = client_signals if client_signals && !client_signals.empty?
        # The page's device report from @touchque/web (deviceRisk.collect), when the workspace
        # turned Device risk on: its signals only ever ask for more.
        body["deviceRisk"] = device_risk unless device_risk.to_s.empty?
        body["deviceRiskRequestId"] = device_risk_request_id unless device_risk_request_id.to_s.empty?
        body["details"] = Util.stringify(details) if details && !details.empty?
        body["browserProof"] = browser_proof if browser_proof && !browser_proof.empty?
        body["context"] = Util.stringify(context) if context && !context.empty?
        body["securityChanges"] = self.class.security_changes_body(security_changes) if security_changes && !security_changes.empty?
        body["destination"] = Util.stringify(destination) if destination && !destination.empty?
        body["locale"] = locale if locale && !locale.empty?
        @http.post("/login/request", body)
      end

      # Times go out as ISO 8601 UTC; strings and epoch milliseconds as given.
      def self.security_changes_body(changes)
        changes.each_with_object({}) do |(kind, at), out|
          next if at.nil?

          out[kind.to_s] = at.respond_to?(:utc) ? at.utc.strftime("%Y-%m-%dT%H:%M:%S.%LZ") : at
        end
      end

      # Where a request is now: PENDING, CONFIRMED, REJECTED or EXPIRED.
      def status(request_id)
        @http.get("/login/status/#{Util.seg(request_id)}")
      end

      # Asks the phone and polls until the user approves or rejects (every 0.4 s, up to
      # +timeout+ seconds). With number matching the user picks a number on the phone:
      # +on_challenge+ (or the block) gets {"requestId", "challengeCode", "expiresAt",
      # "reasons", "caseCode"} right after the request exists and before any waiting.
      # Show +challengeCode+ to the user now; the phone asks for it. An error it raises
      # is logged and ignored.
      #
      # Raises PasskeyRequiredError (policy: no push was sent; step_up: tapped during a
      # call), RejectedError, or TimeoutError.
      def verify(external_username, type: "LOGIN", timeout: 30, poll_interval: 0.4, on_challenge: nil, **options, &block)
        on_challenge ||= block
        sent = request(external_username, type: type, **options)
        request_id = sent["requestId"]
        raise PasskeyRequiredError.new(request_id) if sent["requiresPasskey"]

        if on_challenge
          challenge = { "requestId" => request_id, "expiresAt" => sent["expiresAt"] }
          %w[challengeCode reasons caseCode].each { |k| challenge[k] = sent[k] if sent[k] && !(sent[k].respond_to?(:empty?) && sent[k].empty?) }
          begin
            on_challenge.call(challenge)
          rescue StandardError => e
            # The caller's callback must not stop the wait.
            Touchque.log :warn, "[Touchque] on_challenge failed: #{e.class}: #{e.message}"
          end
        end
        wait(request_id, sent["challengeCode"], timeout, poll_interval)
      end

      # Waits for a request you already sent.
      def wait_for_approval(request_id, timeout: 30, poll_interval: 0.4)
        wait(request_id, nil, timeout, poll_interval)
      end

      # Approves a pending request with one of the user's recovery codes (no phone).
      def approve_with_recovery_code(request_id, code)
        @http.post("/login/recovery", { "requestId" => request_id, "code" => code })
      end

      # Uses an approved request exactly once. The first call on a CONFIRMED request wins
      # atomically; every later call raises APIError with code +already_used+ (409).
      def consume(request_id)
        @http.post("/login/#{Util.seg(request_id)}/consume", {})
      end

      # Reports a request you later learned was fraud (a chargeback, a confirmed account
      # takeover, a scam the user was talked into). The risk engine learns from it; the
      # request's status does not change. A repeat answers "alreadyReported" => true.
      def report_fraud(request_id, reason: nil, note: nil)
        raise ConfigError, "report_fraud() needs the request id" if request_id.to_s.empty?

        @http.post("/login/#{Util.seg(request_id)}/report-fraud", Util.compact({ "reason" => reason, "note" => note }))
      end

      private

      def wait(request_id, challenge_code, timeout, interval)
        deadline = Time.now + timeout
        loop do
          s = status(request_id)
          case s["status"]
          when "CONFIRMED"
            return {
              "approved" => true, "status" => "CONFIRMED", "requestId" => request_id,
              "challengeCode" => challenge_code, "assurance" => s["assurance"], "confirmedVia" => s["confirmedVia"],
              # Vishing Shield: approved during a call; critical actions wait for the phone to re-confirm.
              "provisional" => s["provisional"] ? true : false
            }
          when "REJECTED" then raise RejectedError.new(request_id)
          when "EXPIRED" then raise TimeoutError.new("Touchque: request '#{request_id}' expired before it was approved.", request_id)
          end
          # Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
          raise PasskeyRequiredError.new(request_id, "step_up") if s["status"] == "PENDING" && s["requiresPasskey"]
          if Time.now + interval > deadline
            raise TimeoutError.new("Touchque: request '#{request_id}' was not approved within #{timeout}s. The user did not respond in time.", request_id)
          end

          sleep interval
        end
      end
    end

    # WebAuthn / FIDO2 (passkeys), the backend half: the ceremony runs in the browser
    # (@touchque/web); your backend relays its JSON through these methods.
    class WebAuthn
      def initialize(http)
        @http = http
      end

      # Registration step 1. +approval_request_id+: a PASSKEY_ENROLL request the user approved
      # on their linked phone (403 enrollment_approval_required otherwise).
      def register_options(external_username, discoverable: false, approval_request_id: nil)
        body = { "externalUsername" => external_username }
        body["discoverable"] = true if discoverable
        body["approvalRequestId"] = approval_request_id if approval_request_id && !approval_request_id.empty?
        @http.post("/webauthn/register/options", body)
      end

      def register_verify(external_username, response, label: nil)
        body = { "externalUsername" => external_username, "response" => response }
        body["label"] = label unless label.nil?
        @http.post("/webauthn/register/verify", body)
      end

      # Second factor: options scoped to a pending request.
      def authenticate_options(request_id)
        @http.post("/webauthn/login/options", { "requestId" => request_id })
      end

      def authenticate_verify(request_id, response)
        @http.post("/webauthn/login/verify", { "requestId" => request_id, "response" => response })
      end

      # Whether passkey sign-in (passwordlessLoginEnabled) is on for your workspace.
      # Ask before your sign-in page shows its passkey button and passkey autofill:
      # when it is off, primary_options answers 403 passwordless_login_disabled.
      # { "enabled" => bool, "userVerification" => "required" | "preferred" | nil }.
      def primary_availability
        raw = @http.get("/webauthn/authenticate/primary/availability") || {}
        enabled = raw["enabled"] == true
        uv = raw["userVerification"]
        { "enabled" => enabled, "userVerification" => enabled && %w[required preferred].include?(uv) ? uv : nil }
      end

      # Passwordless sign-in step 1; without a user, any passkey of your site (autofill).
      def primary_options(external_username = nil)
        @http.post("/webauthn/authenticate/primary/options", Util.compact({ "externalUsername" => external_username }))
      end

      def primary_verify(attempt_id, response)
        @http.post("/webauthn/authenticate/primary/verify", { "attemptId" => attempt_id, "response" => response })
      end

      def list_credentials(external_username)
        @http.get("/webauthn/credentials", { "externalUsername" => external_username })
      end

      # Scope the deletion to +external_username+ (recommended).
      def delete_credential(credential_record_id, external_username: nil)
        path = "/webauthn/credentials/#{Util.seg(credential_record_id)}"
        path += "?externalUsername=#{Util.seg(external_username)}" if external_username
        @http.delete(path)
      end
    end

    # Offline Sign: QR challenge and typed-code approvals that work with the phone offline.
    class Offline
      ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

      def initialize(http)
        @http = http
      end

      # An offline QR challenge. Always pass +request_id+ when the QR follows a push: a
      # phone-side rejection then kills the QR, and number matching carries over.
      def challenge(external_username, type: "LOGIN", details: nil, client_ip: nil, user_agent: nil,
                    ttl_seconds: nil, include_qr_image: true, request_id: nil, require_number_match: false)
        body = { "externalUsername" => external_username, "type" => type }
        body["details"] = Util.stringify(details) unless details.nil?
        body["clientIp"] = client_ip unless client_ip.nil?
        body["userAgent"] = user_agent unless user_agent.nil?
        body["ttlSeconds"] = ttl_seconds unless ttl_seconds.nil?
        body["includeQrImage"] = false unless include_qr_image
        body["requestId"] = request_id unless request_id.nil?
        body["requireNumberMatch"] = true if require_number_match
        @http.post("/offline/challenge", body)
      end

      # The 7-character code from the phone. Never raises for a wrong, expired or used code:
      # check "approved"; "reason" is invalid_code, locked, expired, used, unknown_challenge,
      # request_rejected, too_many_failures or device_not_enrolled.
      def verify(challenge_id, code)
        not_approved_as_result { @http.post("/offline/verify", { "challengeId" => challenge_id, "code" => code }) }
      end

      # The rolling time-based code. Refused for critical action types.
      def verify_totp(external_username, code, type: "LOGIN", client_ip: nil, request_id: nil)
        body = { "externalUsername" => external_username, "code" => code, "type" => type }
        body["clientIp"] = client_ip unless client_ip.nil?
        body["requestId"] = request_id unless request_id.nil?
        not_approved_as_result { @http.post("/offline/totp/verify", body) }
      end

      # Salted, slow digests of each user's next codes, for checking typed codes while your
      # server cannot reach Touchque. Check a code with Offline.match_totp_verifier.
      def totp_verifiers(external_usernames, from_step: nil, steps: nil)
        body = { "externalUsernames" => external_usernames.to_a }
        body["fromStep"] = from_step unless from_step.nil?
        body["steps"] = steps unless steps.nil?
        @http.post("/offline/totp/verifiers", body)
      end

      # The step a typed code belongs to (the current one or one either side), or nil,
      # without calling Touchque. Accept each step once.
      def self.match_totp_verifier(verifiers, user, code, at: nil)
        given = code.to_s.upcase.delete(" \t-")
        return nil unless given.length == 7 && given.chars.all? { |c| ALPHABET.include?(c) }

        step_seconds = verifiers["stepSeconds"].to_i
        length = verifiers.dig("kdf", "length").to_i
        return nil if step_seconds <= 0 || length <= 0

        salt = Util.b64_decode(user["salt"])
        digests = Util.b64_decode(user["digests"])
        now = (at || Time.now).to_i / step_seconds
        [now, now - 1, now + 1].each do |step|
          next if step < user["fromStep"].to_i || step > verifiers["notAfterStep"].to_i

          i = (step - user["fromStep"].to_i) * 2 * length
          next if i + 2 * length > digests.bytesize

          got = OpenSSL::KDF.pbkdf2_hmac(given, salt: salt + ":#{step}", iterations: verifiers.dig("kdf", "iterations").to_i, length: length, hash: "sha256")
          return step if Util.secure_compare(digests.byteslice(i, length), got) || Util.secure_compare(digests.byteslice(i + length, length), got)
        end
        nil
      end

      private

      def not_approved_as_result
        yield
      rescue APIError => e
        raise if e.status >= 500

        { "approved" => false, "reason" => e.reason || e.code || e.error, "attemptsLeft" => e.attempts_left }
      end
    end
  end
end

# ─────────────────────────────────────────────────────────────
# From lib/touchque/rails/guard.rb — require_touchque "ACTION" in a Rails controller
# ─────────────────────────────────────────────────────────────

# frozen_string_literal: true

module Touchque
  module Rails
    # One line per protected action:
    #
    #   class TransfersController < ApplicationController
    #     include Touchque::Rails::Guard
    #     require_touchque "SEND_MONEY", only: :create,
    #                      details: -> { { "Amount" => params.require(:amount), "To" => params.require(:to) } }
    #
    #     def create
    #       touchque_approval # the approval, once the user approved on their phone
    #     end
    #   end
    #
    # Until the user approves this answers 202 {"touchque": step, "token": "..."}; your page
    # shows the step and sends the same request again with header X-Touchque-Token (the
    # @touchque/web loop). Once approved the action runs ONCE. Refusals answer 403 / 408 /
    # 423 / 429 with Retry-After. Options: user: (default: current_user's email, id or
    # username; for your login action, whoever just passed your password check), details:,
    # reference_id:, context: (procs run in the controller, or method names),
    # silent_sign_in: (true or { max_age_seconds: }), enroll:, error_body:, and
    # before_action's only: / except: / if: / unless:.
    #
    # Every answer of 400 and above carries X-Touchque-State (and X-Touchque-Reason when the
    # step has a reason).
    #
    # error_body: your own error shape for every answer of 400 and above (never a 202 step,
    # never an approval): a proc run in the controller, or a method name, given the refusal
    # ({ status:, code:, message:, touchque: }, with a copy of the step). What it encodes to
    # decides: a JSON object (a Hash, Struct, Data...) is sent with "touchque" set to the
    # step; anything else as it is. Status and headers stay; one that raises, or a result
    # that cannot be encoded, is logged and the default body sent.
    #
    #   require_touchque "SEND_MONEY", error_body: ->(r) { { message: r[:message], code: r[:code] } }
    #
    # Touchque.client is built on the first request: without TQ_API_KEY / TQ_API_SECRET the
    # action answers 500 misconfigured (401 without a signed-in user) and never runs.
    module Guard
      def self.included(base)
        base.extend(ClassMethods)
      end

      module ClassMethods
        def require_touchque(action, user: nil, details: nil, reference_id: nil, context: nil, silent_sign_in: false, enroll: true,
                             error_body: nil, **filter_options)
          Touchque::Guard.assert_silent_sign_in!(silent_sign_in, "require_touchque")
          unless error_body.nil? || error_body.is_a?(Symbol) || error_body.respond_to?(:call)
            raise ArgumentError, "require_touchque: error_body must be a proc, a method name or respond to call."
          end

          options = { user: user, details: details, reference_id: reference_id, context: context, silent_sign_in: silent_sign_in,
                      enroll: enroll, error_body: error_body }
          before_action(**filter_options) { touchque_guard!(action, options) }
        end
      end

      # The approval of this request (set by require_touchque), or nil.
      def touchque_approval
        request.env["touchque.approval"]
      end

      private

      def touchque_guard!(action, options)
        user = touchque_value(options[:user]) || touchque_default_user
        client = Touchque::Guard.default_client
        result = if client.nil?
                   # No client (TQ_API_KEY / TQ_API_SECRET missing): an answer, never an exception.
                   user.to_s.empty? ? Touchque::Guard.unauthenticated : Touchque::Guard.misconfigured
                 else
                   header = ->(name) { request.headers[name] }
                   input = Touchque::Guard.input_from_headers(header)
                   silent = options[:silent_sign_in]
                   Touchque::Guard.run(
                     client, user, action,
                     details: touchque_value(options[:details]), reference_id: touchque_value(options[:reference_id]),
                     ip: request.remote_ip, user_agent: request.user_agent, token: input[:token], offline: input[:offline],
                     code: input[:code], code_type: input[:code_type], enroll: options[:enroll],
                     browser_proof: Touchque::Guard.silent_on?(silent) ? header.call(Touchque::Guard::BROWSER_HEADER) : nil,
                     silent_sign_in: silent, context: touchque_value(options[:context])
                   )
                 end
        if result[:approved]
          request.env["touchque.approval"] = result[:approved]
          return
        end
        Touchque::Guard.headers(result).each { |name, value| response.headers[name] = value }
        render json: touchque_body(result, options[:error_body]), status: result[:status]
      end

      # The guard's body, or error_body's (JSON text; the default body when it fails) for an
      # answer of 400 and above.
      def touchque_body(result, error_body)
        return result[:body] if error_body.nil? || result[:status] < 400

        Touchque::Guard.error_body(result, lambda { |refusal|
          case error_body
          when Proc then instance_exec(refusal, &error_body)
          when Symbol then send(error_body, refusal)
          else error_body.call(refusal)
          end
        })
      end

      def touchque_value(option)
        case option
        when Proc then instance_exec(&option)
        when Symbol then send(option)
        else option
        end
      end

      # The signed-in user: current_user's email, id or username.
      def touchque_default_user
        user = respond_to?(:current_user, true) ? send(:current_user) : nil
        return nil unless user

        %i[email id username].each do |m|
          value = user.respond_to?(m) ? user.public_send(m) : nil
          return value.to_s unless value.nil? || value.to_s.empty?
        end
        nil
      end
    end

    # Verified webhooks in a controller:
    #
    #   class TouchqueWebhooksController < ActionController::API
    #     include Touchque::Rails::Webhook
    #     verify_touchque_webhook
    #
    #     def create
    #       EndSession.call(touchque_webhook["requestId"]) if touchque_webhook["event"] == Touchque::Resources::Webhook::EVENT_APPROVAL_REVOKED
    #       head :ok
    #     end
    #   end
    #
    # A bad signature or an old timestamp answers 401 before your action; a replay of a
    # delivery already accepted answers 200 without running it again (Touchque.replay_cache:
    # in-process by default; set one over Redis when you run several processes).
    module Webhook
      def self.included(base)
        base.extend(ClassMethods)
        base.skip_forgery_protection if base.respond_to?(:skip_forgery_protection)
      end

      module ClassMethods
        def verify_touchque_webhook(tolerance_seconds: Touchque::Resources::Webhook::DEFAULT_TOLERANCE_SECONDS, **filter_options)
          before_action(**filter_options) { touchque_verify_webhook!(tolerance_seconds) }
        end
      end

      # The verified payload of this request.
      def touchque_webhook
        @touchque_webhook
      end

      private

      def touchque_verify_webhook!(tolerance_seconds)
        @touchque_webhook = Touchque.client.webhook.verify(request.raw_post, request.headers["x-signature"],
                                                           tolerance_seconds: tolerance_seconds, replay_cache: Touchque.replay_cache)
      rescue Touchque::WebhookReplayError
        render json: { received: true, duplicate: true }, status: :ok
      rescue Touchque::WebhookSignatureError
        render json: { error: "invalid_signature" }, status: :unauthorized
      end
    end
  end
end

# ─────────────────────────────────────────────────────────────
# From lib/touchque/relay.rb — the relay routes @touchque/web calls (public part)
# ─────────────────────────────────────────────────────────────

# frozen_string_literal: true

module Touchque
  # What the relay wants sent back: a status, a JSON body and headers. +on_authenticated+
  # receives the pending success response and may change it (e.g. add a Set-Cookie);
  # the handler sets the body afterwards.
  class RelayResponse
    attr_accessor :status, :body
    attr_reader :headers

    def initialize(status = 200, body = {})
      @status = status
      @body = body
      @headers = []
    end

    # Sets a header, replacing any value it had.
    def set_header(name, value)
      @headers.reject! { |(n, _)| n.casecmp?(name) }
      @headers << [name, value.to_s]
      self
    end

    # Adds a header value, keeping existing ones (several Set-Cookie).
    def add_header(name, value)
      @headers << [name, value.to_s]
      self
    end

    def header(name)
      @headers.find { |(n, _)| n.casecmp?(name) }&.last
    end

    def to_json(*)
      Util.json(@body)
    end
  end

  # Counters for the relay's rate limits. +hit+ must atomically count one hit for +key+
  # in its fixed window and return [count, reset_at_ms]. Several processes (Puma
  # clusters, several hosts): implement it over Redis (INCR + PEXPIRE, then PTTL).
  class MemoryRateLimitStore
    def initialize(max_entries: 50_000)
      @max_entries = [max_entries, 2].max
      @entries = {}
      @lock = Mutex.new
    end

    def hit(key, window_ms, now_ms)
      @lock.synchronize do
        count, reset_at = @entries[key]
        if count.nil? || reset_at <= now_ms
          prune(now_ms) if count.nil? && @entries.size >= @max_entries
          count = 0
          reset_at = now_ms + window_ms
        end
        @entries[key] = [count + 1, reset_at]
      end
    end

    # ... private route handlers omitted
  end
end

# ─────────────────────────────────────────────────────────────
# From lib/touchque/rack/relay.rb — mount Touchque::Rack::Relay.new(...) => "/touchque"
# ─────────────────────────────────────────────────────────────

# frozen_string_literal: true

require "rack"

module Touchque
  module Rack
    # The relay as a Rack app: mount it wherever your frontend (@touchque/web) expects it.
    #
    #   # Rails, config/routes.rb
    #   mount Touchque::Rack::Relay.new(
    #     get_user_id: ->(req) { req.session["user_email"] },
    #     get_login_user: ->(req) { req.session["password_verified_user"] },
    #     on_authenticated: ->(req, response, info) { req.session["user_email"] = info["externalUsername"] }
    #   ) => "/touchque"
    #
    #   # Sinatra / plain Rack
    #   map("/touchque") { run Touchque::Rack::Relay.new(get_user_id: ->(req) { req.session["user"] }) }
    #
    # The callbacks get the Rack::Request (its session is the app's session). The client IP
    # is Rack::Request#ip: configure trusted proxies when you run behind a load balancer.
    # See Touchque::RelayHandler for the routes and options.
    class Relay
      MAX_BODY_BYTES = 64 * 1024

      def initialize(client: nil, **options)
        @client = client
        @options = options
        @handler = nil
        @lock = Mutex.new
      end

      def call(env)
        req = ::Rack::Request.new(env)
        body = {}
        if req.post? && req.media_type == "application/json"
          raw = req.body&.read(MAX_BODY_BYTES + 1).to_s
          return json(413, { "error" => "body_too_large" }) if raw.bytesize > MAX_BODY_BYTES

          parsed = raw.empty? ? {} : Util.parse_json(raw)
          return json(400, { "error" => "invalid_json" }) if parsed.nil?

          body = parsed.is_a?(Hash) ? parsed : {}
        end
        res = handler.handle(
          method: req.request_method, path: req.path_info, body: body, ip: req.ip.to_s, user_agent: req.user_agent,
          header: ->(name) { env["HTTP_#{name.upcase.tr("-", "_")}"] }, request: req
        )
        return json(404, { "error" => "not_found" }) unless res

        headers = {}
        res.headers.each do |(name, value)|
          key = name.downcase
          headers[key] = headers.key?(key) ? join(headers[key], value) : value
        end
        json(res.status, res.body, headers)
      end

      private

      # Built on the first request, so Touchque.client can be configured after the routes load.
      def handler
        @handler || @lock.synchronize { @handler ||= RelayHandler.new(@client || Touchque.client, **@options) }
      end

      def join(previous, value)
        # Rack 3 takes several values as an Array; Rack 2 as lines.
        ::Rack.release.to_f >= 3 ? Array(previous) + [value] : "#{previous}\n#{value}"
      end

      def json(status, body, headers = {})
        [status, { "content-type" => "application/json; charset=utf-8" }.merge(headers), [Util.json(body)]]
      end
    end
  end
end
