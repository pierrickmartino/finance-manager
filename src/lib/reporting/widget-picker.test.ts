import { describe, expect, it } from 'vitest';
import { widgetPickerOptions } from './widget-picker';

const DASHBOARDS = [
  { id: 'home', name: 'Home' },
  { id: 'travel', name: 'Travel' },
];

describe('the saved-Widget picker on a Dashboard', () => {
  it('lists Standalone Widgets first, then the others, each labelled with where it sits', () => {
    const widgets = [
      { id: 'w1', name: 'Rent', dashboardId: 'travel' },
      { id: 'w2', name: 'Groceries', dashboardId: null },
      { id: 'w3', name: 'Balances', dashboardId: 'home' },
      { id: 'w4', name: 'Car', dashboardId: null },
    ];

    expect(widgetPickerOptions(widgets, DASHBOARDS)).toEqual([
      { id: 'w2', label: 'Groceries (No Dashboard)' },
      { id: 'w4', label: 'Car (No Dashboard)' },
      { id: 'w1', label: 'Rent (Travel)' },
      { id: 'w3', label: 'Balances (Home)' },
    ]);
  });

  it('returns nothing when no Widget exists', () => {
    expect(widgetPickerOptions([], DASHBOARDS)).toEqual([]);
  });
});
