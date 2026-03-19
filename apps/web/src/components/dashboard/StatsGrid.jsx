export function StatsGrid({ stats }) {
  return (
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      <div className="card metric"><p className="muted small">Total Pills</p><h2>{stats.totalPills}</h2></div>
      <div className="card metric"><p className="muted small">Records</p><h2>{stats.totalRecords}</h2></div>
      <div className="card metric"><p className="muted small">Machines Online</p><h2>{stats.machinesOnline}</h2></div>
      <div className="card metric"><p className="muted small">Active Jobs</p><h2>{stats.activeJobs || 0}</h2></div>
      <div className="card metric"><p className="muted small">Pill Types</p><h2>{stats.totalTypes}</h2></div>
    </div>
  );
}
