export function ApiKeyCard({ apiKey, setApiKey, onSaveApiKey }) {
  return (
    <div className="card">
      <h3>API Key</h3>
      <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="x-api-key for write routes" />
      <button type="button" onClick={onSaveApiKey}>Save API Key</button>
      <p className="small muted">Write endpoints require API key when backend has API_KEY set.</p>
    </div>
  );
}
