/** Escapes one CSV cell (quotes, commas and line breaks). */
function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

/**
 * Downloads a real CSV file. A UTF-8 BOM is added so Excel opens Arabic text correctly.
 */
export function downloadCsv(filename: string, headers: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): void {
  const blob = new Blob(['﻿', toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
