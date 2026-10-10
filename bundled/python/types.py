# TouchQue Python SDK — bundled type/API reference for AI assistants.
# Concatenation of touchque-python/touchque/{__init__.py,config.py,client.py,steps.py,approval_proof.py,
# resources/login.py,resources/offline.py,contrib/flask.py,contrib/fastapi.py,contrib/django.py}
# plus the public part of touchque/relay.py (RelayHandler).
# Regenerate with `node scripts/sync-bundled.js` whenever the SDK's public API changes.

# ─────────────────────────────────────────────────────────────
# From touchque/__init__.py — everything importable from `touchque`
# ─────────────────────────────────────────────────────────────

from .config import Config
from .client import TouchQue, get_default_client
from .exceptions import (
    TouchQueException,
    TouchQueAPIException,
    TouchQueNetworkException,
    TouchQueTimeoutException,
    TouchQueRejectedException,
    TouchQueWebhookSignatureException,
    TouchQueWebhookReplayException,
    TouchQueConfigException,
    TouchQuePasskeyRequiredError,
)
from .resources.webhook import ReplayCache, MemoryReplayCache
from .steps import normalize_details, details_digest
from .approval_proof import verify_approval_proof
from .guard import run_guard, guard_input_from_headers
from .relay import RelayHandler, RelayResponse, RELAY_ROUTES
from .rate_limiter import FixedWindowLimiter

__all__ = [
    'TouchQue',
    'Config',
    'get_default_client',
    'TouchQueException',
    'TouchQueAPIException',
    'TouchQueNetworkException',
    'TouchQueTimeoutException',
    'TouchQueRejectedException',
    'TouchQueWebhookSignatureException',
    'TouchQueWebhookReplayException',
    'ReplayCache',
    'MemoryReplayCache',
    'TouchQueConfigException',
    'TouchQuePasskeyRequiredError',
    'normalize_details',
    'details_digest',
    'verify_approval_proof',
    'run_guard',
    'guard_input_from_headers',
    'RelayHandler',
    'RelayResponse',
    'RELAY_ROUTES',
    'FixedWindowLimiter',
]

# ─────────────────────────────────────────────────────────────
# From touchque/config.py
# ─────────────────────────────────────────────────────────────

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
# From touchque/approval_proof.py — verify_approval_proof (pip install "touchque-authenticator[proof]")
# ─────────────────────────────────────────────────────────────

"""Verifies the device-signed proof of an approval ("what you see is what you sign").

When the user's phone holds a hardware key (Secure Enclave / Android Keystore),
every approval is signed by it over the request id, the action type, the
number-match code and a digest of the transaction details the user was shown.
The proof arrives in the SUCCESS webhook (``approvalProof``) and in
``login.status(id)['approvalProof']``. Verifying it does not require trusting
TouchQue: it proves the enrolled phone signed exactly these details.

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

import time
from typing import Dict, Any, List, Optional, Union

# Label -> value, or an ordered list of {'label': ..., 'value': ...}.
LoginDetails = Union[Dict[str, Union[str, int, float]], List[Dict[str, Any]]]
from urllib.parse import quote
from ..http_client import HttpClient
from ..exceptions import TouchQueTimeoutException, TouchQueRejectedException, TouchQuePasskeyRequiredError, TouchQueConfigException

class Login:
    def __init__(self, http: HttpClient):
        self._http = http

    def request(self, external_username: str, type: str = 'LOGIN', reference_id: Optional[str] = None, client_ip: Optional[str] = None, user_agent: Optional[str] = None, require_biometric: bool = False, require_number_match: bool = False, details: Optional[LoginDetails] = None) -> Dict[str, Any]:
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
        if details:
            payload['details'] = details

        return self._http.post('/login/request', payload)

    def status(self, request_id: str) -> Dict[str, Any]:
        """Check the current status of a login request."""
        return self._http.get(f"/login/status/{quote(request_id, safe='')}")

    def verify(self, external_username: str, type: str = 'LOGIN', reference_id: Optional[str] = None, client_ip: Optional[str] = None, user_agent: Optional[str] = None, require_biometric: bool = False, require_number_match: bool = False, timeout_ms: int = 30000, details: Optional[LoginDetails] = None) -> Dict[str, Any]:
        """Request a login and wait (poll) until the user approves or rejects it."""
        request_result = self.request(external_username, type, reference_id, client_ip, user_agent, require_biometric, require_number_match, details)
        request_id = request_result['requestId']
        if request_result.get('requiresPasskey'):
            raise TouchQuePasskeyRequiredError(request_id)

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
                }

            if status == 'REJECTED':
                raise TouchQueRejectedException(f"Request {request_id} was rejected by the user.")

            if status == 'EXPIRED':
                raise TouchQueTimeoutException(f"Request {request_id} expired before it was approved.")

            elapsed = (time.time() * 1000) - start_time
            if elapsed > timeout_ms:
                raise TouchQueTimeoutException(f"Login verification timed out after {timeout_ms}ms")

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
        token, a retried form post) raises ``TouchQueAPIException`` with
        ``code='already_used'`` (409)."""
        return self._http.post(f"/login/{quote(request_id, safe='')}/consume", {})

    FRAUD_REASONS = ('chargeback', 'account_takeover', 'social_engineering', 'other')

    def report_fraud(self, request_id: str, reason: Optional[str] = None, note: Optional[str] = None) -> Dict[str, Any]:
        """Report a request you later learned was fraud — a chargeback, a
        confirmed account takeover, a scam the user was talked into. TouchQue's
        risk engine learns from it (it is the strongest signal it gets) and the
        report is kept in your audit log. The request's status does not change.
        Safe to call more than once: a repeat answers ``alreadyReported: True``.

        :param reason: one of ``Login.FRAUD_REASONS`` (default ``'other'``).
        :param note: free text for your audit log, at most 500 characters.
        """
        if not request_id:
            raise TouchQueConfigException('report_fraud() needs the request id')
        payload: Dict[str, Any] = {}
        if reason:
            payload['reason'] = reason
        if note:
            payload['note'] = note
        return self._http.post(f"/login/{quote(request_id, safe='')}/report-fraud", payload)

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
  POST   /passkey/authenticate/options    (pre-auth, body.email)
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
(``rate_limit``), and TouchQue itself caps approval pushes per user. Set
``get_login_user`` so POST /login and the offline routes only work for a user
who already passed YOUR first factor (password step): then nobody can make
TouchQue push to, or lock out, an arbitrary user through your server. The
offline routes are OFF until you do (or explicitly opt out with
``allow_offline_without_first_factor=True``): with the username taken from
the body, anyone could burn a user's offline attempts and lock them out.
"""
import inspect
import logging
import re
from typing import TYPE_CHECKING, Any, Callable, Dict, Optional, Tuple, Union

from .exceptions import (
    TouchQueAPIException, TouchQuePasskeyRequiredError, TouchQueRejectedException, TouchQueTimeoutException,
)
from .guard import guard_input_from_headers, run_guard
from .rate_limiter import FixedWindowLimiter

if TYPE_CHECKING:
    from .client import TouchQue

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

    ``client``: a ``TouchQue`` instance (default: ``get_default_client()``).

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

    ``on_authenticated(request, response, info)``: called right before the
    relay sends its own success response for POST /login (once approved),
    /offline/verify, /offline/totp, /passkey/authenticate/verify and
    /passkey/login/verify. ``info`` is ``{"externalUsername", "requestId"
    (when known), "via": "login" | "passkey" | "offline" | "offline-totp"}``.
    Open your session here: mutate ``request`` (session) or ``response``
    (``set_cookie``); do not build a response yourself.

    Callbacks receive the framework's native request object.
    """

    def __init__(
        self,
        client: Optional['TouchQue'] = None,
        get_user_id: Optional[Callable[[Any], Optional[str]]] = None,
        get_login_user: Optional[Callable[[Any], Optional[str]]] = None,
        rate_limit: Union[Dict[str, int], bool, None] = None,
        allow_offline_without_first_factor: bool = False,
        action_type: str = 'LOGIN',
        get_details: Optional[Callable[[Any], Any]] = None,
        on_authenticated: Optional[Callable[[Any, Any, Dict[str, Any]], Any]] = None,
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
                '[TouchQue] RelayHandler: POST /login takes the username from the request body%s. Set '
                '`get_login_user` to bind them to your first factor (password step) so they cannot be used '
                'against arbitrary users.',
                ', and so do the offline routes' if self.offline_enabled
                else '; the offline routes are disabled until you set it')

    @property
    def client(self) -> 'TouchQue':
        if self._client is None:
            from .client import get_default_client
            self._client = get_default_client()
        return self._client

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
``X-TouchQue-Token: <token>``. Once approved the view runs ONCE, with
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
from typing import Any, Callable, Optional

from flask import Blueprint, abort, current_app, g, json, jsonify, request

from ..client import TouchQue, get_default_client
from ..guard import guard_input_from_headers, run_guard
from ..relay import RELAY_ROUTES, RelayHandler
from ..steps import LoginDetails


def _default_user() -> Optional[str]:
    u = getattr(g, 'user', None)
    if u is None:
        return None
    if isinstance(u, str):
        return u
    return getattr(u, 'email', None) or getattr(u, 'id', None) or getattr(u, 'username', None)


def require_touchque(
    action: str,
    client: Optional[TouchQue] = None,
    user: Optional[Callable[[], Optional[str]]] = None,
    details: Optional[Callable[[], Optional[LoginDetails]]] = None,
    reference_id: Optional[Callable[[], Optional[str]]] = None,
) -> Callable:
    """
    ``user``: who is approving. Default: ``flask.g.user`` (string, or an
    object with ``.email``/``.id``/``.username``). For the login step, return
    the user who just passed your password check, e.g.
    ``user=lambda: session.get('password_ok')``.
    """
    user_of = user or _default_user
    tq = client

    def decorator(view: Callable) -> Callable:
        @functools.wraps(view)
        def wrapped(*args: Any, **kwargs: Any) -> Any:
            c = tq or get_default_client()
            uid = user_of()
            result = run_guard(
                c, uid, action,
                details=details() if details else None,
                reference_id=reference_id() if reference_id else None,
                ip=request.remote_addr, user_agent=request.headers.get('User-Agent'),
                **guard_input_from_headers(lambda name: request.headers.get(name)),
            )
            if 'approved' in result:
                g.touchque = result['approved']
                return view(*args, **kwargs)
            resp = jsonify(result['body'])
            resp.status_code = result['status']
            resp.headers['Cache-Control'] = 'no-store'
            retry = result['body']['touchque'].get('retryAfter')
            if retry:
                resp.headers['Retry-After'] = str(retry)
            return resp
        return wrapped
    return decorator


def touchque_relay_blueprint(
    client: Optional[TouchQue] = None,
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
# From touchque/contrib/fastapi.py — RequireTouchQue + touchque_relay_router
# ─────────────────────────────────────────────────────────────

"""
FastAPI: one line per protected route, as a dependency.

    from fastapi import Depends, Request
    from touchque.contrib.fastapi import RequireTouchQue

    @app.post('/transfer')
    async def transfer(request: Request, touchque=Depends(
        RequireTouchQue('SEND_MONEY', details=lambda req: {'Amount': f'{req.state.amount} EUR'})
    )):
        return {'ok': True, 'touchque': touchque}

Until the user approves on their phone the dependency raises
``HTTPException(202, detail={"touchque": step, "token": ...})``. Your page
shows the step in its own design and sends the same request again with
header ``X-TouchQue-Token: <token>``. Once approved the dependency resolves
to the approval (once) and your route runs.

FastAPI's default exception handler puts that JSON under a top-level
``"detail"`` key (``{"detail": {"touchque": ..., "token": ...}}``) — unlike
the Django/Flask adapters, which return it at the top level. Call
``install_touchque_exception_handler(app)`` once at startup to flatten it and
match the other adapters exactly.

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
import json
from typing import Any, Awaitable, Callable, Optional

import anyio
import anyio.from_thread
import anyio.to_thread
import fastapi
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from ..client import TouchQue, get_default_client
from ..guard import guard_input_from_headers, run_guard
from ..relay import RELAY_ROUTES, RelayHandler
from ..steps import LoginDetails


async def _default_user(request: Request) -> Optional[str]:
    u = getattr(request.state, 'user', None)
    if u is None:
        return None
    if isinstance(u, str):
        return u
    return getattr(u, 'email', None) or getattr(u, 'id', None) or getattr(u, 'username', None)


def RequireTouchQue(  # noqa: N802 — reads as a dependency factory, PascalCase is idiomatic here
    action: str,
    client: Optional[TouchQue] = None,
    user: Optional[Callable[[Request], Any]] = None,
    details: Optional[Callable[[Request], Optional[LoginDetails]]] = None,
    reference_id: Optional[Callable[[Request], Any]] = None,
) -> Callable[[Request], Any]:
    """
    ``user``: async or sync callable resolving who is approving from the
    request. Default: ``request.state.user``. For the login step, return the
    user who just passed your password check.
    """
    user_of = user or _default_user
    tq = client

    async def dependency(request: Request) -> Any:
        c = tq or get_default_client()
        uid = user_of(request)
        if hasattr(uid, '__await__'):
            uid = await uid
        det = details(request) if details else None
        if hasattr(det, '__await__'):
            det = await det
        ref = reference_id(request) if reference_id else None
        if hasattr(ref, '__await__'):
            ref = await ref

        result = await anyio.to_thread.run_sync(lambda: run_guard(
            c, uid, action, details=det, reference_id=ref,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get('user-agent'),
            **guard_input_from_headers(lambda name: request.headers.get(name)),
        ))
        if 'approved' in result:
            return result['approved']
        headers = {'Cache-Control': 'no-store'}
        retry = result['body']['touchque'].get('retryAfter')
        if retry:
            headers['Retry-After'] = str(retry)
        raise HTTPException(status_code=result['status'], detail=result['body'], headers=headers)

    return dependency


def install_touchque_exception_handler(app: fastapi.FastAPI) -> None:
    """Optional: makes a raised TouchQue step return the SAME JSON shape as
    the Django/Flask adapters (no ``{"detail": ...}`` wrapper)."""
    from fastapi import Request as _Request
    from fastapi.responses import JSONResponse

    @app.exception_handler(HTTPException)
    async def _touchque_exception_handler(request: _Request, exc: HTTPException):  # type: ignore[no-redef]
        if isinstance(exc.detail, dict) and 'touchque' in exc.detail:
            return JSONResponse(exc.detail, status_code=exc.status_code, headers=exc.headers)
        return JSONResponse({'detail': exc.detail}, status_code=exc.status_code, headers=exc.headers)


async def _await(awaitable: Awaitable[Any]) -> Any:
    return await awaitable


def _run_async(awaitable: Awaitable[Any]) -> Any:
    """Resolves an async callback's result from the relay's worker thread."""
    return anyio.from_thread.run(_await, awaitable)


def touchque_relay_router(
    client: Optional[TouchQue] = None,
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
``X-TouchQue-Token: <token>``. Once approved the view runs ONCE, with
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
from typing import Any, Callable, List, Optional

from django.core.serializers.json import DjangoJSONEncoder
from django.http import Http404, HttpRequest, HttpResponse, JsonResponse
from django.urls import re_path
from django.views.decorators.csrf import csrf_exempt as _csrf_exempt

from ..client import TouchQue, get_default_client
from ..guard import guard_input_from_headers, run_guard
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


def require_touchque(
    action: str,
    client: Optional[TouchQue] = None,
    user: Optional[Callable[[HttpRequest], Optional[str]]] = None,
    details: Optional[Callable[[HttpRequest], Optional[LoginDetails]]] = None,
    reference_id: Optional[Callable[[HttpRequest], Optional[str]]] = None,
) -> Callable:
    """
    ``user``: who is approving, given the request. Default:
    ``request.user.email`` (Django auth). For the login step, return the user
    who just passed your password check, e.g.
    ``user=lambda req: req.session.get('password_ok')``.
    """
    user_of = user or _default_user
    tq = client

    def decorator(view: Callable) -> Callable:
        @functools.wraps(view)
        def wrapped(request: HttpRequest, *args: Any, **kwargs: Any) -> Any:
            c = tq or get_default_client()
            uid = user_of(request)
            result = run_guard(
                c, uid, action,
                details=details(request) if details else None,
                reference_id=reference_id(request) if reference_id else None,
                ip=request.META.get('REMOTE_ADDR'), user_agent=request.META.get('HTTP_USER_AGENT'),
                **guard_input_from_headers(lambda name: request.headers.get(name)),
            )
            if 'approved' in result:
                request.touchque = result['approved']
                return view(request, *args, **kwargs)
            resp = JsonResponse(result['body'], status=result['status'])
            resp['Cache-Control'] = 'no-store'
            retry = result['body']['touchque'].get('retryAfter')
            if retry:
                resp['Retry-After'] = str(retry)
            return resp
        return wrapped
    return decorator


def _json_body(request: HttpRequest) -> Any:
    if request.content_type != 'application/json' or not request.body:
        return None
    try:
        return json.loads(request.body)
    except ValueError:
        return None


def touchque_relay_view(
    client: Optional[TouchQue] = None,
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
    client: Optional[TouchQue] = None,
    csrf_exempt: bool = False,
    handler: Optional[RelayHandler] = None,
    **options: Any
) -> List[Any]:
    """URL patterns for the relay, to mount with
    ``path('touchque/', include(touchque_relay_urls(...)))``."""
    view = touchque_relay_view(client, csrf_exempt=csrf_exempt, handler=handler, **options)
    return [re_path(r'^(?P<sub>.*)$', view, name='touchque_relay')]
