export function LoginPage({
  email,
  setEmail,
  code,
  setCode,
  quickRole,
  setQuickRole,
  quickCode,
  setQuickCode,
  onSendCode,
  onSignIn,
  onSignUp,
  onQuickLogin,
  onProviderLogin,
  isSubmitting,
  providers
}) {
  return (
    <div className="login-shell">
      <div className="login-card">
        <h2>Sign in to PillCount</h2>
        <p className="muted">Use your email code, or continue with a provider.</p>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          disabled={isSubmitting}
        />
        <button type="button" onClick={onSendCode} disabled={isSubmitting}>Send Verification Code</button>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter 6-digit code"
          disabled={isSubmitting}
        />

        <div className="row">
          <button type="button" onClick={onSignIn} disabled={isSubmitting}>Sign In</button>
          <button type="button" className="secondary" onClick={onSignUp} disabled={isSubmitting}>Sign Up</button>
        </div>

        {providers.quickEnabled ? (
          <div className="quick-login-block">
            <div className="login-divider"><span>quick login</span></div>
            <select value={quickRole} onChange={(e) => setQuickRole(e.target.value)} disabled={isSubmitting}>
              <option value="admin" disabled={!providers.quickRoles?.admin}>Admin</option>
              <option value="developer" disabled={!providers.quickRoles?.developer}>Developer</option>
              <option value="operator" disabled={!providers.quickRoles?.operator}>Operator</option>
            </select>
            <input
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value)}
              placeholder="Enter quick login code"
              disabled={isSubmitting}
            />
            <button type="button" className="secondary" onClick={onQuickLogin} disabled={isSubmitting}>
              Quick Login
            </button>
          </div>
        ) : null}

        <div className="login-divider"><span>or</span></div>

        <button
          type="button"
          className="social-btn"
          disabled={isSubmitting || !providers.googleEnabled}
          onClick={() => onProviderLogin('google')}
        >
          Continue with Google
        </button>
        <button
          type="button"
          className="social-btn"
          disabled={isSubmitting || !providers.microsoftEnabled}
          onClick={() => onProviderLogin('microsoft')}
        >
          Continue with Microsoft
        </button>
        <button
          type="button"
          className="social-btn"
          disabled={isSubmitting || !providers.appleEnabled}
          onClick={() => onProviderLogin('apple')}
        >
          Continue with Apple
        </button>
        <p className="small muted" style={{ marginTop: 12 }}>
          New accounts are created automatically after a successful Sign Up or first provider login.
        </p>
      </div>
    </div>
  );
}
