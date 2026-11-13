# Touchque Python SDK — bundled type/API reference for AI assistants.
# Concatenation of touchque-python/touchque/{__init__.py,config.py,client.py,steps.py,approval_proof.py,
# resources/login.py,resources/offline.py,contrib/flask.py,contrib/fastapi.py,contrib/django.py}
# plus the public part of touchque/relay.py (RelayHandler).
# Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

# ─────────────────────────────────────────────────────────────
# From touchque/__init__.py — everything importable from `touchque`
# ─────────────────────────────────────────────────────────────

import logging as _logging

from .config import Config
from .client import Touchque, get_default_client, set_default_client
from .exceptions import (
    TouchqueException,
    TouchqueAPIException,
    TouchqueFeatureException,
    TouchqueFeatureNotInPlanException,
    TouchqueFeatureReadOnlyException,
    TouchqueFeatureOffException,
    TouchqueNetworkException,
    TouchqueTimeoutException,
    TouchqueRejectedException,
    TouchqueWebhookSignatureException,
    TouchqueWebhookReplayException,
    TouchqueConfigException,
    TouchquePasskeyRequiredError,
    TouchqueApprovalError,
    TouchqueApprovalMismatchError,
)
from .resources.webhook import ReplayCache, MemoryReplayCache, WebhookReasons, WebhookEvents
from .steps import normalize_details, details_digest
from .approval_proof import verify_approval_proof
from .code_reply import new_code_reply_key, open_code_reply
from .safe_guard import (
    safe_approval_message, safe_display_digest, safe_governance_hash, safe_schedule_call, safe_tx_hash, verify_safe_approval,
    with_safe_approvals,
)
from .guard import (
    run_guard, is_status_poll, guard_input_from_headers, guard_response, guard_response_body, guard_response_headers,
    silent_input_from_headers, BeforeStart, ErrorBody, BROWSER_HEADER,
)
from .resources.risk import parse_risk_check
from .resources.recovery import is_recovery_open
from .resources.mobile import is_mobile_push_expired, mobile_push_from_webhook
from .resources.assist import is_assist_check_passed
from .resources.qr_pairings import QR_PAIRING_REFUSAL_REASONS, qr_pairing_uri
from .resources.device_risk import DEVICE_RISK_EVENTS, DEVICE_RISK_REPORTS, parse_device_risk_check
from .resources.action_types import SECOND_THOUGHT_QUESTIONS
from .relay import RelayHandler, RelayResponse, RELAY_ROUTES
from .rate_limiter import FixedWindowLimiter
from .agent import TouchqueAgent, generate_agent_key, jwk_thumbprint
from .agent_frameworks import (
    ApprovalPolicy, approve_interruptions_with_touchque, current_approval, guard_mcp_session, require_agent_approval,
    touchque_can_use_tool, with_touchque_approval,
)
from .org_agent import TouchqueOrgAgent, file_token, github_actions_token
from .mcp_auth import McpAuth, McpAuthError
from .cross_app_access import (
    ID_JAG_TOKEN_TYPE, IdJagError, IdJagVerifier, redeem_id_jag, request_id_jag,
)
from .security_events import (
    SECURITY_EVENT_TYPES, SecurityEvent, SecurityEventError, SecurityEventVerifier, poll_security_events,
)
from .agent_card import AgentCardError, canonical_json, sign_agent_card, verify_agent_card
from .approval_token import matches_authorization_details, verify_approval_token_with
from .hosted_login import HostedLogin, HostedLoginError, AuthorizationRequest, TokenSet, UserApprovalRequest, CONNECTION_TOKEN_TYPE
from .my_account import MyAccount, MyAccountError

__all__ = [
    'Touchque',
    'Config',
    'get_default_client',
    'set_default_client',
    'TouchqueException',
    'TouchqueAPIException',
    'TouchqueFeatureException',
    'TouchqueFeatureNotInPlanException',
    'TouchqueFeatureReadOnlyException',
    'TouchqueFeatureOffException',
    'TouchqueNetworkException',
    'TouchqueTimeoutException',
    'TouchqueRejectedException',
    'TouchqueWebhookSignatureException',
    'TouchqueWebhookReplayException',
    'ReplayCache',
    'MemoryReplayCache',
    'WebhookReasons',
    'WebhookEvents',
    'TouchqueConfigException',
    'TouchquePasskeyRequiredError',
    'normalize_details',
    'details_digest',
    'verify_approval_proof',
    'new_code_reply_key',
    'open_code_reply',
    'safe_tx_hash',
    'safe_governance_hash',
    'safe_approval_message',
    'safe_display_digest',
    'verify_safe_approval',
    'with_safe_approvals',
    'safe_schedule_call',
    'run_guard',
    'is_status_poll',
    'BeforeStart',
    'guard_input_from_headers',
    'guard_response',
    'guard_response_body',
    'guard_response_headers',
    'ErrorBody',
    'silent_input_from_headers',
    'BROWSER_HEADER',
    'parse_risk_check',
    'is_recovery_open',
    'is_mobile_push_expired',
    'mobile_push_from_webhook',
    'is_assist_check_passed',
    'QR_PAIRING_REFUSAL_REASONS',
    'qr_pairing_uri',
    'DEVICE_RISK_EVENTS',
    'DEVICE_RISK_REPORTS',
    'parse_device_risk_check',
    'SECOND_THOUGHT_QUESTIONS',
    'RelayHandler',
    'RelayResponse',
    'RELAY_ROUTES',
    'FixedWindowLimiter',
    'TouchqueAgent',
    'ApprovalPolicy',
    'with_touchque_approval',
    'current_approval',
    'require_agent_approval',
    'approve_interruptions_with_touchque',
    'touchque_can_use_tool',
    'guard_mcp_session',
    'generate_agent_key',
    'TouchqueOrgAgent',
    'github_actions_token',
    'file_token',
    'McpAuth',
    'McpAuthError',
    'ID_JAG_TOKEN_TYPE',
    'IdJagError',
    'IdJagVerifier',
    'SECURITY_EVENT_TYPES', 'SecurityEvent', 'SecurityEventError', 'SecurityEventVerifier', 'poll_security_events',
    'request_id_jag',
    'redeem_id_jag',
    'AgentCardError',
    'canonical_json',
    'sign_agent_card',
    'verify_agent_card',
    'jwk_thumbprint',
    'HostedLogin',
    'CONNECTION_TOKEN_TYPE',
    'HostedLoginError',
    'UserApprovalRequest',
    'MyAccount',
    'MyAccountError',
    'AuthorizationRequest',
    'TokenSet',
]

# The SDK's own problems (a misconfigured guard, a failed on_challenge, a relay without
# get_login_user) go to logging.getLogger('touchque'). Silent by default: nothing is printed
# unless your app configures logging (logging.basicConfig, or a handler on 'touchque').
_logging.getLogger('touchque').addHandler(_logging.NullHandler())

# ─────────────────────────────────────────────────────────────
# From touchque/config.py
# ─────────────────────────────────────────────────────────────

import os
from urllib.parse import urlparse

from .exceptions import TouchqueConfigException

_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
DEFAULT_BASE_URL = "https://api.touchque.com"


def _assert_safe_base_url(base_url: str) -> None:
    """Allow plaintext http only for localhost / loopback (local development)."""
    parsed = urlparse(base_url)
    if parsed.scheme == "https":
        return
    if parsed.scheme == "http" and (parsed.hostname or "").lower() in _LOCAL_HOSTS:
        return
    if parsed.scheme == "http":
        raise TouchqueConfigException(
            f'Refusing a plaintext http:// base_url for "{parsed.hostname}". '
            "The API key and request signature would be sent in the clear — use https://."
        )
    raise TouchqueConfigException(f"base_url must be http(s): {base_url}")


class Config:
    def __init__(
        self,
        api_key: str = None,
        api_secret: str = None,
        base_url: str = None,
        timeout: int = 10000,
    ):
        """
        Falls back to the environment when an argument is omitted:
        ``TQ_API_KEY``, ``TQ_API_SECRET``, ``TQ_API_URL`` (default
        ``https://api.touchque.com``).
        """
        api_key = api_key if api_key is not None else os.environ.get("TQ_API_KEY")
        api_secret = api_secret if api_secret is not None else os.environ.get("TQ_API_SECRET")
        base_url = base_url if base_url is not None else os.environ.get("TQ_API_URL", DEFAULT_BASE_URL)

        if not api_key or not api_secret:
            raise TouchqueConfigException(
                "Set TQ_API_KEY and TQ_API_SECRET (or pass api_key=/api_secret=)."
            )
        if not api_key.startswith('tq_'):
            raise TouchqueConfigException(
                'api_key must start with "tq_". Did you accidentally swap api_key and api_secret?'
            )

        _assert_safe_base_url(base_url)

        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

# ─────────────────────────────────────────────────────────────
# From touchque/client.py — the Touchque client class
# ─────────────────────────────────────────────────────────────

import threading
from typing import Any, Dict, Optional

from .config import Config
from .http_client import HttpClient
from .resources.action_types import ActionTypes
from .resources.actions import Actions
from .resources.agents import Agents
from .resources.identity import Identity
from .resources.auth import Auth
from .resources.login import Login
from .resources.offline import Offline
from .resources.risk import Risk
from .resources.recovery import Recovery
from .resources.mobile import Mobile
from .resources.qr_pairings import QrPairings
from .resources.device_risk import DeviceRisk
from .resources.safe_guard import SafeGuard
from .resources.assist import Assist
from .resources.webauthn import WebAuthn
from .resources.webhook import Webhook
from .steps import LoginDetails, check as _check, complete as _complete, start as _start


class Touchque:
    """
    Touchque SDK client.

        # .env: TQ_API_KEY=tq_...  TQ_API_SECRET=...
        client = Touchque()                                   # from the environment
        client = Touchque(Config(api_key=..., api_secret=...))  # explicit

    One line per protected route (see ``touchque.contrib`` for Django /
    FastAPI / Flask adapters, or call ``client.start`` / ``client.check`` /
    ``client.complete`` yourself for any framework).
    """

    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self._api_secret = self.config.api_secret
        http = self._http_client()

        self.auth = Auth(http)
        self.login = Login(http)
        self.webauthn = WebAuthn(http)
        self.webhook = Webhook(self.config)
        self.offline = Offline(http)
        #: Action types: what users approve (LOGIN, SEND_MONEY…). Was ``actions`` before 4.0.
        self.action_types = ActionTypes(http)
        #: Touchque Actions: your own code in the approval pipeline.
        self.actions = Actions(http)
        #: Silent sign-ins: should this sign-in ask the phone, and which browsers Touchque knows.
        self.risk = Risk(http)
        #: Never Locked Out: move a user whose phone is gone to a new phone, with colleagues vouching.
        self.recovery = Recovery(http)
        #: Help desk: IT working on a person's account in the open, and checks on their phone before sensitive actions.
        self.assist = Assist(http)
        #: AI agents as identities of their own: register (public key), suspend, revoke, kill switch.
        #: The agent itself uses ``touchque.TouchqueAgent``.
        self.agents = Agents(http)
        # Touchque Login Management API: customers' accounts, roles, organizations, apps
        self.identity = Identity(http)
        #: Mobile SDK: your own iOS/Android app approves for your users (enrollment tokens, devices, settings).
        self.mobile = Mobile(http)
        #: Pairing a browser by QR code: the phone that scans it is the one asked to approve.
        self.qr_pairings = QrPairings(http)
        #: Device risk: the device on your sign-up, reset, sign-in or approval page (a paid add-on).
        self.device_risk = DeviceRisk(http)
        #: Safe Guard: Safe transactions approved on the approver's phone, for TouchqueSafeGuard.
        self.safe_guard = SafeGuard(http)

    def _http_client(self) -> HttpClient:
        """What every resource sends its calls through (``touchque.testing``'s fake answers them in memory)."""
        return HttpClient(self.config)

    # ── headless step-up (see touchque.steps / touchque.guard) ─────────────

    def start(self, action: str, user: str, details: Optional[LoginDetails] = None,
              reference_id: Optional[str] = None, ip: Optional[str] = None,
              user_agent: Optional[str] = None, browser_proof: Optional[str] = None) -> Dict[str, Any]:
        """Starts an approval and returns immediately — show the step in your
        UI. ``waiting`` + ``number``: show the number, the user picks it on
        the phone. ``enroll``: show ``enroll['qrCodeDataUrl']`` so the user
        links the Touchque app first. ``browser_proof``: the browser's
        ``X-Touchque-Browser`` proof, so the approval makes the browser known
        (silent sign-ins, see ``risk.check``)."""
        return _start(self, action, user, details=details, reference_id=reference_id, ip=ip, user_agent=user_agent,
                      browser_proof=browser_proof)

    def check(self, request_id: str) -> Dict[str, Any]:
        """Where a started approval is now: waiting, approved, rejected, expired…"""
        return _check(self, request_id)

    def complete(self, request_id: str, user: str, action: str, details: Optional[LoginDetails] = None,
                 reference_id: Optional[str] = None) -> Dict[str, Any]:
        """Uses an approved request exactly once, after checking it is for
        this user, action and transaction. Call it right before doing the
        protected thing."""
        return _complete(self, request_id, user, action, details=details, reference_id=reference_id)


_default_client: Optional[Touchque] = None
# Guards building and replacing the default client, so a client set during the first build is never lost.
_default_lock = threading.Lock()


def get_default_client() -> Touchque:
    """The client built from TQ_API_KEY / TQ_API_SECRET, created on first use
    and kept, so the environment is read once per process unless
    ``set_default_client`` resets it. Raises ``TouchqueConfigException``
    while they are not set: call it at startup to fail fast. The adapters,
    ``run_guard(None, ...)`` and ``is_status_poll(None, ...)`` use it when
    given no ``client``; ``touchque.testing.FakeTouchque().install()``
    replaces it in tests."""
    global _default_client
    client = _default_client
    if client is not None:
        return client
    with _default_lock:  # built once, and never over a client set meanwhile
        if _default_client is None:
            _default_client = Touchque()
        return _default_client


def set_default_client(client: Optional[Touchque]) -> None:
    """Makes ``client`` the default client (``get_default_client()``) that
    the adapters, ``run_guard(None, ...)`` and ``is_status_poll(None, ...)``
    use: your own ``Touchque`` (another ``Config``: base URL, timeout).
    ``None`` forgets it, so the next call builds it again from
    ``TQ_API_KEY`` / ``TQ_API_SECRET`` / ``TQ_API_URL`` (a test that changes
    them, a rotated key). The SDK's own lines go to
    ``logging.getLogger('touchque')`` whichever client is used."""
    _swap_default_client(client)


def _swap_default_client(client: Optional[Touchque]) -> Optional[Touchque]:
    """Sets the default client under ``_default_lock``; returns the one it replaced."""
    global _default_client
    with _default_lock:
        previous, _default_client = _default_client, client
        return previous

# ─────────────────────────────────────────────────────────────
# From touchque/steps.py — the headless step-up flow
# ─────────────────────────────────────────────────────────────

"""
The headless step-up flow shared by every integration (Django, FastAPI,
Flask, or your own framework): start -> show the step in YOUR UI -> check ->
complete exactly once.

A "step" is plain JSON-serializable data: what state the approval is in and
whatever the user has to see (the matching number, the enrollment QR code,
the offline QR code). It never contains API secrets.
"""
import base64
import calendar
import hashlib
import hmac
import json
import re
import time
from typing import Any, Dict, List, Optional, Union

from .exceptions import TouchqueAPIException, TouchqueConfigException, TouchqueException
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .client import Touchque

LoginDetails = Union[Dict[str, Any], List[Dict[str, Any]]]

# States: waiting | approved | rejected | expired | enroll | passkey_required
#         | offline | blocked | frozen | rate_limited


def normalize_details(details: Optional[LoginDetails]) -> List[Dict[str, str]]:
    """Same normalization the API does: a dict or a list of {label, value} -> [{label, value}] strings."""
    if not details:
        return []
    if isinstance(details, list):
        pairs = [(d['label'], d['value']) for d in details]
    else:
        pairs = list(details.items())
    return [{'label': str(label).strip(), 'value': str(value).strip()} for label, value in pairs]


def details_digest(details: Optional[LoginDetails]) -> str:
    pairs = normalize_details(details)
    if not pairs:
        return ''
    canonical = '\x1e'.join(f"{p['label']}\x1f{p['value']}" for p in pairs)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def _err_code(err: TouchqueAPIException) -> Optional[str]:
    return err.code or (err.data or {}).get('error')


def _why(res: Dict[str, Any]) -> Dict[str, Any]:
    """"Why?": the case code (``K7P-2QX``) and plain reasons of a login request's
    answer, for its step. Both are safe for the browser: show the code with the
    step ("Tell your support team: K7P-2QX")."""
    out: Dict[str, Any] = {}
    if isinstance(res.get('caseCode'), str) and res['caseCode']:
        out['caseCode'] = res['caseCode']
    reasons = [{'code': r['code'], 'text': r.get('text') if isinstance(r.get('text'), str) else ''}
               for r in (res.get('reasons') or []) if isinstance(r, dict) and isinstance(r.get('code'), str)]
    if reasons:
        out['reasons'] = reasons
    return out


def start(client: 'Touchque', action: str, user: str, details: Optional[LoginDetails] = None,
          reference_id: Optional[str] = None, ip: Optional[str] = None, user_agent: Optional[str] = None,
          enroll: bool = True, browser_proof: Optional[str] = None,
          context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Starts an approval for `action` — never waits.

    ``enroll=False``: a user with no phone linked gets
    ``{'state': 'enroll', 'reason': 'enrollment_off'}`` instead of a first-time QR.

    ``browser_proof`` (silent sign-ins): the browser's device-bound key proof
    (``X-Touchque-Browser``), passed through untouched. Once the user
    approves, Touchque knows this browser."""
    if not user:
        raise TouchqueConfigException('start() needs the user id')
    norm = normalize_details(details)
    try:
        res = client.login.request(
            user, type=action, reference_id=reference_id, client_ip=ip, user_agent=user_agent,
            details=norm or None, browser_proof=browser_proof, context=context,
        )
        canary = res.get('canary')
        canary = {'url': canary['url']} if isinstance(canary, dict) and isinstance(canary.get('url'), str) else None
        if res.get('requiresPasskey'):
            step = {'state': 'passkey_required', 'requestId': res.get('requestId'),
                    'expiresAt': res.get('expiresAt'), 'details': norm or None, **_why(res)}
            if canary:
                step['canary'] = canary
            return step
        step = {
            'state': 'waiting', 'requestId': res.get('requestId'), 'number': res.get('challengeCode'),
            'expiresAt': res.get('expiresAt'), 'details': norm or None, **_why(res),
        }
        if res.get('telemetryToken'):
            # Only when the workspace collects behavioural signals: lets the browser post
            # them for this one request (@touchque/web does it when given `telemetry`).
            step['telemetryToken'] = res['telemetryToken']
        if canary:
            # Mirror Alarm: the page showing this step loads the canary (@touchque/web does it), so
            # a phishing proxy in front of your site gets the approval refused. Only on this first step.
            step['canary'] = canary
        return step
    except TouchqueAPIException as err:
        code = _err_code(err)
        why = {'caseCode': err.case_code} if err.case_code else {}
        if err.status == 404 and (code == 'device_not_linked' or 'linked device' in str(err).lower()):
            if not enroll:
                # No phone, and this guard may not show a QR: say so, so the page stops polling.
                return {'state': 'enroll', 'reason': 'enrollment_off'}
            return _enroll_step(client, user)
        if err.status == 423:
            return {'state': 'frozen', 'retryAfter': err.retry_after, **why}
        if err.status == 429:
            return {'state': 'rate_limited', 'retryAfter': err.retry_after, **why}
        if err.status == 400 and (code == 'unknown_action' or 'invalid action type' in str(err).lower()):
            raise TouchqueConfigException(
                f'Unknown action "{action}". Create it once with client.action_types.define("{action}") '
                'or in the Dashboard (Action Types).'
            ) from err
        if err.status == 403:
            reason = (err.reason if code == 'blocked' else None) \
                or ('passkey_not_registered' if code in ('passkey_not_registered',) or (err.data or {}).get('error') == 'phishing_resistant_required' else None) \
                or ('action_disabled' if code == 'action_disabled' else None) \
                or code or 'blocked'
            return {'state': 'blocked', 'reason': reason, **why}
        raise


_ISO_8601 = re.compile(
    r'(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|z|[+-]\d{2}:?\d{2})?')


def _iso_ms(value: Any) -> Optional[int]:
    """An ISO 8601 date-time (``2026-11-12T10:05:00.000Z``) as ms since the
    epoch, or ``None`` when it is not one. No zone means UTC."""
    m = _ISO_8601.fullmatch(value) if isinstance(value, str) else None
    if not m:
        return None
    year, month, day, hour, minute, second = (int(g) for g in m.groups()[:6])
    if not (1 <= month <= 12 and 1 <= day <= 31 and hour < 24 and minute < 60 and second < 61):
        return None
    try:
        secs = calendar.timegm((year, month, day, hour, minute, second))
    except (ValueError, OverflowError):
        return None
    zone = m.group(8)
    if zone and zone not in ('Z', 'z'):
        digits = zone[1:].replace(':', '')
        offset = int(digits[:2]) * 3600 + int(digits[2:]) * 60
        secs += offset if zone[0] == '-' else -offset
    return secs * 1000 + int((m.group(7) or '0')[:3].ljust(3, '0'))


def _iso_from_ms(ms: int) -> str:
    """ms since the epoch as ISO 8601 in UTC, like JavaScript's toISOString()."""
    return time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(ms // 1000)) + '.%03dZ' % (ms % 1000)


def _enroll_expiry(res: Dict[str, Any]) -> Optional[str]:
    """When the first-time QR stops working: the API's ``expiresAt`` when it is
    ISO 8601, else now + ``ttlMs`` when positive, else ``None``."""
    if _iso_ms(res.get('expiresAt')) is not None:
        return res['expiresAt']
    ttl = res.get('ttlMs')
    if isinstance(ttl, (int, float)) and not isinstance(ttl, bool) and ttl > 0:
        return _iso_from_ms(int(time.time() * 1000) + int(ttl))
    return None


def _enroll_qr(res: Dict[str, Any]) -> Dict[str, Any]:
    enroll = {'qrCodeDataUrl': res.get('qrCodeDataUrl'), 'recoveryCodes': res.get('recoveryCodes')}
    expires_at = _enroll_expiry(res)
    if expires_at:
        # The guard binds it to its token (claim "ee"), so polls keep this QR instead of making a new one.
        enroll['expiresAt'] = expires_at
    return {'state': 'enroll', 'enroll': enroll}


def _enroll_step(client: 'Touchque', user: str) -> Dict[str, Any]:
    """First-time linking. Never unlinks a phone: a secret is only re-issued
    when the account is confirmed NOT linked."""
    try:
        return _enroll_qr(client.auth.generate_secret(user))
    except TouchqueAPIException as err:
        if err.status != 409:
            raise
        try:
            current = client.auth.get_user(user)
        except TouchqueAPIException:
            current = None
        if current and (current.get('used') or current.get('deviceId')):
            return {'state': 'enroll', 'reason': 'already_linked'}
        return _enroll_qr(client.auth.reset_secret(user))


_STATE_MAP = {'PENDING': 'waiting', 'CONFIRMED': 'approved', 'REJECTED': 'rejected', 'EXPIRED': 'expired'}


def check(client: 'Touchque', request_id: str) -> Dict[str, Any]:
    """Current state of a started approval, with the request's live
    ``expiresAt`` when the API gives it (a Vishing Shield escalation to a
    passkey extends it)."""
    s = client.login.status(request_id)
    state = 'passkey_required' if s.get('status') == 'PENDING' and s.get('requiresPasskey') \
        else _STATE_MAP.get(s.get('status'), 'waiting')
    step: Dict[str, Any] = {'state': state, 'requestId': request_id}
    if isinstance(s.get('expiresAt'), str) and s['expiresAt']:
        step['expiresAt'] = s['expiresAt']
    if state == 'approved' and s.get('assurance'):
        step['assurance'] = s['assurance']
    return step


def complete(client: 'Touchque', request_id: str, user: str, action: str,
             details: Optional[LoginDetails] = None, reference_id: Optional[str] = None) -> Dict[str, Any]:
    """Uses an approved request exactly once and checks it is for THIS user,
    action and transaction. Raises TouchqueException if it was already used,
    not approved, or approved for something else."""
    res = client.login.consume(request_id)
    same_user = str(res.get('externalUsername', '')).lower() == str(user).lower()
    same_details = details_digest(details) == details_digest(res.get('details') or [])
    same_ref = (res.get('referenceId') or None) == (reference_id or None)
    if not same_user or res.get('type') != action or not same_details or not same_ref:
        raise TouchqueException('Touchque: this approval is for a different user, action or transaction.')
    approval = {
        'requestId': request_id,
        'user': res.get('externalUsername'),
        'action': res.get('type'),
        'assurance': res.get('assurance'),
        'confirmedVia': res.get('confirmedVia'),
        'approvalProof': res.get('approvalProof'),
    }
    if 'provisional' in res:
        # Vishing Shield: approved during a call. Let the user in, but treat the session as limited:
        # critical actions are refused until APPROVAL_RECONFIRMED, and APPROVAL_REVOKED means end it.
        approval.update({
            'provisional': bool(res.get('provisional')), 'revoked': bool(res.get('revoked')),
            'revokeReason': res.get('revokeReason'), 'reconfirmedAt': res.get('reconfirmedAt'),
        })
    return approval


# ── Guard token ──────────────────────────────────────────────────────────
# The browser echoes this back while it waits. It is signed with a key derived
# from the API secret and binds the approval to one user, action and
# transaction, so it cannot be replayed for another user, amount or route.

def _token_key(api_secret: str) -> bytes:
    return hmac.new(api_secret.encode('utf-8'), b'touchque-guard-token-v1', hashlib.sha256).digest()


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _from_b64u(s: str) -> bytes:
    pad = '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def sign_guard_token(api_secret: str, claims: Dict[str, Any]) -> str:
    body = _b64u(json.dumps(claims, separators=(',', ':')).encode('utf-8'))
    mac = _b64u(hmac.new(_token_key(api_secret), body.encode('ascii'), hashlib.sha256).digest())
    return f"v1.{body}.{mac}"


def verify_guard_token(api_secret: str, token: Optional[str]) -> Optional[Dict[str, Any]]:
    if not isinstance(token, str) or len(token) > 4096:
        return None
    parts = token.split('.')
    if len(parts) != 3 or parts[0] != 'v1':
        return None
    _, body, mac = parts
    # A header may carry any latin-1 text; only an ASCII token can be one we signed.
    if not body.isascii() or not mac.isascii():
        return None
    expected = _b64u(hmac.new(_token_key(api_secret), body.encode('ascii'), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, mac):
        return None
    try:
        claims = json.loads(_from_b64u(body))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(claims.get('exp'), (int, float)) or claims['exp'] < time.time() * 1000:
        return None
    return claims

# ─────────────────────────────────────────────────────────────
# From touchque/approval_proof.py — verify_approval_proof (pip install "touchque-authenticator[proof]")
# ─────────────────────────────────────────────────────────────

"""Verifies the device-signed proof of an approval ("what you see is what you sign").

When the user's phone holds a hardware key (Secure Enclave / Android Keystore),
every approval is signed by it over the request id, the action type, the
number-match code and a digest of the transaction details the user was shown.
The proof arrives in the SUCCESS webhook (``approvalProof``) and in
``login.status(id)['approvalProof']``. Verifying it does not require trusting
Touchque: it proves the enrolled phone signed exactly these details.

Needs the optional ``cryptography`` package:
``pip install "touchque-authenticator[proof]"``.
"""
import base64
import binascii
from typing import Any, Mapping, Optional

from .steps import LoginDetails, details_digest

__all__ = ['verify_approval_proof', 'details_digest']

_MESSAGE_PREFIX = 'touchque-approve:v2'


def _load_crypto():
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec
    except ImportError as exc:  # pragma: no cover - exercised only without the extra
        raise ImportError(
            'verify_approval_proof needs the "cryptography" package: '
            'pip install "touchque-authenticator[proof]"'
        ) from exc
    return InvalidSignature, hashes, ec


def verify_approval_proof(
    proof: Optional[Mapping[str, Any]],
    *,
    request_id: str,
    type: str,
    details: Optional[LoginDetails] = None,
    challenge_code: Optional[str] = None,
    expected_public_key: Optional[str] = None,
    allow_unpinned_key: bool = False,
) -> bool:
    """Returns True only if ``proof`` was signed by the device key over exactly
    the request, action type, challenge code and details you expect.

    :param proof: the ``approvalProof`` object from the webhook / status.
    :param request_id: the request id ``login.request()`` returned.
    :param type: the action type you sent (e.g. ``'WITHDRAW'``).
    :param details: the details you sent, exactly as you sent them (dict or
        list of ``{label, value}``); ``None`` when you sent none.
    :param challenge_code: the number-match code ``login.request()`` returned,
        when number matching was used.
    :param expected_public_key: pin the device — the base64 public key you
        stored for this user (e.g. ``proof['publicKey']`` of their first
        verified approval). A proof from any other key is rejected. Required
        unless ``allow_unpinned_key`` is set.
    :param allow_unpinned_key: accept whatever key the proof carries. Without a
        pinned key the proof only shows that *some* key signed these details.
        Only for trust-on-first-use: store ``proof['publicKey']`` after this
        first check and pin it from then on.

    Fails closed (no pin and no ``allow_unpinned_key`` -> False) and never
    raises for malformed input; it returns False.
    """
    InvalidSignature, hashes, ec = _load_crypto()
    try:
        if not isinstance(proof, Mapping):
            return False
        if proof.get('version') != 'v2' or proof.get('algorithm') != 'ECDSA-P256-SHA256':
            return False
        public_key_b64 = proof.get('publicKey')
        message = proof.get('message')
        signature_b64 = proof.get('signature')
        if not all(isinstance(v, str) for v in (public_key_b64, message, signature_b64)):
            return False
        if expected_public_key:
            if public_key_b64 != expected_public_key:
                return False
        elif allow_unpinned_key is not True:
            return False

        expected_message = '\n'.join([
            _MESSAGE_PREFIX,
            str(request_id),
            str(type),
            challenge_code if challenge_code is not None else '',
            details_digest(details),
        ])
        if message != expected_message:
            return False

        raw = base64.b64decode(public_key_b64, validate=True)
        if len(raw) != 65 or raw[0] != 0x04:
            return False
        key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw)
        signature = base64.b64decode(signature_b64, validate=True)
        key.verify(signature, message.encode('utf-8'), ec.ECDSA(hashes.SHA256()))
        return True
    except (InvalidSignature, ValueError, TypeError, binascii.Error):
        return False

# ─────────────────────────────────────────────────────────────
# From touchque/resources/login.py — tq.login (request/status/verify/report_fraud)
# ─────────────────────────────────────────────────────────────

import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Union

# Label -> value, or an ordered list of {'label': ..., 'value': ...}.
LoginDetails = Union[Dict[str, Union[str, int, float]], List[Dict[str, Any]]]
from urllib.parse import quote
from ..http_client import HttpClient
from ..exceptions import TouchqueTimeoutException, TouchqueRejectedException, TouchquePasskeyRequiredError, TouchqueConfigException

logger = logging.getLogger('touchque')

SECURITY_CHANGE_KINDS = ('password', 'mfa', 'device', 'email', 'phone')
DESTINATION_KINDS = ('iban', 'account', 'wallet', 'address', 'payee')


def _security_changes_body(changes: Dict[str, Any]) -> Dict[str, Any]:
    """datetimes go out as ISO 8601 (a naive one is taken as UTC); strings and epoch milliseconds as given."""
    out: Dict[str, Any] = {}
    for kind, at in changes.items():
        if at is None:
            continue
        if isinstance(at, datetime):
            out[kind] = (at if at.tzinfo else at.replace(tzinfo=timezone.utc)).isoformat()
        else:
            out[kind] = at
    return out


class Login:
    def __init__(self, http: HttpClient):
        self._http = http

    def request(self, external_username: str, type: str = 'LOGIN', reference_id: Optional[str] = None, client_ip: Optional[str] = None, user_agent: Optional[str] = None, require_biometric: bool = False, require_number_match: bool = False, details: Optional[LoginDetails] = None, browser_proof: Optional[str] = None, context: Optional[Dict[str, Any]] = None, challenge_digits: Optional[int] = None, expires_in: Optional[int] = None, client_signals: Optional[str] = None, security_changes: Optional[Dict[str, Any]] = None, destination: Optional[Dict[str, Any]] = None, locale: Optional[str] = None, qr_pairing: Optional[str] = None, device_risk: Optional[str] = None, device_risk_request_id: Optional[str] = None, reply: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Request a 2FA login/approval from the user's mobile device.

        When the integration has behavioral biometrics enabled
        (``TenantPolicy.behavioralBiometricsEnabled``), the response also
        contains ``telemetryToken`` — pass it plus ``requestId`` to your
        frontend to initialize the ``@touchque/web`` behavioral widget
        (``tq.behavioral.attach(...)``). There is no widget in this server SDK.

        ``details`` is transaction context shown on the approval screen, e.g.
        ``{'Amount': '1,250.00 USD', 'Recipient': 'Jane Doe'}`` (shown in
        order). At most 8 entries, labels <= 40 and values <= 120
        characters; the API rejects (never truncates) anything outside those
        limits. Build it from server-side state, never from browser input.

        ``browser_proof`` (silent sign-ins): the browser's device-bound key
        proof, exactly as the browser sent it (``X-Touchque-Browser`` header,
        made by ``@touchque/web``). When the user approves this request on the
        phone (or with a passkey), Touchque remembers the browser, so a later
        ``risk.check`` can let the same browser in without asking. Pass it
        through untouched; an invalid proof only means "a browser Touchque
        does not know".

        ``context``: for your Touchque Actions only (``event.context``): roles,
        plan, amount… Any JSON object up to 4 KB. Never shown on the phone.

        ``expires_in``: how long the push waits for the person, in seconds:
        30 (default) to 300; longer suits a request the person has to read
        first, such as an AI agent asking on their behalf.

        ``qr_pairing``: a browser pairing by QR code (``client.qr_pairings``),
        scanned and confirmed on the phone: only the phone that scanned it is
        asked, once, with number matching, for the user it scanned for.

        ``device_risk_request_id``: the page's identification from ``@touchque/web``
        (``deviceRisk.identify()``), for this account only; or ``device_risk``,
        the page's report (``deviceRisk.collect({ purpose })``), passed through untouched. Used
        only when your workspace turned Device risk on: its signals only ever
        ask for more, and a device your admin marked "step up always" asks at once.

        ``client_signals``: the end user's page check from ``@touchque/web``
        (``startClientSignals().encode()``), passed through untouched. A browser
        driven by software asks with number matching, or is refused where the
        workspace blocks it (403 ``automated_client``).

        ``security_changes``: when the user's sign-in security last changed in
        your system, ``{'password', 'mfa', 'device', 'email', 'phone'}`` each a
        datetime, ISO 8601 string or epoch milliseconds. Touchque adds what it
        saw itself; access rules and Actions read the minutes since each
        (``minutesSince.mfaChange``, ``.deviceChange``, ...), e.g. refuse
        ``PAYOUT_CHANGE`` within 24 hours of a 2FA change.

        ``destination``: where the action sends money or value,
        ``{'kind': 'iban'|'account'|'wallet'|'address'|'payee', 'value': ..., 'known': [...]}``.
        The phone shows it in full in groups of four, with a warning when it
        looks like one the user used before but is not the same; the answer's
        ``destination`` is ``{'known', 'lookalike'}``. Do not repeat it in ``details``.

        ``locale``: ``'tr'`` (default) or ``'en'``, the language of those rows.

        ``reply``: ask the person to type back on the phone a sign-in code another service sent
        them, ``{'kind': 'code', 'key': new_code_reply_key()['public_key'], 'channel': 'sms',
        'target': '+**********26'}``. The phone encrypts it to ``key``; ``status()['reply']['ct']``
        holds only the ciphertext: open it with ``open_code_reply``. Such a request lives 5
        minutes. Not with ``qr_pairing``.
        """
        payload = {
            'externalUsername': external_username,
            'type': type
        }
        if reference_id is not None:
            payload['referenceId'] = reference_id
        if client_ip is not None:
            payload['clientIp'] = client_ip
        if user_agent is not None:
            payload['userAgent'] = user_agent
        if require_biometric:
            payload['requireBiometric'] = True
        if require_number_match:
            payload['requireNumberMatch'] = True
        if challenge_digits in (2, 3):
            payload['challengeDigits'] = challenge_digits
        if expires_in is not None:
            payload['expiresIn'] = expires_in
        if qr_pairing:
            payload['qrPairing'] = qr_pairing
        if reply is not None:
            payload['reply'] = reply
        if client_signals:
            payload['clientSignals'] = client_signals
        if device_risk:
            payload['deviceRisk'] = device_risk
        if device_risk_request_id:
            payload['deviceRiskRequestId'] = device_risk_request_id
        if details:
            payload['details'] = details
        if browser_proof:
            payload['browserProof'] = browser_proof
        if context:
            payload['context'] = context
        if security_changes:
            payload['securityChanges'] = _security_changes_body(security_changes)
        if destination:
            payload['destination'] = destination
        if locale:
            payload['locale'] = locale

        return self._http.post('/login/request', payload)

    def status(self, request_id: str) -> Dict[str, Any]:
        """Check the current status of a login request."""
        return self._http.get(f"/login/status/{quote(request_id, safe='')}")

    def wait_for_approval(self, request_id: str, timeout_ms: int = 30000, poll_interval_ms: int = 400) -> Dict[str, Any]:
        """Wait (poll) until the user approves or rejects a request you already sent with ``request``.

        Returns ``{'approved': True, 'status': 'CONFIRMED', 'requestId', 'assurance', 'confirmedVia',
        'provisional'}``. Raises ``TouchqueRejectedException`` when the user said no,
        ``TouchqueTimeoutException`` when the request expired or ``timeout_ms`` ran out, and
        ``TouchquePasskeyRequiredError`` (``reason='step_up'``) when the user tapped Approve
        during a call and the request now waits for a passkey in the browser::

            req = tq.login.request(user, 'SEND_MONEY')
            tq.login.wait_for_approval(req['requestId'], timeout_ms=60000)"""
        start_time = time.time() * 1000

        while True:
            status_result = self.status(request_id)
            status = status_result.get('status')

            if status == 'CONFIRMED':
                return {
                    'approved': True,
                    'status': status,
                    'requestId': request_id,
                    'assurance': status_result.get('assurance'),
                    'confirmedVia': status_result.get('confirmedVia'),
                    # Vishing Shield: approved during a call; critical actions wait for the phone to re-confirm.
                    'provisional': bool(status_result.get('provisional')),
                }

            if status == 'REJECTED':
                raise TouchqueRejectedException(f"Request {request_id} was rejected by the user.")

            if status == 'EXPIRED':
                raise TouchqueTimeoutException(f"Request {request_id} expired before it was approved.")

            # Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
            if status == 'PENDING' and status_result.get('requiresPasskey'):
                raise TouchquePasskeyRequiredError(request_id, 'step_up')

            elapsed = (time.time() * 1000) - start_time
            if elapsed > timeout_ms:
                raise TouchqueTimeoutException(f"Waiting for approval timed out after {timeout_ms}ms")

            time.sleep(poll_interval_ms / 1000)

    def verify(self, external_username: str, type: str = 'LOGIN', reference_id: Optional[str] = None, client_ip: Optional[str] = None, user_agent: Optional[str] = None, require_biometric: bool = False, require_number_match: bool = False, timeout_ms: int = 30000, details: Optional[LoginDetails] = None, browser_proof: Optional[str] = None, on_challenge: Optional[Callable[[Dict[str, Any]], Any]] = None, context: Optional[Dict[str, Any]] = None, challenge_digits: Optional[int] = None, security_changes: Optional[Dict[str, Any]] = None, destination: Optional[Dict[str, Any]] = None, locale: Optional[str] = None) -> Dict[str, Any]:
        """Request a login and wait (poll) until the user approves or rejects it.

        With number matching (your ``require_number_match``, a workspace policy
        or the risk engine can turn it on) the user must pick a number on the
        phone. ``on_challenge`` is called once, right after the request is
        created and before any waiting, with ``{'requestId', 'challengeCode',
        'expiresAt', 'reasons', 'caseCode'}``: show ``challengeCode`` to the
        user now; the phone asks for it. An exception it raises is logged and
        ignored (verify keeps waiting). It is not called when only a passkey
        can approve::

            tq.login.verify(user, 'SEND_MONEY',
                            on_challenge=lambda c: c.get('challengeCode') and show(f"Pick {c['challengeCode']} on your phone"))

        Raises ``TouchquePasskeyRequiredError`` when a passkey must approve it:
        a phishing-resistant policy (``reason='policy'``, no push sent), or the
        user tapped Approve during a call (``reason='step_up'``, Vishing Shield):
        finish it in the browser with ``@touchque/web``."""
        request_result = self.request(external_username, type, reference_id, client_ip, user_agent, require_biometric, require_number_match, details, browser_proof, context, challenge_digits, security_changes=security_changes, destination=destination, locale=locale)
        request_id = request_result['requestId']
        if request_result.get('requiresPasskey'):
            raise TouchquePasskeyRequiredError(request_id)

        if on_challenge is not None:
            challenge = {'requestId': request_id, 'expiresAt': request_result.get('expiresAt')}
            for key in ('challengeCode', 'reasons', 'caseCode'):
                if request_result.get(key):
                    challenge[key] = request_result[key]
            try:
                on_challenge(challenge)
            except Exception as err:  # noqa: BLE001 — the user's callback must not stop the wait
                # err.__class__, not type(err): the parameter `type` shadows the builtin here.
                logger.warning('[Touchque] on_challenge failed: %s: %s', err.__class__.__name__, err)

        start_time = time.time() * 1000
        poll_interval_sec = 0.4

        while True:
            status_result = self.status(request_id)
            status = status_result.get('status')

            if status == 'CONFIRMED':
                return {
                    'approved': True,
                    'status': status,
                    'requestId': request_id,
                    'challengeCode': request_result.get('challengeCode'),
                    'assurance': status_result.get('assurance'),
                    'confirmedVia': status_result.get('confirmedVia'),
                    # Vishing Shield: approved during a call; critical actions wait for the phone to re-confirm.
                    'provisional': bool(status_result.get('provisional')),
                }

            if status == 'REJECTED':
                raise TouchqueRejectedException(f"Request {request_id} was rejected by the user.")

            if status == 'EXPIRED':
                raise TouchqueTimeoutException(f"Request {request_id} expired before it was approved.")

            # Vishing Shield: tapped during a call, the request now waits for a passkey in the browser.
            if status == 'PENDING' and status_result.get('requiresPasskey'):
                raise TouchquePasskeyRequiredError(request_id, 'step_up')

            elapsed = (time.time() * 1000) - start_time
            if elapsed > timeout_ms:
                raise TouchqueTimeoutException(f"Login verification timed out after {timeout_ms}ms")

            time.sleep(poll_interval_sec)

    def approve_with_recovery_code(self, request_id: str, code: str) -> Dict[str, Any]:
        """Approve a pending 2FA request using a Recovery Code (bypasses mobile device)."""
        return self._http.post('/login/recovery', {
            'requestId': request_id,
            'code': code
        })

    def consume(self, request_id: str) -> Dict[str, Any]:
        """Uses an approved request exactly once. The first call on a
        CONFIRMED request wins atomically; every later call (a replayed
        token, a retried form post) raises ``TouchqueAPIException`` with
        ``code='already_used'`` (409)."""
        return self._http.post(f"/login/{quote(request_id, safe='')}/consume", {})

    FRAUD_REASONS = ('chargeback', 'account_takeover', 'social_engineering', 'other')

    def report_fraud(self, request_id: str, reason: Optional[str] = None, note: Optional[str] = None) -> Dict[str, Any]:
        """Report a request you later learned was fraud — a chargeback, a
        confirmed account takeover, a scam the user was talked into. Touchque's
        risk engine learns from it (it is the strongest signal it gets) and the
        report is kept in your audit log. The request's status does not change.
        Safe to call more than once: a repeat answers ``alreadyReported: True``.

        :param reason: one of ``Login.FRAUD_REASONS`` (default ``'other'``).
        :param note: free text for your audit log, at most 500 characters.
        """
        if not request_id:
            raise TouchqueConfigException('report_fraud() needs the request id')
        payload: Dict[str, Any] = {}
        if reason:
            payload['reason'] = reason
        if note:
            payload['note'] = note
        return self._http.post(f"/login/{quote(request_id, safe='')}/report-fraud", payload)

# ─────────────────────────────────────────────────────────────
# From touchque/resources/offline.py — Offline Sign (QR + code)
# ─────────────────────────────────────────────────────────────

import base64
import hashlib
import hmac
import time
from typing import Any, Dict, List, Optional

from ..http_client import HttpClient
from ..exceptions import TouchqueAPIException

_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'


class Offline:
    """Offline Sign — QR challenge / typed code approvals that work with the
    phone offline (no internet on the device)."""

    def __init__(self, http: HttpClient):
        self._http = http

    def challenge(
        self,
        external_username: str,
        type: str = 'LOGIN',
        details: Optional[Any] = None,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
        ttl_seconds: Optional[int] = None,
        include_qr_image: bool = True,
        request_id: Optional[str] = None,
        require_number_match: bool = False,
    ) -> Dict[str, Any]:
        """Issues an offline QR challenge. Returns
        ``{challengeId, qr, qrDataUrl, expiresAt, expiresInSeconds, totpAvailable}``
        (+ ``challengeCode`` when number matching applies: print it under the QR; the
        phone offers it among two decoys and the user taps the match).
        ``details`` is REQUIRED for critical action types.

        ``request_id`` is the push this QR is a fallback for: once the phone REJECTS it the QR
        is dead (no new QR is issued, a code for the old one is refused with ``request_rejected``),
        and a push with number matching makes the QR show the same number. Always pass it
        when the QR follows a push.
        """
        body: Dict[str, Any] = {'externalUsername': external_username, 'type': type}
        if details is not None:
            body['details'] = details
        if client_ip is not None:
            body['clientIp'] = client_ip
        if user_agent is not None:
            body['userAgent'] = user_agent
        if ttl_seconds is not None:
            body['ttlSeconds'] = ttl_seconds
        if not include_qr_image:
            body['includeQrImage'] = False
        if request_id is not None:
            body['requestId'] = request_id
        if require_number_match:
            body['requireNumberMatch'] = True
        return self._http.post('/offline/challenge', body)

    def verify(self, challenge_id: str, code: str) -> Dict[str, Any]:
        """Verifies the 7-character code shown on the phone. Never raises for
        a wrong/expired/used code — check ``approved``; ``reason`` is one of
        ``invalid_code | locked | expired | used | unknown_challenge |
        request_rejected | too_many_failures | device_not_enrolled``.
        """
        return self._not_approved_as_result(
            lambda: self._http.post('/offline/verify', {'challengeId': challenge_id, 'code': code})
        )

    def verify_totp(self, external_username: str, code: str, type: str = 'LOGIN',
                     client_ip: Optional[str] = None, request_id: Optional[str] = None) -> Dict[str, Any]:
        """Verifies the rolling time-based code (no QR scan needed). Refused
        for critical action types. ``request_id``: the push this sign-in belongs
        to — a code is refused (``request_rejected``) once the phone rejected it."""
        body: Dict[str, Any] = {'externalUsername': external_username, 'code': code, 'type': type}
        if client_ip is not None:
            body['clientIp'] = client_ip
        if request_id is not None:
            body['requestId'] = request_id
        return self._not_approved_as_result(lambda: self._http.post('/offline/totp/verify', body))

    def totp_verifiers(self, external_usernames: List[str], from_step: Optional[int] = None,
                       steps: Optional[int] = None) -> Dict[str, Any]:
        """For checking typed time-based codes while your server cannot reach
        Touchque (an outage): salted, slow digests of each user's next codes,
        never a key. Up to 1,000 users and 24,000 user-steps a call; ``steps`` 1-480 (default 480, four hours)
        from ``from_step`` (default: the current 30-second step). Returns
        ``{stepSeconds, fromStep, steps, notAfterStep, kdf, users: [{externalUsername,
        fromStep, salt, digests}]}`` with only the users who can use time-based codes
        now. Check a typed code with :meth:`match_totp_verifier`. Requires the
        workspace policies ``offlineTotpEnabled`` and ``outageVerifiersEnabled``.
        Fetch again every few minutes: removed and frozen users fall out."""
        body: Dict[str, Any] = {'externalUsernames': list(external_usernames)}
        if from_step is not None:
            body['fromStep'] = from_step
        if steps is not None:
            body['steps'] = steps
        return self._http.post('/offline/totp/verifiers', body)

    @staticmethod
    def match_totp_verifier(verifiers: Dict[str, Any], user: Dict[str, Any], code: str,
                            at: Optional[float] = None) -> Optional[int]:
        """Checks a typed code against one user's digests from
        :meth:`totp_verifiers` without calling Touchque. Returns the step the
        code belongs to (the current one or one either side), or ``None``.
        Accept each step once: remember the step you accepted for the user and
        refuse codes for it or an older one. ``at``: Unix time (default now)."""
        given = ''.join(code.upper().split()).replace('-', '') if isinstance(code, str) else ''
        if len(given) != 7 or any(c not in _CODE_ALPHABET for c in given):
            return None
        kdf = verifiers['kdf']
        length = kdf['length']
        now = int((time.time() if at is None else at) // verifiers['stepSeconds'])
        salt = base64.b64decode(user['salt'])
        digests = base64.b64decode(user['digests'])
        for step in (now, now - 1, now + 1):
            if step < user['fromStep'] or step > verifiers['notAfterStep']:
                continue
            i = (step - user['fromStep']) * 2 * length
            if i + 2 * length > len(digests):
                continue
            got = hashlib.pbkdf2_hmac('sha256', given.encode(), salt + f':{step}'.encode(), kdf['iterations'], length)
            if hmac.compare_digest(digests[i:i + length], got) or hmac.compare_digest(digests[i + length:i + 2 * length], got):
                return step
        return None

    @staticmethod
    def _not_approved_as_result(call) -> Dict[str, Any]:
        try:
            return call()
        except TouchqueAPIException as err:
            if err.status is not None and err.status < 500:
                return {
                    'approved': False,
                    'reason': err.reason or err.code or (err.data or {}).get('error'),
                    'attemptsLeft': err.attempts_left,
                }
            raise

# ─────────────────────────────────────────────────────────────
# From touchque/relay.py — RelayHandler, the relay routes @touchque/web calls (public part)
# ─────────────────────────────────────────────────────────────

"""
Framework-agnostic relay: the routes every partner backend needs for classic
push 2FA, offline codes and passkeys, so you don't hand-write them. The Flask,
FastAPI and Django adapters in ``touchque.contrib`` are thin wrappers over
``RelayHandler.handle()``. Same routes and behaviour as the Node SDK's
``touchqueRouter``.

Routes (relative to wherever you mount the relay):

  POST   /enroll/start                    (auth required) -> generate_secret response
  GET    /enroll/status                   (auth required) -> {linked, used, deviceId}
  POST   /login                           (pre-auth) -> 202 {touchque: step, token} until approved
  POST   /offline/challenge               (pre-auth, body.externalUsername) -> QR for a phone with no internet
  POST   /offline/verify                  (pre-auth, body.challengeId/code)
  POST   /offline/totp                    (pre-auth, body.externalUsername/code) -> time-based code fallback
  POST   /passkey/authenticate/options    (pre-auth, body.email; none = any passkey, for autofill)
  POST   /passkey/authenticate/verify     (pre-auth, body.attemptId/response)
  POST   /passkey/login/options           (pre-auth, body.requestId - approve a pending 2FA request)
  POST   /passkey/login/verify            (pre-auth, body.requestId/response)
  POST   /passkey/register/options        (auth required)
  POST   /passkey/register/verify         (auth required)
  GET    /passkey/credentials             (auth required)
  DELETE /passkey/credentials/<id>        (auth required)

"Auth required" routes answer 401 ``UNAUTHORIZED_FOR_2FA`` when
``get_user_id(request)`` returns nothing.

Pre-auth routes are rate limited per IP and per username by default
(``rate_limit``), and Touchque itself caps approval pushes per user. Set
``get_login_user`` so POST /login and the offline routes only work for a user
who already passed YOUR first factor (password step): then nobody can make
Touchque push to, or lock out, an arbitrary user through your server. The
offline routes are OFF until you do (or explicitly opt out with
``allow_offline_without_first_factor=True``): with the username taken from
the body, anyone could burn a user's offline attempts and lock them out.
"""
import inspect
import logging
import re
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Tuple, Union

from .exceptions import (
    TouchqueAPIException, TouchquePasskeyRequiredError, TouchqueRejectedException, TouchqueTimeoutException,
)
from .guard import (
    SilentSignIn, guard_input_from_headers, guard_response_headers, is_status_poll, run_guard, silent_input_from_headers,
)
from .rate_limiter import FixedWindowLimiter

# A 1.5 s poll for a 2-minute push is 80 requests: one attempt's worth of polls.
POLLS_PER_ATTEMPT = 10
#: Reserved action: the approval on the phone that unlocks adding a passkey.
PASSKEY_ENROLL_ACTION = 'PASSKEY_ENROLL'

if TYPE_CHECKING:
    from .client import Touchque

logger = logging.getLogger('touchque')

#: Every (method, sub-path) the relay answers. ``<id>`` is one path segment.
RELAY_ROUTES = (
    ('POST', '/enroll/start'),
    ('GET', '/enroll/status'),
    ('POST', '/login'),
    ('POST', '/offline/challenge'),
    ('POST', '/offline/verify'),
    ('POST', '/offline/totp'),
    ('POST', '/passkey/authenticate/options'),
    ('POST', '/passkey/authenticate/verify'),
    ('POST', '/passkey/login/options'),
    ('POST', '/passkey/login/verify'),
    ('POST', '/passkey/register/options'),
    ('POST', '/passkey/register/verify'),
    ('GET', '/passkey/credentials'),
    ('DELETE', '/passkey/credentials/<id>'),
)

_CREDENTIAL_PATH = re.compile(r'^/passkey/credentials/([^/]+)$')

_warned_pre_auth = False


class RelayResponse:
    """What the adapter should send: ``status``, a JSON-serialisable ``body``
    and extra ``headers`` (``Retry-After``, ``Cache-Control``)."""

    __slots__ = ('status', 'body', 'headers')

    def __init__(self, status: int, body: Any, headers: Optional[Dict[str, str]] = None):
        self.status = status
        self.body = body
        self.headers = headers or {}

    def __repr__(self) -> str:
        return 'RelayResponse(status=%r, body=%r, headers=%r)' % (self.status, self.body, self.headers)

class RelayHandler:
    """
    The relay routes, independent of any web framework.

    ``client``: a ``Touchque`` instance (default: ``get_default_client()``).

    ``get_user_id(request)``: REQUIRED. The signed-in user's identifier for
    the "auth required" routes (enrollment, passkey registration and
    management). Return ``None`` when nobody is signed in - the route answers 401.

    ``get_login_user(request)``: STRONGLY RECOMMENDED. The user who already
    passed your first factor (e.g. the password step stored in the session).
    When set, POST /login, /offline/challenge and /offline/totp act for this
    user and IGNORE any username in the request body; when it returns nothing
    they answer 401 ``FIRST_FACTOR_REQUIRED``.

    ``rate_limit``: built-in limits for the pre-auth routes, per client IP and
    per username, per route. On by default (20 per IP and 5 per username per
    minute). A dict with ``window_ms`` / ``per_ip`` / ``per_user`` overrides
    them; ``False`` turns the limiter off (if you already limit in front).
    The adapters use the framework's client address - make sure it is the
    real client behind a proxy (e.g. werkzeug ``ProxyFix``).

    ``allow_offline_without_first_factor``: the offline routes answer 403
    ``OFFLINE_REQUIRES_FIRST_FACTOR`` unless ``get_login_user`` is set. Set
    this to ``True`` only if they really should trust the username in the body.

    ``action_type``: action type for POST /login and the offline routes. Default ``'LOGIN'``.

    ``get_details(request)``: optional transaction context shown on the
    approval screen. Build it from server-side state - the request body is
    attacker-controlled.

    ``silent_sign_in``: silent sign-ins for POST /login (default off). When
    on, a new sign-in whose browser sent its device-bound key proof
    (``X-Touchque-Browser``, added by ``@touchque/web`` with
    ``browserKey: true``) first asks Touchque whether anything about it is
    new. If nothing is, it succeeds at once with no push (``on_authenticated``
    gets ``via: 'silent'``; the answer's ``assurance['method']`` is
    ``'silent'``). Otherwise, and on any error, the usual push starts and its
    approval makes the browser known. Set ``get_login_user`` too: the user
    must have passed your password step. ``{'max_age_seconds': n}`` sets your
    own limit on how long ago the last phone approval in that browser may be.

    ``on_authenticated(request, response, info)``: called right before the
    relay sends its own success response for POST /login (once approved),
    /offline/verify, /offline/totp, /passkey/authenticate/verify and
    /passkey/login/verify. ``info`` is ``{"externalUsername", "requestId"
    (when known), "via": "login" | "passkey" | "offline" | "offline-totp" |
    "silent"}``. Open your session here: mutate ``request`` (session) or
    ``response`` (``set_cookie``); do not build a response yourself.

    Callbacks receive the framework's native request object.
    """

    def __init__(
        self,
        client: Optional['Touchque'] = None,
        get_user_id: Optional[Callable[[Any], Optional[str]]] = None,
        get_login_user: Optional[Callable[[Any], Optional[str]]] = None,
        rate_limit: Union[Dict[str, int], bool, None] = None,
        allow_offline_without_first_factor: bool = False,
        action_type: str = 'LOGIN',
        get_details: Optional[Callable[[Any], Any]] = None,
        on_authenticated: Optional[Callable[[Any, Any, Dict[str, Any]], Any]] = None,
        silent_sign_in: SilentSignIn = False,
    ):
        global _warned_pre_auth
        if get_user_id is None:
            raise TypeError('RelayHandler: get_user_id is required')
        self._client = client
        self.get_user_id = get_user_id
        self.get_login_user = get_login_user
        self.action_type = action_type
        self.get_details = get_details
        self.on_authenticated = on_authenticated
        self.silent_sign_in = silent_sign_in
        if rate_limit is False:
            self.limiter = None  # type: Optional[FixedWindowLimiter]
        else:
            opts = rate_limit if isinstance(rate_limit, dict) else {}
            self.limiter = FixedWindowLimiter(
                window_ms=opts.get('window_ms'), per_ip=opts.get('per_ip'), per_user=opts.get('per_user'))
        self.offline_enabled = bool(get_login_user) or allow_offline_without_first_factor is True

        if not get_login_user and not _warned_pre_auth:
            _warned_pre_auth = True
            logger.warning(
                '[Touchque] RelayHandler: POST /login takes the username from the request body%s. Set '
                '`get_login_user` to bind them to your first factor (password step) so they cannot be used '
                'against arbitrary users.',
                ', and so do the offline routes' if self.offline_enabled
                else '; the offline routes are disabled until you set it')

    @property
    def client(self) -> 'Touchque':
        """The client given to the handler, else the default client, looked
        up on every request (``get_default_client()`` keeps it process-wide),
        so ``set_default_client`` and ``FakeTouchque.install()`` reach it."""
        if self._client is not None:
            return self._client
        from .client import get_default_client
        return get_default_client()

    # ── entry point ─────────────────────────────────────────────────────
    def handle(
        self,
        method: str,
        path: str,
        body: Any = None,
        ip: Optional[str] = None,
        user_agent: Optional[str] = None,
        get_header: Optional[Callable[[str], Optional[str]]] = None,
        request: Any = None,
        response: Any = None,
        run_async: Optional[Callable[[Any], Any]] = None,
    ) -> Optional[RelayResponse]:
        """Runs one relay route.

        ``method``/``path``: HTTP method and the sub-path below the mount
        point (e.g. ``'/login'``). ``body``: the parsed JSON body (or None).
        ``get_header``: case-insensitive header getter. ``request`` /
        ``response``: the framework's native objects, passed to the callbacks
        as-is. ``run_async``: how to resolve an awaitable returned by a
        callback (the FastAPI adapter supplies it).

        Returns the response to send, or ``None`` when no route matches.
        """
        ctx = _Ctx(self, (method or '').upper(), _norm_path(path), body, ip, user_agent,
                   get_header or (lambda name: None), request, response, run_async)
        try:
            return ctx.dispatch()
        except _Done as done:
            return done.response

# ... private route handlers omitted

# ─────────────────────────────────────────────────────────────
# From touchque/contrib/flask.py — @require_touchque + touchque_relay_blueprint
# ─────────────────────────────────────────────────────────────

"""
Flask: one line per protected route.

    from touchque.contrib.flask import require_touchque

    @app.post('/transfer')
    @require_touchque('SEND_MONEY', details=lambda: {'Amount': f'{request.json["amount"]} EUR'})
    def transfer():
        return jsonify(ok=True, touchque=g.touchque)

Until the user approves on their phone this answers
202 {"touchque": step, "token": ...}. Your page shows the step in its own
design and sends the same request again with header
``X-Touchque-Token: <token>``. Once approved the view runs ONCE, with
``flask.g.touchque`` set to the approval.

Relay routes (POST /login, enrollment, offline codes, passkey ceremonies)
as one Blueprint - see ``touchque.relay.RelayHandler`` for every option:

    from touchque.contrib.flask import touchque_relay_blueprint

    def opened(req, resp, info):
        session['user'] = info['externalUsername']

    app.register_blueprint(touchque_relay_blueprint(
        tq,
        get_user_id=lambda req: session.get('user'),
        get_login_user=lambda req: session.get('password_ok'),
        on_authenticated=opened,
    ), url_prefix='/touchque')
"""
import functools
from typing import Any, Callable, Dict, Optional, Tuple

from flask import Blueprint, abort, current_app, g, json, jsonify, request

from ..client import Touchque
from ..guard import ErrorBody, SilentSignIn, guard_input_from_headers, run_guard, silent_input_from_headers
from ..guard import guard_response as _guard_response
from ..relay import RELAY_ROUTES, RelayHandler
from ..steps import LoginDetails


def _default_user() -> Optional[str]:
    u = getattr(g, 'user', None)
    if u is None:
        return None
    if isinstance(u, str):
        return u
    return getattr(u, 'email', None) or getattr(u, 'id', None) or getattr(u, 'username', None)


def guard_response(result: Dict[str, Any], error_body: Optional[ErrorBody] = None) -> Tuple[int, Dict[str, str], Any]:
    """What ``require_touchque`` sends for a ``run_guard`` result that is not
    an approval, as ``(status, headers, body)``: ``touchque.guard_response``
    with ``error_body``'s result encoded by your app's JSON provider (dates,
    ``Decimal``, ``UUID``, dataclasses), as the decorator encodes it. For the
    guard inside your own view::

        status, headers, body = guard_response(result, error_body)
        return jsonify(body), status, headers
    """
    return _guard_response(result, error_body, encode=json.dumps)


def require_touchque(
    action: str,
    client: Optional[Touchque] = None,
    user: Optional[Callable[[], Optional[str]]] = None,
    details: Optional[Callable[[], Optional[LoginDetails]]] = None,
    reference_id: Optional[Callable[[], Optional[str]]] = None,
    silent_sign_in: SilentSignIn = False,
    context: Optional[Callable[[], Optional[Dict[str, Any]]]] = None,
    error_body: Optional[ErrorBody] = None,
) -> Callable:
    """
    ``client``: default ``get_default_client()``, built from ``TQ_API_KEY`` /
    ``TQ_API_SECRET`` on the first request. Without them the route answers
    500 ``misconfigured`` (401 when nobody is signed in) and the view never
    runs; nothing is raised at import or on a request.

    ``user``: who is approving. Default: ``flask.g.user`` (string, or an
    object with ``.email``/``.id``/``.username``). For the login step, return
    the user who just passed your password check, e.g.
    ``user=lambda: session.get('password_ok')``.

    ``silent_sign_in`` (default off): when on, a new attempt whose browser
    sent its device-bound key proof (``X-Touchque-Browser``, added by
    ``@touchque/web`` with ``browserKey: true``) first asks Touchque whether
    anything about it is new. If nothing is, your view runs at once with no
    push (``g.touchque['assurance']['method'] == 'silent'``,
    ``g.touchque['reasons']``). Otherwise, and on any error, the usual push
    starts and its approval makes the browser known.
    ``{'max_age_seconds': n}`` sets your own limit on how long ago the last
    phone approval in that browser may be.

    ``context``: for your Touchque Actions only (``event.context``), e.g.
    ``context=lambda: {'roles': g.user.roles}``. Never shown on the phone.

    ``error_body``: your app's own error shape for the refusals (401, 403,
    408, 423, 429, 500, 503), e.g.
    ``error_body=lambda r: {'message': r['message'], 'code': r['code']}``.
    It gets ``{'status', 'code', 'message', 'touchque'}``; what it returns
    counts by Flask's JSON encoding: an object (a dict, a dataclass, a pydantic
    model) is sent with ``touchque`` set to the step, anything else as it is.
    Status and headers stay, and every refusal carries ``X-Touchque-State``
    (and ``X-Touchque-Reason``). Never called for a 202 step. For
    ``run_guard`` in your own view, this module's ``guard_response`` gives
    the same answer.
    """
    user_of = user or _default_user
    tq = client

    def decorator(view: Callable) -> Callable:
        @functools.wraps(view)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            uid = user_of()
            result = run_guard(
                tq, uid, action,
                details=details() if details else None,
                reference_id=reference_id() if reference_id else None,
                context=context() if context else None,
                ip=request.remote_addr, user_agent=request.headers.get('User-Agent'),
                **guard_input_from_headers(lambda name: request.headers.get(name)),
                **silent_input_from_headers(silent_sign_in, lambda name: request.headers.get(name)),
            )
            if 'approved' in result:
                g.touchque = result['approved']
                return view(*args, **kwargs)
            # Encoded like the response (the app's JSON provider), so a value it cannot encode is caught.
            status, headers, body = guard_response(result, error_body)
            resp = jsonify(body)
            resp.status_code = status
            for name, value in headers.items():
                resp.headers[name] = value
            return resp
        return wrapped
    return decorator


def touchque_relay_blueprint(
    client: Optional[Touchque] = None,
    name: str = 'touchque_relay',
    url_prefix: Optional[str] = None,
    handler: Optional[RelayHandler] = None,
    **options: Any
) -> Blueprint:
    """A Blueprint with every relay route. ``options`` are ``RelayHandler``'s
    (``get_user_id`` is required); or pass a ready ``handler``.

    Callbacks get ``flask.request``; ``on_authenticated(request, response,
    info)`` gets the Flask response that will be sent, so it may call
    ``response.set_cookie(...)`` or write ``flask.session``.
    ``request.remote_addr`` is the client IP the rate limiter uses: behind a
    proxy, wrap the app in werkzeug's ``ProxyFix``.
    """
    relay = handler or RelayHandler(client, **options)
    bp = Blueprint(name, __name__, url_prefix=url_prefix)

    def make_view(method: str, sub: str) -> Callable:
        def view(cred_id: Optional[str] = None) -> Any:
            response = current_app.response_class(mimetype='application/json')
            result = relay.handle(
                method, sub.replace('<id>', cred_id or ''),
                body=request.get_json(silent=True),
                ip=request.remote_addr, user_agent=request.headers.get('User-Agent'),
                get_header=lambda name_: request.headers.get(name_),
                request=request._get_current_object(),  # type: ignore[attr-defined]
                response=response,
            )
            if result is None:
                abort(404)
            response.set_data(json.dumps(result.body))
            response.status_code = result.status
            for key, value in result.headers.items():
                response.headers[key] = value
            return response
        return view

    for method, sub in RELAY_ROUTES:
        endpoint = method.lower() + sub.replace('/', '_').replace('<id>', 'id')
        bp.add_url_rule(sub.replace('<id>', '<cred_id>'), endpoint=endpoint,
                        view_func=make_view(method, sub), methods=[method])
    return bp

# ─────────────────────────────────────────────────────────────
# From touchque/contrib/fastapi.py — RequireTouchque + touchque_relay_router
# ─────────────────────────────────────────────────────────────

"""
FastAPI: one line per protected route, as a dependency.

    from fastapi import Depends, Request
    from touchque.contrib.fastapi import RequireTouchque

    @app.post('/transfer')
    async def transfer(request: Request, touchque=Depends(
        RequireTouchque('SEND_MONEY', details=lambda req: {'Amount': f'{req.state.amount} EUR'})
    )):
        return {'ok': True, 'touchque': touchque}

Until the user approves on their phone the dependency raises
``HTTPException(202, detail={"touchque": step, "token": ...})``. Your page
shows the step in its own design and sends the same request again with
header ``X-Touchque-Token: <token>``. Once approved the dependency resolves
to the approval (once) and your route runs.

FastAPI's default exception handler puts that JSON under a top-level
``"detail"`` key (``{"detail": {"touchque": ..., "token": ...}}``), where
``@touchque/web`` never sees the step. Call
``install_touchque_exception_handler(app)`` once at startup: it is REQUIRED
when your pages use ``@touchque/web``. It sends the answer at the top level,
like the Django/Flask adapters (also what ``error_body`` returns).

``run_guard`` makes a blocking HTTP call (the ``requests`` library); it runs
in FastAPI's threadpool via ``anyio.to_thread`` so it never blocks the event
loop.

Relay routes (POST /login, enrollment, offline codes, passkey ceremonies)
as one APIRouter - see ``touchque.relay.RelayHandler`` for every option.
Callbacks may be sync or async:

    from touchque.contrib.fastapi import touchque_relay_router

    async def opened(request, response, info):
        response.set_cookie('session', await create_session(info['externalUsername']))

    app.include_router(touchque_relay_router(
        tq,
        get_user_id=lambda req: req.session.get('user'),
        get_login_user=lambda req: req.session.get('password_ok'),
        on_authenticated=opened,
    ), prefix='/touchque')
"""
import inspect
import json
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

import anyio
import anyio.from_thread
import anyio.to_thread
import fastapi
from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse, Response

from ..client import Touchque
from ..guard import (
    ErrorBody, SilentSignIn, _custom_body, _error_body_failed, _refusal, guard_input_from_headers, run_guard,
    silent_input_from_headers,
)
from ..guard import guard_response as _guard_response
from ..relay import RELAY_ROUTES, RelayHandler
from ..steps import LoginDetails


class _GuardAnswer(HTTPException):
    """A step or refusal from ``RequireTouchque``: ``install_touchque_exception_handler``
    sends its body as it is, whatever its shape (``detail`` cannot be None)."""

    def __init__(self, status_code: int, body: Any, headers: Dict[str, str]):
        super().__init__(status_code=status_code, detail=body, headers=headers)
        self.touchque_body = body


def _encode(value: Any) -> str:
    """How FastAPI encodes a body: ``jsonable_encoder``, then ``JSONResponse``'s ``json.dumps``."""
    return json.dumps(jsonable_encoder(value), ensure_ascii=False, allow_nan=False, separators=(',', ':'))


async def guard_response(result: Dict[str, Any], error_body: Optional[Callable[[Dict[str, Any]], Any]] = None
                         ) -> Tuple[int, Dict[str, str], Any]:
    """What ``RequireTouchque`` sends for a ``run_guard`` result that is not
    an approval, as ``(status, headers, body)``, to await:
    ``touchque.guard_response`` with an async ``error_body`` awaited and its
    result encoded by ``jsonable_encoder`` (a pydantic model keeps its
    aliases), as the dependency does. For the guard inside your own route
    (``run_guard`` blocks: run it in a thread from an ``async def`` route)::

        result = await anyio.to_thread.run_sync(lambda: run_guard(None, user, 'SEND_MONEY', ...))
        if 'approved' not in result:
            status, headers, body = await guard_response(result, error_body)
            return JSONResponse(body, status_code=status, headers=headers)
    """
    status, headers, body = _guard_response(result)
    if error_body is None or status < 400:
        return status, headers, body
    try:
        custom = error_body(_refusal(result))
        if inspect.isawaitable(custom):
            custom = await custom
        return status, headers, _custom_body(result, custom, _encode, plain=False)
    except Exception as err:  # noqa: BLE001 - your callback must not turn a refusal into a crash
        return status, headers, _error_body_failed(result, err)


async def _default_user(request: Request) -> Optional[str]:
    u = getattr(request.state, 'user', None)
    if u is None:
        return None
    if isinstance(u, str):
        return u
    return getattr(u, 'email', None) or getattr(u, 'id', None) or getattr(u, 'username', None)


def RequireTouchque(  # noqa: N802 — reads as a dependency factory, PascalCase is idiomatic here
    action: str,
    client: Optional[Touchque] = None,
    user: Optional[Callable[[Request], Any]] = None,
    details: Optional[Callable[[Request], Optional[LoginDetails]]] = None,
    reference_id: Optional[Callable[[Request], Any]] = None,
    silent_sign_in: SilentSignIn = False,
    context: Optional[Callable[[Request], Any]] = None,
    error_body: Optional[ErrorBody] = None,
) -> Callable[[Request], Any]:
    """
    ``client``: default ``get_default_client()``, built from ``TQ_API_KEY`` /
    ``TQ_API_SECRET`` on the first request. Without them the route answers
    500 ``misconfigured`` (401 when nobody is signed in) and your route never
    runs; nothing is raised at startup.

    ``user``: async or sync callable resolving who is approving from the
    request. Default: ``request.state.user``. For the login step, return the
    user who just passed your password check.

    ``silent_sign_in`` (default off): when on, a new attempt whose browser
    sent its device-bound key proof (``X-Touchque-Browser``, added by
    ``@touchque/web`` with ``browserKey: true``) first asks Touchque whether
    anything about it is new. If nothing is, the dependency resolves at once
    with no push (``approval['assurance']['method'] == 'silent'``,
    ``approval['reasons']``). Otherwise, and on any error, the usual push
    starts and its approval makes the browser known.
    ``{'max_age_seconds': n}`` sets your own limit on how long ago the last
    phone approval in that browser may be.

    ``context``: for your Touchque Actions only (``event.context``), e.g. the
    user's roles. Never shown on the phone.

    ``error_body``: your app's own error shape for the refusals (401, 403,
    408, 423, 429, 500, 503), e.g.
    ``error_body=lambda r: {'message': r['message'], 'code': r['code']}``.
    It may be async. It gets ``{'status', 'code', 'message', 'touchque'}``;
    what it returns counts by FastAPI's JSON encoding (``jsonable_encoder``):
    an object (a dict, a pydantic model, a dataclass) is sent with
    ``touchque`` set to the step, anything else as it is. Status and headers
    stay, and every refusal carries ``X-Touchque-State`` (and
    ``X-Touchque-Reason``). Never called for a 202 step. With
    ``install_touchque_exception_handler`` it is the whole body; without it,
    FastAPI puts it under ``"detail"``. For ``run_guard`` in your own route,
    this module's awaitable ``guard_response`` gives the same answer.
    """
    user_of = user or _default_user
    tq = client

    async def dependency(request: Request) -> Any:
        uid = user_of(request)
        if hasattr(uid, '__await__'):
            uid = await uid
        det = details(request) if details else None
        if hasattr(det, '__await__'):
            det = await det
        ref = reference_id(request) if reference_id else None
        if hasattr(ref, '__await__'):
            ref = await ref
        ctx = context(request) if context else None
        if hasattr(ctx, '__await__'):
            ctx = await ctx

        result = await anyio.to_thread.run_sync(lambda: run_guard(
            tq, uid, action, details=det, reference_id=ref, context=ctx,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent'),
            **guard_input_from_headers(lambda name: request.headers.get(name)),
            **silent_input_from_headers(silent_sign_in, lambda name: request.headers.get(name)),
        ))
        if 'approved' in result:
            return result['approved']
        status, headers, body = await guard_response(result, error_body)
        raise _GuardAnswer(status, body, headers)

    return dependency


def install_touchque_exception_handler(app: fastapi.FastAPI) -> None:
    """Required when your pages use ``@touchque/web``: without it a
    ``RequireTouchque`` step is sent as ``{"detail": {...}}`` and the page
    never sees it. Sends Touchque's steps and refusals with the SAME JSON
    shape as the Django/Flask adapters (no ``{"detail": ...}`` wrapper), and an
    ``error_body`` result exactly as returned.

    It handles only Touchque's answers (and an ``HTTPException`` whose
    ``detail`` is a dict with ``touchque``). Every other ``HTTPException``
    goes to FastAPI's default handler (``http_exception_handler``),
    unchanged (no body on a 204 or 304). It is registered for
    ``fastapi.HTTPException``, so it replaces your own handler for that
    class (one you register after it replaces it instead), and the
    ``fastapi.HTTPException``s you raise no longer reach a handler you set
    for Starlette's ``HTTPException``."""
    from fastapi import Request as _Request
    from fastapi.exception_handlers import http_exception_handler
    from fastapi.responses import JSONResponse

    @app.exception_handler(HTTPException)
    async def _touchque_exception_handler(request: _Request, exc: HTTPException):  # type: ignore[no-redef]
        if isinstance(exc, _GuardAnswer):
            return JSONResponse(exc.touchque_body, status_code=exc.status_code, headers=exc.headers)
        if isinstance(exc.detail, dict) and 'touchque' in exc.detail:
            return JSONResponse(exc.detail, status_code=exc.status_code, headers=exc.headers)
        return await http_exception_handler(request, exc)


async def _await(awaitable: Awaitable[Any]) -> Any:
    return await awaitable


def _run_async(awaitable: Awaitable[Any]) -> Any:
    """Resolves an async callback's result from the relay's worker thread."""
    return anyio.from_thread.run(_await, awaitable)


def touchque_relay_router(
    client: Optional[Touchque] = None,
    prefix: str = '',
    handler: Optional[RelayHandler] = None,
    **options: Any
) -> APIRouter:
    """An APIRouter with every relay route. ``options`` are ``RelayHandler``'s
    (``get_user_id`` is required); or pass a ready ``handler``. Callbacks may
    be sync or async.

    Callbacks get the Starlette ``Request``; ``on_authenticated(request,
    response, info)`` gets a ``fastapi.Response`` whose headers (e.g.
    ``response.set_cookie(...)``) are copied onto the JSON response - the same
    pattern as a FastAPI ``response: Response`` parameter - or it may write
    ``request.session``. ``request.client.host`` is the client IP the rate
    limiter uses: behind a proxy, run uvicorn with ``--proxy-headers``.
    The relay (blocking HTTP calls) runs in the threadpool.
    """
    relay = handler or RelayHandler(client, **options)
    router = APIRouter(prefix=prefix)

    def make_endpoint(method: str, sub: str) -> Callable[[Request], Awaitable[Response]]:
        async def endpoint(request: Request) -> Response:
            raw = await request.body()
            body = None
            if raw and request.headers.get('content-type', '').split(';')[0].strip() == 'application/json':
                try:
                    body = json.loads(raw)
                except ValueError:
                    body = None
            native = Response()
            path = sub.replace('<id>', request.path_params.get('cred_id', ''))
            result = await anyio.to_thread.run_sync(lambda: relay.handle(
                method, path, body=body,
                ip=request.client.host if request.client else None,
                user_agent=request.headers.get('user-agent'),
                get_header=lambda name: request.headers.get(name),
                request=request, response=native, run_async=_run_async,
            ))
            if result is None:
                raise HTTPException(status_code=404)
            out = JSONResponse(result.body, status_code=result.status, headers=result.headers)
            out.raw_headers.extend(
                (k, v) for k, v in native.raw_headers if k not in (b'content-length', b'content-type'))
            return out
        return endpoint

    for method, sub in RELAY_ROUTES:
        router.add_api_route(sub.replace('<id>', '{cred_id}'), make_endpoint(method, sub), methods=[method],
                             include_in_schema=False)
    return router

# ─────────────────────────────────────────────────────────────
# From touchque/contrib/django.py — @require_touchque + touchque_relay_view / touchque_relay_urls
# ─────────────────────────────────────────────────────────────

"""
Django: one line per protected view.

    from touchque.contrib.django import require_touchque

    @require_touchque('SEND_MONEY', details=lambda req: {'Amount': f'{req.POST["amount"]} EUR'})
    def transfer(request):
        return JsonResponse({'ok': True, 'touchque': request.touchque})

Until the user approves on their phone this answers
202 {"touchque": step, "token": ...}. Your page shows the step in its own
design and sends the same request again with header
``X-Touchque-Token: <token>``. Once approved the view runs ONCE, with
``request.touchque`` set to the approval.

Relay routes (POST /login, enrollment, offline codes, passkey ceremonies)
under one URL prefix - see ``touchque.relay.RelayHandler`` for every option:

    # urls.py
    from touchque.contrib.django import touchque_relay_urls

    def opened(request, response, info):
        request.session['user'] = info['externalUsername']

    urlpatterns = [
        path('touchque/', include(touchque_relay_urls(
            get_user_id=lambda req: req.session.get('user'),
            get_login_user=lambda req: req.session.get('password_ok'),
            on_authenticated=opened,
        ))),
    ]

Django's CSRF protection stays on for these POST/DELETE routes: send the
token from the page (``@touchque/web``: ``headers: {'X-CSRFToken': ...}``),
or pass ``csrf_exempt=True`` if you protect them another way.
"""
import functools
import json
from typing import Any, Callable, Dict, List, Optional, Tuple

from django.core.serializers.json import DjangoJSONEncoder
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.urls import re_path
from django.views.decorators.csrf import csrf_exempt as _csrf_exempt

from ..client import Touchque
from ..guard import ErrorBody, SilentSignIn, guard_input_from_headers, run_guard, silent_input_from_headers
from ..guard import guard_response as _guard_response
from ..relay import RelayHandler
from ..steps import LoginDetails


def _default_user(request: HttpRequest) -> Optional[str]:
    u = getattr(request, 'user', None)
    if u is None or not getattr(u, 'is_authenticated', True):
        return None
    if isinstance(u, str):
        return u
    email = getattr(u, 'email', None)
    return email or getattr(u, 'username', None) or str(getattr(u, 'pk', '') or '') or None


def guard_response(result: Dict[str, Any], error_body: Optional[ErrorBody] = None) -> Tuple[int, Dict[str, str], Any]:
    """What ``require_touchque`` sends for a ``run_guard`` result that is not
    an approval, as ``(status, headers, body)``: ``touchque.guard_response``
    with ``error_body``'s result encoded by ``DjangoJSONEncoder`` (dates,
    ``Decimal``, ``UUID``), as the decorator encodes it. For the guard inside
    your own view::

        status, headers, body = guard_response(result, error_body)
        resp = JsonResponse(body, status=status, safe=False)
        for name, value in headers.items():
            resp[name] = value
        return resp
    """
    return _guard_response(result, error_body, encode=_encode)


def require_touchque(
    action: str,
    client: Optional[Touchque] = None,
    user: Optional[Callable[[HttpRequest], Optional[str]]] = None,
    details: Optional[Callable[[HttpRequest], Optional[LoginDetails]]] = None,
    reference_id: Optional[Callable[[HttpRequest], Optional[str]]] = None,
    silent_sign_in: SilentSignIn = False,
    context: Optional[Callable[[HttpRequest], Optional[Dict[str, Any]]]] = None,
    error_body: Optional[ErrorBody] = None,
) -> Callable:
    """
    ``client``: default ``get_default_client()``, built from ``TQ_API_KEY`` /
    ``TQ_API_SECRET`` on the first request. Without them the view answers
    500 ``misconfigured`` (401 when nobody is signed in) and never runs;
    nothing is raised at import or on a request.

    ``user``: who is approving, given the request. Default:
    ``request.user.email`` (Django auth). For the login step, return the user
    who just passed your password check, e.g.
    ``user=lambda req: req.session.get('password_ok')``.

    ``silent_sign_in`` (default off): when on, a new attempt whose browser
    sent its device-bound key proof (``X-Touchque-Browser``, added by
    ``@touchque/web`` with ``browserKey: true``) first asks Touchque whether
    anything about it is new. If nothing is, your view runs at once with no
    push (``request.touchque['assurance']['method'] == 'silent'``,
    ``request.touchque['reasons']``). Otherwise, and on any error, the usual push
    starts and its approval makes the browser known.
    ``{'max_age_seconds': n}`` sets your own limit on how long ago the last
    phone approval in that browser may be.

    ``context``: for your Touchque Actions only (``event.context``), e.g. the
    user's roles. Never shown on the phone.

    ``error_body``: your app's own error shape for the refusals (401, 403,
    408, 423, 429, 500, 503), e.g.
    ``error_body=lambda r: {'message': r['message'], 'code': r['code']}``.
    It gets ``{'status', 'code', 'message', 'touchque'}``; what it returns
    counts by its JSON encoding (``DjangoJSONEncoder``): an object (a dict, a
    dataclass, a pydantic model) is sent with ``touchque`` set to the step,
    anything else as it is. Status and headers stay, and every refusal carries
    ``X-Touchque-State`` (and ``X-Touchque-Reason``). Never called for a 202
    step. For ``run_guard`` in your own view, this module's ``guard_response``
    gives the same answer.
    """
    user_of = user or _default_user
    tq = client

    def decorator(view: Callable) -> Callable:
        @functools.wraps(view)
        def wrapped(request: HttpRequest, *args: Any, **kwargs: Any) -> Any:
            uid = user_of(request)
            result = run_guard(
                tq, uid, action,
                details=details(request) if details else None,
                reference_id=reference_id(request) if reference_id else None,
                context=context(request) if context else None,
                ip=request.META.get('REMOTE_ADDR'), user_agent=request.META.get('HTTP_USER_AGENT'),
                **guard_input_from_headers(lambda name: request.headers.get(name)),
                **silent_input_from_headers(silent_sign_in, lambda name: request.headers.get(name)),
            )
            if 'approved' in result:
                request.touchque = result['approved']
                return view(request, *args, **kwargs)
            status, headers, body = guard_response(result, error_body)
            resp = JsonResponse(body, status=status, safe=False)
            for name, value in headers.items():
                resp[name] = value
            return resp
        return wrapped
    return decorator


def _encode(value: Any) -> str:
    """How ``JsonResponse`` encodes a body."""
    return json.dumps(value, cls=DjangoJSONEncoder)


def _json_body(request: HttpRequest) -> Any:
    if request.content_type != 'application/json' or not request.body:
        return None
    try:
        return json.loads(request.body)
    except ValueError:
        return None


def touchque_relay_view(
    client: Optional[Touchque] = None,
    csrf_exempt: bool = False,
    handler: Optional[RelayHandler] = None,
    **options: Any
) -> Callable:
    """One view for every relay route; the sub-path comes from the ``sub``
    URL kwarg (see ``touchque_relay_urls``). ``options`` are
    ``RelayHandler``'s (``get_user_id`` is required); or pass a ready ``handler``.

    Callbacks get the ``HttpRequest``; ``on_authenticated(request, response,
    info)`` gets the ``HttpResponse`` that will be sent, so it may call
    ``response.set_cookie(...)`` or write ``request.session``.
    ``REMOTE_ADDR`` is the client IP the rate limiter uses: behind a proxy,
    make sure it holds the real client address.
    """
    relay = handler or RelayHandler(client, **options)

    def view(request: HttpRequest, sub: str = '') -> HttpResponse:
        response = HttpResponse(content_type='application/json')
        result = relay.handle(
            request.method or '', '/' + sub, body=_json_body(request),
            ip=request.META.get('REMOTE_ADDR'), user_agent=request.META.get('HTTP_USER_AGENT'),
            get_header=lambda name: request.headers.get(name),
            request=request, response=response,
        )
        if result is None:
            raise Http404()
        response.status_code = result.status
        response.content = json.dumps(result.body, cls=DjangoJSONEncoder).encode('utf-8')
        for key, value in result.headers.items():
            response[key] = value
        return response

    return _csrf_exempt(view) if csrf_exempt else view


def touchque_relay_urls(
    client: Optional[Touchque] = None,
    csrf_exempt: bool = False,
    handler: Optional[RelayHandler] = None,
    **options: Any
) -> List[Any]:
    """URL patterns for the relay, to mount with
    ``path('touchque/', include(touchque_relay_urls(...)))``."""
    view = touchque_relay_view(client, csrf_exempt=csrf_exempt, handler=handler, **options)
    return [re_path(r'^(?P<sub>.*)$', view, name='touchque_relay')]
