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

  it('rewrites sale items idempotently and removes duplicate line items', async () => {
    const calls = [];
    const conn = {
      execute: async (query, params) => {
        calls.push({ query, params });
        return [[], []];
      },
    };
    const item = { variantId: 'variant-1', quantity: 2, unitCost: 6000, price: 10000, discount: 0, subtotal: 20000 };
    await syncStateToSQL(conn, 'org-1', {
      locations: [], products: [], balances: [], transfers: [], movements: [], stockCounts: [],
      sales: [{ id: 'sale-1', locationId: 'outlet-1', total: 20000, payment: 'QRIS', items: [item, { ...item }] }],
    });

    expect(calls.filter(call => call.query === 'DELETE FROM sale_items WHERE sale_id = ?')).toHaveLength(1);
    const insertedItems = calls.filter(call => call.query.startsWith('INSERT INTO sale_items'));
    expect(insertedItems).toHaveLength(1);
    expect(insertedItems[0].params).toEqual(['sale-1', 'variant-1', 2, 6000, 10000, 0, 20000]);
  });
});
