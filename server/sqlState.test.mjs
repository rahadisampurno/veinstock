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
    expect(insertedSale.params.slice(0, 14)).toEqual([
      'sale-1', 'org-1', 'outlet-1', 22000, 2000, 'percentage', 9.09, 20000,
      0, 20000, null, null, 'offline', 'QRIS',
    ]);

    expect(calls.filter(call => call.query === 'DELETE FROM sale_items WHERE sale_id = ?')).toHaveLength(1);
    const insertedItems = calls.filter(call => call.query.startsWith('INSERT INTO sale_items'));
    expect(insertedItems).toHaveLength(1);
    expect(insertedItems[0].params).toEqual(['sale-1', 'variant-1', 2, 6000, 10000, 0, 20000]);
  });

  it('persists an aggregated marketplace sale and hashes order IDs outside the sale row', async () => {
    const calls = [];
    const conn = {
      execute: async (query, params) => {
        calls.push({ query, params });
        return [[], []];
      },
    };
    await syncStateToSQL(conn, 'org-1', {
      locations: [], products: [], balances: [], transfers: [], movements: [], stockCounts: [],
      sales: [{
        id: 'sale-import', locationId: 'warehouse', grossTotal: 30000,
        discountAmount: 2000, total: 28000, platformFee: 7000, netPayout: 21000,
        sourcePlatform: 'tiktok', sourceImportId: 'market-import-1',
        payment: 'Transfer', items: [],
      }],
      marketplaceSkuMappings: [{
        platform: 'tiktok', externalSku: 'TIK-1', variantId: 'variant-1',
        createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
      }],
      marketplaceImports: [{
        id: 'market-import-1', platform: 'tiktok', fingerprint: 'a'.repeat(64),
        sourceFileName: 'orders.xlsx', locationId: 'warehouse', saleId: 'sale-import',
        externalOrderIds: ['order-1', 'order-2'], rowCount: 2, ignoredRowCount: 0,
        duplicateOrderCount: 0, totalQuantity: 2, grossTotal: 30000,
        discountAmount: 2000, platformFee: 7000, netPayout: 21000,
        createdAt: '2026-09-01T00:00:00.000Z', createdBy: 'owner-1',
      }],
    });

    const insertedSale = calls.find(call => call.query.startsWith('INSERT INTO sales'));
    expect(insertedSale.params.slice(8, 14)).toEqual([
      7000, 21000, 'tiktok', 'market-import-1', 'offline', 'Transfer',
    ]);
    expect(insertedSale.query).not.toContain('external_order_ids');
    const importInsert = calls.find(call => call.query.startsWith('INSERT INTO marketplace_imports'));
    expect(importInsert.query).toContain('sale_id=VALUES(sale_id)');
    expect(calls.some(call => call.query.startsWith('INSERT INTO marketplace_sku_mappings'))).toBe(true);
    const dedupInsert = calls.find(call => call.query.startsWith('INSERT INTO marketplace_order_hashes'));
    expect(dedupInsert.query).toContain('import_id=VALUES(import_id)');
    expect(dedupInsert.params).toHaveLength(6);
    expect([0, 1, 3, 4].every(index => Buffer.isBuffer(dedupInsert.params[index]))).toBe(true);
    expect([0, 1, 3, 4].every(index => dedupInsert.params[index].length === 16)).toBe(true);
    expect([dedupInsert.params[2], dedupInsert.params[5]]).toEqual([
      'market-import-1', 'market-import-1',
    ]);
  });

  it('syncs only new or changed history records when a previous state is supplied', async () => {
    const calls = [];
    const conn = {
      execute: async (query, params) => {
        calls.push({ query, params });
        return [[], []];
      },
    };
    const oldSale = {
      id: 'sale-old', locationId: 'warehouse', grossTotal: 10000,
      discountAmount: 0, discountType: 'nominal', discountValue: 0,
      total: 10000, payment: 'QRIS', channel: 'offline', items: [],
    };
    const newSale = { ...oldSale, id: 'sale-new', total: 12000, grossTotal: 12000 };
    const previous = {
      locations: [], products: [], balances: [], transfers: [], stockCounts: [],
      sales: [oldSale], movements: [{ id: 'move-old', locationId: 'warehouse', variantId: 'v1', quantity: -1 }],
      marketplaceSkuMappings: [], marketplaceImports: [],
    };
    const next = {
      ...previous,
      sales: [newSale, oldSale],
      movements: [
        { id: 'move-new', locationId: 'warehouse', variantId: 'v1', quantity: -2 },
        ...previous.movements,
      ],
    };

    await syncStateToSQL(conn, 'org-1', next, previous);

    const saleInserts = calls.filter(call => call.query.startsWith('INSERT INTO sales'));
    expect(saleInserts).toHaveLength(1);
    expect(saleInserts[0].params[0]).toBe('sale-new');
    const movementInserts = calls.filter(call => call.query.startsWith('INSERT IGNORE INTO stock_movements'));
    expect(movementInserts).toHaveLength(1);
    expect(movementInserts[0].params[0]).toBe('move-new');
  });
});
