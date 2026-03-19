export function AuthCard({
  email,
  setEmail,
  code,
  setCode,
  devCode,
  quickRole,
  setQuickRole,
  quickCode,
  setQuickCode,
  onSendCode,
  onVerifyCode,
  onQuickLogin,
  onLogout,
  disabled
}) {
  return (
    <div className="card">
      <h3>Authentication</h3>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" disabled={disabled} />
      <div className="row">
        <button type="button" onClick={onSendCode} disabled={disabled}>Send Code</button>
        <button type="button" className="secondary" onClick={onVerifyCode} disabled={disabled}>Verify</button>
      </div>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" disabled={disabled} />
      {devCode ? <p className="small muted">Dev code: {devCode}</p> : null}

      <div style={{ marginTop: 14 }}>
        <select value={quickRole} onChange={(e) => setQuickRole(e.target.value)} disabled={disabled}>
          <option value="admin">Admin</option>
          <option value="developer">Developer</option>
          <option value="operator">Operator</option>
        </select>
        <input value={quickCode} onChange={(e) => setQuickCode(e.target.value)} placeholder="Quick login code" disabled={disabled} />
        <button type="button" onClick={onQuickLogin} disabled={disabled}>Quick Login</button>
      </div>

      <button type="button" className="secondary" style={{ marginTop: 12 }} onClick={onLogout}>Logout</button>
    </div>
  );
}
