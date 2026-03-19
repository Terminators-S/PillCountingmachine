import { useMemo, useState } from 'react';

const PAGE_SIZE = 12;

function compareValues(left, right, direction) {
  if (left === right) return 0;
  if (left === null || left === undefined) return direction === 'asc' ? -1 : 1;
  if (right === null || right === undefined) return direction === 'asc' ? 1 : -1;
  if (left > right) return direction === 'asc' ? 1 : -1;
  return direction === 'asc' ? -1 : 1;
}

export function InventoryTable({ balances, searchText }) {
  const [sortKey, setSortKey] = useState('quantity');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);

  const filteredBalances = useMemo(() => {
    const query = String(searchText || '').trim().toLowerCase();
    if (!query) return balances;

    return balances.filter((balance) => (
      String(balance.pillTypeCode || '').toLowerCase().includes(query) ||
      String(balance.pillName || '').toLowerCase().includes(query) ||
      String(balance.lotNo || '').toLowerCase().includes(query) ||
      String(balance.location || '').toLowerCase().includes(query)
    ));
  }, [balances, searchText]);

  const sortedBalances = useMemo(() => {
    const next = [...filteredBalances];
    return next.sort((left, right) => {
      if (sortKey === 'pill') {
        return compareValues(String(left.pillName || left.pillTypeCode || ''), String(right.pillName || right.pillTypeCode || ''), sortDir);
      }
      if (sortKey === 'expiry') {
        return compareValues(String(left.expiryDate || ''), String(right.expiryDate || ''), sortDir);
      }
      if (sortKey === 'location') {
        return compareValues(String(left.location || ''), String(right.location || ''), sortDir);
      }
      return compareValues(Number(left.quantity || 0), Number(right.quantity || 0), sortDir);
    });
  }, [filteredBalances, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedBalances.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sortedBalances.slice(start, start + PAGE_SIZE);

  const toggleSort = (nextSortKey) => {
    if (sortKey === nextSortKey) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextSortKey);
    setSortDir(nextSortKey === 'quantity' ? 'desc' : 'asc');
  };

  return (
    <div className="card">
      <div className="section-title">
        <h3>Inventory by Lot & Location</h3>
        <p className="small muted">{filteredBalances.length} rows</p>
      </div>
      <div className="table-wrap">
        <table className="table sticky-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('pill')}>
                  Product
                </button>
              </th>
              <th>Lot</th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('expiry')}>
                  Expiry
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('location')}>
                  Location
                </button>
              </th>
              <th>
                <button type="button" className="table-sort" onClick={() => toggleSort('quantity')}>
                  Quantity
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? pageRows.map((row, index) => (
              <tr key={`${row.pillTypeCode}-${row.lotNo}-${row.location}-${index}`}>
                <td>{row.pillName || row.pillTypeCode}</td>
                <td>{row.lotNo || 'UNSPECIFIED'}</td>
                <td>{row.expiryDate || '—'}</td>
                <td>{row.location || 'UNASSIGNED'}</td>
                <td>{row.quantity}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="muted">No inventory rows for current filters.</td></tr>
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
