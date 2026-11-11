# @touchque/react

React bindings for [`@touchque/web`](https://www.npmjs.com/package/@touchque/web)
— hooks and components for [Touchque](https://touchque.com) push 2FA and
passkey sign-in, so you don't hand-write the step-up polling loop yourself.

[![npm version](https://img.shields.io/npm/v/@touchque/react.svg)](https://www.npmjs.com/package/@touchque/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

📘 Full docs: **[support.touchque.com](https://support.touchque.com)**

## Install

```bash
npm install @touchque/react @touchque/web
```

`@touchque/web` is a peer dependency — install it alongside this package.

## Quick start — protect any action

Pair this with a server route guarded by a Touchque server SDK
(e.g. Node's `requireTouchque('SEND_MONEY')`):

```tsx
import { useTouchqueAction } from '@touchque/react';

function TransferButton() {
  // baseUrl: where your server mounted touchqueRouter (used for passkey approval).
  const { run, status, step } = useTouchqueAction({ baseUrl: '/touchque', credentials: 'include' });
  const send = () => run('/api/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 100 }),
  });

  return (
    <>
      <button onClick={send} disabled={status === 'pending'}>Send</button>
      {step?.state === 'waiting' && step.number && <p>Approve {step.number} on your phone</p>}
      {step?.state === 'enroll' && <img src={step.enroll!.qrCodeDataUrl} alt="Scan with Touchque" />}
    </>
  );
}
```

## Drop-in approval dialog

```tsx
import { useTouchqueApproval, TouchqueApproval } from '@touchque/react';

function SendMoney() {
  const approval = useTouchqueApproval({ baseUrl: '/touchque', credentials: 'include' });
  const send = async () => {
    const res = await approval.fetch('/api/transfer', { method: 'POST', body: JSON.stringify({ amount: 250 }) });
    if (res.ok) toast('Sent');
  };
  return (
    <>
      <button onClick={send}>Send</button>
      <TouchqueApproval approval={approval} />
    </>
  );
}
```

The dialog opens only when your server asks for an approval. It shows the number to pick on the phone, the
first-time link QR, the offline QR and code, the passkey step and refusals with their case code; closing it
rejects the call with an `AbortError`. `approval.login()` runs the push sign-in the same way. Props: `theme`
(`light`, `dark`, `auto`), `className`, `style` (set the `--tq-approval-*` CSS variables there). Texts:
`useTouchqueApproval(config, { texts })`. The hook also returns the state (`phase`, `number`, `offline`,
`error`…) to render your own.

## Passkey autofill and the passkey offer

```tsx
const autofill = usePasskeyAutofill({ baseUrl: '/touchque' }, { onResult: (r) => r.ok && goHome() });
<input type="email" name="email" {...autofill.inputProps} />

const offer = usePasskeyUpgrade({ baseUrl: '/touchque', credentials: 'include' }, user.email);
{offer.status === 'offer' && <Banner onAdd={() => offer.upgrade()} onLater={offer.dismiss} />}
```

Autofill never opens a modal; without browser support nothing happens. The offer shows once per browser and
user, after a password or email-link sign-in (see `@touchque/web`'s README).

## Login (enroll + push, number matching)

```tsx
import { TwoFactorLoginButton, TwoFactorEnroll, useTouchqueLogin } from '@touchque/react';

<TwoFactorEnroll onLinked={() => setStep('login')} />
<TwoFactorLoginButton onSuccess={(result) => setSession(result)} />
```

Or drive the same flow yourself with `useTouchqueLogin()` / `useTouchqueEnroll()`.

## Passkeys

```tsx
import { PasskeyButton, useTouchquePasskey } from '@touchque/react';

<PasskeyButton email={email} onSuccess={(result) => setSession(result)} />
```

`useTouchquePasskey()` exposes the same flow as a hook if you want your own UI.

## Errors

Re-exported from `@touchque/web` so you don't need a second import for
`instanceof` checks: `PasskeyDismissedError`, `PasskeyNotRegisteredError`,
`PasskeyDisabledError`, `EnrollmentTimeoutError`, `EnrollmentCancelledError`,
`PasskeyRequiredError`, `TouchqueWebAPIError`.

## Security

This package renders whatever `@touchque/web` gives it — it never holds an
API secret and only talks to your own backend. See
[SECURITY.md](https://github.com/Touchque/touchque-react/blob/main/SECURITY.md) to report a vulnerability.

## Requirements

- React 18+
- `@touchque/web` and a Touchque server SDK relaying requests on your backend

## Contributing

This package's tests build against a local `@touchque/web` checkout — clone
[`touchque-web`](https://github.com/Touchque/touchque-web) as a sibling
directory before running `npm install`. See [CONTRIBUTING.md](https://github.com/Touchque/touchque-react/blob/main/CONTRIBUTING.md).

## License

MIT © [Touchque](https://touchque.com)

## "Why?": case codes

`useTouchqueLogin().caseCode` is the case code of the current step or of the refusal (`K7P-2QX`), or `null`. Show it
next to the step or the error, "Tell your support team: K7P-2QX"; your team opens the whole decision by it in the
Touchque dashboard. Needs `@touchque/web` 1.5.0 and a 4.0.0 server SDK.

## Touchque Login (hosted sign-in)

Sign-up and sign-in pages for your own customers, on your brand, with OpenID Connect. See [support.touchque.com/touchque-login](https://support.touchque.com/touchque-login) for this SDK's client and a quickstart.
