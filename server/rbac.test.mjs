import { describe, expect, it } from 'vitest';
import { authorizeAction } from './rbac.mjs';

const user = (role, outlet_id = 'outlet-a') => ({ role, outlet_id, organization_id: 'org-a' });

describe('server RBAC policy', () => {
  it('gives Owner full operational access', () => {
    expect(authorizeAction({ user: user('owner'), action: 'user.create' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('owner'), action: 'stock.adjust', locationId: 'outlet-b' }).allowed).toBe(true);
  });

  it('keeps Finance read-only', () => {
    expect(authorizeAction({ user: user('finance'), action: 'report.export' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('finance'), action: 'sale.create', locationId: 'outlet-a' }).allowed).toBe(false);
  });

  it('limits Warehouse, PIC, and Cashier to their assigned location', () => {
    for (const role of ['warehouse', 'pic', 'cashier']) {
      expect(authorizeAction({ user: user(role), action: 'stock.view', locationId: 'outlet-b' }).allowed).toBe(false);
    }
    expect(authorizeAction({ user: user('warehouse'), action: 'stock.in', locationId: 'outlet-a' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('pic'), action: 'sale.create', locationId: 'outlet-a' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('cashier'), action: 'sale.create', locationId: 'outlet-a' }).allowed).toBe(true);
  });

  it('does not grant Cashier stock adjustment, void, or transfer permissions', () => {
    for (const action of ['stock.adjust', 'sale.void', 'stock.in', 'stock.opname', 'transfer.create']) {
      expect(authorizeAction({ user: user('cashier'), action, locationId: 'outlet-a' }).allowed).toBe(false);
    }
  });
});
