#!/usr/bin/env node
// Checks the balance arithmetic of the synthetic import fixtures. No dependencies.
// Run: node test/fixtures/import/check-fixtures.mjs
// It is a sanity check of the fixture files, not a parser: the app's parsers are tested separately.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const cents = (s) => {
  const m = /^([+-]?)(\d+)\.(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`bad amount: ${s}`);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 100 + Number(m[3]));
};

// ---------- IBAN ----------
const validIban = (iban) => {
  const s = iban.replace(/\s/g, '');
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let m = 0;
  for (const ch of r) m = (m * 10 + Number(ch)) % 97;
  return m === 1;
};

// ---------- UBS CSV ----------
const splitCsv = (line) => {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q && c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = !q;
    else if (c === ';' && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
};
function ubs(file) {
  const text = readFileSync(join(ROOT, file), 'utf8').replace(/^﻿/, '');
  const lines = text.split('\r\n').filter((l) => l !== '');
  const meta = {};
  let i = 0;
  for (; !lines[i].startsWith('Date de transaction;'); i++) {
    const [k, v] = splitCsv(lines[i]);
    meta[k.replace(/:$/, '')] = v;
  }
  const head = splitCsv(lines[i]);
  const col = (n) => head.indexOf(n);
  const rows = lines.slice(i + 1).map(splitCsv).map((f) => ({
    booking: f[col('Date de comptabilisation')],
    amount: f[col('Débit')] ? cents(f[col('Débit')]) : cents(f[col('Crédit')]),
    solde: cents(f[col('Solde')]),
    ref: f[col('No de transaction')],
  }));
  const open = cents(meta['Solde initial']);
  const close = cents(meta['Solde final']);
  const oldestFirst = [...rows].reverse();
  const gaps = [];
  let bal = open;
  for (const r of oldestFirst) {
    bal += r.amount;
    if (bal !== r.solde) { gaps.push(r.ref); bal = r.solde; }
  }
  const sum = rows.reduce((a, r) => a + r.amount, 0);
  const sortedNewestFirst = rows.every((r, k) => k === 0 || rows[k - 1].booking >= r.booking);
  return { meta, rows, open, close, reconciles: open + sum === close, gaps, sortedNewestFirst, declaredCount: Number(meta['Nombre de transactions dans la période sélectionnée']) };
}

// ---------- CAMT.053 ----------
const tag = (xml, t) => { const m = new RegExp(`<${t}(?: [^>]*)?>([\\s\\S]*?)</${t}>`).exec(xml); return m ? m[1] : null; };
const all = (xml, t) => [...xml.matchAll(new RegExp(`<${t}(?: [^>]*)?>([\\s\\S]*?)</${t}>`, 'g'))].map((m) => m[1]);
const signed = (block) => cents(tag(block, 'Amt')) * (tag(block, 'CdtDbtInd') === 'DBIT' ? -1 : 1);
function camt(file) {
  const xml = readFileSync(join(ROOT, file), 'utf8');
  const bal = Object.fromEntries(all(xml, 'Bal').map((b) => [tag(b, 'Cd'), signed(b)]));
  const entries = all(xml, 'Ntry').map((n) => ({
    sts: tag(n, 'Sts'),
    booking: tag(tag(n, 'BookgDt') ?? '', 'Dt'),
    amount: signed(n),
    ref: tag(n, 'AcctSvcrRef'),
    details: all(n, 'TxDtls').length,
    detailSum: all(n, 'TxDtls').filter((d) => tag(d, 'Amt')).reduce((a, d) => a + signed(d), 0),
    ccy: /<Amt Ccy="([A-Z]{3})">/.exec(n)[1],
  }));
  const booked = entries.filter((e) => e.sts === 'BOOK');
  const sum = booked.reduce((a, e) => a + e.amount, 0);
  return { iban: tag(tag(xml, 'Acct'), 'IBAN'), ccy: tag(tag(xml, 'Acct'), 'Ccy'), open: bal.OPBD, close: bal.CLBD, entries, booked, reconciles: bal.OPBD + sum === bal.CLBD };
}

// ---------- OFX (Windows-1252, SGML) ----------
// Node's TextDecoder('windows-1252') maps 0x80-0x9F to C1 controls, so map them here.
const CP1252_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
const decode1252 = (buf) => [...buf].map((b) => (b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : String.fromCharCode(b))).join('');
const leaf = (sgml, t) => { const m = new RegExp(`<${t}>([^<\\r\\n]*)`).exec(sgml); return m ? m[1] : null; };
function ofx(file) {
  const text = decode1252(readFileSync(join(ROOT, file)));
  const trns = text.split('<STMTTRN>').slice(1).map((s) => s.split('</STMTTRN>')[0]).map((s) => ({
    posted: leaf(s, 'DTPOSTED'), amountRaw: leaf(s, 'TRNAMT'), amount: cents(leaf(s, 'TRNAMT')), fitid: leaf(s, 'FITID'), name: leaf(s, 'NAME'), memo: leaf(s, 'MEMO'),
  }));
  const close = cents(leaf(text, 'BALAMT'));
  const sum = trns.reduce((a, t) => a + t.amount, 0);
  return { text, trns, close, derivedOpen: close - sum, ccy: leaf(text, 'CURDEF'), start: leaf(text, 'DTSTART'), end: leaf(text, 'DTEND'), hasOpening: /AVAILBAL|<BALLIST>/.test(text) };
}

// ================= assertions =================
const IBAN = { ubs: 'CH6900235235123456010', bcgeChf: 'CH3400788000050012345', bcgeEur: 'CH3100788000050012399', ca: 'FR7618206004006123456789050' };
for (const [k, v] of Object.entries(IBAN)) check(validIban(v), `IBAN ${k} has a bad checksum`);

// UBS
const ubsA = ubs('ubs/ubs-chf-2025-10.csv');
const ubsB = ubs('ubs/ubs-chf-2025-10-16_2025-11-15-overlap.csv');
const ubsX = ubs('ubs/ubs-chf-2025-10-missing-row.csv');
for (const [name, f, exp] of [['ubs A', ubsA, [845035, 1290305, 14]], ['ubs B', ubsB, [701290, 1049030, 12]]]) {
  check(f.reconciles, `${name}: Solde initial + rows != Solde final`);
  check(f.gaps.length === 0, `${name}: running Solde gaps at ${f.gaps}`);
  check(f.open === exp[0] && f.close === exp[1] && f.rows.length === exp[2] && f.declaredCount === exp[2], `${name}: unexpected open/close/count`);
  check(f.sortedNewestFirst, `${name}: rows not newest first`);
  check(f.meta.IBAN.replace(/\s/g, '') === IBAN.ubs && f.meta.Monnaie === 'CHF', `${name}: IBAN or currency`);
}
check(!ubsX.reconciles && ubsX.close - ubsX.open - ubsX.rows.reduce((a, r) => a + r.amount, 0) === -6490, 'ubs missing-row: should be off by exactly -64.90');
check(ubsX.gaps.length === 1 && ubsX.gaps[0] === '9930290TI0000108', `ubs missing-row: expected one gap at 9930290TI0000108, got ${ubsX.gaps}`);
check(ubsX.rows.length === 13 && ubsX.declaredCount === 14, 'ubs missing-row: 13 rows, header still says 14');
// overlap: the shared rows are identical, and B opens where A's running balance stood on 2025-10-15
const shared = ubsB.rows.filter((r) => r.booking <= '2025-10-31');
check(shared.length === 7, 'ubs overlap: expected 7 shared rows');
for (const r of shared) {
  const a = ubsA.rows.find((x) => x.ref === r.ref);
  check(a && a.amount === r.amount && a.solde === r.solde && a.booking === r.booking, `ubs overlap: row ${r.ref} differs between exports`);
}
check(ubsA.rows.find((r) => r.ref === '9930288TI0000107').solde === ubsB.open, 'ubs overlap: B Solde initial != A balance after 2025-10-15');

// CAMT
const chfOct = camt('bcge/bcge-chf-2025-10.xml');
const chfNov = camt('bcge/bcge-chf-2025-11.xml');
const eurOct = camt('bcge/bcge-eur-2025-10.xml');
const tampered = camt('bcge/bcge-chf-2025-10-tampered.xml');
for (const [name, f, exp] of [['camt chf oct', chfOct, [1523040, 1690815, 8, 9]], ['camt chf nov', chfNov, [1690815, 2115665, 7, 7]], ['camt eur oct', eurOct, [125000, 181950, 3, 3]]]) {
  check(f.reconciles, `${name}: OPBD + booked entries != CLBD`);
  check(f.open === exp[0] && f.close === exp[1] && f.booked.length === exp[2] && f.entries.length === exp[3], `${name}: unexpected open/close/counts`);
  check(f.entries.every((e) => e.ccy === f.ccy), `${name}: entry currency differs from account`);
  for (const e of f.entries) if (e.details > 1) check(e.detailSum === e.amount, `${name}: bundled entry ${e.ref} details do not sum to the entry`);
}
check(chfOct.close === chfNov.open, 'camt statement boundary: Oct CLBD != Nov OPBD');
check(chfOct.iban === IBAN.bcgeChf && chfOct.ccy === 'CHF' && eurOct.iban === IBAN.bcgeEur && eurOct.ccy === 'EUR', 'camt: IBAN or currency');
check(chfOct.entries.some((e) => e.sts === 'PDNG'), 'camt: expected a PDNG entry in Oct');
check(chfOct.booked.filter((e) => !e.ref).length === 3 && chfNov.booked.filter((e) => !e.ref).length === 1 && eurOct.booked.filter((e) => !e.ref).length === 1, 'camt: entries without AcctSvcrRef');
check(chfOct.booked.filter((e) => !e.ref && e.booking === '2025-10-05' && e.amount === -10000).length === 2, 'camt: two identical same-day entries without a reference');
check(chfOct.booked.some((e) => e.details === 3), 'camt: expected a bundled entry with 3 TxDtls');
check(!tampered.reconciles && tampered.open + tampered.booked.reduce((a, e) => a + e.amount, 0) - tampered.close === 18000, 'camt tampered: should be off by +180.00');

// OFX
const ca1 = ofx('credit-agricole/ca-eur-2025-10.ofx');
const ca2 = ofx('credit-agricole/ca-eur-2025-10-15_2025-11-14-overlap.ofx');
const caC = ofx('credit-agricole/ca-eur-2025-10-closed-tags.ofx');
check(ca1.ccy === 'EUR' && !ca1.hasOpening, 'ofx: currency EUR and no opening balance');
check(ca1.close === 134217 && ca1.derivedOpen === 98067 && ca1.trns.length === 7, `ofx Oct: close/derived opening/count (${ca1.close}/${ca1.derivedOpen}/${ca1.trns.length})`);
check(ca2.close === 123332 && ca2.trns.length === 6, `ofx overlap: close/count (${ca2.close}/${ca2.trns.length})`);
// overlap consistency: the second file's derived opening equals the first file's balance at the end of 2025-10-14
const balBefore = ca1.derivedOpen + ca1.trns.filter((t) => t.posted < ca2.start).reduce((a, t) => a + t.amount, 0);
check(ca2.derivedOpen === balBefore && balBefore === 91717, `ofx overlap: derived opening ${ca2.derivedOpen} != ${balBefore}`);
for (const t of ca2.trns.filter((x) => x.posted <= ca1.end)) {
  const a = ca1.trns.find((x) => x.fitid === t.fitid);
  check(a && a.amount === t.amount && a.posted === t.posted && a.name === t.name, `ofx overlap: FITID ${t.fitid} differs`);
}
for (const f of [ca1, ca2]) {
  check(f.trns.every((t) => t.name.length <= 32 && /^[+-]\d+\.\d{2}$/.test(t.amountRaw)), 'ofx: NAME <= 32 chars and explicit sign');
  check(new Set(f.trns.map((t) => t.fitid)).size === f.trns.length, 'ofx: FITIDs unique');
}
check(ca1.text.includes('ÉLECTRICITÉ') && ca1.text.includes('15,00 €'), 'ofx: Windows-1252 accents and euro sign decode');
check(!/<\/NAME>/.test(ca1.text) && /<\/NAME>/.test(caC.text), 'ofx: unclosed leaf tags in the normal file, closed in the variant');
check(JSON.stringify(caC.trns) === JSON.stringify(ca1.trns) && caC.close === ca1.close, 'ofx closed-tags: same content as the Oct file');

// Transfers across files
const ubsXfer = ubsA.rows.find((r) => r.ref === '9930287TI0000106');
const eurIn = eurOct.booked.find((e) => e.ref === 'BCGE20251015000613');
check(ubsXfer.amount === -100000 && eurIn.amount === 107250, 'transfer CHF->EUR: UBS -1000.00 CHF / BCGE EUR +1072.50 EUR');
const eurOut = eurOct.booked.find((e) => e.ref === 'BCGE20251020000255');
const caIn = ca1.trns.find((t) => t.fitid === '2510220000005');
check(eurOut.amount === -50000 && caIn.amount === 50000, 'transfer EUR->EUR: BCGE EUR -500.00 / CA +500.00');
check(ubsA.rows.find((r) => r.ref === '9930283TI0000105').amount === 200000 && chfOct.booked.find((e) => e.ref === 'BCGE20251010000342').amount === -200000, 'transfer CHF->CHF: BCGE CHF -2000.00 / UBS +2000.00');

if (failures.length) {
  console.error(`FAIL (${failures.length})\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('OK: all fixture balances reconcile as documented (and the broken variants fail where expected).');
