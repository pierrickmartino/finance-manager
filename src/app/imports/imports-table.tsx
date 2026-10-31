import Link from 'next/link';
import type { Formatter } from '@/lib/format';
import type { Import } from '@/server/services/imports';

const CELL = 'px-3 py-2 text-left';

interface ImportsTableProps {
  imports: Import[];
  fmt: Formatter;
}

/** Past Imports of one Account (spec 32): date, file, counts, reconciliation result. */
export function ImportsTable({ imports, fmt }: ImportsTableProps) {
  if (imports.length === 0) return <p className="text-sm text-zinc-500">No Imports yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table aria-label="Imports" className="w-full text-sm">
        <thead className="border-b border-zinc-200 dark:border-zinc-800">
          <tr>
            <th className={CELL}>Imported on</th>
            <th className={CELL}>File</th>
            <th className={CELL}>Period</th>
            <th className={`${CELL} text-right`}>Added</th>
            <th className={`${CELL} text-right`}>Skipped</th>
            <th className={CELL}>Reconciliation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {imports.map((row) => (
            <tr key={row.id}>
              <td className={CELL}>{fmt.date(row.importedAt)}</td>
              <td className={CELL}>
                <Link href={`/accounts/${row.accountId}/imports/${row.id}`} className="underline">
                  {row.fileName}
                </Link>
              </td>
              <td className={CELL}>
                {row.statementFrom && row.statementTo
                  ? `${fmt.date(row.statementFrom)} – ${fmt.date(row.statementTo)}`
                  : '—'}
              </td>
              <td className={`${CELL} text-right tabular-nums`}>{row.addedCount}</td>
              <td className={`${CELL} text-right tabular-nums`}>{row.duplicateCount}</td>
              <td className={CELL}>
                {row.reconciliationStatus === 'ok' ? 'Reconciled' : 'Mismatch'}
                {row.undoneAt && ' · Undone'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
