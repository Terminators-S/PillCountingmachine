import { useMemo, useState } from 'react';

const PAGE_SIZE = 10;

function compareValues(left, right, direction) {
  if (left === right) return 0;
  if (left === null || left === undefined) return direction === 'asc' ? -1 : 1;
  if (right === null || right === undefined) return direction === 'asc' ? 1 : -1;
  if (left > right) return direction === 'asc' ? 1 : -1;
  return direction === 'asc' ? -1 : 1;
}

export function EventsTable({ events }) {
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const sortedEvents = useMemo(() => {
    const next = [...events];
    return next.sort((left, right) => compareValues(Number(left.timestamp || 0), Number(right.timestamp || 0), sortDir));
  }, [events, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedEvents.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sortedEvents.slice(start, start + PAGE_SIZE);

  return (
    <div className="card">
      <div className="section-title">
        <h3>Machine Events</h3>
        <p className="small muted">{events.length} total</p>
      </div>
      <div className="table-actions">
        <button type="button" className="ghost" onClick={() => setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'))}>
          Sort by Time ({sortDir === 'desc' ? 'Newest' : 'Oldest'})
        </button>
      </div>
      <div className="table-wrap">
        <table className="table sticky-table">
          <thead><tr><th>Time</th><th>Machine</th><th>Event</th><th>Event ID</th><th>Payload</th></tr></thead>
          <tbody>
            {pageRows.length ? pageRows.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.timestamp).toLocaleString()}</td>
                <td>{event.machineId}</td>
                <td>{event.eventType}</td>
                <td className="small muted">{event.eventId || '—'}</td>
                <td className="muted small">
                  <details>
                    <summary>View payload</summary>
                    <pre className="payload-pre">{event.payload ? JSON.stringify(event.payload, null, 2) : '—'}</pre>
                  </details>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="muted">No events available.</td></tr>
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
