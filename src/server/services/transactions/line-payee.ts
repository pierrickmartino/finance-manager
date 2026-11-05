/**
 * A Split line's reported Payee (ADR-0006): the line's own Payee, else its Transaction's. A row
 * with no Split line (`line` is NULL from a LEFT JOIN) reports its Transaction's Payee, so the
 * same expression serves split and unsplit rows alike.
 *
 * SQL over a `split_line` alias `line` and its `"transaction"` alias `transaction`.
 */
export function reportedPayeeIdSql(line = 'sl', transaction = 't'): string {
  return `coalesce(${line}.payee_id, ${transaction}.payee_id)`;
}
