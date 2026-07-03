import React from 'react';
import Skeleton from './Skeleton';

// Standardized glass data table.
//
// columns: [{ key, label, align?, render?(row), sortable?, mono? }]
//   - align: 'left' | 'right' | 'center' (default 'left')
//   - mono: force tabular-mono; defaults to true for right-aligned columns
//   - render: custom cell node; otherwise row[key] is shown
// rows: array of row objects
// rowKey: (row, i) => key  (defaults to index)
// sortKey / sortDir / onSort(key): controlled sorting (headers become clickable when column.sortable)
// loading: show shimmer rows
// empty: node rendered when there are no rows
const DataTable = ({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDir,
  onSort,
  loading = false,
  empty = null,
}) => {
  const isMono = (col) => (col.mono !== undefined ? col.mono : col.align === 'right');
  const cellClass = (col) => `${isMono(col) ? 'cell-num' : ''}`.trim();
  const alignStyle = (col) => (col.align && col.align !== 'right' ? { textAlign: col.align } : undefined);

  const sortIndicator = (col) => {
    if (!col.sortable) return null;
    if (sortKey !== col.key) return <span className="ui-sort-ind inactive"> ↕</span>;
    return <span className="ui-sort-ind">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>;
  };

  if (loading) {
    return (
      <div className="ui-table-wrap" style={{ padding: 16 }}>
        <Skeleton rows={5} height={34} />
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return empty ? <>{empty}</> : null;
  }

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.sortable ? 'sortable' : ''}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                style={{ textAlign: col.align === 'right' ? 'right' : col.align || 'left', width: col.width }}
                title={col.sortable ? `Sort by ${col.label}` : undefined}
              >
                {col.label}{sortIndicator(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i}>
              {columns.map((col) => (
                <td key={col.key} className={cellClass(col)} style={alignStyle(col)}>
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
