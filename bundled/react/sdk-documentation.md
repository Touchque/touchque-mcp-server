# @touchque/react

React bindings for [`@touchque/web`](https://www.npmjs.com/package/@touchque/web)
— hooks and components for [TouchQue](https://touchque.com) push 2FA and
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

Pair this with a server route guarded by a TouchQue server SDK
(e.g. Node's `requireTouchQue('SEND_MONEY')`):

```tsx
import { useTouchQueAction } from '@touchque/react';

function TransferButton() {
  const { run, status, step } = useTouchQueAction();

  return (
    <>
      <button onClick={() => run('/api/transfer', { method: 'POST', body: ... })}>
        Send
      </button>
      {status === 'waiting' && step.number && <p>Approve {step.number} on your phone</p>}
      {status === 'enroll' && <img src={step.enroll.qrCodeDataUrl} alt="Scan with TouchQue" />}
    </>
  );
}
```

## Drop-in approval dialog

```tsx
import { useTouchQueApproval, TouchQueApproval } from '@touchque/react';

function SendMoney() {
  const approval = useTouchQueApproval({ baseUrl: '/touchque', credentials: 'include' });
  const send = async () => {
    const res = await approval.fetch('/api/transfer', { method: 'POST', body: JSON.stringify({ amount: 250 }) });
    if (res.ok) toast('Sent');
  };
  return (
    <>
      <button onClick={send}>Send</button>
      <TouchQueApproval approval={approval} />
    </>
  );
}
```

The dialog opens only when your server asks for an approval. It shows the number to pick on the phone, the
first-time link QR, the offline QR and code, the passkey step and refusals with their case code; closing it
rejects the call with an `AbortError`. `approval.login()` runs the push sign-in the same way. Props: `theme`
(`light`, `dark`, `auto`), `className`, `style` (set the `--tq-approval-*` CSS variables there). Texts:
`useTouchQueApproval(config, { texts })`. The hook also returns the state (`phase`, `number`, `offline`,
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
import { TwoFactorLoginButton, TwoFactorEnroll, useTouchQueLogin } from '@touchque/react';

<TwoFactorEnroll onLinked={() => setStep('login')} />
<TwoFactorLoginButton onSuccess={(result) => setSession(result)} />
```

Or drive the same flow yourself with `useTouchQueLogin()` / `useTouchQueEnroll()`.

## Passkeys

```tsx
import { PasskeyButton, useTouchQuePasskey } from '@touchque/react';

<PasskeyButton email={email} onSuccess={(result) => setSession(result)} />
```

`useTouchQuePasskey()` exposes the same flow as a hook if you want your own UI.

## Errors

Re-exported from `@touchque/web` so you don't need a second import for
`instanceof` checks: `PasskeyDismissedError`, `PasskeyNotRegisteredError`,
`PasskeyDisabledError`, `EnrollmentTimeoutError`, `EnrollmentCancelledError`,
`PasskeyRequiredError`, `TouchQueWebAPIError`.

## Security

This package renders whatever `@touchque/web` gives it — it never holds an
API secret and only talks to your own backend. See
[SECURITY.md](./SECURITY.md) to report a vulnerability.

## Requirements

- React 18+
- `@touchque/web` and a TouchQue server SDK relaying requests on your backend

## Contributing

This package's tests build against a local `@touchque/web` checkout — clone
[`touchque-web`](https://github.com/Touchque/touchque-web) as a sibling
directory before running `npm install`. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT © [TouchQue](https://touchque.com)

## "Why?": case codes

`useTouchQueLogin().caseCode` is the case code of the current step or of the refusal (`K7P-2QX`), or `null`. Show it
next to the step or the error, "Tell your support team: K7P-2QX"; your team opens the whole decision by it in the
TouchQue dashboard. Needs `@touchque/web` 1.5.0 and a 4.0.0 server SDK.

## TouchQue Login (hosted sign-in)

Sign-up and sign-in pages for your own customers, on your brand, with OpenID Connect. See [HOSTED_LOGIN.md](../HOSTED_LOGIN.md) for this SDK's client and a quickstart.
