import {createContext, useContext, useState, type FormEvent, type ReactNode} from 'react';
import {checkPassword, configuredHash, SESSION_KEY, sessionValue} from '../lib/accessGate';

// Demo access screen, same design and behavior as BC3: access lasts for the browser tab session and the
// header "Lock" button ends it. Not security (see lib/accessGate.ts).
const EXPECTED = configuredHash(import.meta.env.VITE_ACCESS_PASSWORD_HASH);

function hasSessionAccess() {
  if (!EXPECTED) return false;
  try {
    return sessionStorage.getItem(SESSION_KEY) === sessionValue(EXPECTED);
  } catch {
    return false;
  }
}

const LockContext = createContext<() => void>(() => undefined);
// eslint-disable-next-line react-refresh/only-export-components -- hook beside its provider
export const useLock = () => useContext(LockContext);

export function PasswordGate({children}: {children: ReactNode}) {
  const [authorized, setAuthorized] = useState(hasSessionAccess);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const lock = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* nothing stored */
    }
    setAuthorized(false);
    setPassword('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (checking) return;
    setChecking(true);
    const ok = await checkPassword(password, EXPECTED);
    setChecking(false);
    if (!ok || !EXPECTED) {
      setError('Incorrect password. Please try again.');
      setPassword('');
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, sessionValue(EXPECTED));
    } catch {
      /* Access still works for this page view when storage is unavailable. */
    }
    setAuthorized(true);
    setError('');
  };

  if (authorized) return <LockContext.Provider value={lock}>{children}</LockContext.Provider>;
  return (
    <main className="access-page">
      <section className="access-panel" aria-labelledby="access-title">
        <div className="access-brand">
          <img src="/weis-1-logo-svg-vector.svg" alt="Weis Markets" width={58} height={58} />
          <span />
          <img src="/wizelinered.svg" alt="Wizeline" width={42} height={42} />
        </div>
        <p className="access-eyebrow">
          <span>LABOR SPEND ·</span> <span>RESTRICTED DEMO</span>
        </p>
        <h1 id="access-title">Enter the report</h1>
        {EXPECTED ? (
          <>
            <p className="access-copy">Use the access password provided by the project owner.</p>
            <form onSubmit={submit}>
              <label htmlFor="report-password">Password</label>
              <input
                id="report-password"
                name="password"
                type="password"
                value={password}
                onChange={event => {
                  setPassword(event.target.value);
                  setError('');
                }}
                autoComplete="current-password"
                autoFocus
                required
                maxLength={200}
                aria-describedby={error ? 'password-error' : undefined}
              />
              {error ? (
                <p className="access-error" id="password-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" disabled={checking}>
                {checking ? 'Checking…' : 'Continue'}
              </button>
            </form>
          </>
        ) : (
          <p className="access-error" role="alert">
            Access is not configured for this deployment. Please contact the project owner.
          </p>
        )}
        <p className="access-footnote">Authorized viewers only. Access lasts until this browser tab or session is closed.</p>
        <p className="access-notice">This interactive prototype was developed by Wizeline for Weis Markets for demonstration, evaluation and feedback only. All data and figures are synthetic and do not represent Weis Markets results.</p>
        <p className="access-copyright">© 2026 Wizeline · Prototype developed for Weis Markets</p>
      </section>
    </main>
  );
}
