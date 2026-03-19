import { useMemo, useState } from 'react';

const PAGE_SIZE = 10;

function compareValues(left, right, direction) {
  if (left === right) return 0;
  if (left === null || left === undefined) return direction === 'asc' ? -1 : 1;
  if (right === null || right === undefined) return direction === 'asc' ? 1 : -1;
  if (left > right) return direction === 'asc' ? 1 : -1;
  return direction === 'asc' ? -1 : 1;
}

export function JobsTable({ jobs, onStartJob, onFinishJob, isBusy }) {
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const sortedJobs = useMemo(() => {
    const next = [...jobs];
    return next.sort((left, right) => {
      if (sortKey === 'status') {
        return compareValues(String(left.status || ''), String(right.status || ''), sortDir);
      }
      if (sortKey === 'machineId') {
        return compareValues(String(left.machineId || ''), String(right.machineId || ''), sortDir);
      }
      return compareValues(Number(left.createdAt || 0), Number(right.createdAt || 0), sortDir);
    });
  }, [jobs, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedJobs.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sortedJobs.slice(start, start + PAGE_SIZE);

  const toggleSort = (nextSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextSortKey);
    setSortDir(nextSortKey === 'createdAt' ? 'desc' : 'asc');
  };

  return (
    <div className="card">
      <div className="section-title">
        <h3>Jobs & Sessions</h3>
        <p className="small muted">{jobs.length} total</p>
      </div>
      <div className="table-wrap">
        <table className="table sticky-table">
          <thead>
            <tr>
              <th>Job ID</th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('machineId')}>
                  Machine
                </button>
              </th>
              <th>Pill Type</th>
              <th>Target</th>
              <th>Actual</th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('status')}>
                  Status
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('createdAt')}>
                  Created
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? pageRows.map((job) => (
              <tr key={job.jobId}>
                <td>{job.jobId}</td>
                <td>{job.machineId}</td>
                <td>{job.pillTypeCode}</td>
                <td>{job.targetQuantity}</td>
                <td>{job.actualQuantity ?? '—'}</td>
                <td>
                  <span className={job.status === 'completed' ? 'badge badge-ok' : 'badge badge-neutral'}>
                    {job.status}
                  </span>
                </td>
                <td>{new Date(job.createdAt).toLocaleString()}</td>
                <td>
                  {job.status === 'planned' ? (
                    <button type="button" className="ghost small-btn" onClick={() => onStartJob(job)} disabled={isBusy}>
                      Start
                    </button>
                  ) : null}
                  {job.status === 'in_progress' ? (
                    <button type="button" className="ghost small-btn" onClick={() => onFinishJob(job)} disabled={isBusy}>
                      Finish
                    </button>
                  ) : null}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8} className="muted">No jobs found. Create the first session.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <button type="button" className="ghost" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={safePage <= 1}>
          Previous
        </button>
        <p className="small muted">Page {safePage} / {pageCount}</p>
        <button
          type="button"
          className="ghost"
          onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
          disabled={safePage >= pageCount}
        >
          Next
        </button>
      </div>
    </div>
  );
}
