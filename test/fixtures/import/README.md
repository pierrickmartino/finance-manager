# Import fixtures (synthetic)

Every file here is **hand-written and made up**: names, addresses, IBANs, references and payment text are invented. They stand in for the real anonymised exports of ticket #7, which the user may add later next to these files.

The files copy each bank's real format as closely as we know it. All balances reconcile to the cent, except the two files whose names say they are broken (`-missing-row`, `-tampered`).

Check the arithmetic with `node test/fixtures/import/check-fixtures.mjs`. It has no dependencies, and it fails if a file stops matching the values below.

Amounts below are signed (debit negative) and given in major units. Store them as integer minor units, so `-87.45` is `-8745`.

## Accounts

All IBANs have valid checksums. They share one owner, "Alex Muster", so Transfers can be linked across files.

| Account | Bank / Import format | IBAN | Currency | Files |
|---|---|---|---|---|
| UBS CHF | UBS / UBS CSV | `CH6900235235123456010` (`CH69 0023 5235 1234 5601 0`) | CHF | `ubs/*.csv` |
| BCGE CHF | BCGE / CAMT.053 | `CH3400788000050012345` | CHF | `bcge/bcge-chf-*.xml` |
| BCGE EUR | BCGE / CAMT.053 | `CH3100788000050012399` | EUR | `bcge/bcge-eur-*.xml` |
| Crédit Agricole EUR | Crédit Agricole / OFX | `FR7618206004006123456789050` (not in the file) | EUR | `credit-agricole/*.ofx` |

The OFX file has no IBAN. It identifies the account by `BANKID 18206`, `BRANCHID 00400` and `ACCTID 61234567890`, which are the bank, branch and account parts of the FR IBAN (RIB key `50`).

## Cases to file map

| Case | Where |
|---|---|
| Bundled entry (one Transaction, 3 details) | `bcge-chf-2025-10.xml`, `BCGE20251002000117` |
| Entries without `AcctSvcrRef` (fallback Fingerprint) | `bcge-chf-2025-10.xml` (3), `bcge-chf-2025-11.xml` (1), `bcge-eur-2025-10.xml` (1) |
| Identical same-day entries, no reference (occurrence index 0 and 1) | `bcge-chf-2025-10.xml`, two `-100.00` on 2025-10-05 |
| Non-BOOK entry (skipped) | `bcge-chf-2025-10.xml`, `PDNG` with `BCGE20251031000950` |
| Statement boundary | `bcge-chf-2025-10.xml` CLBD = `bcge-chf-2025-11.xml` OPBD = 16908.15. The Oct PDNG entry is booked in Nov under a new reference. |
| Tampered CAMT (reconciliation fails) | `bcge-chf-2025-10-tampered.xml` |
| Refund | UBS `9930290TI0000108` (+89.90, refunds `…104`). Crédit Agricole `2510140000004` (+129.99, refunds `2510100000003`). |
| Overlapping second export (dedup) | `ubs-chf-2025-10-16_2025-11-15-overlap.csv`, `ca-eur-2025-10-15_2025-11-14-overlap.ofx` |
| Removed row (reconciliation and running-balance gap) | `ubs-chf-2025-10-missing-row.csv` |
| Same-day, same-amount entries with different references | UBS `…110` / `…111` (two -4.50 on 2025-10-24) |
| Booking date ≠ transaction or value date | UBS `…102`, `…104`, `…109`, `…112`, `…115`, `…116`. BCGE `…000777`, Nov fees. |
| Cross-currency Transfer CHF → EUR | UBS `…106` -1000.00 CHF (2025-10-14) ↔ BCGE EUR `BCGE20251015000613` +1072.50 EUR (2025-10-15) |
| Same-currency CHF Transfer | BCGE CHF `BCGE20251010000342` -2000.00 ↔ UBS `…105` +2000.00 (both 2025-10-10) |
| Same-currency EUR Transfer (OFX side has no IBAN) | BCGE EUR `BCGE20251020000255` -500.00 (2025-10-20) ↔ CA `2510220000005` +500.00 (2025-10-22) |
| OFX closing balance only, derived opening | `ca-eur-2025-10.ofx` |
| OFX with closing tags (tolerant parser) | `ca-eur-2025-10-closed-tags.ofx` |
| Windows-1252 accents and `€` (byte `0x80`) | every `.ofx` file |

Transfer notes:
- Each side names the other Account's IBAN, except Crédit Agricole. UBS gives it in `Description3`. CAMT gives it in `RltdPties/CdtrAcct` (debits) or `DbtrAcct` (credits).
- The CHF → EUR rate implied is 1.0725 EUR per CHF (0.93240 CHF per EUR). A stubbed rate within ±2% of that accepts the pair, for example 0.9324 CHF/EUR. A rate 3% off rejects it, for example 0.9604 CHF/EUR.

## UBS CSV (`ubs/`)

The format:
- The file is UTF-8 **with a BOM**, with CRLF line endings, `;` separators, and a trailing `;` on every line.
- It starts with a metadata block (`Numéro de compte`, `IBAN` with spaces, `Du`, `Au`, `Solde initial`, `Solde final`, `Évaluation en date du`, `Monnaie`, `Nombre de transactions dans la période sélectionnée`). Then comes one empty line, then the table header.
- Columns: `Date de transaction;Heure de transaction;Date de comptabilisation;Date de valeur;Monnaie;Débit;Crédit;Sous-montant;Solde;No de transaction;Description1;Description2;Description3;Notes de bas de page`.
- Dates are `YYYY-MM-DD`. Decimals use `.` with no thousands separator.
- **`Débit` is already negative** (`-87.45`) and `Crédit` is positive. Exactly one of the two is filled.
- Rows are **newest first**. `Solde` is the balance after the row. Rows with the same booking date keep the bank's order, so walk the file bottom-up.
- `Description1` is the counterparty name and address. `Description2` is the transaction type.
- `Description3` is quoted when it contains `;`, for example `"Raison du paiement: Loyer octobre 2025; IBAN: CH78 0900 0000 0123 4567 8; Frais: 0.00"`. The counterparty IBAN is the value after `IBAN:` with spaces removed. Card rows have no IBAN.
- `Sous-montant` is always empty here. Collective orders with sub-amount rows are not modelled.

### `ubs-chf-2025-10.csv`

| Period | Solde initial | Solde final | Rows |
|---|---|---|---|
| 2025-10-01 – 2025-10-31 | 8450.35 | 12903.05 | 14 |

Rows are listed oldest first here; the file holds them in the opposite order. A `…` reference is short for `9930…TI0000…`, and the table gives the full value.

| Booking | Value | Amount | No de transaction | Solde | Counterparty / note |
|---|---|---|---|---|---|
| 2025-10-01 | 2025-10-01 | -2150.00 | 9930274TI0000101 | 6300.35 | Régie Exemple SA, IBAN `CH7809000000012345678`, reason "Loyer octobre 2025" |
| 2025-10-02 | 2025-10-01 | -87.45 | 9930275TI0000102 | 6212.90 | Migros card. Trade date 2025-10-01. |
| 2025-10-03 | 2025-10-03 | -45.20 | 9930276TI0000103 | 6167.70 | Coop card |
| 2025-10-06 | 2025-10-04 | -89.90 | 9930279TI0000104 | 6077.80 | Boutique Exemple Sport, purchase (refunded by `…108`) |
| 2025-10-10 | 2025-10-10 | +2000.00 | 9930283TI0000105 | 8077.80 | **Transfer** from BCGE CHF, IBAN `CH3400788000050012345` |
| 2025-10-14 | 2025-10-14 | -1000.00 | 9930287TI0000106 | 7077.80 | **Transfer** to BCGE EUR, IBAN `CH3100788000050012399` |
| 2025-10-15 | 2025-10-15 | -64.90 | 9930288TI0000107 | 7012.90 | Télécom Exemple SA, IBAN `CH2009000000087654321` (the row removed in `-missing-row`) |
| 2025-10-17 | 2025-10-17 | +89.90 | 9930290TI0000108 | 7102.80 | **Refund** from Boutique Exemple Sport |
| 2025-10-20 | 2025-10-18 | -23.15 | 9930293TI0000109 | 7079.65 | Migros card |
| 2025-10-24 | 2025-10-24 | -4.50 | 9930297TI0000110 | 7075.15 | Café Exemple, first of two identical amounts |
| 2025-10-24 | 2025-10-24 | -4.50 | 9930297TI0000111 | 7070.65 | Café Exemple, second |
| 2025-10-24 | 2025-10-25 | +6250.00 | 9930298TI0000112 | 13320.65 | Salary, Employeur Exemple SA, IBAN `CH0300700110000123456` |
| 2025-10-28 | 2025-10-28 | -412.60 | 9930301TI0000113 | 12908.05 | Assurance Maladie Exemple, IBAN `CH0509000000011223344` |
| 2025-10-31 | 2025-10-31 | -5.00 | 9930304TI0000114 | 12903.05 | Account fee, no IBAN |

### `ubs-chf-2025-10-16_2025-11-15-overlap.csv`

| Period | Solde initial | Solde final | Rows |
|---|---|---|---|
| 2025-10-16 – 2025-11-15 | 7012.90 | 10490.30 | 12 |

The file holds `…108` to `…114` from the October export (7 rows, byte-identical), plus 5 new rows. Importing it after the October file adds **5** Transactions and skips **7** duplicates. Its `Solde initial` equals the October running balance after `…107`.

| Booking | Value | Amount | No de transaction | Solde | Counterparty |
|---|---|---|---|---|---|
| 2025-11-03 | 2025-11-01 | -2150.00 | 9930307TI0000115 | 10753.05 | Régie Exemple SA, "Loyer novembre 2025" |
| 2025-11-04 | 2025-11-03 | -102.30 | 9930308TI0000116 | 10650.75 | Migros card |
| 2025-11-07 | 2025-11-07 | -38.70 | 9930311TI0000117 | 10612.05 | Pharmacie Exemple |
| 2025-11-12 | 2025-11-12 | -64.90 | 9930316TI0000118 | 10547.15 | Télécom Exemple SA |
| 2025-11-14 | 2025-11-14 | -56.85 | 9930318TI0000119 | 10490.30 | Coop card |

### `ubs-chf-2025-10-missing-row.csv` (broken on purpose)

This is the October export with row `9930288TI0000107` (2025-10-15, -64.90) deleted. Everything else is unchanged: the metadata (including the row count of 14), and the other rows and their `Solde`.
- `Solde initial` plus the rows gives 12967.95, which is **64.90 more** than `Solde final` (12903.05).
- The running-balance check breaks at **`9930290TI0000108`** (2025-10-17). The previous row's `Solde` 7077.80 plus 89.90 gives 7167.70, but that row's `Solde` is 7102.80. So the gap sits between `…106` (2025-10-14) and `…108` (2025-10-17).

## BCGE CAMT.053 (`bcge/`)

The format:
- `camt.053.001.04` in UTF-8. One `Stmt` per file, with `Acct/Id/IBAN` and `Acct/Ccy`.
- `Bal` holds `OPBD` (dated on the first day) and `CLBD` (dated on the last day). Each `Bal` has an unsigned `Amt` plus a `CdtDbtInd`.
- Each `Ntry` has an unsigned `Amt Ccy`, a `CdtDbtInd`, `Sts`, `BookgDt/Dt`, `ValDt/Dt`, an optional `AcctSvcrRef`, `BkTxCd`, `NtryDtls`, and `AddtlNtryInf`.
- A bundled entry has `NtryDtls/Btch` and several `TxDtls`, each with its own `Amt` and `CdtDbtInd`. A single-detail entry has no `Amt` in `TxDtls`.
- Counterparties are in `TxDtls/RltdPties`. For a debit, the counterparty is `Cdtr`/`CdtrAcct`, and `Dbtr`/`DbtrAcct` is the owner. For a credit it is the other way round. The remittance text is in `RmtInf/Ustrd`.
- Cash, card and fee entries have no `RltdPties`, and their `EndToEndId` is `NOTPROVIDED`.

### `bcge-chf-2025-10.xml`

| Period | OPBD | CLBD | Booked entries | Entries in file |
|---|---|---|---|---|
| 2025-10-01 – 2025-10-31 | 15230.40 | 16908.15 | 8 | 9 (1 `PDNG`) |

| Booking | Value | Amount | AcctSvcrRef | Note |
|---|---|---|---|---|
| 2025-10-02 | 2025-10-02 | -1187.35 | BCGE20251002000117 | **Bundled**, 3 `TxDtls`. Services Industriels Exemple -142.85 (`CH2000788000099887766`, "Facture électricité 09/2025"). Assurance Ménage Exemple SA -389.50 (`CH5300700110000777888`). Garderie Les Exemples -655.00 (`CH1509000000055667788`). |
| 2025-10-05 | 2025-10-05 | -100.00 | — | **No ref**. "Retrait Bancomat BCGE Genève Exemple", occurrence 0. |
| 2025-10-05 | 2025-10-05 | -100.00 | — | **No ref**, identical to the previous entry, occurrence 1 |
| 2025-10-08 | 2025-10-07 | -72.40 | — | **No ref**. "Achat Debit Mastercard Boulangerie Exemple Genève". |
| 2025-10-10 | 2025-10-10 | -2000.00 | BCGE20251010000342 | **Transfer** to UBS, `CdtrAcct` `CH6900235235123456010` |
| 2025-10-15 | 2025-10-15 | +350.00 | BCGE20251015000511 | Caisse d'Allocations Exemple, `CH5600788000044332211` |
| 2025-10-24 | 2025-10-25 | +4800.00 | BCGE20251024000777 | Salary, Employeur Deux Exemple SA, `CH4700700110000654321` |
| 2025-10-31 | 2025-10-31 | -12.50 | BCGE20251031000901 | Account fee |
| — | 2025-11-02 | (-45.00) | BCGE20251031000950 | **`Sts = PDNG`**, no `BookgDt`. Must be skipped, and it is not in the balances. |

### `bcge-chf-2025-11.xml` (next statement)

| Period | OPBD | CLBD | Booked entries |
|---|---|---|---|
| 2025-11-01 – 2025-11-30 | 16908.15 | 21156.65 | 7 |

| Booking | Value | Amount | AcctSvcrRef | Note |
|---|---|---|---|---|
| 2025-11-03 | 2025-11-03 | -45.00 | BCGE20251103000021 | The October `PDNG` card payment, now booked under a new reference |
| 2025-11-03 | 2025-11-03 | -655.00 | BCGE20251103000044 | Garderie Les Exemples |
| 2025-11-07 | 2025-11-07 | -100.00 | — | **No ref**, Bancomat |
| 2025-11-14 | 2025-11-14 | +350.00 | BCGE20251114000512 | Allocations |
| 2025-11-20 | 2025-11-20 | -89.00 | BCGE20251120000630 | Transports Publics Exemple (`CH2909000000099001122`, no street) |
| 2025-11-25 | 2025-11-25 | +4800.00 | BCGE20251125000778 | Salary |
| 2025-11-28 | 2025-11-30 | -12.50 | BCGE20251128000902 | Account fee |

### `bcge-eur-2025-10.xml`

| Period | OPBD | CLBD | Booked entries |
|---|---|---|---|
| 2025-10-01 – 2025-10-31 | 1250.00 | 1819.50 | 3 |

| Booking | Value | Amount | AcctSvcrRef | Note |
|---|---|---|---|---|
| 2025-10-15 | 2025-10-15 | +1072.50 | BCGE20251015000613 | **Cross-currency Transfer** from UBS, `DbtrAcct` `CH6900235235123456010` |
| 2025-10-20 | 2025-10-20 | -500.00 | BCGE20251020000255 | **EUR Transfer** to Crédit Agricole, `CdtrAcct` `FR7618206004006123456789050` |
| 2025-10-31 | 2025-10-31 | -3.00 | — | **No ref**. "Frais de tenue de compte EUR". |

### `bcge-chf-2025-10-tampered.xml` (broken on purpose)

This is `bcge-chf-2025-10.xml` with one entry amount changed. `BCGE20251015000511` reads **+530.00** instead of +350.00. OPBD, CLBD and `TxsSummry` are unchanged, so OPBD plus the booked entries is **180.00 more** than CLBD.

## Crédit Agricole OFX (`credit-agricole/`)

The format:
- OFX 1.02 SGML. A colon-style header (`OFXHEADER:100` … `CHARSET:1252`) comes first, then a blank line.
- The encoding is **Windows-1252** with CRLF line endings. Accents are single bytes (`É` = `0xC9`), and `€` is byte `0x80`. Node's `TextDecoder('windows-1252')` decodes `0x80` as U+0080, not `€`, so use a proper cp1252 table (or iconv).
- **Leaf tags are unclosed** (`<TRNAMT>-38.90`). Aggregates are closed (`</STMTTRN>`).
- `CURDEF` is `EUR`.
- `DTPOSTED` is `YYYYMMDD`, and there is no value date. `TRNTYPE` is always `OTHER`.
- `TRNAMT` always has an explicit sign (`-38.90`, `+500.00`).
- `NAME` is cut at **32 characters**, mid-word. `MEMO` carries the full text.
- There is **only a `LEDGERBAL`** (closing balance at `DTASOF`). There is no opening balance and no `AVAILBAL`.

### `ca-eur-2025-10.ofx`

| Period | LEDGERBAL (closing) | Sum of transactions | Derived opening | Transactions |
|---|---|---|---|---|
| 20251001 – 20251031 | 1342.17 | +361.50 | **980.67** | 7 |

| DTPOSTED | TRNAMT | FITID | NAME (as in file, 32 chars) | Note |
|---|---|---|---|---|
| 20251003 | -38.90 | 2510030000001 | `PRLV SEPA ÉLECTRICITÉ EXEMPLE DI` | Accented text. MEMO "… DISTRIBUTION ÉCHÉANCE 10/2025 RUM EX000123". |
| 20251006 | -24.60 | 2510060000002 | `CARTE X1234 03/10 BOULANGERIE DU` | MEMO contains `CHÂTEAU` |
| 20251010 | -129.99 | 2510100000003 | `CARTE X1234 08/10 MAGASINS EXEMP` | Purchase |
| 20251014 | +129.99 | 2510140000004 | `AVOIR CARTE X1234 13/10 MAGASINS` | **Refund** of the purchase above |
| 20251022 | +500.00 | 2510220000005 | `VIR SEPA RECU /DE ALEX MUSTER /M` | **EUR Transfer** from BCGE EUR (no IBAN in OFX) |
| 20251027 | -15.00 | 2510270000006 | `COTISATION OFFRE COMPTE À COMPOS` | MEMO ends with `15,00 €` (byte `0x80`) |
| 20251030 | -60.00 | 2510300000007 | `RETRAIT DAB 29/10 ANNEMASSE GARE` | Exactly 32 chars, not cut |

Opening-balance cases:
- **New Account:** the preview proposes **980.67** as the opening balance (dated before 2025-10-03, the first transaction).
- **Account with Manual history:** if the Manual transactions (2021–2025) bring the balance at the end of 2025-09-30 to **980.67**, there is no warning. Any other value, for example 1000.00, should warn about the mismatch (here 19.33).

### `ca-eur-2025-10-15_2025-11-14-overlap.ofx`

| Period | LEDGERBAL | Derived opening | Transactions |
|---|---|---|---|
| 20251015 – 20251114 | 1233.32 | 917.17 | 6 |

The file holds `2510220000005`, `…06` and `…07` from the October file (identical), plus 3 new ones. Importing it after the October file adds **3** Transactions. Its derived opening, 917.17, equals the October balance at the end of 2025-10-14, so the existing-history check passes.

| DTPOSTED | TRNAMT | FITID | NAME |
|---|---|---|---|
| 20251104 | -47.15 | 2511040000008 | `CARTE X1234 02/11 SUPERMARCHÉ EX` |
| 20251105 | -38.90 | 2511050000009 | `PRLV SEPA ÉLECTRICITÉ EXEMPLE DI` (same NAME and amount as `…01`, a month later) |
| 20251112 | -22.80 | 2511120000010 | `CARTE X1234 10/11 PHARMACIE DE L` |

### `ca-eur-2025-10-closed-tags.ofx`

This has the same content as `ca-eur-2025-10.ofx`, but every leaf tag is closed (`<TRNAMT>-38.90</TRNAMT>`). A tolerant parser must produce the same result from both.

## `.gitattributes`

These are byte-level fixtures: a BOM, CRLF line endings and Windows-1252. `.gitattributes` in this folder marks `.ofx` as binary and `.csv`/`.xml` as `-text`, so git never rewrites them.
