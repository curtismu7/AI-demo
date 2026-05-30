import React from 'react';

function valueByPath(obj, path) {
  if (!obj || !path) return undefined;
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function formatValue(value, format) {
  if (value === null || value === undefined) return '';

  switch (format) {
    case 'money':
      return '$' + Number(value).toFixed(2);
    case 'date':
      return String(value);
    case 'percent':
      return String(value) + '%';
    case 'count':
    case 'text':
    default:
      return String(value);
  }
}

function VerticalResult({ descriptor, data }) {
  // Text fallback for null/undefined/unknown descriptor type
  if (!descriptor || !descriptor.type || !['card', 'fieldList', 'table'].includes(descriptor.type)) {
    if (typeof data === 'string') {
      return <div className="vertical-result vertical-result-text">{data}</div>;
    }
    return <div className="vertical-result vertical-result-text">{JSON.stringify(data)}</div>;
  }

  // Card and fieldList rendering
  if (descriptor.type === 'card' || descriptor.type === 'fieldList') {
    const fields = descriptor.fields || [];
    return (
      <div className="vertical-result vertical-result-fields">
        {descriptor.title && <h3 className="vertical-result-title">{descriptor.title}</h3>}
        <dl className="vertical-result-list">
          {fields.map((field, idx) => {
            const value = valueByPath(data, field.path);
            const formatted = formatValue(value, field.format);
            return (
              <div key={idx} className="vertical-result-field">
                <dt className="vertical-result-label">{field.label}</dt>
                <dd className="vertical-result-value">{formatted}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    );
  }

  // Table rendering
  if (descriptor.type === 'table') {
    const columns = descriptor.columns || [];
    const rows = Array.isArray(data)
      ? data
      : (data && Object.values(data).find((v) => Array.isArray(v))) || [];

    return (
      <div className="vertical-result vertical-result-table">
        <table className="vertical-result-table-element">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th key={idx}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {columns.map((col, colIdx) => {
                  const value = valueByPath(row, col.path);
                  const formatted = formatValue(value, col.format);
                  return <td key={colIdx}>{formatted}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
}

export default VerticalResult;
