import { describe, expect, it } from 'vitest';
import { getStateFromSQL, syncStateToSQL } from './sqlState.mjs';

describe('SQL state synchronization', () => {
  it('preserves organization role policies from the canonical snapshot', async () => {
    const policy = { menus: ['dashboard', 'help'], permissions: ['stock.view'] };
    const connection = {
      execute: async (query) => {
        if (query.startsWith('SELECT name, owner_name')) return [[{ name: 'Test' }], []];
        if (query.startsWith('SELECT version, payload')) return [[{ version: 1, payload: { rolePolicies: { pic: policy }, securityMigrations: { operationalRoleScopeV1: true } } }], []];
        return [[], []];
      },
      query: async () => [[], []],
    };
    const result = await getStateFromSQL(connection, 'org-test');
    expect(result.data.rolePolicies.pic).toEqual(policy);
    expect(result.data.securityMigrations.operationalRoleScopeV1).toBe(true);
  });
  it('stores product image URLs using the frontend imageUrl field', async () => {
    const calls = [];
    const conn = {
      execute: async (query, params) => {
        calls.push({ query, params });
        return [[], []];
      },
    };

    await syncStateToSQL(conn, 'org-1', {
      locations: [], balances: [], transfers: [], movements: [], stockCounts: [], sales: [],
      products: [{ id: 'product-1', name: 'Matcha Latte', imageUrl: 'https://images.example/matcha.webp', variants: [] }],
    });

    const productInsert = calls.find(call => call.query.startsWith('INSERT INTO products'));
    expect(productInsert.params.at(-1)).toBe('https://images.example/matcha.webp');
  });

  it('persists offline and online pricing for every variant', async () => {
    const calls = [];
    const conn = {
      execute: async (query, params) => {
        calls.push({ query, params });
        return [[], []];
      },
    };

    await syncStateToSQL(conn, 'org-1', {
      locations: [], balances: [], transfers: [], movements: [], stockCounts: [], sales: [],
      products: [{
        id: 'product-1', name: 'Keripik', category: 'Snack', unit: 'Pcs', active: true,
        variants: [{
          id: 'variant-1', name: 'Balado', sku: 'BLD', cost: 6000,
          onlineCost: 8000, price: 10000, onlinePrice: 13000,
          resellerPrice: 9000, minStock: 1, active: true,
        }],
      }],
    });

    const insert = calls.find(call => call.query.startsWith('INSERT INTO variants'));
    expect(insert.params.slice(9, 14)).toEqual([6000, 8000, 10000, 13000, 9000]);
  });

  it('rewrites sale items idempotently and removes duplicate line items', async () => {
    const calls = [];
    const conn = {
      execute: async (query, params) => {
        calls.push({ query, params });
        return [[], []];
      },
    };
    // Snapshot lama pernah menyimpan `price: 0`; sinkronisasi harus
    // memulihkannya dari subtotal agar histori dan laporan tetap benar.
    const item = { variantId: 'variant-1', quantity: 2, unitCost: 6000, price: 0, discount: 0, subtotal: 20000 };
    await syncStateToSQL(conn, 'org-1', {
      locations: [], products: [], balances: [], transfers: [], movements: [], stockCounts: [],
      sales: [{ id: 'sale-1', locationId: 'outlet-1', grossTotal: 22000, discountAmount: 2000, discountType: 'percentage', discountValue: 9.09, total: 20000, payment: 'QRIS', items: [item, { ...item }] }],
    });

    const insertedSale = calls.find(call => call.query.startsWith('INSERT INTO sales'));
    expect(insertedSale.params.slice(0, 9)).toEqual([
      'sale-1', 'org-1', 'outlet-1', 22000, 2000, 'percentage', 9.09, 20000, 'offline',
    ]);

    expect(calls.filter(call => call.query === 'DELETE FROM sale_items WHERE sale_id = ?')).toHaveLength(1);
    const insertedItems = calls.filter(call => call.query.startsWith('INSERT INTO sale_items'));
    expect(insertedItems).toHaveLength(1);
    expect(insertedItems[0].params).toEqual(['sale-1', 'variant-1', 2, 6000, 10000, 0, 20000]);
  });
});
