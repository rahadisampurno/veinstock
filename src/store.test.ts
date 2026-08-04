import { describe, expect, it } from 'vitest';
import { adjustBalance, getBalance, movement, normalizeData, normalizeStockUnit, seedData } from './store';

describe('inventory balance', () => {
  it('normalizes legacy stock unit capitalization', () => {
    expect(normalizeStockUnit('gram')).toBe('Gram');
    expect(normalizeStockUnit('pcs')).toBe('Pcs');
    expect(normalizeStockUnit('KG')).toBe('Kg');
  });
  it('reduces source stock without changing another location', () => {
    const beforeOutlet = getBalance(seedData.balances, 'loc-outlet-1', 'v-balado');
    const next = adjustBalance(seedData.balances, 'loc-owner', 'v-balado', -1000);
    expect(getBalance(next, 'loc-owner', 'v-balado')).toBe(8000);
    expect(getBalance(next, 'loc-outlet-1', 'v-balado')).toBe(beforeOutlet);
  });

  it('creates a balance when a variant is first received', () => {
    const next = adjustBalance([], 'loc-new', 'v-new', 750);
    expect(getBalance(next, 'loc-new', 'v-new')).toBe(750);
  });

  it('records signed quantities in the audit trail', () => {
    const entry = movement('v-balado', 'loc-owner', 'Penjualan offline', -80, '2 gelas', 'Kasir');
    expect(entry.quantity).toBe(-80);
    expect(entry.type).toBe('Penjualan offline');
    expect(entry.createdAt).toBeTruthy();
  });

  it('classifies legacy sales by their transaction location', () => {
    const data = normalizeData({
      ...seedData,
      sales: [
        { ...seedData.sales[0], id: 'legacy-outlet', channel: undefined as any },
        { ...seedData.sales[1], id: 'legacy-online', channel: undefined as any },
      ],
    });

    expect(data.sales.find(sale => sale.id === 'legacy-outlet')?.channel).toBe('offline');
    expect(data.sales.find(sale => sale.id === 'legacy-online')?.channel).toBe('online');
  });
});
