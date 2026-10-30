# Spec: Finance Manager v1 — household tracking and reporting

## Problem Statement

I track my household's money by exporting transactions from four banks (BCGE, UBS, Cler, Crédit Agricole) into Excel, classifying every line by hand, and building a pivot table and charts to see how income and expenses evolve by category over time. This is slow, error-prone and fragile:

- Every month I reclassify the same recurring payments by hand.
- Overlapping exports produce duplicates that I have to spot myself.
- Nothing checks that what I imported adds up to the bank's balance, so a missing file goes unnoticed.
- Money moving between my own accounts (including CHF ↔ EUR) inflates both income and expenses unless I remember to exclude it.
- EUR accounts have to be converted to CHF by hand.
- Large one-off movements (a property sale, pension buy-ins and repayments) swamp every chart.
- There is no history of what I changed, and no way to see several views of the data at once.

Existing tools don't fit: Actual Budget is built around envelope budgeting, which I don't want, and its multi-currency support is weak. I also don't want AI guessing at my classifications.

## Solution

A self-hosted, single-user web app (Next.js, PostgreSQL, Tailwind, hosted on Railway in the EU) that tracks household income and expenses across all my Accounts and reports on them in CHF. It records and reports; it does not budget.

- I import bank files (BCGE CAMT.053, UBS CSV, Crédit Agricole CSV) into Accounts, each bound to one Import format. Every Import is previewed, deduplicated by Fingerprint, and reconciled against the bank's Statement balance. Cler is entered as Manual transactions, checked against Balance snapshots.
- Deterministic, ordered Rules set the Payee, Category and Tags on import. I can apply them to existing Transactions with a preview. My manual edits always win.
- Transfers between my own Accounts are suggested (pre-selected when the counterparty IBAN is one of mine) and confirmed by me. They are excluded from income and expense.
- Category groups are typed Income, Expense or Capital, so one-off wealth movements don't distort income and expense.
- Amounts are stored in each Account's Currency and converted to CHF at query time with ECB daily rates.
- Multiple drag-and-drop Dashboards hold Widgets, each a saved query (filters, date range, axes, measure) with one of five visualisations, including a full-screen pivot table.
- Every change to domain data is recorded in an append-only History.
- Access is protected by password and TOTP. A nightly encrypted backup is pulled to a machine I own.

## User Stories

### Setup and access

1. As the user, I want a first-run setup screen that creates my password and enrols TOTP, so that the app is protected from the first minute.
2. As the user, I want the setup screen to disable itself permanently once completed, so that nobody else can claim the instance.
3. As the user, I want to receive single-use recovery codes during setup, so that I can get in if I lose my TOTP device.
4. As the user, I want to log in with my password and a TOTP code, so that a leaked password alone is not enough to read my finances.
5. As the user, I want failed logins to be rate-limited, so that brute-forcing my password over the internet is impractical.
6. As the user, I want my session to expire after a period of inactivity, so that a forgotten open tab doesn't stay logged in forever.
7. As the user, I want a server-side command to reset my credentials, so that I can recover even without recovery codes, using Railway's shell.
8. As the user, I want there to be no email-based password reset, so that there is no email-based attack surface.

### Banks and Accounts

9. As the user, I want to create Banks (BCGE, UBS, Cler, Crédit Agricole), so that my Accounts are grouped the way I think about them.
10. As the user, I want to create an Account with a Bank, name, Currency (CHF or EUR), IBAN and kind (current, savings, 3a, loan), so that every Transaction belongs to a well-defined ledger.
11. As the user, I want to bind each Account to exactly one Import format (BCGE CAMT.053, UBS CSV, Crédit Agricole CSV, or none for manual Accounts), so that re-imports never create duplicates.
12. As the user, I want the Import format to become unchangeable once the Account has Transactions, so that I can't accidentally break deduplication.
13. As the user, I want to record an Account's IBAN, so that Transfers to and from it can be recognised automatically.
14. As the user, I want joint Accounts (held with my partner) to be treated exactly like any other Account, so that the app tracks household money as a whole.
15. As the user, I want to enter an opening balance for an Account at its start date, so that its balance history is correct from the beginning.
16. As the user, I want to see every Account's current balance in its own Currency and in CHF, so that I know where my money is.
17. As the user, I want to close or archive an Account without losing its history, so that old Accounts stay in historical reports.

### Import

18. As the user, I want to upload a bank file into a chosen Account, so that its Transactions are added without typing.
19. As the user, I want the upload to be rejected with a clear message if the file doesn't match the Account's Import format, so that I can't import the wrong file into the wrong Account.
20. As the user, I want to see a preview of every Transaction in the file before anything is saved, so that I can check what is about to happen.
21. As the user, I want Transactions already imported (same Fingerprint) to be skipped silently and counted in the preview, so that I can safely import overlapping periods.
22. As the user, I want near-duplicates (same Account, amount and date but a different Fingerprint) to be flagged in the preview for me to keep or skip, so that I decide on ambiguous cases.
23. As the user, I want the bank's own reference to be used as the Fingerprint whenever the file provides one, so that deduplication is as reliable as possible.
24. As the user, I want a hash-based Fingerprint with an occurrence counter for entries without a bank reference, so that two identical coffees on the same day stay two Transactions.
25. As the user, I want only booked Transactions to be imported, never pending ones, so that amounts and dates don't change after import.
26. As the user, I want each import to be reconciled against the file's opening and closing Statement balances and warn me when they don't add up, so that a missing statement or a broken parser is caught immediately.
27. As the user, I want UBS CSV's running balance per row to be used for reconciliation too, so that a gap is located precisely.
28. As the user, I want a bank entry that bundles several payments to become a single Transaction, with the bundled details shown for information, so that the Account balance matches the bank.
29. As the user, I want Rules to be applied to new Transactions in the preview, so that I see the resulting Payee, Category and Tags before committing.
30. As the user, I want Transfer candidates to be shown in the preview, so that I can confirm them as part of the import.
31. As the user, I want to commit the previewed Import in one action, so that the whole file is saved consistently or not at all.
32. As the user, I want a list of past Imports per Account (date, file name, counts, reconciliation result), so that I can see what was imported when.
33. As the user, I want to undo a whole Import, which deletes its Transactions and unlinks any Transfers they were part of, so that a wrong file can be cleanly removed.
34. As the user, I want to delete a single imported Transaction, so that I can remove a bank error without undoing the whole Import.
35. As the user, I want the bank fields of an imported Transaction (dates, amount, original text) to be read-only, so that the record stays faithful to the bank.
36. As the user, I want the parser to handle each file's own conventions (encoding, separators, decimal format, French headers, newest-first order), so that I never have to edit a file before importing it.
37. As the user, I want the booking date to be used as the Transaction date in every parser, so that dates are consistent across banks.
38. As the user, I want the original bank description, counterparty name, counterparty IBAN and payment reference to be kept on each Transaction, so that I can search them and Rules can use them.

### Manual Accounts (Cler)

39. As the user, I want to enter Manual transactions on an Account that has no export, so that Cler current is tracked.
40. As the user, I want Manual transactions to be fully editable and deletable, so that I can fix typing mistakes.
41. As the user, I want Rules to run on Manual transactions when I save them, so that they are classified like imported ones.
42. As the user, I want to record Balance snapshots (date, balance) on any Account, so that manual and loan Accounts can be checked against the bank.
43. As the user, I want a warning when an Account's computed balance differs from a Balance snapshot, so that I notice missing or wrong Manual transactions.
44. As the user, I want a loan Account to be tracked through Balance snapshots only, so that its outstanding balance appears without entering every movement.

### Payees

45. As the user, I want a managed list of Payees with clean names, so that reports show "Migros" instead of raw bank text.
46. As the user, I want to rename a Payee and have every Transaction follow, so that cleanup is done once.
47. As the user, I want to merge two Payees, so that variants of the same counterparty are reported together.
48. As the user, I want the raw bank description to stay visible and searchable next to the Payee, so that I can always see what the bank said.

### Categories and Tags

49. As the user, I want two-level classification (Category group → Category), so that I can report at either level.
50. As the user, I want each Category group to be typed Income, Expense or Capital, so that reports know how to treat it.
51. As the user, I want Capital Categories (property sale, notary, pension buy-in and EPL repayment) to be excluded from income and expense but included in cash flow and balances, so that one-off wealth movements don't distort my spending picture.
52. As the user, I want signed amounts to net within a Category, so that a refund reduces that Category's spending instead of counting as income.
53. As the user, I want an editable starter set of Categories seeded on first run, so that I don't start from a blank page.
54. As the user, I want to create, rename and reorder Category groups and Categories, so that the classification fits my life.
55. As the user, I want to move a Category to another Category group, with its history following, so that reclassifying a whole Category is one action.
56. As the user, I want to delete a Category only when it is empty, and to merge it into another to empty it, so that no Transaction is left orphaned.
57. As the user, I want a "Credit card (unitemised)" Category for monthly card settlements, so that card spending is visible as one line until itemised cards arrive.
58. As the user, I want to add any number of free-form Tags to a Transaction (for example "Vacation 2024"), so that I can follow themes that cut across Categories.
59. As the user, I want to rename, merge and delete Tags, so that the Tag list stays tidy.

### Classification workflow

60. As the user, I want an Unclassified view listing Transactions that are neither Transfers nor categorised, so that I know what remains to do.
61. As the user, I want the Unclassified view grouped by raw description and sorted by count, so that classifying a few groups covers most Transactions.
62. As the user, I want to select many Transactions and set their Payee, Category or Tags at once, so that classifying six years is feasible.
63. As the user, I want to edit a single Transaction's Payee, Category, Tags and Notes, so that I can correct individual cases.
64. As the user, I want any manual or bulk edit to lock the edited fields against all Rules, so that my decisions are never overwritten.
65. As the user, I want to see which fields of a Transaction are locked and unlock them, so that I can hand a field back to the Rules.
66. As the user, I want "create rule from this Transaction", prefilled from its Account, Payee and description, so that one classification becomes a reusable Rule.
67. As the user, I want to search and filter the Transaction list by date, Account, amount, text, Payee, Category, Tag and status, so that I can find anything.
68. As the user, I want to see a progress figure (share of Transactions Unclassified), so that I know how close I am to the 2% target.

### Rules

69. As the user, I want to create a Rule with conditions combined with AND, so that classification is deterministic.
70. As the user, I want text conditions (contains, equals, starts with, regex) on raw description, counterparty name and Payee, ignoring case and accents with whitespace normalised, so that bank formatting quirks don't break matches.
71. As the user, I want amount conditions (=, <, >, between) on the signed amount in the Account's Currency, so that I can separate payments by size.
72. As the user, I want Account conditions (is, is one of) and a direction condition (money in or out), so that Rules can be specific to a source.
73. As the user, I want booking-date conditions (before, after, between), so that Rules can reflect changes over time, such as a new landlord.
74. As the user, I want Rule actions that set the Payee, set the Category and add Tags, so that one Rule can fully classify a Transaction.
75. As the user, I want Rules to run in an order I control, by drag-and-drop, so that precedence is explicit.
76. As the user, I want the first matching Rule that sets a field to win that field, with later Rules still filling empty fields and Tags accumulating, so that conflicts are resolved predictably.
77. As the user, I want Rules to skip Transactions that are part of a Transfer, so that Transfers never receive a Category.
78. As the user, I want Rules to run automatically only on import and on saving a Manual transaction, so that editing a Rule never silently changes the past.
79. As the user, I want "apply to existing" to show a preview diff (how many Transactions, which fields, old → new) before writing, so that I can check a Rule's effect.
80. As the user, I want "apply to existing" to respect locked fields, so that my manual decisions survive.
81. As the user, I want to see how many Transactions each Rule currently matches, so that I can spot dead or overly broad Rules.
82. As the user, I want to disable a Rule without deleting it, so that I can test changes safely.

### Transfers

83. As the user, I want Transfer candidates to be suggested at import, searching all my Accounts, so that internal movements are found even across banks.
84. As the user, I want a candidate to be pre-selected when the counterparty IBAN matches one of my Accounts, so that the common case is one click.
85. As the user, I want same-currency candidates to need an exact opposite amount within ±3 days, so that false matches are rare.
86. As the user, I want cross-currency candidates (CHF ↔ EUR) to need opposite amounts within ±2% after FX conversion and dates within ±3 days, so that exchanges between my accounts are found.
87. As the user, I want to confirm or reject each candidate, never having them linked automatically, so that I stay in control.
88. As the user, I want to manually link any two Transactions as a Transfer, or unlink one, so that I can fix what detection missed.
89. As the user, I want linked Transfers excluded from income, expense and Capital totals, so that moving money between my Accounts never looks like spending.
90. As the user, I want the monthly card settlement and loan or 3a payments between tracked Accounts to be Transfers, so that only real spending is counted.

### Exchange rates

91. As the user, I want ECB daily reference rates for CHF and EUR fetched automatically every day, so that conversions stay current without effort.
92. As the user, I want rates backfilled to 2021-01-01, so that my whole history can be converted.
93. As the user, I want a missing day (weekend or holiday) to use the most recent earlier rate, so that every Transaction can be converted.
94. As the user, I want amounts stored only in the Account's Currency and converted to CHF at report time, so that a corrected rate fixes every report.
95. As the user, I want balances in CHF valued at the rate of the date being shown, so that my EUR holdings reflect the exchange rate of that day.
96. As the user, I want to see when rates were last fetched and be warned when they are stale, so that I know the CHF figures are current.

### Dashboards and Widgets

97. As the user, I want several named Dashboards, so that I can keep separate views (overview, health costs, a vacation).
98. As the user, I want to add, remove, move and resize Widgets by drag-and-drop on a Dashboard, so that each Dashboard shows what I care about.
99. As the user, I want each Widget to be a saved query with its own filters (Account, Category group, Category, Payee, Tag, Category group type, Currency), so that Widgets are independent.
100. As the user, I want a Widget's date range to be either live (for example "last 12 months", "year to date") or fixed (from–to), so that some Widgets move with time and others don't.
101. As the user, I want live ranges to cover complete periods only, with the current partial period shown separately or flagged, so that this month doesn't look like a sudden drop.
102. As the user, I want to choose a Widget's row axis and column axis from time (month, quarter, year), Category group, Category, Account, Payee, Tag and Currency, so that I can slice the data any way I want.
103. As the user, I want to choose a measure (sum, count, average per period), so that I can see totals, frequency and typical values.
104. As the user, I want five visualisations (table/pivot, line, stacked bar, donut, single number), so that each question gets the right chart.
105. As the user, I want to open any table Widget full-screen as a pivot report, so that it replaces my Excel pivot.
106. As the user, I want all Widget values in CHF, so that every figure is comparable.
107. As the user, I want to click a cell or chart segment and see the underlying Transactions, so that I can check any number.
108. As the user, I want a starter Dashboard seeded on first run with monthly income vs. expense, net cash flow, spending by Category over time, and Account balances, so that the app is useful immediately.
109. As the user, I want to duplicate a Widget or a Dashboard, so that I can make variants quickly.
110. As the user, I want income vs. expense Widgets to exclude Transfers and Capital by default, so that they show my real day-to-day economy.

### History and audit

111. As the user, I want every change to domain data (Transactions, Rules, Categories, Payees, Tags, Accounts, Imports, Transfers, Balance snapshots) recorded as an append-only History entry, so that I can always see what changed.
112. As the user, I want each History entry to record the field, old value, new value, timestamp and actor (manual edit, a named Rule, an Import, the system), so that every change is explained.
113. As the user, I want all entries produced by one action (a bulk edit, a merge, an apply-to-existing) grouped in a Batch, so that I can read a large change as one event.
114. As the user, I want History entries written together with the change they describe, so that the record can never drift from the data.
115. As the user, I want a filterable History page (by date, entity, actor, Batch), so that I can investigate a problem.
116. As the user, I want to see a single Transaction's History from its detail view, so that I know why it is classified the way it is.
117. As the user, I want Dashboard layout changes and automatic FX fetches left out of History, so that it isn't flooded with noise.

### Export, backup and privacy

118. As the user, I want to export all Transactions as CSV (bank fields, Payee, Category group, Category, Tags, Notes, Transfer link, CHF value), so that I can always go back to Excel.
119. As the user, I want a nightly database dump encrypted with a key whose private half never touches Railway, so that a breach of the host doesn't expose my backups.
120. As the user, I want a machine I own to pull the nightly encrypted dump, so that Railway never holds credentials to my storage.
121. As the user, I want a documented, tested restore procedure, so that I know the backups actually work.
122. As the user, I want an anonymiser for bank sample files that keeps structure, dates, amounts and encoding but replaces names, addresses, IBANs, references and payment text, so that parser tests never contain my real data.

### Display preferences

123. As the user, I want amounts shown with Swiss formatting (1'234.50) and dates as dd.mm.yyyy by default, so that the app reads naturally.
124. As the user, I want a setting to change the number and date format, so that I can pick another convention.

## Implementation Decisions

### Architecture

- Next.js app (App Router), TypeScript, PostgreSQL, Tailwind, deployed on Railway (EU region) with a managed Postgres. Same approach as the user's workout-manager project.
- **Single test seam: an application service layer.** Every server action or route handler is a thin adapter over this layer; all domain logic lives behind it. Its operations are the only public API the UI uses. The operations are:
  - **Accounts:** create, update or archive a Bank or Account; record an opening balance or Balance snapshot; list Accounts with balances.
  - **Import:** preview an Import (Account, file) → preview result; commit an Import (preview id, decisions on near-duplicates and Transfer candidates); undo an Import; list Imports.
  - **Transactions:** create, edit or delete a Manual transaction; edit classification fields; bulk-edit; unlock fields; delete an imported Transaction; query Transactions; list Unclassified groups.
  - **Payees, Categories and Tags:** create, rename, merge, move, reorder, delete.
  - **Rules:** create, update, reorder, enable or disable; preview apply-to-existing; commit apply-to-existing; create a Rule from a Transaction.
  - **Transfers:** list candidates, confirm, reject, link manually, unlink.
  - **FX:** fetch daily rates, backfill rates, read rate status.
  - **Reporting:** run a Widget query; create, update and delete Dashboards and Widgets; save a layout.
  - **History:** query History entries.
  - **Export:** export Transactions to CSV.
- Mutating operations run in one database transaction that includes their History entries.

### Modules (deep modules behind the service layer)

- **Import format parsers**: one per Import format (BCGE CAMT.053 v001.04, UBS CSV, Crédit Agricole CSV). Each turns a file into a normalised statement: opening and closing balance (when present), and entries with booking date, value date, signed amount in minor units, currency, bank reference (optional), raw description, counterparty name, counterparty IBAN, payment reference, bundled details, and running balance (when present). Parsers are pure. A registry maps an Import format to its parser.
  - The BCGE CAMT.053 parser reads `Ntry` elements: `AcctSvcrRef` → bank reference, `BookgDt` → booking date, `CdtDbtInd` → sign, `NtryDtls/TxDtls` → bundled details and counterparty, `Bal` with `OPBD` / `CLBD` → statement balances, and only `Sts = BOOK`.
  - The UBS CSV parser reads the metadata header (IBAN, period, `Solde initial`, `Solde final`, currency) and then the table. It uses `Date de comptabilisation` as the booking date, `Débit` / `Crédit` as the amount, `No de transaction` as the bank reference, and `Solde` as the running balance. `Description1` holds the counterparty name and address, and `Description3` holds the payment reason and counterparty IBAN.
  - The Crédit Agricole CSV parser waits for a sample file.
- **Fingerprinting**: the bank reference when present. Otherwise a hash of Account id, booking date, amount and normalised description, plus an occurrence index among identical hashes in the same file. Unique per Account. (ADR-0003)
- **Import pipeline**: parse → compute Fingerprints → classify each entry as new, exact duplicate or near-duplicate → reconcile (previous computed balance + new Transactions = closing Statement balance; running balance per row where available) → apply Rules → find Transfer candidates → return a preview. The preview is stored server-side until committed or discarded. Commit writes everything atomically.
- **Rules engine**: a pure evaluator taking (ordered Rules, Transaction, locked fields) → field assignments plus the matching Rule per field. Text normalisation: lowercase, strip accents, collapse whitespace. Regex is evaluated with a timeout or size guard.
- **Transfer matcher**: a pure function of (new Transactions, existing Transactions of the other Accounts, Account IBANs, FX lookup) → ranked candidates. A candidate is pre-selected on an IBAN match.
- **FX module**: the ECB fetcher (through an adapter interface, so tests can stub it), a daily scheduled job, a backfill, and a rate lookup with fallback to the most recent earlier date. CHF to CHF is 1.
- **Reporting query engine**: compiles a Widget query definition into a single SQL query that converts to CHF by joining the FX table at query time, and returns a table of rows × columns. Visualisations are pure renderers over that table.
- **History recorder**: appends entries (entity, entity id, field, before, after, actor type, actor id, Batch id, timestamp) inside the caller's database transaction.
- **Auth**: password hashed with argon2id, TOTP (RFC 6238) with hashed recovery codes, rate limiting, secure httpOnly cookies, and session expiry. A one-time setup flag disables the setup screen. A CLI command resets credentials.
- **Anonymiser**: a standalone script (not part of the app) that rewrites a bank file keeping its format, consistently substituting personal data.

### Schema (key shapes)

- `bank(id, name)`
- `account(id, bank_id, name, kind, currency, iban, import_format, opening_balance_minor, opening_date, archived_at)`. `import_format` can't change once the Account has Transactions.
- `import(id, account_id, file_name, imported_at, statement_from, statement_to, opening_balance_minor, closing_balance_minor, reconciliation_status, undone_at)`
- `transaction(id, account_id, import_id NULL, is_manual, booking_date, value_date, amount_minor BIGINT, currency, fingerprint, bank_reference, raw_description, counterparty_name, counterparty_iban, payment_reference, bundled_details JSONB, payee_id, category_id, notes, locked_fields, transfer_id NULL)`. Unique on (account_id, fingerprint) for imported Transactions.
- `transfer(id, created_at)`, linked from exactly two Transactions on different Accounts with opposite signs.
- `payee(id, name)`, `tag(id, name)`, `transaction_tag(transaction_id, tag_id, source)`
- `category_group(id, name, type ∈ {income, expense, capital}, sort)`, `category(id, group_id, name, sort)`
- `rule(id, sort, enabled, conditions JSONB, actions JSONB)`
- `balance_snapshot(id, account_id, date, balance_minor)`
- `fx_rate(date, currency, rate_to_chf)`, primary key (date, currency)
- `dashboard(id, name, sort)`, `widget(id, dashboard_id, layout JSONB, query JSONB, visualisation)`
- `history_entry(id, batch_id, at, actor_type, actor_id, entity_type, entity_id, field, before JSONB, after JSONB)`, append-only
- `app_user(id, password_hash, totp_secret_enc, recovery_codes_hashed, setup_completed_at)`, `session(...)`, `settings(number_format, date_format)`

### Domain rules (binding)

- A Transaction is single-sided. A Transfer is two linked Transactions. There are no splits. (ADR-0001)
- Amounts are stored in the Account's Currency as integer minor units and never stored in CHF. (ADR-0002)
- Each Account has one Import format, fixed once the Account has Transactions. (ADR-0003)
- Transfers have no Category, and Rules skip them.
- Income and expense totals use the Category group type, excluding Transfers and Capital. Net cash flow includes Capital but excludes Transfers.
- Manual and bulk edits lock fields. Rules never write a locked field.
- Bank fields on imported Transactions are immutable.

## Testing Decisions

- **What a good test is:** it exercises behaviour through the application service layer, against a real PostgreSQL database, and asserts on returned results and persisted state. It never asserts on internal calls or private module structure. A test should survive a refactor that keeps behaviour.
- **Primary seam: the application service layer**, tested with a real, per-run PostgreSQL (container or ephemeral database) with migrations applied. Each test gets a clean schema or transaction.
  - Parsers are tested **through** "preview an Import", using anonymised fixture files per Import format, one folder per bank. Fixtures must cover: a bundled entry, an entry without a bank reference, a refund, a cross-currency Transfer, a statement boundary, and an overlapping re-import.
  - Fingerprinting and deduplication: re-importing the same and overlapping files, near-duplicate flagging, identical same-day amounts.
  - Reconciliation: matching and mismatching closing balances; UBS running-balance gaps.
  - Rules: ordering, first-wins per field, Tag accumulation, locked fields, date, amount, text and regex conditions, accent and case insensitivity, apply-to-existing preview vs. commit.
  - Transfers: IBAN pre-selection, same-currency exact match, cross-currency ±2%, ±3-day window, manual link and unlink, exclusion from totals.
  - FX: fallback to the most recent earlier rate, backfill, CHF conversion in report queries, balance revaluation by date.
  - Reporting: each axis and measure, complete-period live ranges, Capital and Transfer exclusion, drill-down consistency (cell totals equal the sum of the underlying Transactions).
  - History: an entry for every mutating operation, Batch grouping, and atomicity (a failed operation leaves no entries).
  - Import undo and Category merge or delete constraints.
- **The only test double is the ECB rate source**, stubbed through the FX adapter interface with fixed rates.
- **End-to-end tests (Playwright) cover only critical flows:** first-run setup with TOTP and then login; import → preview → commit; classify from the Unclassified view and create a Rule from a Transaction; build a Widget on a Dashboard.
- Pure calculations (FX date fallback, text normalisation) may get focused unit tests when that is clearer than going through the service layer.
- Coverage target: at least 80% of the service layer and the modules behind it.
- **Prior art:** none. This is a greenfield repository, and these tests establish the conventions.

## Out of Scope

- Budgeting of any kind (envelopes, targets, rollover) and forecasting.
- AI or LLM features of any kind.
- Itemised credit card Accounts (the first v2 item); card spending stays a lump sum.
- Split transactions, so loan and leasing interest isn't tracked separately.
- Investment and securities valuation; 3a Accounts are treated as cash.
- Currencies other than CHF and EUR in the UI, though the data model allows any ISO code.
- A display currency per Widget; everything is in CHF.
- FX gain or loss accounting, and FX spread reporting on Transfers.
- Automatic bank synchronisation (open banking).
- Paste import from web pages (for Cler).
- MT940.
- A native mobile app; the web UI is responsive but desktop-first.
- Multiple users or sharing.
- Recurring or scheduled Transactions.
- Undoing a Rule run.
- Receipts and attachments.
- UI translation; English only.
- Day-of-month and weekday Rule conditions, and OR groups in Rules.

## Further Notes

- Vocabulary follows `GLOSSARY.md`. Binding decisions are in `docs/adr/0001`–`0003`.
- **Definition of done for v1:**
  - All Accounts imported or entered from their start date, with balances reconciled to the cent.
  - At most 2% of Transactions Unclassified.
  - One Dashboard reproduces the current Excel pivot.
  - A monthly import takes under 10 minutes (Cler entry excluded).
  - One backup restore has been tested.
- **Sample status:**
  - UBS CSV and BCGE CAMT.053 (camt.053.001.04) samples exist but contain personal data. They must go through the anonymiser and be reviewed before being committed as fixtures.
  - The Crédit Agricole CSV sample is still missing, which blocks that parser. Layouts differ between regional banks.
  - Cler has no export.
- **Open questions:**
  - The Cler current start date (2021-01-01 or later).
  - Which machine pulls the nightly backup.
