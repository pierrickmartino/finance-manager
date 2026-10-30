# Finance Manager

A self-hosted, single-user app for tracking household income and expenses across several banks and currencies. It records and reports; it does not budget.

## Language

### Money and accounts

**Bank**:
The institution holding one or more Accounts (BCGE, UBS, Cler, Crédit Agricole).
_Avoid_: Provider, institution

**Account**:
A single ledger at a Bank, with one fixed Currency, an IBAN and a kind (current, savings, 3a, loan). Every Account tracked in the app is the household's own, whoever its holder is; money to or from an untracked account is income or expense.
_Avoid_: Wallet, pocket, own account

**Currency**:
The ISO currency in which an Account holds its amounts (CHF, EUR).

**Base currency**:
The single currency, CHF, in which all reports are expressed. It never changes.
_Avoid_: Reporting currency, home currency

**FX rate**:
The rate on a given date for converting one Currency into the Base currency.
_Avoid_: Exchange rate, conversion rate

### Transactions

**Transaction**:
One movement of money on one Account, dated and signed, in that Account's Currency.
_Avoid_: Entry, posting, operation, line

**Transfer**:
A pair of linked Transactions moving money between two of the user's own Accounts, possibly in different Currencies. It is neither income nor expense.
_Avoid_: Internal movement

**Transfer candidate**:
A suggested, not yet confirmed, pairing of two Transactions as a Transfer.

**Manual transaction**:
A Transaction entered by hand for an Account that has no usable bank export.

### Import

**Import**:
One upload of one bank file into one Account, previewed before it is committed.
_Avoid_: Sync, upload

**Import format**:
The one file format (CAMT.053 or a specific bank CSV layout) an Account is imported from.
_Avoid_: File type, parser

**Fingerprint**:
The identity of a Transaction from the bank's point of view, defined by its Account's Import format, used to recognise it when the same period is imported again.
_Avoid_: Hash, dedup key

**Statement balance**:
The balance an Account had at a date according to the Bank, used to check that the imported Transactions are complete.
_Avoid_: Bank balance

**Balance snapshot**:
A Statement balance entered by hand, for Accounts whose exports contain no balances.

### Classification

**Category group**:
The top level of the two-level classification, typed as Income, Expense or Capital.

**Capital**:
The Category group type for large one-off movements of wealth, such as a property sale or a pension buy-in. These count as neither income nor expense but still affect cash flow and balances.
_Avoid_: Exceptional, one-off, investment

**Category**:
The second level of classification, belonging to exactly one Category group. Signed amounts net within it, so a refund reduces spending.
_Avoid_: Subcategory, class

**Payee**:
The clean, user-managed name of the counterparty of a Transaction, as opposed to the raw bank description.
_Avoid_: Merchant, beneficiary, counterparty

**Tag**:
A free label cutting across Categories, many per Transaction, such as "Vacation 2024".
_Avoid_: Label, project

**Unclassified**:
The state of a Transaction that is not a Transfer and has no Category yet.
_Avoid_: Uncategorised, inbox

**Rule**:
An ordered condition-to-action pair that classifies Transactions. For each field, the first matching Rule wins; a manual edit always beats any Rule.
_Avoid_: Filter, automation

### History

**History entry**:
An append-only record of one change to domain data: what changed, from what to what, when, and by which actor (manual edit, Rule, Import, system).
_Avoid_: Log, event

**Batch**:
The group of History entries produced by one user action, such as a bulk edit, a Payee merge or an "apply to existing".

### Reporting

**Widget**:
A saved query (filters, date range, axes, measure) together with the way it is visualised.
_Avoid_: Card, tile, report

**Dashboard**:
A named, user-arranged grid of Widgets.
