export function DashboardToolbar({
  isRefreshing,
  autoRefresh,
  setAutoRefresh,
  onRefresh,
  globalSearch,
  setGlobalSearch,
  machineQuery,
  setMachineQuery,
  recordQuery,
  setRecordQuery,
  statusFilter,
  setStatusFilter,
  savedView,
  setSavedView,
  onExportRecords
}) {
  return (
    <div className="card toolbar" style={{ marginBottom: 16 }}>
      <div className="toolbar-row">
        <button onClick={onRefresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
        </button>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto refresh
        </label>
        <button className="secondary" onClick={onExportRecords}>Export Records CSV</button>
      </div>
      <div className="toolbar-row">
        <input
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
          placeholder="Global search: machine, pill, lot, operator"
        />
        <select value={savedView} onChange={(e) => setSavedView(e.target.value)}>
          <option value="default">Saved View: Default</option>
          <option value="online">Online Machines</option>
          <option value="offline">Offline Attention</option>
          <option value="highVolume">High Volume Records</option>
        </select>
        <p className="small muted toolbar-hint">Live console filters apply to all overview tables.</p>
      </div>
      <div className="toolbar-row">
        <input
          value={machineQuery}
          onChange={(e) => setMachineQuery(e.target.value)}
          placeholder="Search machine ID or location"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="online">Online only</option>
          <option value="offline">Offline only</option>
        </select>
        <input
          value={recordQuery}
          onChange={(e) => setRecordQuery(e.target.value)}
          placeholder="Search records by machine, pill, or code"
        />
      </div>
    </div>
  );
}
