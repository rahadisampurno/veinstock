import type { SessionUser } from '../types';

export type ActionType = 
  | 'product.view' | 'product.create' | 'product.update' | 'product.delete'
  | 'location.view' | 'location.create' | 'location.update' | 'location.delete'
  | 'user.view' | 'user.create' | 'user.update' | 'user.assign_location'
  | 'stock.view' | 'stock.initial_balance' | 'stock.in' | 'stock.out' | 'stock.adjust' | 'stock.opname'
  | 'transfer.create' | 'transfer.send' | 'transfer.receive' | 'transfer.cancel'
  | 'sale.view' | 'sale.create' | 'sale.void'
  | 'shipping.view' | 'shipping.manage'
  | 'report.view' | 'report.export'
  | 'audit.view';

export interface Scope {
  organizationId: string | null;
  role: string;
  scopeType: 'all' | 'specific' | 'none';
  allowedLocationIds: string[];
  permissions: Set<ActionType>;
}

export function resolveUserScope(user?: SessionUser | null): Scope {
  const role = user?.role || 'guest';
  const outletId = user?.outletId || null;
  const organizationId = user?.organizationId || null;

  let allowedLocationIds: string[] = [];
  let scopeType: 'all' | 'specific' | 'none' = 'none';

  if (role === 'owner' || role === 'admin' || role === 'finance') {
    scopeType = 'all';
  } else if (role === 'warehouse' || role === 'pic' || role === 'cashier') {
    scopeType = 'specific';
    if (outletId) allowedLocationIds = [outletId];
  }

  const permissions = new Set<ActionType>();
  
  if (role === 'owner') {
    ['product.view', 'product.create', 'product.update', 'product.delete',
     'location.view', 'location.create', 'location.update', 'location.delete',
     'user.view', 'user.create', 'user.update', 'user.assign_location',
     'stock.view', 'stock.initial_balance', 'stock.in', 'stock.out', 'stock.adjust', 'stock.opname',
     'transfer.create', 'transfer.send', 'transfer.receive', 'transfer.cancel',
     'sale.view', 'sale.create', 'sale.void', 'shipping.view', 'shipping.manage',
     'report.view', 'report.export', 'audit.view'].forEach(p => permissions.add(p as ActionType));
  } else if (role === 'admin') {
    ['product.view', 'product.create', 'product.update',
     'location.view', 'location.create', 'location.update',
     'user.view', 'user.create', 'user.assign_location',
     'stock.view', 'stock.initial_balance', 'stock.in', 'stock.out', 'stock.adjust', 'stock.opname',
     'transfer.create', 'transfer.send', 'transfer.receive', 'transfer.cancel',
     'sale.view', 'sale.create', 'sale.void', 'shipping.view', 'shipping.manage',
     'report.view', 'report.export'].forEach(p => permissions.add(p as ActionType));
  } else if (role === 'finance') {
    ['stock.view', 'report.view', 'report.export'].forEach(p => permissions.add(p as ActionType));
  } else if (role === 'warehouse') {
    ['product.view', 'location.view', 'stock.view', 'stock.in', 'stock.out', 'stock.opname',
     'transfer.create', 'transfer.send', 'shipping.view', 'shipping.manage', 'report.view', 'report.export'].forEach(p => permissions.add(p as ActionType));
  } else if (role === 'pic') {
    ['product.view', 'location.view', 'stock.view', 'stock.opname',
     'transfer.receive', 'transfer.create', 'transfer.send', 'sale.view', 'sale.create', 'sale.void', 'shipping.view', 'shipping.manage', 'report.view', 'report.export'].forEach(p => permissions.add(p as ActionType));
  } else if (role === 'cashier') {
    ['product.view', 'location.view', 'stock.view', 'sale.create', 'sale.view'].forEach(p => permissions.add(p as ActionType));
  }

  return {
    organizationId,
    role,
    scopeType,
    allowedLocationIds,
    permissions
  };
}

export function authorizeAction(
  user: SessionUser | null | undefined, 
  action: ActionType, 
  locationId?: string
): { allowed: boolean; reason?: string } {
  const scope = resolveUserScope(user);

  if (!scope.permissions.has(action)) {
    return { allowed: false, reason: `Akun Anda tidak memiliki izin untuk melakukan aksi ini.` };
  }

  if (locationId && scope.scopeType === 'specific') {
    if (!scope.allowedLocationIds.includes(locationId)) {
      return { allowed: false, reason: `Akses ditolak: Data ini berada di lokasi lain yang tidak dapat diakses oleh Anda.` };
    }
  }

  return { allowed: true };
}
