function getStoreInitials(storeTitle) {
  const tokens = String(storeTitle || '')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return 'RX';
  return tokens.slice(0, 2).map((token) => token[0].toUpperCase()).join('');
}

export function StatusCard({
  isLocked,
  statusText,
  error,
  lastUpdatedAt,
  storeTitle,
  storeLogoUrl,
  onStoreTitleChange,
  onStoreLogoUrlChange,
  showLogout,
  onLogout
}) {
  const displayTitle = String(storeTitle || '').trim() || 'Your Pharmacy Store';
  const updatedText = lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : 'Waiting for first sync';

  const handleLogoUpload = (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onStoreLogoUrlChange(reader.result);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  return (
    <div className="hero-card" style={{ marginBottom: 16 }}>
      <div className="hero-header">
        <div className="hero-brand">
          <div className="store-logo" aria-hidden="true">
            {storeLogoUrl ? (
              <img src={storeLogoUrl} alt={`${displayTitle} logo`} />
            ) : (
              <span>{getStoreInitials(displayTitle)}</span>
            )}
          </div>
          <div>
            <p className="hero-kicker">Pharmacy Operations Center</p>
            <h1>{displayTitle}</h1>
            <p className="small muted">PillCount Professional Dashboard</p>
          </div>
        </div>
        <div className="hero-actions">
          <p className="small muted">Last sync: {updatedText}</p>
          <p className={isLocked ? 'status-warn small' : 'status-ok small'}>{statusText}</p>
          {showLogout ? (
            <button type="button" className="secondary hero-logout" onClick={onLogout}>
              Logout
            </button>
          ) : null}
        </div>
      </div>

      <details className="brand-config">
        <summary>Customize Store Header</summary>
        <div className="brand-config-grid">
          <label>
            Store title
            <input
              type="text"
              value={storeTitle}
              placeholder="Your Pharmacy Store"
              onChange={(event) => onStoreTitleChange(event.target.value)}
            />
          </label>
          <label>
            Logo URL
            <input
              type="url"
              value={storeLogoUrl}
              placeholder="https://example.com/store-logo.png"
              onChange={(event) => onStoreLogoUrlChange(event.target.value)}
            />
          </label>
          <label className="brand-upload">
            Upload logo
            <input type="file" accept="image/*" onChange={handleLogoUpload} />
          </label>
          <button type="button" className="secondary brand-clear" onClick={() => onStoreLogoUrlChange('')}>
            Clear Logo
          </button>
        </div>
      </details>

      {error ? <p className="status-warn small" style={{ marginTop: 10 }}>{error}</p> : null}
    </div>
  );
}
