import { describe, expect, it } from 'vitest';
import { authorizeAction } from './rbac.mjs';

const user = (role, outlet_id = 'outlet-a') => ({ role, outlet_id, organization_id: 'org-a' });

describe('server RBAC policy', () => {
  it('gives Owner full operational access', () => {
    expect(authorizeAction({ user: user('owner'), action: 'user.create' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('owner'), action: 'stock.adjust', locationId: 'outlet-b' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('owner'), action: 'shipping.evidence.view', locationId: 'outlet-b' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('owner'), action: 'shipping.evidence.manage', locationId: 'outlet-b' }).allowed).toBe(true);
  });

  it('keeps Finance read-only', () => {
    expect(authorizeAction({ user: user('finance'), action: 'report.export' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('finance'), action: 'sale.create', locationId: 'outlet-a' }).allowed).toBe(false);
  });

  it('allows Owner, Admin, and Finance to manage the cashbook', () => {
    for (const role of ['owner', 'admin', 'finance']) {
      expect(authorizeAction({ user: user(role), action: 'cashbook.view' }).allowed).toBe(true);
      expect(authorizeAction({ user: user(role), action: 'cashbook.manage' }).allowed).toBe(true);
    }
    expect(authorizeAction({ user: user('cashier'), action: 'cashbook.view' }).allowed).toBe(false);
  });

  it('limits Warehouse, PIC, and Cashier to their assigned location', () => {
    for (const role of ['warehouse', 'pic', 'cashier']) {
      expect(authorizeAction({ user: user(role), action: 'stock.view', locationId: 'outlet-b' }).allowed).toBe(false);
    }
    expect(authorizeAction({ user: user('warehouse'), action: 'stock.in', locationId: 'outlet-a' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('pic'), action: 'sale.create', locationId: 'outlet-a' }).allowed).toBe(true);
    expect(authorizeAction({ user: user('cashier'), action: 'sale.create', locationId: 'outlet-a' }).allowed).toBe(true);
  });

  it('gives operational roles local history without financial or organization-wide access', () => {
    for (const role of ['warehouse', 'pic']) {
      for (const action of ['report.view', 'report.export', 'audit.view', 'pricing.view']) {
        expect(authorizeAction({ user: user(role), action, locationId: 'outlet-a' }).allowed).toBe(false);
      }
      expect(authorizeAction({ user: user(role), action: 'audit.location.view', locationId: 'outlet-a' }).allowed).toBe(true);
      expect(authorizeAction({ user: user(role), action: 'audit.location.view', locationId: 'outlet-b' }).allowed).toBe(false);
    }
  });

  it('does not grant Cashier stock adjustment, void, or transfer permissions', () => {
    for (const action of ['stock.adjust', 'sale.void', 'stock.in', 'stock.opname', 'transfer.create']) {
      expect(authorizeAction({ user: user('cashier'), action, locationId: 'outlet-a' }).allowed).toBe(false);
    }
  });

  it('uses organization role permissions when a custom policy is attached', () => {
    const user = { role: 'cashier', outletId: 'outlet-a', organizationId: 'org-a', rolePermissions: ['stock.view', 'stock.opname'] };
    expect(authorizeAction({ user, action: 'stock.opname', locationId: 'outlet-a' }).allowed).toBe(true);
    expect(authorizeAction({ user, action: 'sale.create', locationId: 'outlet-a' }).allowed).toBe(false);
    expect(authorizeAction({ user, action: 'stock.opname', locationId: 'outlet-b' }).allowed).toBe(false);
  });

  it('applies custom employee permissions only at the assigned location', () => {
    const employee = {
      role: 'employee',
      outletId: 'outlet-a',
      organizationId: 'org-a',
      rolePermissions: ['cashbook.view', 'cashbook.manage'],
    };
    expect(authorizeAction({ user: employee, action: 'cashbook.view', locationId: 'outlet-a' }).allowed).toBe(true);
    expect(authorizeAction({ user: employee, action: 'cashbook.manage', locationId: 'outlet-a' }).allowed).toBe(true);
    expect(authorizeAction({ user: employee, action: 'cashbook.manage', locationId: 'outlet-b' }).allowed).toBe(false);
  });
});
