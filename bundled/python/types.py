# TouchQue Python SDK — bundled type/API reference for AI assistants.
# Concatenation of touchque-python/touchque/{config.py,client.py,steps.py,resources/offline.py}.
# Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

import os
from urllib.parse import urlparse

from .exceptions import TouchQueConfigException

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
        raise TouchQueConfigException(
            f'Refusing a plaintext http:// base_url for "{parsed.hostname}". '
            "The API key and request signature would be sent in the clear — use https://."
        )
    raise TouchQueConfigException(f"base_url must be http(s): {base_url}")


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
            raise TouchQueConfigException(
                "Set TQ_API_KEY and TQ_API_SECRET (or pass api_key=/api_secret=)."
            )
        if not api_key.startswith('tq_'):
            raise TouchQueConfigException(
                'api_key must start with "tq_". Did you accidentally swap api_key and api_secret?'
            )

        _assert_safe_base_url(base_url)

        self.api_key = api_key
        self.api_secret = api_secret
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

# ─────────────────────────────────────────────────────────────
# From touchque/client.py — the TouchQue client class
# ─────────────────────────────────────────────────────────────

from typing import Any, Dict, Optional

from .config import Config
from .http_client import HttpClient
from .resources.actions import Actions
from .resources.auth import Auth
from .resources.login import Login
from .resources.offline import Offline
from .resources.webauthn import WebAuthn
from .resources.webhook import Webhook
from .steps import LoginDetails, check as _check, complete as _complete, start as _start


class TouchQue:
    """
    TouchQue SDK client.

        # .env: TQ_API_KEY=tq_...  TQ_API_SECRET=...
        client = TouchQue()                                   # from the environment
        client = TouchQue(Config(api_key=..., api_secret=...))  # explicit

    One line per protected route (see ``touchque.contrib`` for Django /
    FastAPI / Flask adapters, or call ``client.start`` / ``client.check`` /
    ``client.complete`` yourself for any framework).
    """

    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config()
        self._api_secret = self.config.api_secret
        http = HttpClient(self.config)

        self.auth = Auth(http)
        self.login = Login(http)
        self.webauthn = WebAuthn(http)
        self.webhook = Webhook(self.config)
        self.offline = Offline(http)
        self.actions = Actions(http)

    # ── headless step-up (see touchque.steps / touchque.guard) ─────────────

    def start(self, action: str, user: str, details: Optional[LoginDetails] = None,
              reference_id: Optional[str] = None, ip: Optional[str] = None,
              user_agent: Optional[str] = None) -> Dict[str, Any]:
        """Starts an approval and returns immediately — show the step in your
        UI. ``waiting`` + ``number``: show the number, the user picks it on
        the phone. ``enroll``: show ``enroll['qrCodeDataUrl']`` so the user
        links the TouchQue app first."""
        return _start(self, action, user, details=details, reference_id=reference_id, ip=ip, user_agent=user_agent)

    def check(self, request_id: str) -> Dict[str, Any]:
        """Where a started approval is now: waiting, approved, rejected, expired…"""
        return _check(self, request_id)

    def complete(self, request_id: str, user: str, action: str, details: Optional[LoginDetails] = None,
                 reference_id: Optional[str] = None) -> Dict[str, Any]:
        """Uses an approved request exactly once, after checking it is for
        this user, action and transaction. Call it right before doing the
        protected thing."""
        return _complete(self, request_id, user, action, details=details, reference_id=reference_id)


_default_client: Optional[TouchQue] = None


def get_default_client() -> TouchQue:
    """The client built from TQ_API_KEY / TQ_API_SECRET, created on first use."""
    global _default_client
    if _default_client is None:
        _default_client = TouchQue()
    return _default_client

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
import hashlib
import hmac
import json
import time
from typing import Any, Dict, List, Optional, Union

from .exceptions import TouchQueAPIException, TouchQueConfigException, TouchQueException
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .client import TouchQue

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


def _err_code(err: TouchQueAPIException) -> Optional[str]:
    return err.code or (err.data or {}).get('error')


def start(client: 'TouchQue', action: str, user: str, details: Optional[LoginDetails] = None,
          reference_id: Optional[str] = None, ip: Optional[str] = None, user_agent: Optional[str] = None,
          enroll: bool = True) -> Dict[str, Any]:
    """Starts an approval for `action` — never waits."""
    if not user:
        raise TouchQueConfigException('start() needs the user id')
    norm = normalize_details(details)
    try:
        res = client.login.request(
            user, type=action, reference_id=reference_id, client_ip=ip, user_agent=user_agent,
            details=norm or None,
        )
        if res.get('requiresPasskey'):
            return {'state': 'passkey_required', 'requestId': res.get('requestId'),
                    'expiresAt': res.get('expiresAt'), 'details': norm or None}
        return {
            'state': 'waiting', 'requestId': res.get('requestId'), 'number': res.get('challengeCode'),
            'expiresAt': res.get('expiresAt'), 'details': norm or None,
        }
    except TouchQueAPIException as err:
        code = _err_code(err)
        if err.status == 404 and (code == 'device_not_linked' or 'linked device' in str(err).lower()):
            if not enroll:
                return {'state': 'enroll'}
            return _enroll_step(client, user)
        if err.status == 423:
            return {'state': 'frozen', 'retryAfter': err.retry_after}
        if err.status == 429:
            return {'state': 'rate_limited', 'retryAfter': err.retry_after}
        if err.status == 400 and (code == 'unknown_action' or 'invalid action type' in str(err).lower()):
            raise TouchQueConfigException(
                f'Unknown action "{action}". Create it once with client.actions.define("{action}") '
                'or in the Dashboard (Action Types).'
            ) from err
        if err.status == 403:
            reason = (err.reason if code == 'blocked' else None) \
                or ('passkey_not_registered' if code in ('passkey_not_registered',) or (err.data or {}).get('error') == 'phishing_resistant_required' else None) \
                or ('action_disabled' if code == 'action_disabled' else None) \
                or code or 'blocked'
            return {'state': 'blocked', 'reason': reason}
        raise


def _enroll_step(client: 'TouchQue', user: str) -> Dict[str, Any]:
    """First-time linking. Never unlinks a phone: a secret is only re-issued
    when the account is confirmed NOT linked."""
    try:
        gen = client.auth.generate_secret(user)
        return {'state': 'enroll', 'enroll': {
            'qrCodeDataUrl': gen.get('qrCodeDataUrl'), 'recoveryCodes': gen.get('recoveryCodes'),
            'expiresAt': gen.get('expiresAt'),
        }}
    except TouchQueAPIException as err:
        if err.status != 409:
            raise
        try:
            current = client.auth.get_user(user)
        except TouchQueAPIException:
            current = None
        if current and (current.get('used') or current.get('deviceId')):
            return {'state': 'enroll', 'reason': 'already_linked'}
        reset = client.auth.reset_secret(user)
        return {'state': 'enroll', 'enroll': {
            'qrCodeDataUrl': reset.get('qrCodeDataUrl'), 'recoveryCodes': reset.get('recoveryCodes'),
            'expiresAt': reset.get('expiresAt'),
        }}


_STATE_MAP = {'PENDING': 'waiting', 'CONFIRMED': 'approved', 'REJECTED': 'rejected', 'EXPIRED': 'expired'}


def check(client: 'TouchQue', request_id: str) -> Dict[str, Any]:
    """Current state of a started approval."""
    s = client.login.status(request_id)
    state = 'passkey_required' if s.get('status') == 'PENDING' and s.get('requiresPasskey') \
        else _STATE_MAP.get(s.get('status'), 'waiting')
    step: Dict[str, Any] = {'state': state, 'requestId': request_id}
    if state == 'approved' and s.get('assurance'):
        step['assurance'] = s['assurance']
    return step


def complete(client: 'TouchQue', request_id: str, user: str, action: str,
             details: Optional[LoginDetails] = None, reference_id: Optional[str] = None) -> Dict[str, Any]:
    """Uses an approved request exactly once and checks it is for THIS user,
    action and transaction. Raises TouchQueException if it was already used,
    not approved, or approved for something else."""
    res = client.login.consume(request_id)
    same_user = str(res.get('externalUsername', '')).lower() == str(user).lower()
    same_details = details_digest(details) == details_digest(res.get('details') or [])
    same_ref = (res.get('referenceId') or None) == (reference_id or None)
    if not same_user or res.get('type') != action or not same_details or not same_ref:
        raise TouchQueException('TouchQue: this approval is for a different user, action or transaction.')
    return {
        'requestId': request_id,
        'user': res.get('externalUsername'),
        'action': res.get('type'),
        'assurance': res.get('assurance'),
        'confirmedVia': res.get('confirmedVia'),
        'approvalProof': res.get('approvalProof'),
    }


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
# From touchque/resources/offline.py — Offline Sign (QR + code)
# ─────────────────────────────────────────────────────────────

from typing import Any, Dict, Optional

from ..http_client import HttpClient
from ..exceptions import TouchQueAPIException


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

    @staticmethod
    def _not_approved_as_result(call) -> Dict[str, Any]:
        try:
            return call()
        except TouchQueAPIException as err:
            if err.status is not None and err.status < 500:
                return {
                    'approved': False,
                    'reason': err.reason or err.code or (err.data or {}).get('error'),
                    'attemptsLeft': err.attempts_left,
                }
            raise
