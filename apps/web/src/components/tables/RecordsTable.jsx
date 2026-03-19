import { useMemo, useState } from 'react';

const PAGE_SIZE = 10;

function compareValues(left, right, direction) {
  if (left === right) return 0;
  if (left === null || left === undefined) return direction === 'asc' ? -1 : 1;
  if (right === null || right === undefined) return direction === 'asc' ? 1 : -1;
  if (left > right) return direction === 'asc' ? 1 : -1;
  return direction === 'asc' ? -1 : 1;
}

export function RecordsTable({ records }) {
  const [sortKey, setSortKey] = useState('timestamp');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const sortedRecords = useMemo(() => {
    const next = [...records];
    return next.sort((left, right) => {
      if (sortKey === 'quantity') {
        return compareValues(Number(left.quantity || 0), Number(right.quantity || 0), sortDir);
      }
      if (sortKey === 'machineId') {
        return compareValues(String(left.machineId || ''), String(right.machineId || ''), sortDir);
      }
      if (sortKey === 'pill') {
        return compareValues(String(left.pillName || left.pillTypeCode || ''), String(right.pillName || right.pillTypeCode || ''), sortDir);
      }
      return compareValues(Number(left.timestamp || 0), Number(right.timestamp || 0), sortDir);
    });
  }, [records, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sortedRecords.slice(start, start + PAGE_SIZE);

  const toggleSort = (nextSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextSortKey);
    setSortDir(nextSortKey === 'timestamp' ? 'desc' : 'asc');
  };

  return (
    <div className="card">
      <div className="section-title">
        <h3>Latest Records</h3>
        <p className="small muted">{records.length} total</p>
      </div>
      <div className="table-wrap">
        <table className="table sticky-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('timestamp')}>
                  Time
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('machineId')}>
                  Machine
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('pill')}>
                  Pill
                </button>
              </th>
              <th>Lot</th>
              <th>Operator</th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('quantity')}>
                  Qty
                </button>
              </th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? pageRows.map((record) => (
              <tr key={record.id}>
                <td>{new Date(record.timestamp).toLocaleString()}</td>
                <td>{record.machineId}</td>
                <td>{record.pillName || record.pillTypeCode}</td>
                <td>{record.lotNo || '—'}</td>
                <td>{record.operatorId || '—'}</td>
                <td>{record.quantity}</td>
                <td>
                  <span className={record.status === 'normal' ? 'badge badge-ok' : 'badge badge-neutral'}>
                    {record.status || 'normal'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7} className="muted">No records match current filters.</td></tr>
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
