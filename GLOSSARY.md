# Finance Manager

A self-hosted, single-user app for tracking household income and expenses across several banks and currencies. It records and analyses; it does not budget.

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
The single currency, CHF, in which all amounts are reported and shown. It never changes.
_Avoid_: Reporting currency, home currency

**FX rate**:
The rate on a given date for converting one Currency into the Base currency.
_Avoid_: Exchange rate, conversion rate

**Net worth**:
The sum, in the Base currency, of every Account's balance on a date, each converted at that date's FX rate. A loan's balance counts against it. It moves with FX rates even when no money moves.
_Avoid_: Wealth, assets, total balance

### Transactions

**Transaction**:
One movement of money on one Account, dated and signed, in that Account's Currency.
_Avoid_: Entry, posting, operation, line

**Transaction detail**:
The page of one Transaction, where it is classified, Split and linked as a Transfer, beside its bank fields and History. Opened from the Transactions list, it steps to the previous or next Transaction of that list.
_Avoid_: Transaction page, detail view

**Transactions list**:
The Transactions matching the current filters, newest first, paged.
_Avoid_: Filtered list, transactions page

**Transaction preview**:
The read-only summary of the selected Transaction beside the Transactions list, on wide screens only. Its "Open & classify" opens the Transaction detail.
_Avoid_: Preview pane, side panel

**Transfer**:
A pair of linked sides moving money between two of the user's own Accounts, possibly in different Currencies. Each side is either a whole Transaction or one Split line of a Transaction. It is neither income nor expense.
_Avoid_: Internal movement

**Transfer candidate**:
A suggested, not yet confirmed, pairing of two whole Transactions as a Transfer. Split lines are never suggested.

**Manual transaction**:
A Transaction entered by hand, for an Account with no usable bank export or for a period its export doesn't cover.

### Import

**Import**:
One upload of one bank file into one Account, previewed before it is committed.
_Avoid_: Sync, upload

**Import format**:
The one file format (CAMT.053, OFX, or a specific bank CSV layout) an Account is imported from.
_Avoid_: File type, parser

**Fingerprint**:
The identity of a Transaction from the bank's point of view, defined by its Account's Import format, used to recognise it when the same period is imported again.
_Avoid_: Hash, dedup key

**Statement balance**:
The balance an Account had at a date according to the Bank, used to check that the imported Transactions are complete.
_Avoid_: Bank balance

**Balance snapshot**:
A Statement balance entered by hand, for Accounts whose exports contain no balances.

**Completeness check**:
The standing check that every imported Account's data is current and has no Gaps, and that every Account with Transactions adds up to its latest Statement balance.
_Avoid_: Data health, import check, freshness

**Gap**:
A span of days between two of an Account's Imports that no Import's statement period covers and no Manual transaction fills.
_Avoid_: Hole, missing period

**Stale**:
The state of an imported Account whose data ends too long ago, counted from the last day its latest Import covers.
_Avoid_: Outdated, old

### Classification

**Category group**:
The top level of the two-level classification, typed as Income, Expense or Capital.

**Capital**:
The Category group type for large one-off movements of wealth, such as a property sale or a pension buy-in. These count as neither income nor expense but still affect cash flow and balances.
_Avoid_: Exceptional, one-off, investment

**Category**:
The second level of classification, belonging to exactly one Category group. Signed amounts net within it, so a refund reduces spending.
_Avoid_: Subcategory, class

**Split**:
The division of one Transaction's amount into Split lines that sum exactly to it, so it can be classified under several Categories while staying one Transaction.
_Avoid_: Breakdown, allocation, child transaction

**Split line**:
One part of a Split: an amount in the Transaction's Currency, of either sign, with its own Tags and note, and either its own Category (of any Category group type) or a Transfer, never both. A line with a Category may also name its own Payee; one that doesn't takes its Transaction's Payee. A Transfer line has no Payee.
_Avoid_: Sub-transaction, part, share

**Payee**:
The clean, user-managed name of the counterparty of a Transaction, as opposed to the raw bank description.
_Avoid_: Merchant, beneficiary, counterparty

**Tag**:
A free label cutting across Categories, many per Transaction, such as "Vacation 2024".
_Avoid_: Label, project

**Unclassified**:
The state of a Transaction that has neither a Category nor a Transfer, or that has a Split line with neither.
_Avoid_: Uncategorised, inbox

**Bulk edit**:
One manual edit applied to many selected Transactions at once: setting a Category or a Payee, or adding or removing a Tag. Tags already on a Transaction are never replaced. A Split or Transfer Transaction is left out of a Category change, and the edit says how many were left out.
_Avoid_: Mass edit, batch edit

**Rule**:
An ordered condition-to-action pair that classifies Transactions. For each field, the first matching Rule wins; a manual edit always beats any Rule.
_Avoid_: Filter, automation

**Recurring payment**:
One Payee's series of expenses of a similar amount at a regular cadence, recognised from Transactions and Split lines already recorded. A Payee may have several; a price change continues the same series. It is never scheduled or entered in advance. One the user has dismissed stays out of view until restored.
_Avoid_: Subscription, standing order, regular charge

**Charge**:
One payment a Recurring payment is recognised from: an unsplit Transaction, or a Split line, classified under an Expense Category with a Payee, and money out. A refund is not a Charge.
_Avoid_: Payment, debit, occurrence

**Missed**:
The state of a Recurring payment whose next expected date, plus a grace of a quarter of its cadence, has passed without a Charge, while its Account's data reaches beyond the grace's last day.

**Not yet imported**:
The state of a Recurring payment that would be Missed, but whose Account's data doesn't reach beyond the grace: the Account is Stale, its data ends sooner, or a Gap falls after the last Charge. It still counts in the yearly cost.
_Avoid_: Pending, unknown

**Ended**:
The state of a Recurring payment with no Charge for two full cadences. A later matching Charge makes it active again.

**Price increase**:
The flag of a Recurring payment whose last Charge is higher than the one before. It shows until the next Charge.

**New**:
The flag of a Recurring payment whose first Charge is within the last 90 days. An Ended one charged again is not New.

**Dismissal**:
The user's record that a Recurring payment is a false positive, anchored on its Charges: any series containing one of them stays out of the list and the total until the Dismissal is restored.
_Avoid_: Hide, ignore, exclusion

### History

**History entry**:
An append-only record of one change to domain data: what changed, from what to what, when, and by which actor (manual edit, Rule, Import, system).
_Avoid_: Log, event

**Batch**:
The group of History entries produced by one user action, such as a bulk edit, a Payee merge or an "apply to existing".

### Reporting

**Widget**:
A saved query (filters, date range, axes, measure) together with the way it is visualised.
_Avoid_: Card, tile, report, saved Widget

**Standalone Widget**:
A Widget that sits on no Dashboard. Adding it to a Dashboard places a copy there; the Standalone Widget stays as it is.
_Avoid_: Report, saved report

**Drill-down**:
The list of Transactions behind one reported number, filtered exactly as that number was, from which the number can be worked out: their sum, their count, or their sum over the periods averaged. A number derived from several others opens the Transactions behind all of them. Balances are checked on their Account, not by a Drill-down.
_Avoid_: Breakdown, detail view, cell Transactions

**Dashboard**:
A named set of Widgets laid out on a board of 12 columns and fixed-height rows, each Widget with its own place and size (ADR-0010). It is read as its Dashboard Story and arranged in place in Edit mode. Each Widget sits on at most one Dashboard.

**Dashboard Story**:
A Dashboard read as a grid of cards: an overview row (the headline amount, with a line of the last 24 months of Net worth beside it and its change over the last month, year and two years when it is Net worth today; the latest month's insight; the most recent Transactions), then the board, with one card per Widget drawn at the Widget's place and size, each saying in words what its chart shows. On narrow screens the cards read as one column, top to bottom then left to right.
_Avoid_: Report, overview page, presentation

**Card**:
How one Widget is drawn on the Dashboard Story, or one section of Analytics: a sentence saying what its chart shows, its mark (a figure, ticks, a ring, a heatmap, dots or bars per period, or Net worth bands by Account kind) and the facts behind it, each linking to its Drill-down, or for balances to their Accounts. A card's kind follows from its Widget's source, visualisation and data; a section of Analytics is drawn as the card of the Widget that would show the same figures, so the two pages read alike. A bars or line Widget whose two columns are its income and its expense is read as a flow.
_Avoid_: Chapter, tile

**Analytics**:
The landing page: a single fixed page of reports, read over one Span at a time, which some Cards may replace with their own Card Span: the Key figures (Net worth today; Income, Expense and Profit over the Span) and the Profit and loss, which stand on their own; then Net worth, the spending insight, the most recent Transactions, Account balances today, and Category, spending, cash-flow and income-versus-expense figures per period of the Span, each drawn as a Card. It has no Edit mode. Each figure opens its Drill-down, and each balance opens its Account.
_Avoid_: Analysis page, reports page, dashboard

**Span**:
The stretch of days Analytics, or one of its Cards, is read over: from a start date, never before the first Transaction, to today. It is split into months, quarters or years by its length; its first period starts at the start date and its last is shown "to date", both set apart from complete ones. The spending insight always speaks of the last complete month, whatever the Span.
_Avoid_: Date range, period window, period view, lookback

**Span preset**:
A named way of choosing a Span's start date, such as "Rolling 90 days", "Year to date" or "This year and last 2". A Span chosen by preset moves with it as days pass; one chosen by date keeps its start date.
_Avoid_: Quick range, shortcut

**Card Span**:
The Span preset one Card of Analytics is pinned to, in place of the page's Span, until set back to the page's. The Card is then read wholly over it: its periods, its Drill-downs and its Comparison span. The Key figures, the spending insight, the most recent Transactions and the Account balances have none.
_Avoid_: Override, local span, card period

**Profit**:
Income minus expense over a span of time, with Capital left out. It is negative when more went out than came in.
_Avoid_: Kept, net profit, savings, net, surplus

**Net cash flow**:
All the money that moved in and out over a span of time, Transfers left out: Profit plus Capital plus what is still Unclassified. It is negative when more went out than came in.
_Avoid_: Net incl. Capital, net profit, net result, bottom line

**Profit and loss**:
The statement of a Span on Analytics: its Income, Expense, Profit, Capital, Unclassified (when there is any) and Net cash flow, each beside its value over the Comparison span and the change. Capital and Unclassified are neither good nor bad.
_Avoid_: P&L, income statement, statement, summary

**Comparison span**:
The stretch a Span's figures are compared with. For a Span to date of a calendar period (quarter, year, or years), it is the same stretch of the previous one, a short month compared up to its last day; for any other Span, the stretch of the same number of days just before it.
_Avoid_: Baseline, previous period, last period

**Edit mode**:
The Dashboard Story's own board, edited in place: a Widget's card is dragged to a free place, resized in whole cells down to its smallest readable size, and pushes the cards in its way down. Gaps are kept, and every change is saved at once, without History. On narrow screens the board is one column in reading order, with no dragging or resizing: a card moves up or down instead, swapping places with its neighbour. From the keyboard, a focused card moves one cell with the arrow keys and resizes one cell with Shift+arrows.
_Avoid_: Layout editor, design mode
