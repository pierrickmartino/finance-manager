import { describe, expect, it } from 'vitest';
import { createFormatter, type NumberFormat } from '@/lib/format';
import { setupTestDatabase } from '@test/support/db';
import { getDisplaySettings, updateDisplaySettings } from '.';

const t = setupTestDatabase();

describe('Display settings', () => {
  it('are Swiss until the user changes them', async () => {
    const fmt = createFormatter(await getDisplaySettings(t.ctx));

    expect(fmt.amount(123450)).toBe("1'234.50");
    expect(fmt.date('2024-03-07')).toBe('07.03.2024');
  });

  it('change how amounts and dates render once updated', async () => {
    await updateDisplaySettings(t.ctx, { numberFormat: 'dot', dateFormat: 'yyyy-mm-dd' });

    const fmt = createFormatter(await getDisplaySettings(t.ctx));

    expect(fmt.amount(123450)).toBe('1.234,50');
    expect(fmt.date('2024-03-07')).toBe('2024-03-07');
  });

  it('keep the last update', async () => {
    await updateDisplaySettings(t.ctx, { numberFormat: 'dot', dateFormat: 'yyyy-mm-dd' });
    await updateDisplaySettings(t.ctx, { numberFormat: 'comma', dateFormat: 'dd/mm/yyyy' });

    expect(await getDisplaySettings(t.ctx)).toEqual({
      numberFormat: 'comma',
      dateFormat: 'dd/mm/yyyy',
    });
  });

  it('reject an unknown format', async () => {
    await expect(
      updateDisplaySettings(t.ctx, {
        numberFormat: 'roman' as NumberFormat,
        dateFormat: 'dd.mm.yyyy',
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});
