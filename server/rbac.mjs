export function resolveUserScope(user) {
  const role = user?.role || 'guest';
  const outletId = user?.outlet_id || user?.outletId || null;
  const organizationId = user?.organization_id || user?.organizationId || null;

  let allowedLocationIds = [];
  let scopeType = 'none';

  if (role === 'owner' || role === 'admin' || role === 'finance') {
    scopeType = 'all';
    // allowedLocationIds remains empty meaning 'all', or we fetch them all if needed
  } else if (role === 'warehouse' || role === 'pic' || role === 'cashier') {
    scopeType = 'specific';
    if (outletId) allowedLocationIds = [outletId];
  }

  const permissions = new Set();
  
  if (role === 'owner') {
    ['product.view', 'product.create', 'product.update', 'product.delete',
     'location.view', 'location.create', 'location.update', 'location.delete',
     'user.view', 'user.create', 'user.update', 'user.assign_location',
     'stock.view', 'stock.initial_balance', 'stock.in', 'stock.out', 'stock.adjust', 'stock.opname',
     'transfer.view', 'transfer.create', 'transfer.send', 'transfer.receive', 'transfer.cancel',
     'sale.view', 'sale.create', 'sale.void', 'shipping.view', 'shipping.manage',
     'report.view', 'report.export', 'audit.view', 'supplier.view', 'supplier.manage',
     'pricing.view', 'pricing.manage', 'attendance.view', 'attendance.record', 'attendance.manage', 'payroll.view', 'payroll.manage',
     'cashbook.view', 'cashbook.manage'].forEach(p => permissions.add(p));
  } else if (role === 'admin') {
    ['product.view', 'product.create', 'product.update',
     'location.view', 'location.create', 'location.update',
     'user.view', 'user.create', 'user.assign_location',
     'stock.view', 'stock.initial_balance', 'stock.in', 'stock.out', 'stock.adjust', 'stock.opname',
     'transfer.view', 'transfer.create', 'transfer.send', 'transfer.receive', 'transfer.cancel',
     'sale.view', 'sale.create', 'sale.void', 'shipping.view', 'shipping.manage',
     'report.view', 'report.export', 'audit.view', 'supplier.view', 'supplier.manage', 'pricing.view', 'pricing.manage', 'attendance.view', 'attendance.record',
     'cashbook.view', 'cashbook.manage'].forEach(p => permissions.add(p));
  } else if (role === 'finance') {
    ['stock.view', 'report.view', 'report.export', 'pricing.view', 'cashbook.view', 'cashbook.manage'].forEach(p => permissions.add(p));
  } else if (role === 'warehouse') {
    ['product.view', 'location.view', 'stock.view', 'stock.in', 'stock.out', 'stock.opname',
     'transfer.view', 'transfer.create', 'transfer.send', 'shipping.view', 'shipping.manage', 'report.view', 'report.export', 'audit.view', 'attendance.view', 'attendance.record'].forEach(p => permissions.add(p));
  } else if (role === 'pic') {
    ['product.view', 'location.view', 'stock.view', 'stock.opname',
     'transfer.view', 'transfer.receive', 'transfer.create', 'transfer.send', 'sale.view', 'sale.create', 'sale.void', 'shipping.view', 'shipping.manage', 'report.view', 'report.export', 'audit.view', 'attendance.view', 'attendance.record'].forEach(p => permissions.add(p));
  } else if (role === 'cashier') {
    ['product.view', 'location.view', 'stock.view', 'sale.create', 'sale.view', 'attendance.view', 'attendance.record'].forEach(p => permissions.add(p));
  } else if (role === 'employee') {
    ['attendance.view', 'attendance.record'].forEach(p => permissions.add(p));
  }

  if (role !== 'owner' && Array.isArray(user?.rolePermissions)) {
    permissions.clear();
    user.rolePermissions.forEach(permission => permissions.add(permission));
  }

  return {
    organizationId,
    role,
    scopeType,
    allowedLocationIds,
    permissions
  };
}

export function authorizeAction({ user, action, locationId }) {
  const scope = resolveUserScope(user);

  // 1. Check if user has permission for this action
  if (!scope.permissions.has(action)) {
    return { allowed: false, reason: `Role Anda (${scope.role}) tidak memiliki izin untuk melakukan aksi ini.` };
  }

  // 2. Check location scope
  if (locationId && scope.scopeType === 'specific') {
    if (!scope.allowedLocationIds.includes(locationId)) {
      return { allowed: false, reason: `Akses ditolak: Data ini berada di lokasi lain yang tidak dapat diakses oleh Anda.` };
    }
  }

  return { allowed: true };
}
