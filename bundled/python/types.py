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
from .resources.auth import SetupContext, SetupDevice, SetupLocation, parse_setup_context
from .resources.identity import CustomDomainsOverview
from .resources.recovery import is_recovery_open
from .resources.mobile import is_mobile_push_expired, mobile_push_from_webhook
from .resources.assist import is_assist_check_passed
from .resources.qr_pairings import QR_PAIRING_REFUSAL_REASONS, qr_pairing_uri
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
    ID_JAG_TOKEN_TYPE, IdJagDpopKey, IdJagError, IdJagVerifier, create_id_jag_dpop_key, id_jag_dpop_proof, redeem_id_jag,
    request_id_jag,
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
    'SetupContext',
    'SetupLocation',
    'SetupDevice',
    'parse_setup_context',
    'CustomDomainsOverview',
    'is_recovery_open',
    'is_mobile_push_expired',
    'mobile_push_from_webhook',
    'is_assist_check_passed',
    'QR_PAIRING_REFUSAL_REASONS',
    'qr_pairing_uri',
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
    'IdJagDpopKey',
    'create_id_jag_dpop_key',
    'id_jag_dpop_proof',
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
        links the Touchque app first. ``ip`` / ``user_agent``: the browser's,
        sent with the push and with each first-time QR request, a reset too
        (the phone shows where the QR was asked for). ``browser_proof``: the browser's
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
            return _enroll_step(client, user, ip=ip, user_agent=user_agent)
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


def _enroll_step(client: 'Touchque', user: str, ip: Optional[str] = None,
                 user_agent: Optional[str] = None) -> Dict[str, Any]:
    """First-time linking. Never unlinks a phone: a secret is only re-issued
    when the account is confirmed NOT linked. ``ip`` / ``user_agent``: the
    browser's, as the push gets them, sent with the new secret and with its
    reset alike (each records its own QR's), so the phone shows where the QR
    was asked for before it links (2FA setup context)."""
    try:
        return _enroll_qr(client.auth.generate_secret(user, client_ip=ip, user_agent=user_agent))
    except TouchqueAPIException as err:
        if err.status != 409:
            raise
        try:
            current = client.auth.get_user(user)
        except TouchqueAPIException:
            current = None
        if current and (current.get('used') or current.get('deviceId')):
            return {'state': 'enroll', 'reason': 'already_linked'}
        return _enroll_qr(client.auth.reset_secret(user, client_ip=ip, user_agent=user_agent))


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

        ``device_risk_request_id``: the Touchque Device Risk identification (from
        the Device Risk SDK's tag or identify call); optional, for this account
        only. Or ``device_risk``: the Touchque Device Risk report (from the
        Device Risk SDK's tag or collect call), passed through untouched;
        optional. Used only when your workspace turned Device risk on: its
        signals only ever ask for more, and a device your admin marked "step up
        always" asks at once.

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
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

from ..http_client import HttpClient
from ..exceptions import TouchqueAPIException

_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
_DEVICE_CODE_LENGTH = 10
# a-z to A-Z (ASCII only); spaces, tabs, line breaks and dashes dropped.
_DEVICE_CODE_TABLE = str.maketrans('abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ' \t\n\r\f\v-')


def _utc_iso(at: Union[str, datetime]) -> str:
    """A datetime as ISO 8601 in UTC (a naive one is taken as UTC); a string as given."""
    if isinstance(at, datetime):
        aware = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
        return aware.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    return at


def _positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 1


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
        qr_format: Optional[str] = None,
        include_qr_terminal: bool = False,
    ) -> Dict[str, Any]:
        """Issues an offline QR challenge. Returns
        ``{challengeId, qr, qrFormat, qrDataUrl, expiresAt, expiresInSeconds, totpAvailable}``
        (+ ``challengeCode`` when number matching applies: print it under the QR; the
        phone offers it among two decoys and the user taps the match).
        ``details`` is REQUIRED for critical action types.

        ``request_id`` is the push this QR is a fallback for: once the phone REJECTS it the QR
        is dead (no new QR is issued, a code for the old one is refused with ``request_rejected``),
        and a push with number matching makes the QR show the same number. Always pass it
        when the QR follows a push.

        ``qr_format='compact'``: a smaller QR (``qr`` starts with ``TQ3:``) for terminals and
        small screens, the same challenge and the same 7-character code; it carries no location
        block, so put what the phone should show in ``details``. The default is ``'standard'``
        (``TQ2.``); the answer's ``qrFormat`` says which format ``qr`` is.
        ``include_qr_terminal=True`` adds ``qrTerminal``: the QR drawn with Unicode half blocks
        (lines separated by ``\\n``), ready to print in a terminal (``None`` when it could not be drawn).
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
        if qr_format is not None:
            body['qrFormat'] = qr_format
        if include_qr_terminal:
            body['includeQrTerminal'] = True
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

    def totp_verifiers(self, external_usernames: List[str], scope: Dict[str, str],
                       from_step: Optional[int] = None, steps: Optional[int] = None) -> Dict[str, Any]:
        """For checking typed codes while your server cannot reach Touchque (an
        outage): salted, slow digests of each user's next OUTAGE codes for one
        scope, never a key. Outage codes are not the normal time-based code:
        each scope (an organization, or your own outage server) has its own,
        the user's phone shows them under the normal code ("<name>: code for
        when Touchque can't be reached") once a call has named the scope for
        the user, and :meth:`verify_totp` never accepts them.

        ``scope`` is required: ``{'id': ..., 'name': ...}``, ``id`` 1-64
        characters of a-z, 0-9, ".", "_", "-" (compared in lower case), ``name``
        1-80 characters shown on the phone. Up to 1,000 users and 24,000
        user-steps a call; ``steps`` 1-480 (default 480, four hours) from
        ``from_step`` (default: the current 30-second step). Returns
        ``{stepSeconds, fromStep, steps, notAfterStep, scope, digestsPerStep, kdf,
        users: [{externalUsername, fromStep, salt, digests}]}`` with only the
        users who can use time-based codes now and whose phone shows this scope.
        Check a typed code with :meth:`match_totp_verifier`. Requires the
        workspace policies ``offlineTotpEnabled`` and ``outageVerifiersEnabled``.
        Fetch again every few minutes from the step you have: removed and frozen
        users fall out. Quotas are per scope (429 ``scope_quota_exceeded``) and
        per workspace. A call without a scope is refused with 400 ``scope_required``."""
        body: Dict[str, Any] = {'externalUsernames': list(external_usernames),
                                'scope': {'id': scope['id'], 'name': scope['name']}}
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
        per = verifiers.get('digestsPerStep') or 2
        now = int((time.time() if at is None else at) // verifiers['stepSeconds'])
        salt = base64.b64decode(user['salt'])
        digests = base64.b64decode(user['digests'])
        for step in (now, now - 1, now + 1):
            if step < user['fromStep'] or step > verifiers['notAfterStep']:
                continue
            i = (step - user['fromStep']) * per * length
            if i + per * length > len(digests):
                continue
            got = hashlib.pbkdf2_hmac('sha256', given.encode(), salt + f':{step}'.encode(), kdf['iterations'], length)
            for k in range(per):
                if hmac.compare_digest(digests[i + k * length:i + (k + 1) * length], got):
                    return step
        return None

    def issue_device_pack(self, external_username: str, scope: Dict[str, str], account: str,
                          count: Optional[int] = None, valid_days: Optional[int] = None) -> Dict[str, Any]:
        """The next offline sign-ins of a person on one device (a laptop, a kiosk, a field
        tablet) that must sign them in with no network. Ask only right after a sign-in the person
        approved on the phone at that device itself, never for a remote session.

        ``scope`` is the device: ``{'id': ..., 'name': ...}``, ``id`` 1-64 characters of a-z, 0-9,
        ".", "_", "-" starting with a letter or a digit (compared in lower case; one id per device
        install), ``name`` 1-80 characters shown on the phone. ``account`` (1-255 characters, shown
        on the phone) is the account the person signs in to there. ``count`` 1-20 slots (default
        10), valid ``valid_days`` 1-30 days (default 14). Returns ``{scope: {id, name, epoch},
        account, validUntil, codeLength, kdf: {name, iterations, length}, slots: [{index, salt,
        digest, qr, qrTerminal}]}``: per slot the slow digest of a 10-character code and a QR
        (``TQ4:``) only the person's phone opens; nothing in it can produce a code. Offline, the
        device shows the lowest unused slot's QR, the person scans it with the Touchque app,
        approves and types the code (XXXXX-XXXXX); check it with :meth:`verify_device_code`.
        Indexes continue from the device's last pack and are never issued twice.

        Requires the workspace policies ``offlineSignEnabled`` and ``offlineDevicePacksEnabled``
        (403 ``offline_device_packs_disabled``); refused under a passkey-only policy (403
        ``phishing_resistant_required``), for a phone not enrolled for offline sign (409
        ``device_not_enrolled_for_offline``), for a revoked device (409 ``scope_revoked``) and after
        12 packs an hour per person and device (429 ``too_many_packs``)."""
        body: Dict[str, Any] = {'externalUsername': external_username,
                                'scope': {'id': scope['id'], 'name': scope['name']}, 'account': account}
        if count is not None:
            body['count'] = count
        if valid_days is not None:
            body['validDays'] = valid_days
        return self._http.post('/offline/device-packs', body)

    def revoke_device_scope(self, scope_id: str, external_username: Optional[str] = None,
                            reason: Optional[str] = None) -> Dict[str, Any]:
        """A device's offline sign-ins stop (lost, stolen, reinstalled): it gets no more packs,
        and the person's phone refuses its codes once it has the list. Without
        ``external_username``, every person's packs on that device. ``reason``: up to 64
        characters (default ``revoked``). Returns ``{revoked}``, how many packs were revoked. A
        reinstalled device needs a new scope id."""
        body: Dict[str, Any] = {'scopeId': scope_id}
        if external_username is not None:
            body['externalUsername'] = external_username
        if reason is not None:
            body['reason'] = reason
        return self._http.post('/offline/device-packs/revoke', body)

    def report_device_pack_use(self, scope_id: str, external_username: str,
                               used: List[Dict[str, Any]]) -> Dict[str, Any]:
        """The slots a device accepted while it had no network, sent once it is back online:
        ``used`` is 1-100 ``{'index': ..., 'at': ...}`` (``at``: a datetime, a naive one taken as
        UTC, or an ISO 8601 string, within the last 60 days). Touchque writes one log row per slot
        with the time it happened. Returns ``{recorded, ignored}`` (an index never issued or
        repeated, or a time out of range, is ignored); 404 ``unknown_scope`` when the device has no
        pack for that person."""
        body = {'scopeId': scope_id, 'externalUsername': external_username,
                'used': [{'index': u['index'], 'at': _utc_iso(u['at'])} for u in used]}
        return self._http.post('/offline/device-packs/report', body)

    @staticmethod
    def normalize_device_code(code: Any) -> Optional[str]:
        """A typed offline sign-in code in its canonical form: upper case, without spaces or
        dashes. ``None`` unless it is exactly 10 characters of the codes' alphabet (A-Z and 2-9
        without I and O)."""
        if not isinstance(code, str):
            return None
        given = code.translate(_DEVICE_CODE_TABLE)
        if len(given) != _DEVICE_CODE_LENGTH or any(c not in _CODE_ALPHABET for c in given):
            return None
        return given

    @staticmethod
    def format_device_code(code: Any) -> Optional[str]:
        """An offline sign-in code the way the phone shows it, ``XXXXX-XXXXX``; ``None`` unless
        :meth:`normalize_device_code` accepts it."""
        given = Offline.normalize_device_code(code)
        return None if given is None else f'{given[:5]}-{given[5:]}'

    @staticmethod
    def verify_device_code(kdf: Mapping, slot: Mapping, code: str) -> bool:
        """Checks the code a person typed against one slot of an offline sign-in pack (the
        pack's ``kdf`` and one of its ``slots``), on the device and with no network:
        PBKDF2-SHA256(code, salt || ":" || index, kdf iterations, kdf length) compared in constant
        time with the slot's digest. Case, spaces and dashes are ignored; anything that is not 10
        characters of the codes' alphabet is ``False`` without computing the digest, and so is a
        KDF other than pbkdf2-sha256. Check the lowest unused slot only. The digest takes a moment
        by design (600,000 iterations)."""
        given = Offline.normalize_device_code(code)
        if given is None or not isinstance(kdf, Mapping) or not isinstance(slot, Mapping):
            return False
        name = kdf.get('name')
        if name and name != 'pbkdf2-sha256':
            return False
        iterations, length, index = kdf.get('iterations'), kdf.get('length'), slot.get('index')
        if not (_positive_int(iterations) and _positive_int(length) and _positive_int(index)) or iterations > 0x7fffffff:
            return False
        try:
            salt = base64.b64decode(slot['salt'], validate=True)
            digest = base64.b64decode(slot['digest'], validate=True)
        except (KeyError, TypeError, ValueError):
            return False
        if len(digest) != length:
            return False
        got = hashlib.pbkdf2_hmac('sha256', given.encode('ascii'), salt + b':' + str(index).encode('ascii'), iterations, length)
        return hmac.compare_digest(got, digest)

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

  POST   /enroll/start                    (auth required) -> generate_secret response, or reset_secret's
                                          for a QR not scanned yet (both with the browser's IP and
                                          User-Agent, as for POST /login)
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
    real client behind a proxy (e.g. werkzeug ``ProxyFix``). Touchque gets
    the same address, with the User-Agent, for each push and first-time QR.

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

# ─────────────────────────────────────────────────────────────
# From touchque/cross_app_access.py — Cross App Access: ID-JAG request/redeem/verify, DPoP binding
# ─────────────────────────────────────────────────────────────

"""Cross App Access: Identity Assertion JWT Authorization Grants (ID-JAG,
draft-ietf-oauth-identity-assertion-authz-grant, an open standard).

An organization's identity provider (Touchque SSO) decides which of its apps
may reach which other service for its members; the app trades a member's ID
token for an ID-JAG there, then the ID-JAG for an access token at the other
service's authorization server, with no consent screen per member.

Your app, signed in with Touchque SSO (an OpenID Connect app with a secret)::

    jag = request_id_jag(issuer='https://sso.touchque.com', client_id=client_id, client_secret=secret,
                         id_token=id_token, audience='https://auth.files.example')
    tokens = redeem_id_jag(token_endpoint='https://auth.files.example/token', client_id='acme',
                           client_secret=files_secret, assertion=jag['assertion'])

Your own authorization server, taking ID-JAGs from an organization's identity provider::

    verifier = IdJagVerifier(issuer='https://sso.touchque.com', audience='https://auth.files.example')
    claims = verifier.verify(form['assertion'], client_id=authenticated_client_id)
    # claims['sub'] (the member at that identity provider), claims['email'], claims['scopes'], claims['resource']

Sender-constrained with DPoP (RFC 9449), optional: give the same key to both calls. The ID-JAG is
then bound to it (``cnf.jkt``) and is useless to anyone who copies it without the key::

    dpop_key = create_id_jag_dpop_key()
    jag = request_id_jag(..., dpop_key=dpop_key)     # jag['dpop_bound']: the identity provider bound it
    tokens = redeem_id_jag(..., assertion=jag['assertion'], dpop_key=dpop_key)

A token endpoint that answers ``use_dpop_nonce`` with a valid ``DPoP-Nonce`` (RFC 9449 nonce
syntax) gets the same request once more, with a proof that carries the nonce. The access token is
DPoP-bound too: a request with it carries a proof for that method, URL and token::

    proof = id_jag_dpop_proof(dpop_key, url, method='GET', access_token=tokens['access_token'])
    requests.get(url, headers={'Authorization': f"DPoP {tokens['access_token']}", 'DPoP': proof})

An authorization server that checks DPoP proofs checks the proof (and any nonce it requires) before
``verify``, which uses up the ID-JAG's jti, and passes the proof key's thumbprint; a bound ID-JAG
without it is refused::

    claims = verifier.verify(form['assertion'], client_id=authenticated_client_id, dpop_jkt=proof_jkt)

Needs the optional ``cryptography`` package for verifying and for DPoP: ``pip install "touchque-authenticator[agent]"``.
"""

import base64
import hashlib
import re
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
from urllib.parse import quote, urlparse, urlsplit, urlunsplit

import requests

from .agent import _b64url, _crypto, _json, _public_jwk, jwk_thumbprint
from .exceptions import TouchqueConfigException
from .mcp_auth import _json_part, _b64d, _public_key, _verify

__all__ = [
    'ID_JAG_TOKEN_TYPE', 'ID_TOKEN_TYPE', 'TOKEN_EXCHANGE_GRANT', 'JWT_BEARER_GRANT',
    'IdJagError', 'IdJagVerifier', 'IdJagDpopKey', 'create_id_jag_dpop_key', 'id_jag_dpop_proof',
    'request_id_jag', 'redeem_id_jag',
]

ID_JAG_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id-jag'
ID_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:id_token'
TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange'
JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
_TYP = 'oauth-id-jag+jwt'
_ALGS = ('RS256', 'ES256', 'EdDSA')
_DEFAULT_PORTS = {'http': 80, 'https': 443}
# RFC 9110 token characters (an HTTP method, an auth-scheme, an auth-param name).
_TCHAR = r"[!#$%&'*+.^_`|~0-9A-Za-z-]"
_TOKEN = re.compile(_TCHAR + '+')
# What a method is trimmed of: ASCII whitespace only (not NUL, not U+00A0 or other Unicode spaces).
_ASCII_SPACE = ' \t\r\n\v\f'
# RFC 9449 section 8: DPoP-Nonce = 1*NQCHAR, NQCHAR = %x21 / %x23-5B / %x5D-7E (printable ASCII
# except space, double quote and backslash).
_NONCE = re.compile(r'[\x21\x23-\x5b\x5d-\x7e]+')
# RFC 6749 section 5.2: an error code is 1*( %x20-21 / %x23-5B / %x5D-7E ); one of at most 128 is taken.
_ERROR_CODE = re.compile(r'[\x20\x21\x23-\x5b\x5d-\x7e]{1,128}')
# Reading WWW-Authenticate (RFC 9110 section 11.6.1) in time linear in its length. _LIST_ITEMS finds
# each item of the comma-separated list that is not empty, as the token it starts with and the rest
# after blanks: an item runs to the next comma outside a quoted string (a quoted-pair's character never
# ends a quoted string, and one left open runs to the end). Then the token a text starts with, a whole
# quoted-string and its quoted-pairs.
_LIST_ITEMS = re.compile(r'(?:^|(?<=,))[ \t]*(?=[^ \t,])(' + _TCHAR + r'*)[ \t]*((?:[^",]+|"[^"\\]*(?:\\.[^"\\]*)*"?)*)', re.S)
_LEADING_TOKEN = re.compile(r'[ \t]*(' + _TCHAR + r'*)[ \t]*')
_QUOTED_STRING = re.compile(r'"([^"\\]*(?:\\.[^"\\]*)*)"', re.S)
_QUOTED_PAIR = re.compile(r'\\(.)', re.S)


class IdJagError(Exception):
    """A refused ID-JAG or exchange; ``code`` is the OAuth error (invalid_grant for a bad ID-JAG).

    From ``request_id_jag`` and ``redeem_id_jag``: a token endpoint answer outside 2xx (a redirect
    included: redirects are not followed) has its ``status``, and its JSON ``error`` as ``code`` when
    that is an OAuth error code (RFC 6749 error characters, at most 128), else ``server_error``; a 2xx
    whose body is not a JSON object is ``invalid_response`` with its ``status``. A token endpoint that
    could not be reached or whose answer could not be read (refused, reset, DNS, the 10-second timeout,
    an answer requests refuses, such as a header line over 64 KB) is ``temporarily_unavailable`` with no
    ``status`` and the ``requests`` exception as ``__cause__``.

    ``dpop_nonce`` is the latest valid ``DPoP-Nonce`` (RFC 9449) the server sent during the call (the
    retried request's answer's, else the first answer's), on every IdJagError of the call, for a retry
    by hand; ``None`` without one."""

    def __init__(self, code: str, message: str, status: Optional[int] = None, dpop_nonce: Optional[str] = None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.dpop_nonce = dpop_nonce


class IdJagDpopKey:
    """A DPoP key (RFC 9449, P-256) that binds an ID-JAG to its holder; keep it in this process."""

    def __init__(self, private_key: Any, public_jwk: Dict[str, Any], thumbprint: str):
        self.private_key = private_key
        self.public_jwk = public_jwk
        # RFC 7638 thumbprint: the ID-JAG's cnf.jkt.
        self.thumbprint = thumbprint

    def __repr__(self) -> str:
        return f'IdJagDpopKey(thumbprint={self.thumbprint!r})'


def create_id_jag_dpop_key() -> IdJagDpopKey:
    """A fresh DPoP key for ``request_id_jag`` and ``redeem_id_jag``."""
    _, _, ec, _, _ = _crypto()
    key = ec.generate_private_key(ec.SECP256R1())
    public = _public_jwk(key)
    return IdJagDpopKey(key, public, jwk_thumbprint(public))


def _htu(url: str) -> str:
    # htu (RFC 9449), not a full WHATWG URL normalization: scheme and host lowercased, user info and
    # the default port dropped, '/' for an empty path, the path kept as given (no dot-segment removal,
    # no re-encoding), no query or fragment. urllib.parse.urlsplit splits the URL.
    if not isinstance(url, str):
        raise TouchqueConfigException(f'{url!r} is not an absolute http(s) URL')
    try:
        u = urlsplit(url)
        port = u.port
    except ValueError:  # urlsplit refuses it (such as an unbalanced [) or cannot read its port (such as 99999)
        raise TouchqueConfigException(f'{url} is not an absolute http(s) URL') from None
    if u.scheme not in _DEFAULT_PORTS or not u.hostname:
        raise TouchqueConfigException(f'{url} is not an absolute http(s) URL')
    host = f'[{u.hostname}]' if ':' in u.hostname else u.hostname
    if port is not None and port != _DEFAULT_PORTS[u.scheme]:
        host = f'{host}:{port}'
    return f'{u.scheme}://{host}{u.path or "/"}'


def _htm(method: Optional[str]) -> str:
    # htm: the method trimmed of ASCII whitespace and uppercased, POST when empty. RFC 9110 token
    # characters only, checked before uppercasing (str.upper() turns some non-ASCII letters into ASCII
    # ones: U+017F into 'S'). str.strip() with no argument would also drop U+00A0 and other Unicode
    # spaces, which then would not be refused.
    text = '' if method is None else method.strip(_ASCII_SPACE) if isinstance(method, str) else None
    if text == '':
        return 'POST'
    if text is None or not _TOKEN.fullmatch(text):
        raise TouchqueConfigException(f'{method!r} is not an HTTP method: RFC 9110 token characters only')
    return text.upper()


def id_jag_dpop_proof(key: IdJagDpopKey, url: str, *, method: str = 'POST', access_token: Optional[str] = None,
                      nonce: Optional[str] = None) -> str:
    """A DPoP proof (RFC 9449) for one request to ``url``: by default the POST to a token endpoint.

    For a request with the DPoP-bound access token, give its ``method`` and the ``access_token``
    (``ath``) and send ``Authorization: DPoP <access_token>`` with the proof. ``nonce``: the
    server's ``DPoP-Nonce``, put in the proof as given. An empty ``access_token`` or ``nonce`` is
    left out, like ``None``.

    ``htm`` is ``method`` trimmed of ASCII whitespace (space, tab, CR, LF, VT, FF) and uppercased,
    POST when empty; what is left must be RFC 9110 token characters (NUL and U+00A0 are not trimmed,
    so they are refused), else TouchqueConfigException. ``htu`` is ``url`` with the scheme and host
    lowercased, user info and the default port dropped, ``/`` for an empty path, the path kept exactly
    as given (no dot-segment removal, no re-encoding) and no query or fragment; a URL without an http
    or https scheme or without a host, or one ``urllib.parse.urlsplit`` refuses or whose port it cannot
    read, raises TouchqueConfigException. So give the URL your HTTP client sends: requests removes dot
    segments and percent-encodes some characters (see ``requests.Request(method, url).prepare().url``).
    ``request_id_jag`` and ``redeem_id_jag`` make their proofs for the URL requests sends. The
    header's ``jwk`` is the key's ``kty``, ``crv``, ``x`` and ``y`` only."""
    hashes, _, ec, _, decode_dss_signature = _crypto()
    jwk = key.public_jwk
    header = {'typ': 'dpop+jwt', 'alg': 'ES256', 'jwk': {'kty': jwk['kty'], 'crv': jwk['crv'], 'x': jwk['x'], 'y': jwk['y']}}
    claims: Dict[str, Any] = {'htm': _htm(method), 'htu': _htu(url), 'iat': int(time.time()), 'jti': str(uuid.uuid4())}
    if access_token:
        claims['ath'] = _b64url(hashlib.sha256(access_token.encode('ascii')).digest())
    if nonce:
        claims['nonce'] = nonce
    signing_input = f'{_b64url(_json(header).encode())}.{_b64url(_json(claims).encode())}'
    r, s = decode_dss_signature(key.private_key.sign(signing_input.encode('ascii'), ec.ECDSA(hashes.SHA256())))
    return f"{signing_input}.{_b64url(r.to_bytes(32, 'big') + s.to_bytes(32, 'big'))}"


def _safe_url(value: str) -> bool:
    u = urlparse(value or '')
    return u.scheme == 'https' or (u.scheme == 'http' and u.hostname in ('localhost', '127.0.0.1', '::1'))


def _get_json(url: str) -> Dict[str, Any]:
    r = requests.get(url, timeout=5, allow_redirects=False, headers={'Accept': 'application/json'})
    if r.status_code != 200:
        raise RuntimeError(f'{url} answered {r.status_code}')
    return r.json()


def _discover(issuer: str) -> Dict[str, Any]:
    meta = _get_json(issuer.rstrip('/') + '/.well-known/openid-configuration')
    if meta.get('issuer') != issuer:
        raise TouchqueConfigException("the identity provider's metadata does not match its issuer")
    return meta


class IdJagVerifier:
    """Checks the ID-JAG an authenticated client presents at your authorization server (jwt-bearer grant)."""

    def __init__(self, issuer: str, audience: str, jwks_uri: Optional[str] = None, clock_skew: int = 60,
                 first_use: Optional[Callable[[str, int], bool]] = None):
        if not issuer or not audience:
            raise TouchqueConfigException("IdJagVerifier needs issuer (the identity provider) and audience (your authorization server's issuer)")
        self.issuer = issuer
        self.audience = audience
        self.jwks_uri = jwks_uri
        self.skew = clock_skew
        # Records an ID-JAG's jti and says whether it is new; memory in this process by default.
        self.first_use = first_use or self._remember_once
        self._keys: Dict[str, Any] = {}
        self._keys_at = 0.0
        self._tried_at = 0.0
        self._seen: Dict[str, int] = {}
        self._lock = threading.Lock()

    def _remember_once(self, jti: str, expires_at: int) -> bool:
        now = int(time.time())
        with self._lock:
            for k in [k for k, exp in self._seen.items() if exp < now]:
                del self._seen[k]
            if jti in self._seen:
                return False
            self._seen[jti] = expires_at + self.skew
            return True

    def _load_keys(self) -> None:
        if not self.jwks_uri:
            meta = _discover(self.issuer)
            if not isinstance(meta.get('jwks_uri'), str):
                raise TouchqueConfigException('the identity provider names no jwks_uri')
            self.jwks_uri = meta['jwks_uri']
        jwks = _get_json(self.jwks_uri)
        self._keys = {k['kid']: _public_key(k) for k in jwks.get('keys', []) if k.get('kid')}
        self._keys_at = time.time()

    def _key_for(self, kid: str):
        if not self._keys_at or time.time() - self._keys_at > 600:
            self._load_keys()
        if kid not in self._keys and time.time() - self._tried_at > 60:
            self._tried_at = time.time()
            self._load_keys()
        return self._keys.get(kid)

    def verify(self, assertion: str, client_id: str, dpop_jkt: Optional[str] = None) -> Dict[str, Any]:
        """The ID-JAG, checked and used once: its claims, or IdJagError (code invalid_grant).

        ``dpop_jkt``: the thumbprint of the DPoP proof you verified on this request, if any; an
        ID-JAG bound to a key (``cnf.jkt``) is refused without a matching one. Check the proof (and
        any nonce you require) before calling this: a call that accepts the ID-JAG uses up its jti."""
        def bad(message: str) -> IdJagError:
            return IdJagError('invalid_grant', message)

        parts = assertion.split('.') if isinstance(assertion, str) else []
        if len(parts) != 3:
            raise bad('assertion is not a JWT')
        try:
            head = _json_part(parts[0])
            c = _json_part(parts[1])
            sig = _b64d(parts[2])
        except ValueError:
            raise bad('assertion is not a JWT')
        if head.get('typ') != _TYP:
            raise bad('not an ID-JAG (typ oauth-id-jag+jwt)')
        if head.get('alg') not in _ALGS or not isinstance(head.get('kid'), str):
            raise bad('unsupported signature')
        try:
            key = self._key_for(head['kid'])
        except Exception as err:  # the provider's keys could not be read
            raise IdJagError('temporarily_unavailable', f"the identity provider's keys could not be read: {err}")
        if key is None or not _verify(f'{parts[0]}.{parts[1]}'.encode(), sig, head['alg'], key):
            raise bad('signature does not verify')
        now = int(time.time())
        auds = c.get('aud') if isinstance(c.get('aud'), list) else [c.get('aud')]
        if c.get('iss') != self.issuer:
            raise bad('another issuer')
        if len(auds) != 1 or auds[0] != self.audience:
            raise bad('not for this authorization server')
        if not isinstance(c.get('client_id'), str) or c['client_id'] != client_id:
            raise bad('issued to another client')
        if not isinstance(c.get('exp'), (int, float)) or c['exp'] + self.skew < now:
            raise bad('expired')
        if not isinstance(c.get('iat'), (int, float)) or c['iat'] - self.skew > now:
            raise bad('issued in the future')
        if not isinstance(c.get('sub'), str) or not isinstance(c.get('jti'), str):
            raise bad('sub and jti are required')
        # Before the jti is spent: a copy without the key cannot use the ID-JAG up.
        cnf_jkt = None
        if 'cnf' in c:
            cnf = c['cnf']
            if not isinstance(cnf, dict) or not isinstance(cnf.get('jkt'), str):
                raise bad('unsupported confirmation method (only DPoP cnf.jkt)')
            if not dpop_jkt:
                raise bad('bound to a DPoP key: a DPoP proof with that key is required')
            if dpop_jkt != cnf['jkt']:
                raise bad('the DPoP proof was made with another key')
            cnf_jkt = cnf['jkt']
        if not self.first_use(c['jti'], int(c['exp'])):
            raise bad('already used')
        scope = c.get('scope')
        return {
            'iss': c['iss'], 'sub': c['sub'], 'aud': auds[0], 'client_id': c['client_id'], 'jti': c['jti'],
            'issued_at': int(c['iat']), 'expires_at': int(c['exp']),
            'scopes': scope.split(' ') if isinstance(scope, str) and scope else [],
            'resource': c.get('resource'), 'tenant': c.get('tenant'), 'email': c.get('email'),
            'auth_time': c.get('auth_time'), 'amr': c.get('amr'), 'cnf_jkt': cnf_jkt, 'claims': c,
        }


def _sent_url(url: str) -> str:
    # The URL requests puts on the wire for url, the htu of the SDK's own proofs: requests.Request's
    # prepare() rewrites it (dot segments removed, unreserved percent-escapes decoded, characters a path
    # may not hold percent-encoded, an IDNA host), and requests.adapters.HTTPAdapter.request_url gives the
    # request target it sends. Asking the installed requests keeps the two equal across its versions:
    # before 2.34 a path that starts with // went out from one /, from 2.34 on it goes out as it is.
    try:
        prepared = requests.Request('POST', url).prepare()
    except requests.exceptions.RequestException as err:  # such as a port above 65535
        raise TouchqueConfigException(f'{url} is not a URL requests can send to: {err}') from err
    u = urlsplit(prepared.url)
    adapter = requests.adapters.HTTPAdapter()
    try:
        target = adapter.request_url(prepared, {})
    finally:
        adapter.close()
    path = target.split('?', 1)[0] if target.startswith('/') else u.path
    return urlunsplit((u.scheme, u.netloc, path or '/', u.query, ''))


def _field_values(r: requests.Response, name: str, split_joined: bool = False) -> List[str]:
    # The values of a header, one per field line: urllib3's list (requests' own headers join the
    # lines of one name with ', '). Without that list (a response requests did not get from urllib3)
    # requests' value, split at ', ' when split_joined.
    getlist = getattr(getattr(getattr(r, 'raw', None), 'headers', None), 'getlist', None)
    values = getlist(name) if callable(getlist) else None
    if not isinstance(values, list):
        value = r.headers.get(name)
        values = [] if not isinstance(value, str) else value.split(', ') if split_joined else [value]
    return [v for v in values if isinstance(v, str)]


def _dpop_nonce(r: requests.Response) -> Optional[str]:
    # The answer's DPoP-Nonce when it holds one valid nonce: sent once, or on several lines that all
    # carry that same nonce. None when it is missing, empty, not nonce syntax or sent with different
    # values. Spaces and tabs around a field value are not part of it (RFC 9110 OWS).
    values = [v.strip(' \t') for v in _field_values(r, 'DPoP-Nonce', split_joined=True)]
    if not values or any(v != values[0] for v in values[1:]) or not _NONCE.fullmatch(values[0]):
        return None
    return values[0]


def _leading_token(text: str) -> Tuple[str, str]:
    # The token text starts with (RFC 9110 tchar, maybe empty) and the rest, blanks around the token dropped.
    m = _LEADING_TOKEN.match(text)
    return m.group(1), text[m.end():]


def _is_use_dpop_nonce(text: str) -> bool:
    # Whether an auth-param value is use_dpop_nonce: that token, or a quoted-string that holds it once
    # its quoted-pairs are undone (so at most 30 characters with its quotes). An unclosed quoted string
    # has no value.
    text = text.strip(' \t')
    if text == 'use_dpop_nonce':
        return True
    if len(text) > 30 or not text.startswith('"'):
        return False
    m = _QUOTED_STRING.fullmatch(text)
    return m is not None and _QUOTED_PAIR.sub(r'\1', m.group(1)) == 'use_dpop_nonce'


def _challenge_asks_for_nonce(value: str) -> bool:
    # Whether a WWW-Authenticate value (RFC 9110 section 11.6.1) has a DPoP challenge whose own error
    # parameter is use_dpop_nonce (RFC 9449 section 9); scheme and parameter names in any case. Its
    # items split at commas outside quoted strings; an item that is not name=value starts a challenge
    # (its scheme, then maybe its first parameter), and a name=value item is a parameter of the
    # challenge before it. Linear in the length.
    low = value.lower()
    if 'dpop' not in low or 'error' not in low:  # no DPoP challenge, or no error parameter
        return False
    dpop = False  # in a DPoP challenge
    for name, rest in _LIST_ITEMS.findall(value):  # empty list elements left out
        if not rest.startswith('='):
            dpop = name.lower() == 'dpop'
            if not dpop:
                continue
            name, rest = _leading_token(rest)
        elif not dpop:
            continue
        if name.lower() == 'error' and rest.startswith('=') and _is_use_dpop_nonce(rest[1:]):
            return True
    return False


def _wants_nonce(r: requests.Response, data: Dict[str, Any]) -> bool:
    # RFC 9449 section 8: 400 use_dpop_nonce; section 9: 401 with a DPoP challenge that says so (each
    # WWW-Authenticate line read on its own).
    if r.status_code not in (400, 401):
        return False
    if data.get('error') == 'use_dpop_nonce':
        return True
    return r.status_code == 401 and any(_challenge_asks_for_nonce(v) for v in _field_values(r, 'WWW-Authenticate'))


def _post_form(url: str, form: Dict[str, Optional[str]], basic: Optional[tuple] = None,
               dpop_key: Optional[IdJagDpopKey] = None) -> Tuple[Dict[str, Any], Optional[str]]:
    # The token endpoint's answer, the JSON object of a 2xx, and the latest valid DPoP-Nonce the server
    # sent; anything else raises IdJagError (see there).
    if not _safe_url(url):
        raise TouchqueConfigException(f'{url} must be an https URL')
    sent_url = _sent_url(url)
    headers = {'Accept': 'application/json'}
    if basic:
        raw = f'{quote(basic[0], safe="")}:{quote(basic[1], safe="")}'
        headers['Authorization'] = 'Basic ' + base64.b64encode(raw.encode()).decode()
    body = {k: v for k, v in form.items() if v is not None}

    def send(nonce: Optional[str]) -> Tuple[requests.Response, Any]:
        # nonce: the latest valid one so far; the proof carries it, and so does a failure.
        if dpop_key is not None:
            headers['DPoP'] = id_jag_dpop_proof(dpop_key, sent_url, nonce=nonce)  # a fresh jti and iat every time
        try:
            r = requests.post(url, data=body, headers=headers, timeout=10, allow_redirects=False)
        except requests.exceptions.RequestException as err:
            raise IdJagError('temporarily_unavailable', f'{url} could not be reached or read: {err}', None, nonce) from err
        try:
            return r, r.json()
        except (ValueError, RecursionError):  # not JSON, or nested too deeply for the json module
            return r, None

    r, data = send(None)
    nonce = _dpop_nonce(r)
    if dpop_key is not None and nonce is not None and _wants_nonce(r, data if isinstance(data, dict) else {}):
        # The server wants its nonce in the proof: the same request once more, never again.
        r, data = send(nonce)
        nonce = _dpop_nonce(r) or nonce  # the latest valid nonce the server sent
    if not 200 <= r.status_code < 300:
        fields = data if isinstance(data, dict) else {}
        code = fields.get('error')
        raise IdJagError(code if isinstance(code, str) and _ERROR_CODE.fullmatch(code) else 'server_error',
                         str(fields.get('error_description') or f'{url} answered {r.status_code}'), r.status_code, nonce)
    if not isinstance(data, dict):
        raise IdJagError('invalid_response', f'{url} answered {r.status_code} without a JSON object', r.status_code, nonce)
    return data, nonce


def _scope_text(scope: Union[str, List[str], None]) -> Optional[str]:
    return ' '.join(scope) if isinstance(scope, (list, tuple)) else scope


def request_id_jag(*, client_id: str, client_secret: str, id_token: str, audience: str, issuer: Optional[str] = None,
                   token_endpoint: Optional[str] = None, resource: Optional[str] = None,
                   scope: Union[str, List[str], None] = None, dpop_key: Optional[IdJagDpopKey] = None) -> Dict[str, Any]:
    """Trades a member's ID token for an ID-JAG at the identity provider (token exchange, client_secret_basic):
    ``{'assertion', 'expires_in', 'scope'}``. With ``dpop_key`` the ID-JAG is bound to that key (redeem it
    with the same key) and ``dpop_bound`` says whether the returned ID-JAG carries its thumbprint. Anything
    but a 2xx with an ID-JAG, and a token endpoint that cannot be reached, raises IdJagError (see there)."""
    if not token_endpoint:
        if not issuer:
            raise TouchqueConfigException('request_id_jag needs issuer or token_endpoint')
        token_endpoint = _discover(issuer).get('token_endpoint')
        if not isinstance(token_endpoint, str):
            raise TouchqueConfigException('the identity provider names no token_endpoint')
    data, nonce = _post_form(token_endpoint, {
        'grant_type': TOKEN_EXCHANGE_GRANT, 'requested_token_type': ID_JAG_TOKEN_TYPE,
        'subject_token': id_token, 'subject_token_type': ID_TOKEN_TYPE,
        'audience': audience, 'resource': resource, 'scope': _scope_text(scope),
    }, (client_id, client_secret), dpop_key)
    if data.get('issued_token_type') != ID_JAG_TOKEN_TYPE or not isinstance(data.get('access_token'), str):
        raise IdJagError('invalid_response', 'the identity provider did not answer with an ID-JAG', None, nonce)
    out = {'assertion': data['access_token'], 'expires_in': data.get('expires_in'), 'scope': data.get('scope')}
    if dpop_key is not None:
        # An identity provider without DPoP support ignores the proof: say so instead of guessing.
        parts = data['access_token'].split('.')
        try:
            cnf = _json_part(parts[1]).get('cnf') if len(parts) == 3 else None
        except ValueError:
            cnf = None
        out['dpop_bound'] = isinstance(cnf, dict) and cnf.get('jkt') == dpop_key.thumbprint
    return out


def redeem_id_jag(*, token_endpoint: str, client_id: str, assertion: str, client_secret: Optional[str] = None,
                  resource: Optional[str] = None, scope: Union[str, List[str], None] = None,
                  dpop_key: Optional[IdJagDpopKey] = None) -> Dict[str, Any]:
    """Trades an ID-JAG for an access token at the other service's authorization server (jwt-bearer):
    the token endpoint's JSON object. With ``dpop_key`` (the key the ID-JAG is bound to) a DPoP proof
    goes along; the access token is then DPoP-bound too. Anything but a 2xx with a JSON object, and a
    token endpoint that cannot be reached, raises IdJagError (see there)."""
    form = {'grant_type': JWT_BEARER_GRANT, 'assertion': assertion, 'resource': resource, 'scope': _scope_text(scope)}
    if not client_secret:
        form['client_id'] = client_id
    return _post_form(token_endpoint, form, (client_id, client_secret) if client_secret else None, dpop_key)[0]

# ─────────────────────────────────────────────────────────────
# From touchque/resources/auth.py — tq.auth: first-time QR with the browser's IP and User-Agent, setup context
# ─────────────────────────────────────────────────────────────

import sys
from typing import Dict, Any, Optional
from urllib.parse import quote
from ..http_client import HttpClient

if sys.version_info >= (3, 8):
    from typing import TypedDict
else:  # pragma: no cover - Python 3.7 has no typing.TypedDict: the same names, as dict subclasses
    TypedDict = dict


class SetupLocation(TypedDict):
    """Where a first-time linking QR was asked for, from its IP address
    (GeoIP). Each is ``None`` when unknown."""
    city: Optional[str]
    country: Optional[str]
    #: ISO 3166-1 alpha-2, e.g. ``'DE'``.
    countryCode: Optional[str]


class SetupDevice(TypedDict):
    """The browser that asked for a first-time linking QR, from its
    User-Agent. Each is ``None`` when unknown."""
    browser: Optional[str]  # e.g. 'Safari', 'Chrome'
    os: Optional[str]  # e.g. 'iOS', 'Windows'
    model: Optional[str]  # e.g. 'iPhone'


class SetupContext(TypedDict):
    """2FA setup context: where a first-time linking QR was asked for, as the
    phone shows it before it links (``validate_secret``'s ``setupContext``).
    The Touchque API records it from the request that made the QR
    (``generate_secret``, or ``reset_secret`` for a new one), never in the
    QR. Every key is there; any value may be ``None``."""
    #: The browser's IP address as the phone shows it.
    ip: Optional[str]
    location: Optional[SetupLocation]
    device: Optional[SetupDevice]
    #: When the QR was asked for: ISO 8601, as the API sent it (not parsed).
    requestedAt: Optional[str]
    #: Whether that place is far from the address that checks the QR (``POST /auth/secret/validate``): the
    #: phone's when the phone checks it, your server's when your server calls ``validate_secret``. ``None``
    #: when Touchque cannot tell.
    farFromPhone: Optional[bool]


def _text(value: Any) -> Optional[str]:
    return value if isinstance(value, str) else None


def parse_setup_context(raw: Any) -> Optional[SetupContext]:
    """Reads the ``setupContext`` of a ``POST /auth/secret/validate`` answer,
    leniently, never raising: ``None`` when it is missing, ``None`` or not a
    JSON object. Otherwise all five keys, each ``None`` when it is missing,
    ``None`` or of the wrong type: ``ip`` and ``requestedAt`` only strings,
    ``farFromPhone`` only a boolean, ``location`` and ``device`` only objects
    (with their three keys, strings or ``None``, the same way). Unknown keys
    are dropped."""
    if not isinstance(raw, dict):
        return None
    location, device, far = raw.get('location'), raw.get('device'), raw.get('farFromPhone')
    return {
        'ip': _text(raw.get('ip')),
        'location': {
            'city': _text(location.get('city')),
            'country': _text(location.get('country')),
            'countryCode': _text(location.get('countryCode')),
        } if isinstance(location, dict) else None,
        'device': {
            'browser': _text(device.get('browser')),
            'os': _text(device.get('os')),
            'model': _text(device.get('model')),
        } if isinstance(device, dict) else None,
        'requestedAt': _text(raw.get('requestedAt')),
        'farFromPhone': far if isinstance(far, bool) else None,
    }


def _with_browser(body: Dict[str, Any], client_ip: Optional[str], user_agent: Optional[str]) -> Dict[str, Any]:
    """Adds the browser's IP address and User-Agent, each only when given (not None or empty), as it is."""
    if client_ip:
        body['clientIp'] = client_ip
    if user_agent:
        body['userAgent'] = user_agent
    return body


class Auth:
    def __init__(self, http: HttpClient):
        self._http = http

    def generate_secret(self, external_username: str, *, client_ip: Optional[str] = None,
                        user_agent: Optional[str] = None) -> Dict[str, Any]:
        """Generate a new setup secret for a user: the first-time linking QR
        (``qrCodeDataUrl``) and its recovery codes.

        ``client_ip`` / ``user_agent``: the IP address and User-Agent of the
        browser asking for the QR, as you pass them to ``login.request``; each
        is sent only when given (not ``None`` or empty), as it is. The
        Touchque API records where the QR was asked for (never in the QR) and
        the phone shows it before it links (``validate_secret``'s
        ``setupContext``), so a person tricked into scanning someone else's QR
        sees that place and device. The API keeps what it can use (a port is
        dropped, a loopback address or one that is not an IP address is
        ignored, the User-Agent loses its control characters and is cut at 512
        characters) and never refuses the request for them; with neither kept,
        the QR has no setup context. ``reset_secret`` records its new QR's the
        same way. The relay and the guard send them for you::

            tq.auth.generate_secret(user, client_ip=request.remote_addr,
                                    user_agent=request.headers.get('User-Agent'))
        """
        return self._http.post('/auth/generate-secret', _with_browser(
            {'externalUsername': external_username}, client_ip, user_agent))

    def reset_secret(self, external_username: str, *, client_ip: Optional[str] = None,
                     user_agent: Optional[str] = None) -> Dict[str, Any]:
        """Reset (regenerate) a user's secret.

        ``client_ip`` / ``user_agent``: the browser asking for the new QR,
        sent like ``generate_secret``'s (each only when given). The Touchque
        API records them with the new QR as ``generate_secret`` does; a reset
        without them leaves the new QR with no setup context
        (``validate_secret``'s ``setupContext`` is ``None``), not the old
        QR's."""
        return self._http.post('/auth/secret/reset', _with_browser(
            {'externalUsername': external_username}, client_ip, user_agent))

    def validate_secret(self, secret: str) -> Dict[str, Any]:
        """Validate a setup secret code: ``POST /auth/secret/validate``, the
        phone's public call after scanning the QR. The phone makes it itself;
        your server does not need it for the phone to show where the QR was
        asked for.

        The answer's ``setupContext`` (a ``SetupContext``) is where the QR was
        asked for, as the phone shows it before it links, or ``None``: the
        request that made the QR (``generate_secret``, or ``reset_secret`` for
        a new one) named neither a usable IP address nor a User-Agent, the QR
        is older, or the API predates it. As the phone gets it::

            {'ip': '203.0.113.7',
             'location': {'city': 'Berlin', 'country': 'Germany', 'countryCode': 'DE'},
             'device': {'browser': 'Safari', 'os': 'iOS', 'model': 'iPhone'},
             'requestedAt': '2026-11-16T09:30:00.000Z',
             'farFromPhone': True}

        ``farFromPhone`` compares that place with the address that makes this
        call: called from your server, it compares with your server, not the
        phone. Any value in ``setupContext`` may be ``None`` (``location`` and
        ``device`` too); one of the wrong type is read as ``None``
        (``parse_setup_context``), never an error. The rest of the answer is
        as the API sent it."""
        res = self._http.post('/auth/secret/validate', {
            'secret': secret
        })
        if not isinstance(res, dict):
            return res
        return {**res, 'setupContext': parse_setup_context(res.get('setupContext'))}

    def get_user(self, external_username: str) -> Dict[str, Any]:
        """
        Look up a user's link status without sending a push. Useful while
        polling during enrollment: ``used`` flips true and ``deviceId`` is set
        once the mobile app scans the setup secret.

        Returns ``{ externalUsername, deviceId, used, frozen, createdAt, expireAt, device }``.
        Raises ``TouchqueAPIException`` (404) if the user is unknown.

        ``device`` is the linked phone's posture for device trust, or ``None`` before a
        phone is linked. It is self-reported by the Touchque app::

            {
              "platform": "ios" | "android" | None,
              "model": str | None,             # e.g. "iPhone15,3"
              "osVersion": str | None,         # e.g. "18.1"
              "securityPatch": str | None,     # Android "YYYY-MM-DD", None on iOS
              "appVersion": str | None,
              "screenLock": bool | None,
              "biometrics": "face" | "touch" | "fingerprint" | "iris" | "none" | None,
              "jailbroken": bool,              # jailbroken or rooted, by the app's checks
              "compromised": bool,             # jailbroken/rooted or tampered (sticky for a cool-down)
              "hardwareKey": bool,             # approvals are signed by a Secure Enclave / Keystore key
              "attestation": "apple-appattest" | "android-key" | None,
              "signed": bool,                  # the latest report was signed by the hardware key
              "reportedAt": str | None,        # ISO date-time of the latest report
              "lastSeenAt": str | None,
              "linkedAt": str | None,
              "state": "healthy" | "at_risk" | "compromised" | "unknown",
              "issues": [str],                 # jailbroken, tampered, integrity_failed, no_report,
                                               # stale_report, no_screen_lock, keys_lost,
                                               # no_hardware_key, debugger, developer_mode
            }
        """
        return self._http.get(f"/users/{quote(external_username, safe='')}")

# ─────────────────────────────────────────────────────────────
# From touchque/resources/identity.py — tq.identity: Touchque Login admin: passkey domain, user store, custom domains
# ─────────────────────────────────────────────────────────────

"""Touchque Login Management API (``client.identity``): your customers'
accounts, roles, business-customer organizations, apps, APIs, connections and
the tenant itself, from your server with your workspace key.

    found = client.identity.users.list(q="ayse")
    client.identity.users.block(user_id, reason="chargeback")
    job = client.identity.imports.start(users=[{"email": e, "passwordHash": "$2b$10$..."}])
    client.identity.imports.wait(job["id"])
"""

import sys
import time
from typing import Any, Dict, List, Optional, cast
from urllib.parse import quote

from ..exceptions import api_exception
from ..http_client import HttpClient

if sys.version_info >= (3, 8):
    from typing import TypedDict
else:  # pragma: no cover - Python 3.7 has no typing.TypedDict: the same name, as a dict subclass
    TypedDict = dict


class CustomDomainsOverview(TypedDict):
    """The whole answer of ``GET /identity/custom-domains``
    (``identity.custom_domains.overview()``), plain JSON."""
    #: Your custom sign-in domains, oldest first: what ``custom_domains.list()`` returns.
    domains: List[Dict[str, Any]]
    #: Your organization's verified domains (Organization → Domains), which prove a custom domain under them and
    #: allow a passkey domain above one; ``None`` when they could not be read.
    verifiedDomains: Optional[List[str]]
    #: Customer passkeys made on ``{slug}.login.touchque.com``: they belong to that name and do not work on a
    #: custom domain.
    slugPasskeys: int


def _id(value: str) -> str:
    return quote(str(value), safe='')


def _clean(d: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in d.items() if v is not None}


class IdentityUsers:
    def __init__(self, http: HttpClient):
        self._http = http

    def list(self, q: Optional[str] = None, blocked: Optional[bool] = None, email_verified: Optional[bool] = None,
             connection: Optional[str] = None, organization: Optional[str] = None, limit: Optional[int] = None,
             cursor: Optional[str] = None) -> Dict[str, Any]:
        return self._http.get('/identity/users', _clean({
            'q': q, 'blocked': blocked, 'emailVerified': email_verified, 'connection': connection,
            'organization': organization, 'limit': limit, 'cursor': cursor,
        }))

    def get(self, user_id: str) -> Dict[str, Any]:
        return self._http.get(f'/identity/users/{_id(user_id)}')

    def create(self, email: str, **fields: Any) -> Dict[str, Any]:
        """fields: password, passwordHash (bcrypt/argon2), customPasswordHash, emailVerified,
        name, givenName, familyName, phone, locale, userMetadata, appMetadata, sendVerificationEmail."""
        return self._http.post('/identity/users', {'email': email, **fields})

    def update(self, user_id: str, **changes: Any) -> Dict[str, Any]:
        """Metadata is merged; a key set to None is removed."""
        return self._http.patch(f'/identity/users/{_id(user_id)}', changes)

    def delete(self, user_id: str) -> Dict[str, Any]:
        """Erasure (KVKK/GDPR): the account and every workspace row that names it."""
        return self._http.delete(f'/identity/users/{_id(user_id)}')

    def block(self, user_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
        return self._http.post(f'/identity/users/{_id(user_id)}/block', _clean({'reason': reason}))

    def unblock(self, user_id: str) -> Dict[str, Any]:
        return self._http.post(f'/identity/users/{_id(user_id)}/unblock', {})

    def export(self, user_id: str) -> Dict[str, Any]:
        """Everything about the person (KVKK/GDPR access request); never hashes."""
        return self._http.get(f'/identity/users/{_id(user_id)}/export')

    def sessions(self, user_id: str) -> Dict[str, Any]:
        return self._http.get(f'/identity/users/{_id(user_id)}/sessions')

    def end_session(self, user_id: str, session_id: str) -> Dict[str, Any]:
        """Signs the person out of one session (the others stay)."""
        return self._http.delete(f'/identity/users/{_id(user_id)}/sessions/{_id(session_id)}')

    def sign_out_everywhere(self, user_id: str) -> Dict[str, Any]:
        return self._http.delete(f'/identity/users/{_id(user_id)}/sessions')

    def reset_mfa(self, user_id: str) -> Dict[str, Any]:
        """Removes passkeys, unlinks the Touchque app, turns email codes off, signs out everywhere."""
        return self._http.delete(f'/identity/users/{_id(user_id)}/mfa')

    def connected_accounts(self, user_id: str) -> Dict[str, Any]:
        """Accounts at providers whose tokens the vault keeps for the user (connections with tokenVault on)."""
        return self._http.get(f'/identity/users/{_id(user_id)}/connected-accounts')

    def disconnect_account(self, user_id: str, account_id: str) -> Dict[str, Any]:
        """Deletes the stored tokens: apps stop using the account for the user; signing in with it stays."""
        return self._http.delete(f'/identity/users/{_id(user_id)}/connected-accounts/{_id(account_id)}')

    def unlink_identity(self, user_id: str, identity_id: str, force: bool = False) -> Dict[str, Any]:
        return self._http.delete(f'/identity/users/{_id(user_id)}/identities/{_id(identity_id)}' + ('?force=true' if force else ''))

    def send_verification_email(self, user_id: str, return_to: Optional[str] = None) -> Dict[str, Any]:
        return self._http.post(f'/identity/users/{_id(user_id)}/verification-email', _clean({'returnTo': return_to}))

    def password_reset(self, user_id: str, send_email: bool = True, ttl_sec: Optional[int] = None) -> Dict[str, Any]:
        """send_email=False: the link comes back for you to deliver."""
        return self._http.post(f'/identity/users/{_id(user_id)}/password-reset', _clean({'sendEmail': send_email, 'ttlSec': ttl_sec}))

    def roles(self, user_id: str) -> Dict[str, Any]:
        return self._http.get(f'/identity/users/{_id(user_id)}/roles')

    def add_roles(self, user_id: str, role_ids: List[str], organization_id: Optional[str] = None) -> Dict[str, Any]:
        return self._http.post(f'/identity/users/{_id(user_id)}/roles', _clean({'roleIds': role_ids, 'organizationId': organization_id}))

    def remove_role(self, user_id: str, role_id: str, organization_id: Optional[str] = None) -> Dict[str, Any]:
        query = f'?organizationId={_id(organization_id)}' if organization_id else ''
        return self._http.delete(f'/identity/users/{_id(user_id)}/roles/{_id(role_id)}{query}')

    def logs(self, user_id: str, limit: Optional[int] = None) -> Dict[str, Any]:
        return self._http.get(f'/identity/users/{_id(user_id)}/logs', _clean({'limit': limit}))


class IdentityJobs:
    def __init__(self, http: HttpClient, kind: str):
        self._http = http
        self._kind = kind

    def start(self, users: Optional[List[Dict[str, Any]]] = None, upsert: Optional[bool] = None, format: Optional[str] = None) -> Dict[str, Any]:
        """imports: users (and upsert); exports: format 'csv' or 'json'."""
        return self._http.post(f'/identity/users-{self._kind}', _clean({'users': users, 'upsert': upsert, 'format': format}))

    def get(self, job_id: str) -> Dict[str, Any]:
        return self._http.get(f'/identity/users-{self._kind}/{_id(job_id)}')

    def file(self, job_id: str) -> str:
        """Exports: the finished file (CSV or JSON lines), as text."""
        return self._http.get_text(f'/identity/users-{self._kind}/{_id(job_id)}/file')

    def wait(self, job_id: str, interval: float = 1.0, timeout: float = 600.0) -> Dict[str, Any]:
        end = time.time() + timeout
        while True:
            job = self.get(job_id)
            if job.get('status') != 'running' or time.time() > end:
                return job
            time.sleep(interval)


class _Crud:
    def __init__(self, http: HttpClient, base: str, list_key: str):
        self._http = http
        self._base = base
        self._list_key = list_key

    def list(self, **params: Any) -> List[Dict[str, Any]]:
        return self._http.get(self._base, _clean(params) or None).get(self._list_key, [])

    def get(self, item_id: str) -> Dict[str, Any]:
        return self._http.get(f'{self._base}/{_id(item_id)}')

    def create(self, **body: Any) -> Dict[str, Any]:
        return self._http.post(self._base, body)

    def update(self, item_id: str, **body: Any) -> Dict[str, Any]:
        return self._http.patch(f'{self._base}/{_id(item_id)}', body)

    def delete(self, item_id: str) -> Dict[str, Any]:
        return self._http.delete(f'{self._base}/{_id(item_id)}')


class IdentityOrganizations(_Crud):
    def __init__(self, http: HttpClient):
        super().__init__(http, '/identity/organizations', 'organizations')

    def members(self, org_id: str) -> Dict[str, Any]:
        return self._http.get(f'{self._base}/{_id(org_id)}/members')

    def add_members(self, org_id: str, user_ids: List[str]) -> Dict[str, Any]:
        return self._http.post(f'{self._base}/{_id(org_id)}/members', {'userIds': user_ids})

    def remove_member(self, org_id: str, user_id: str) -> Dict[str, Any]:
        return self._http.delete(f'{self._base}/{_id(org_id)}/members/{_id(user_id)}')

    def set_connections(self, org_id: str, connections: List[Dict[str, Any]]) -> Dict[str, Any]:
        return self._http.put(f'{self._base}/{_id(org_id)}/connections', {'connections': connections})

    def invitations(self, org_id: str) -> Dict[str, Any]:
        return self._http.get(f'{self._base}/{_id(org_id)}/invitations')

    def invite(self, org_id: str, email: str, client_id: str, role_ids: Optional[List[str]] = None,
               inviter_name: Optional[str] = None, send_email: Optional[bool] = None) -> Dict[str, Any]:
        """The link opens the app's sign-in route (initiateLoginUri) with organization and invitation."""
        return self._http.post(f'{self._base}/{_id(org_id)}/invitations', _clean({
            'email': email, 'clientId': client_id, 'roleIds': role_ids, 'inviterName': inviter_name, 'sendEmail': send_email,
        }))

    def revoke_invitation(self, org_id: str, invitation_id: str) -> Dict[str, Any]:
        return self._http.delete(f'{self._base}/{_id(org_id)}/invitations/{_id(invitation_id)}')


class IdentityClients(_Crud):
    def __init__(self, http: HttpClient):
        super().__init__(http, '/identity/clients', 'clients')

    def rotate_secret(self, client_id: str) -> Dict[str, Any]:
        """The new secret is in the answer, this once."""
        return self._http.post(f'{self._base}/{_id(client_id)}/rotate-secret', {})


class IdentityCustomDomains(_Crud):
    """Your own sign-in domains (``login.acme.com``). The API has no read by id: ``get`` finds the domain in the list."""

    def __init__(self, http: HttpClient):
        super().__init__(http, '/identity/custom-domains', 'domains')

    def overview(self) -> CustomDomainsOverview:
        """The whole list answer, a :class:`CustomDomainsOverview`: ``domains``; ``verifiedDomains``, your
        organization's verified domains (Organization → Domains; None when they could not be read), which prove a
        custom domain under them and allow a passkey domain above one; ``slugPasskeys``, customer passkeys made on
        {slug}.login.touchque.com (they do not work on a custom domain). ``list()`` returns only ``domains``."""
        return cast(CustomDomainsOverview, self._http.get(self._base))

    def get(self, item_id: str) -> Dict[str, Any]:
        """The domain with this id, found in ``list()``. When there is none, a TouchqueAPIException like the API's
        own 404: ``status`` 404, ``data['error']`` ``not_found`` (also the message) and ``data['message']``."""
        for domain in self.list():
            if isinstance(domain, dict) and domain.get('id') == item_id:
                return domain
        raise api_exception('not_found', status=404, data={'error': 'not_found', 'message': 'No custom domain with this id'})

    def verify(self, domain_id: str) -> Dict[str, Any]:
        """``POST /identity/custom-domains/{id}/verify``: checks the DNS TXT record now (a domain under one your
        organization verified needs none) and what the domain's DNS says (``dns``). Answers the domain."""
        return self._http.post(f'{self._base}/{_id(domain_id)}/verify', {})


class Identity:
    def __init__(self, http: HttpClient):
        self._http = http
        self.users = IdentityUsers(http)
        self.imports = IdentityJobs(http, 'imports')
        self.exports = IdentityJobs(http, 'exports')
        self.roles = _Crud(http, '/identity/roles', 'roles')
        self.organizations = IdentityOrganizations(http)
        self.clients = IdentityClients(http)
        self.apis = _Crud(http, '/identity/apis', 'apis')
        self.connections = _Crud(http, '/identity/connections', 'connections')
        self.custom_domains = IdentityCustomDomains(http)

    def get_tenant(self) -> Dict[str, Any]:
        return self._http.get('/identity/tenant')

    def update_tenant(self, **body: Any) -> Dict[str, Any]:
        """Turns Touchque Login on (slug, displayName) or changes its settings."""
        return self._http.put('/identity/tenant', body)

    def rotate_signing_key(self) -> Dict[str, Any]:
        return self._http.post('/identity/tenant/signing-keys/rotate', {})

    def set_approver_app_name(self, name: Optional[str]) -> Dict[str, Any]:
        """The phone app the hosted pages tell customers to approve on ("Approve on the Acme app").

        None: your brand name when the Mobile SDK is set up, else Touchque (``approverApp`` in the tenant shows which).
        """
        return self._http.put('/identity/tenant', {'branding': {'approverAppName': name}})

    def set_custom_domain_only(self, on: bool) -> Dict[str, Any]:
        """Serve sign-in only on the primary custom domain: {slug}.login.touchque.com redirects page loads there and
        refuses other calls. Turning it on needs a verified primary domain with a working certificate."""
        return self._http.put('/identity/tenant', {'customDomainOnly': on})

    def set_passkey_domain(self, domain: Optional[str]) -> Dict[str, Any]:
        """The domain customer passkeys are made for (their relying party ID), so they keep working on every sign-in
        host under it: one of your verified custom domains, or a domain above one of them that your organization
        verified (Organization → Domains: ``acme.com`` for ``login.acme.com``). None (or '') clears it: each passkey
        belongs to the host it was made on. Answers the tenant (``passkeyDomain``).

        Set it before customers make passkeys: a change that would leave theirs behind is refused with 409
        ``passkeys_exist`` (``count`` in the exception's ``data``). Other refusals (``data['error']``): 400
        ``invalid_request`` with ``field`` ``passkeyDomain`` (not a domain), 409 ``not_your_domain``, 409
        ``organization_unavailable`` (try again). Before Touchque Login is set up for the workspace
        (``update_tenant(slug=..., displayName=...)``) it is 400 ``invalid_request`` with ``field`` ``slug``."""
        return self._http.put('/identity/tenant', {'passkeyDomain': domain})

    def check_domain_certificate(self, domain_id: str) -> Dict[str, Any]:
        """Checks a verified custom domain's certificate at the sign-in edge now (``certificate``: pending | active | error)."""
        return self._http.post(f'/identity/custom-domains/{_id(domain_id)}/check-certificate', {})

    def outbox(self, to: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
        """The delivery log. Message text only in the local dev inbox."""
        return self._http.get('/identity/outbox', _clean({'to': to, 'limit': limit}))

    def get_attack_protection(self) -> Dict[str, Any]:
        """Wrong passwords, suspicious addresses, bot challenge, breached passwords, new-browser notices, the risk engine."""
        return self._http.get('/identity/attack-protection')

    def set_attack_protection(self, **settings: Any) -> Dict[str, Any]:
        """Partial; the bot challenge's secret is write-only."""
        return self._http.put('/identity/attack-protection', settings)

    def attack_events(self, limit: Optional[int] = None) -> Dict[str, Any]:
        """What attack protection caught lately."""
        return self._http.get('/identity/attack-protection/events', _clean({'limit': limit}))

    def get_delivery(self) -> Dict[str, Any]:
        """The email and SMS providers; secrets never come back (secretsSet)."""
        return self._http.get('/identity/delivery')

    def set_delivery(self, channel: str, **provider: Any) -> Dict[str, Any]:
        """Your own provider: email smtp, ses, postmark, sendgrid; sms twilio, netgsm.
        provider='postmark', from_='login@acme.com', serverToken=... (from_ is sent as "from").
        A secret left out keeps its stored value."""
        body = {('from' if k == 'from_' else k): v for k, v in provider.items()}
        return self._http.put(f'/identity/delivery/{_id(channel)}', body)

    def remove_delivery(self, channel: str) -> Dict[str, Any]:
        """Back to Touchque's transport."""
        return self._http.delete(f'/identity/delivery/{_id(channel)}')

    def test_delivery(self, channel: str, to: str) -> Dict[str, Any]:
        """One test message through the provider in use."""
        return self._http.post(f'/identity/delivery/{_id(channel)}/test', {'to': to})

    def get_user_store(self) -> Dict[str, Any]:
        """Moving your customers in from your own user database: ``url``, ``enabled``, ``active`` (asked: enabled and
        passwords on), ``movedIn`` (accounts made from it so far), ``lastCall`` ({at, event, ok, status, ms, error}, or
        None), ``paused`` (5 failures in a row pause asking for a minute), ``updatedAt``, ``signing``.

        Touchque POSTs ``user_store.verify_password`` {email, password} at a password sign-in of an address with no
        account here (or one moved in without a password), and ``user_store.get_user`` {email} at "forgot password",
        an email code or a sign-up of an address with no account here, signed like its webhooks: check each with
        ``client.webhook.verify(...)``, then answer 200 {"user": {"id", "email", ...}} (``email`` the address asked
        about) or {"user": null} (or 404; the same for an unknown address and a wrong password) within 5 seconds."""
        return self._http.get('/identity/user-store')

    def set_user_store(self, url: Optional[str] = None, enabled: Optional[bool] = None) -> Dict[str, Any]:
        """Sets the endpoint (``url``, https) and whether it is asked (``enabled``). Only what is given is sent and the
        rest kept: ``url`` is needed the first time, and ``enabled`` left out is then True. Answers like
        ``get_user_store`` (201 the first time). Needs passwords on (409 ``passwords_off``)."""
        body: Dict[str, Any] = {}
        if url is not None:
            body['url'] = url
        if enabled is not None:
            body['enabled'] = enabled
        return self._http.put('/identity/user-store', body)

    def test_user_store(self, url: Optional[str] = None) -> Dict[str, Any]:
        """One signed ``user_store.ping`` to ``url`` (None or '': the endpoint set): {ok, error, ms}. Never paused, and
        it does not count toward a pause."""
        return self._http.post('/identity/user-store/test', {'url': url} if url else {})

    def remove_user_store(self) -> Dict[str, Any]:
        """Stops asking your user database; accounts already moved in stay. Returns {} (204), also when none is set;
        404 ``not_enabled`` means Touchque Login is not set up."""
        return self._http.delete('/identity/user-store')
