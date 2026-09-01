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

  it('backfills channel prices and discount totals without changing legacy revenue', () => {
    const data = normalizeData({
      ...seedData,
      products: seedData.products.map(product => ({
        ...product,
        variants: product.variants.map(variant => ({
          ...variant,
          onlineCost: undefined,
          onlinePrice: undefined,
        })),
      })),
      sales: [{
        ...seedData.sales[0],
        total: 20_000,
        grossTotal: undefined,
        discountAmount: undefined,
        items: [{
          variantId: 'v-balado', quantity: 2, unit: 'Gram', unitCost: 52,
          price: 10_000, discount: undefined, subtotal: 20_000,
        }],
      }],
    });

    const variant = data.products[0].variants[0];
    expect(variant.onlineCost).toBe(variant.cost);
    expect(variant.onlinePrice).toBe(variant.price);
    expect(data.sales[0]).toMatchObject({
      grossTotal: 20_000,
      discountAmount: 0,
      discountType: 'nominal',
      discountValue: 0,
      total: 20_000,
    });
    expect(data.sales[0].items[0].discount).toBe(0);
  });

  it('preserves percentage discount metadata while keeping the nominal result', () => {
    const data = normalizeData({
      ...seedData,
      sales: [{
        ...seedData.sales[0],
        grossTotal: 32_000,
        discountType: 'percentage',
        discountValue: 6.25,
        discountAmount: 2_000,
        total: 30_000,
      }],
    });

    expect(data.sales[0]).toMatchObject({
      grossTotal: 32_000,
      discountType: 'percentage',
      discountValue: 6.25,
      discountAmount: 2_000,
      total: 30_000,
    });
  });

  it('recovers a legacy line price that was migrated as zero', () => {
    const data = normalizeData({
      ...seedData,
      sales: [{
        ...seedData.sales[0],
        total: 30_000,
        items: [{
          variantId: 'v-balado', quantity: 3, unit: 'Gram', unitCost: 52,
          price: 0, discount: 0, subtotal: 30_000,
        }],
      }],
    });

    expect(data.sales[0].items[0].price).toBe(10_000);
    expect(data.sales[0].total).toBe(30_000);
  });
});
