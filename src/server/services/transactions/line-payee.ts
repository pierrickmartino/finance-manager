/**
 * SQL: a Split line's reported Payee (ADR-0006), the line's own Payee, else its Transaction's.
 * A row with no Split line (`sl` is NULL from a LEFT JOIN) reports its Transaction's Payee, so
 * the same expression serves split and unsplit rows alike.
 *
 * Over a `split_line` alias `sl` and its `"transaction"` alias `t`.
 */
export const REPORTED_PAYEE_ID = 'coalesce(sl.payee_id, t.payee_id)';
