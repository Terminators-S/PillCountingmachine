import { useMemo, useState } from 'react';

const PAGE_SIZE = 8;

function compareValues(left, right, direction) {
  if (left === right) return 0;
  if (left === null || left === undefined) return direction === 'asc' ? -1 : 1;
  if (right === null || right === undefined) return direction === 'asc' ? 1 : -1;
  if (left > right) return direction === 'asc' ? 1 : -1;
  return direction === 'asc' ? -1 : 1;
}

export function MachinesTable({ machines }) {
  const [sortKey, setSortKey] = useState('machine_id');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);

  const sortedMachines = useMemo(() => {
    const next = [...machines];
    return next.sort((left, right) => {
      if (sortKey === 'status') {
        return compareValues(String(left.status || ''), String(right.status || ''), sortDir);
      }
      if (sortKey === 'location') {
        return compareValues(String(left.location || ''), String(right.location || ''), sortDir);
      }
      return compareValues(String(left.machine_id || ''), String(right.machine_id || ''), sortDir);
    });
  }, [machines, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedMachines.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sortedMachines.slice(start, start + PAGE_SIZE);

  const allVisibleSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.includes(row.machine_id));

  const toggleSort = (nextSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextSortKey);
    setSortDir('asc');
  };

  const toggleRowSelection = (machineId) => {
    setSelectedIds((prev) => (
      prev.includes(machineId)
        ? prev.filter((id) => id !== machineId)
        : [...prev, machineId]
    ));
  };

  const toggleVisibleRows = () => {
    if (!pageRows.length) return;
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !pageRows.some((row) => row.machine_id === id));
      }
      const additions = pageRows.map((row) => row.machine_id).filter((id) => !prev.includes(id));
      return [...prev, ...additions];
    });
  };

  const copySelectedMachineIds = async () => {
    const text = selectedIds.join(', ');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      // Ignore clipboard restrictions.
    }
  };

  return (
    <div className="card">
      <div className="section-title">
        <h3>Machines</h3>
        <p className="small muted">{machines.length} total</p>
      </div>
      <div className="table-actions">
        <button type="button" className="ghost" onClick={copySelectedMachineIds} disabled={!selectedIds.length}>
          Copy Selected IDs
        </button>
        <p className="small muted">{selectedIds.length} selected</p>
      </div>
      <div className="table-wrap">
        <table className="table sticky-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all rows on current page"
                  checked={allVisibleSelected}
                  onChange={toggleVisibleRows}
                />
              </th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('machine_id')}>
                  ID
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('location')}>
                  Location
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('status')}>
                  Status
                </button>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? pageRows.map((machine) => (
              <tr key={machine.machine_id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select machine ${machine.machine_id}`}
                    checked={selectedIds.includes(machine.machine_id)}
                    onChange={() => toggleRowSelection(machine.machine_id)}
                  />
                </td>
                <td>{machine.machine_id}</td>
                <td>{machine.location || '—'}</td>
                <td>
                  <span className={machine.status === 'online' ? 'badge badge-ok' : 'badge badge-neutral'}>
                    {machine.status}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="ghost small-btn"
                    onClick={() => navigator.clipboard?.writeText(machine.machine_id).catch(() => null)}
                  >
                    Copy ID
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="muted">No machines match current filters.</td></tr>
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
