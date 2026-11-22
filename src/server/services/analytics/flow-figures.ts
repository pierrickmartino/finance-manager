/**
 * The flow Key figures (spec #225) from what a report books in the Income and Expense Category
 * groups: Income as booked, Expense what went out (booked negative, so its opposite, and 0 rather
 * than -0 when nothing did), and Profit, Income less Expense (GLOSSARY: Profit).
 */

export type FlowFigureId = 'income' | 'expense' | 'profit';

export type FlowFigures = Record<FlowFigureId, number>;

/** The flow figures from the Income and Expense groups' totals as booked, in CHF minor units. */
export function flowFigures(bookedIncome: number, bookedExpense: number): FlowFigures {
  const expense = 0 - bookedExpense;
  return { income: bookedIncome, expense, profit: bookedIncome - expense };
}
