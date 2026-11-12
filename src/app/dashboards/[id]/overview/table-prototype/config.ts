/* PROTOTYPE — throwaway. Shared by the server page and the client card (see ./index.tsx). */

export const IS_TABLE_PROTOTYPE_ENABLED = process.env.NODE_ENV !== 'production';

export const TABLE_VARIANTS = [
  { key: 'current', name: 'Current (share list)' },
  { key: 'A', name: 'Heatmap' },
  { key: 'B', name: 'Spark rows' },
  { key: 'C', name: 'One column at a time' },
  { key: 'D', name: 'Trimmed pivot' },
];

export const TABLE_TOGGLES = [{ param: 'sample', values: ['on', 'off'] }];
