# Recurring payments

## Problem Statement

My subscriptions, insurance premiums and other regular charges are spread over several Accounts and Currencies. I can't see in one place what they cost me per year, when each is next due, or when one has gone up in price, stopped, or newly started. I find out about a price increase or a forgotten subscription only by chance.

## Solution

A Recurring payments page recognises, from Transactions already recorded, each Payee's series of expenses of a similar amount at a regular cadence. For each it shows the yearly cost in CHF, the last amount, the next expected date and any flag (price increase, Missed, New). Nothing is scheduled or entered in advance, and no AI is used. A false positive can be dismissed, and restored later. See ADR-0011.

## User Stories

1. As the user, I want the app to recognise my Recurring payments from the Transactions I already have, so that I don't have to list them myself.
2. As the user, I want monthly, quarterly, half-yearly and yearly cadences recognised, so that subscriptions, Swiss insurance premiums and annual fees are all covered.
3. As the user, I want weekly patterns ignored, so that grocery shopping doesn't show up as a Recurring payment.
4. As the user, I want only expenses considered (Transactions and Split lines under an Expense Category group), so that salary, Transfers, Capital movements and Unclassified Transactions stay out.
5. As the user, I want a Split line considered under its own Payee, or else its Transaction's, so that bundled payments are recognised like reports see them.
6. As the user, I want a Payee to have several Recurring payments when it charges distinct amounts (Swisscom mobile and internet), so that each is tracked on its own.
7. As the user, I want a moderate price change to continue the same series, so that an increase doesn't look like a new Recurring payment.
8. As the user, I want one series to span my Accounts in the same Currency, so that switching card doesn't split it.
9. As the user, I want each Recurring payment's yearly cost in CHF, shown with its working ("CHF 21.90 × 12"), so that I know what it costs me per year.
10. As the user, I want a headline total of the yearly cost of my active and Missed Recurring payments, so that I see the overall cost at a glance.
11. As the user, I want each Recurring payment's last amount in its own Currency, so that I recognise the charge on my statement.
12. As the user, I want each Recurring payment's next expected date, shown as "around 5 April", so that I know roughly when it comes next.
13. As the user, I want a price increase flagged, with the old and new amount, until the next charge, so that I notice it.
14. As the user, I want a Recurring payment flagged Missed when its charge is overdue, so that I notice a cancelled or failed payment.
15. As the user, I want a Recurring payment shown as "Not yet imported" rather than Missed when its Account's data doesn't reach that far, so that the page doesn't blame the merchant for an import I haven't done.
16. As the user, I want a Recurring payment flagged New when its first charge is within the last 90 days, so that I spot new subscriptions.
17. As the user, I want a Recurring payment with no charge for two full cadences shown as Ended, in a collapsed section and out of the total, so that the list reflects what I still pay.
18. As the user, I want an Ended Recurring payment that is charged again to become active again, not New, so that a paused subscription keeps its history.
19. As the user, I want to dismiss a false positive, and for it to stay dismissed as new charges arrive, so that the list stays clean.
20. As the user, I want dismissed Recurring payments in a collapsed section where I can restore them, so that a dismissal isn't final.
21. As the user, I want dismissing and restoring recorded in History, so that I can see what changed.
22. As the user, I want to open a Recurring payment's charges as a Drill-down, so that I can check what it was recognised from.
23. As the user, I want the list ordered by yearly cost, highest first, so that the most expensive ones come first.
24. As the user, I want the page under Money in the navigation, so that I find it next to Transactions.

## Implementation Decisions

- **Model (ADR-0011).** Recurring payments are recognised on request from the last 36 months of Transactions and are never stored. Only dismissals are stored.
- **Charges.** A charge is a whole Transaction, or a Split line, classified under a Category of an Expense Category group, with a Payee (the line's own, else its Transaction's). Charges without a Payee are ignored.
- **Recognition.**
  - Charges are grouped by Payee and Currency, then into series by amount.
  - A charge continues a series when its amount is within ±20% of the series' previous charge, in the charge's own Currency.
  - A series has a cadence (monthly, quarterly, half-yearly, yearly) when every gap between its charges is within ±20% of it.
  - A series needs at least 3 charges for monthly and quarterly, and 2 for half-yearly and yearly.
  - These thresholds are constants in code, with no settings screen.
- **Figures.**
  - The last amount is the latest charge, in its own Currency.
  - The yearly cost is the last amount × charges per year, converted to CHF at the FX rate on the last charge's date (ADR-0002).
  - The next expected date is the last charge's date plus the cadence in calendar months, clamped to the end of the month.
  - The total is the sum of the yearly cost of active and Missed series.
- **States.**
  - **Missed**: the next expected date plus a grace of a quarter of the cadence has passed with no charge, and the Account of the last charge has data reaching past that grace (it isn't Stale, and there's no Gap over it). If the data doesn't reach that far, the series shows "Not yet imported".
  - **Ended**: no charge for two full cadences. A later charge that continues the series makes it active again.
  - **Price increase**: the last charge is higher than the one before. It shows until the next charge.
  - **New**: the first charge is within the last 90 days. An Ended series that is charged again is not New.
- **Dismissal.**
  - A new table holds dismissals. Each holds references to the charges (Transaction or Split line) of the series when it was dismissed.
  - A recognised series is dismissed if it contains any referenced charge.
  - Dismissing and restoring each go through `mutate()` and record a History entry, so a new History entity type is needed.
  - References to a deleted Transaction or a replaced Split line drop out. A dismissal left with no references is deleted.
- **Page.**
  - A new route, with a nav entry in the Money group of `NAV_GROUPS`.
  - A headline total, then one row per series: Payee, cadence, last amount, yearly cost with its working, next expected date, and flags. Ordered by yearly cost, highest first.
  - Collapsed Ended and Dismissed sections below.
  - A row opens a Drill-down of its charges. The yearly cost is shown as text, not as a drillable number.
  - Styled with `docs/design-system.md` tokens and the `surface.ts` primitives.
- **Docs.** The glossary defines Recurring payment, Missed and Ended. The v1 spec's Out of Scope list is narrowed: forecasting is still out except a Recurring payment's next expected date, and scheduled Transactions are still out.

## Decisions and Clarifications

Settled while building it (#128–#132):

- **The total includes "Not yet imported" series.** They are active series whose import is late, so they still cost the user.
- **Any Gap between the last charge and the end of the grace gives "Not yet imported"**, because a charge could hide in it. Missed needs the data to reach beyond the grace's last day.
- **Refunds are not charges.** A positive amount under an Expense Category is left out.
- **No FX rate, no yearly cost.** The series shows "No FX rate yet", is left out of the total and sorts last.
- **The working shows the FX rate** for a series not in CHF ("EUR 9.99 × 12 at 0.93 CHF/EUR").
- **"around <date>" adds the year** when it isn't the current year.
- **The Drill-down has its own page** (`/recurring-payments/drill`), using the existing list-Transactions-by-id read and the new origin's back link.
- **Ended rows can be dismissed too**, as well as active ones.
- **An off-cadence gap breaks a series**: every gap between charges must fit the cadence.

## Testing Decisions

- As in the other specs: test external behaviour through the public service functions against the real test database, asserting what the user sees.
- **Seam:** the service function that lists Recurring payments, fed with imported and Manual Transactions and Split lines, plus the dismiss and restore functions and History reads.
- **Cases to cover:**
  - Each cadence at its interval and amount bounds.
  - The minimum charge counts.
  - Two series for one Payee.
  - A Payee paid in two Currencies.
  - Split line Payees.
  - Exclusion of Income, Capital, Transfers, Unclassified Transactions and charges with no Payee.
  - Price increase, New, Missed, "Not yet imported" over a Stale Account and over a Gap, Ended, and an Ended series charged again.
  - Yearly cost with an EUR series at the FX rate on the last charge's date.
  - A dismissal surviving new charges and a Payee merge.
  - A re-split dropping a dismissal's references.
- Pure date arithmetic (calendar-month addition at month end, the grace periods) may get focused unit tests.
- One end-to-end test following the existing Playwright specs: open the page, see a recognised series with its yearly cost, dismiss it, then restore it.

## Out of Scope

- Scheduling or creating Transactions in advance.
- Totalling next expected dates into future cash flow or a forecast.
- Marking a series as recurring by hand.
- Weekly cadences.
- Recurring income.
- A Recurring payments Widget on Dashboards.
- Creating a Rule from a Recurring payment.
- Settings for the recognition thresholds.
- Notifications about flags.

## Further Notes

- Vocabulary follows `GLOSSARY.md`. Binding decisions: ADR-0002 (FX conversion) and ADR-0011 (recognised on request).
- The seeded "Subscriptions" Category plays no part in recognition.
