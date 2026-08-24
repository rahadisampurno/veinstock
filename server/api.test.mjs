import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';

const port = 18787;
const base = `http://127.0.0.1:${port}`;
let server;

const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, options);
  return { status: response.status, body: await response.json() };
};
const post = (path, body, token) => request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const patch = (path, body, token) => request(path, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const decodeJwtPayload = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

beforeAll(async () => {
  server = spawn(process.execPath, ['server/index.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DB_HOST: '', JWT_SECRET: 'integration-test-secret', ALLOW_SELF_REGISTRATION: 'true', ALLOW_LEGACY_SNAPSHOT: 'true' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* server belum siap */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Server pengujian tidak siap');
});
afterAll(() => server?.kill('SIGTERM'));

describe('multi-tenant API', () => {
  it('keeps remembered devices signed in substantially longer than a normal session', async () => {
    const suffix = `${Date.now()}-remember-session`;
    const email = `owner-${suffix}@test.local`;
    const password = 'Password123!';
    expect((await post('/api/register', { organizationName: 'Remember Session', name: 'Owner', email, password })).status).toBe(201);

    const normal = await post('/api/login', { email, password, remember: false });
    const remembered = await post('/api/login', { email, password, remember: true });
    expect(normal.status).toBe(200);
    expect(remembered.status).toBe(200);

    const normalPayload = decodeJwtPayload(normal.body.token);
    const rememberedPayload = decodeJwtPayload(remembered.body.token);
    expect(normalPayload.remembered).toBe(false);
    expect(rememberedPayload.remembered).toBe(true);
    expect(normalPayload.exp - normalPayload.iat).toBe(12 * 60 * 60);
    expect(rememberedPayload.exp - rememberedPayload.iat).toBe(90 * 24 * 60 * 60);
  });

  it('allows same-origin camera and geolocation features required by stock evidence and attendance', async () => {
    const response = await fetch(`${base}/api/health`);
    expect(response.headers.get('permissions-policy')).toBe('camera=(self), microphone=(), geolocation=(self)');
  });

  it('returns a readable JSON error when login rate limiting is reached', async () => {
    const email = `rate-limit-${Date.now()}@test.local`;
    let limited;
    for (let attempt = 0; attempt < 11; attempt += 1) limited = await post('/api/login', { email, password: 'salah' });
    expect(limited.status).toBe(429);
    expect(limited.body.message).toMatch(/terlalu banyak percobaan/i);
  });

  it('stores role menu and permission policies per organization and rejects non-owner changes', async () => {
    const suffix = `${Date.now()}-role-policy`;
    const owner = await post('/api/register', { organizationName: 'Role Policy', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const policy = { menus: ['dashboard', 'reports', 'help'], permissions: ['report.view', 'report.export'] };
    expect((await post('/api/commands/role-policies', { role: 'finance', policy }, owner.body.token)).status).toBe(201);
    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(state.body.data.rolePolicies.finance).toEqual(policy);
    expect(state.body.data.movements.some(item => item.type === 'Perubahan hak akses')).toBe(true);

    const financeEmail = `finance-${suffix}@test.local`;
    const financeAccount = await post('/api/users', { name: 'Finance', email: financeEmail, password: 'Password123!', role: 'finance' }, owner.body.token);
    expect(financeAccount.status).toBe(201);
    const finance = await post('/api/login', { email: financeEmail, password: 'Password123!' });
    expect((await post('/api/commands/role-policies', { role: 'cashier', policy }, finance.body.token)).status).toBe(403);

    const currentState = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const locationId = currentState.body.data.locations[0].id;
    const livePolicy = {
      menus: ['dashboard', 'cashbook', 'business', 'help'],
      permissions: ['cashbook.view', 'cashbook.manage'],
    };
    expect((await post('/api/commands/role-policies', { role: 'finance', policy: livePolicy }, owner.body.token)).status).toBe(201);
    const financeState = await request('/api/state', { headers: { authorization: `Bearer ${finance.body.token}` } });
    expect(financeState.body.data.rolePolicies.finance).toEqual(livePolicy);
    expect((await request('/api/organization', {
      method: 'PUT',
      headers: { authorization: `Bearer ${finance.body.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Tidak boleh diubah' }),
    })).status).toBe(403);

    const transactionDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const cashEntry = {
      type: 'in', transactionDate, locationId, category: 'Uji RBAC langsung',
      amount: 1000, paymentMethod: 'Tunai', reportTreatment: 'other_income',
    };
    expect((await post('/api/commands/cashbook', { entry: cashEntry }, finance.body.token)).status).toBe(201);

    const revokedPolicy = {
      menus: ['dashboard', 'cashbook', 'business', 'help'],
      permissions: ['cashbook.view'],
    };
    expect((await post('/api/commands/role-policies', { role: 'finance', policy: revokedPolicy }, owner.body.token)).status).toBe(201);
    expect((await post('/api/commands/cashbook', { entry: { ...cashEntry, category: 'Harus ditolak' } }, finance.body.token)).status).toBe(403);

    expect((await patch(`/api/users/${financeAccount.body.user.id}`, {
      name: 'Finance menjadi karyawan', email: financeEmail, role: 'employee', active: true,
    }, owner.body.token)).status).toBe(200);
    const sameSessionAfterRoleChange = await request('/api/state', {
      headers: { authorization: `Bearer ${finance.body.token}` },
    });
    expect(sameSessionAfterRoleChange.status).toBe(200);
    expect(sameSessionAfterRoleChange.body.data.users.find(item => item.id === financeAccount.body.user.id)?.role).toBe('employee');
    expect(Object.keys(sameSessionAfterRoleChange.body.data.rolePolicies)).toEqual(['employee']);
    expect(sameSessionAfterRoleChange.body.data.cashEntries).toEqual([]);
  });

  it('records debt or receivable evidence and marks the entry paid', async () => {
    const suffix = `${Date.now()}-debt-entry`;
    const owner = await post('/api/register', { organizationName: 'Debt Ledger', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const initial = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const locationId = initial.body.data.locations[0].id;
    const created = await post('/api/commands/debts', {
      entry: {
        type: 'debt', transactionDate: '2026-08-24', dueDate: '2026-08-31',
        locationId, partyName: 'Supplier Uji', amount: 250000,
        proofUrl: 'https://example.com/invoice.jpg', note: 'Invoice bahan baku',
      },
    }, owner.body.token);
    expect(created.status).toBe(201);
    const afterCreate = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const entry = afterCreate.body.data.debtEntries[0];
    expect(entry).toMatchObject({ type: 'debt', status: 'unpaid', amount: 250000, partyName: 'Supplier Uji' });
    expect((await post('/api/commands/debts', { action: 'mark_paid', id: entry.id, paidProofUrl: 'javascript:alert(1)' }, owner.body.token)).status).toBe(400);
    const paidProofUrl = 'https://example.com/payment.jpg';
    expect((await post('/api/commands/debts', { action: 'mark_paid', id: entry.id, paidProofUrl }, owner.body.token)).status).toBe(201);
    const afterPaid = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(afterPaid.body.data.debtEntries[0].status).toBe('paid');
    expect(afterPaid.body.data.debtEntries[0].paidAt).toBeTruthy();
    expect(afterPaid.body.data.debtEntries[0].paidProofUrl).toBe(paidProofUrl);
  });

  it('deactivates and reactivates an employee account and work record together', async () => {
    const suffix = `${Date.now()}-employee-status`;
    const password = 'Password123!';
    const owner = await post('/api/register', { organizationName: 'Employee Status', name: 'Owner', email: `owner-${suffix}@test.local`, password });
    const initial = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const locationId = initial.body.data.locations[0].id;
    const staffEmail = `staff-${suffix}@test.local`;
    const account = await post('/api/users', { name: 'Staff Uji', email: staffEmail, password, role: 'employee' }, owner.body.token);
    expect(account.status).toBe(201);
    expect((await post('/api/commands/employees', { employee: { id: `emp-${suffix}`, userId: account.body.user.id, locationId, position: 'Karyawan', monthlySalary: 2500000, active: true } }, owner.body.token)).status).toBe(201);

    expect((await request(`/api/commands/employees/emp-${suffix}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ active: false }) })).status).toBe(201);
    const inactive = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(inactive.body.data.users.find(item => item.id === account.body.user.id).active).toBe(false);
    expect(inactive.body.data.employees.find(item => item.id === `emp-${suffix}`).active).toBe(false);
    expect((await post('/api/login', { email: staffEmail, password })).status).toBe(401);

    expect((await request(`/api/commands/employees/emp-${suffix}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ active: true }) })).status).toBe(201);
    expect((await post('/api/login', { email: staffEmail, password })).status).toBe(200);
  });

  it('persists an uploaded product image after the product is edited', async () => {
    const suffix = `${Date.now()}-product-image`;
    const owner = await post('/api/register', { organizationName: 'Gambar Produk', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const product = {
      id: 'product-image', name: 'Matcha Latte', category: 'Minuman', unit: 'Cup', active: true,
      variants: [{ id: 'variant-image', name: 'Reguler', sku: 'MAT-REG', cost: 10000, price: 22000, resellerPrice: 18000, minStock: 1 }],
    };
    expect((await post('/api/commands/products', { product }, owner.body.token)).status).toBe(201);

    const imageUrl = 'https://res.cloudinary.com/example/image/upload/matcha.webp';
    expect((await patch('/api/commands/products/product-image', { product: { ...product, imageUrl } }, owner.body.token)).status).toBe(201);
    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(state.body.data.products.find(item => item.id === product.id).imageUrl).toBe(imageUrl);
  });

  it('rejects products whose selling price is zero', async () => {
    const suffix = `${Date.now()}-zero-price`;
    const owner = await post('/api/register', { organizationName: 'Validasi Harga', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const product = {
      id: `product-${suffix}`, name: 'Produk Harga Nol', category: 'Uji', unit: 'Pcs', active: true,
      variants: [{ id: `variant-${suffix}`, name: 'Reguler', sku: `ZERO-${suffix}`, cost: 1000, price: 0, resellerPrice: 0, minStock: 0 }],
    };
    const response = await post('/api/commands/products', { product }, owner.body.token);
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/harga jual/i);
  });

  it('accepts a valid operational state larger than the legacy 2 MB request limit', async () => {
    const suffix = `${Date.now()}-large-state`;
    const owner = await post('/api/register', { organizationName: 'State Besar', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    expect(owner.status).toBe(201);

    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    // Catatan ini merepresentasikan riwayat operasional yang membuat payload
    // melewati limit 2 MB sebelumnya, tanpa mengubah saldo atau transaksi.
    state.body.data.auditSnapshot = 'x'.repeat(2.5 * 1024 * 1024);
    const saved = await request('/api/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` },
      body: JSON.stringify({ data: state.body.data, version: state.body.version }),
    });
    expect(saved.status).toBe(200);
  });

  it('isolates organizations and enforces finance read-only access', async () => {
    const suffix = Date.now();
    const a = await post('/api/register', { organizationName: 'Tenant A', name: 'Owner A', email: `owner-a-${suffix}@test.local`, password: 'Password123!' });
    const b = await post('/api/register', { organizationName: 'Tenant B', name: 'Owner B', email: `owner-b-${suffix}@test.local`, password: 'Password123!' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.user.organizationId).not.toBe(b.body.user.organizationId);

    const stateA = await request('/api/state', { headers: { authorization: `Bearer ${a.body.token}` } });
    const stateB = await request('/api/state', { headers: { authorization: `Bearer ${b.body.token}` } });
    expect(stateA.body.data.locations[0].name).toContain('Tenant A');
    expect(stateB.body.data.locations[0].name).toContain('Tenant B');

    stateA.body.data.locations.push({ id: 'outlet-a', name: 'Outlet A', type: 'outlet', active: true });
    const saved = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.body.token}` }, body: JSON.stringify({ data: stateA.body.data, version: stateA.body.version }) });
    expect(saved.status).toBe(200);
    const staleWrite = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${a.body.token}` }, body: JSON.stringify({ data: stateA.body.data, version: stateA.body.version }) });
    expect(staleWrite.status).toBe(409);
    const unchangedB = await request('/api/state', { headers: { authorization: `Bearer ${b.body.token}` } });
    expect(unchangedB.body.data.locations).toHaveLength(1);

    const financeEmail = `finance-${suffix}@test.local`;
    expect((await post('/api/users', { name: 'Finance', email: financeEmail, password: 'Password123!', role: 'finance' }, a.body.token)).status).toBe(201);
    const finance = await post('/api/login', { email: financeEmail, password: 'Password123!' });
    const financeWrite = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${finance.body.token}` }, body: JSON.stringify({ data: stateA.body.data, version: saved.body.version }) });
    expect(financeWrite.status).toBe(403);
  });

  it('prevents a cashier from changing stock directly but accepts an auditable sale', async () => {
    const suffix = `${Date.now()}-cashier`;
    const owner = await post('/api/register', { organizationName: 'Kasir Aman', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    expect(owner.status).toBe(201);

    const ownerState = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    ownerState.body.data.locations.push({ id: 'outlet-kasir', name: 'Outlet Kasir', type: 'outlet', active: true });
    ownerState.body.data.products.push({
      id: 'product-kasir', name: 'Snack', category: 'Snack', unit: 'Pcs', active: true,
      variants: [{ id: 'variant-kasir', name: 'Original', sku: 'SNK-001', cost: 5000, price: 10000, resellerPrice: 8000, minStock: 1 }],
    });
    ownerState.body.data.balances.push({ locationId: 'outlet-kasir', variantId: 'variant-kasir', quantity: 5 });
    const prepared = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ data: ownerState.body.data, version: ownerState.body.version }) });
    expect(prepared.status).toBe(200);

    const cashierEmail = `cashier-${suffix}@test.local`;
    expect((await post('/api/users', { name: 'Kasir', email: cashierEmail, password: 'Password123!', role: 'cashier', outletId: 'outlet-kasir' }, owner.body.token)).status).toBe(201);
    const cashier = await post('/api/login', { email: cashierEmail, password: 'Password123!' });
    const cashierState = await request('/api/state', { headers: { authorization: `Bearer ${cashier.body.token}` } });
    expect(cashierState.body.data.products[0].variants[0].cost).toBeUndefined();
    expect(cashierState.body.data.products[0].variants[0].price).toBe(10000);

    const forged = structuredClone(cashierState.body.data);
    forged.balances[0].quantity += 99;
    const denied = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${cashier.body.token}` }, body: JSON.stringify({ data: forged, version: cashierState.body.version }) });
    expect(denied.status).toBe(403);

    const valid = structuredClone(cashierState.body.data);
    valid.sales.unshift({ id: 'sale-kasir', locationId: 'outlet-kasir', channel: 'offline', total: 10000, payment: 'QRIS', createdAt: new Date().toISOString(), items: [{ variantId: 'variant-kasir', quantity: 1, unit: 'Pcs', unitCost: 5000, subtotal: 5000 }] });
    valid.balances[0].quantity -= 1;
    valid.movements.unshift({ id: 'movement-kasir', locationId: 'outlet-kasir', variantId: 'variant-kasir', quantity: -1, type: 'Penjualan offline', note: '1 Pcs', user: 'Kasir', createdAt: new Date().toISOString() });
    const accepted = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${cashier.body.token}` }, body: JSON.stringify({ data: valid, version: cashierState.body.version }) });
    expect(accepted.status).toBe(200);
  });

  it('keeps a multi-variant transfer consistent between Owner and assigned PIC', async () => {
    const suffix = `${Date.now()}-transfer`;
    const owner = await post('/api/register', { organizationName: 'Transfer Sinkron', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    expect(owner.status).toBe(201);

    const initial = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    initial.body.data.locations.push(
      { id: 'warehouse-transfer', name: 'Gudang Transfer', type: 'warehouse', active: true },
      { id: 'outlet-transfer', name: 'Outlet Transfer', type: 'outlet', active: true },
    );
    initial.body.data.products.push({
      id: 'product-transfer', name: 'Snack Transfer', category: 'Snack', unit: 'Pcs', active: true,
      variants: [
        { id: 'variant-transfer-a', name: 'Pedas', sku: 'TRF-A', cost: 1000, price: 2000, resellerPrice: 1500, minStock: 1 },
        { id: 'variant-transfer-b', name: 'Original', sku: 'TRF-B', cost: 1000, price: 2000, resellerPrice: 1500, minStock: 1 },
      ],
    });
    initial.body.data.balances.push(
      { locationId: 'warehouse-transfer', variantId: 'variant-transfer-a', quantity: 50 },
      { locationId: 'warehouse-transfer', variantId: 'variant-transfer-b', quantity: 50 },
    );
    const prepared = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ data: initial.body.data, version: initial.body.version }) });
    expect(prepared.status).toBe(200);

    const ownerWithStock = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const dispatch = structuredClone(ownerWithStock.body.data);
    const code = `TRF-${suffix}`;
    dispatch.transfers.push(
      { id: 'transfer-a', transferCode: code, fromId: 'warehouse-transfer', toId: 'outlet-transfer', variantId: 'variant-transfer-a', quantity: 4, status: 'sent', createdAt: new Date().toISOString() },
      { id: 'transfer-b', transferCode: code, fromId: 'warehouse-transfer', toId: 'outlet-transfer', variantId: 'variant-transfer-b', quantity: 6, status: 'sent', createdAt: new Date().toISOString() },
    );
    dispatch.balances.find(b => b.locationId === 'warehouse-transfer' && b.variantId === 'variant-transfer-a').quantity -= 4;
    dispatch.balances.find(b => b.locationId === 'warehouse-transfer' && b.variantId === 'variant-transfer-b').quantity -= 6;
    dispatch.movements.push(
      { id: 'movement-transfer-a', locationId: 'warehouse-transfer', variantId: 'variant-transfer-a', quantity: -4, type: 'Transfer keluar', note: code, user: 'Owner', createdAt: new Date().toISOString() },
      { id: 'movement-transfer-b', locationId: 'warehouse-transfer', variantId: 'variant-transfer-b', quantity: -6, type: 'Transfer keluar', note: code, user: 'Owner', createdAt: new Date().toISOString() },
    );
    const sent = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ data: dispatch, version: ownerWithStock.body.version }) });
    expect(sent.status).toBe(200);

    const picEmail = `pic-${suffix}@test.local`;
    expect((await post('/api/users', { name: 'PIC', email: picEmail, password: 'Password123!', role: 'pic', outletId: 'outlet-transfer' }, owner.body.token)).status).toBe(201);
    const pic = await post('/api/login', { email: picEmail, password: 'Password123!' });
    const picState = await request('/api/state', { headers: { authorization: `Bearer ${pic.body.token}` } });
    expect(picState.body.data.transfers).toHaveLength(2);
    expect(new Set(picState.body.data.transfers.map(item => item.transferCode))).toEqual(new Set([code]));
    expect(picState.body.data.locations.map(location => location.id)).toEqual(['outlet-transfer']);
    expect(picState.body.data.transfers.every(item => item.fromName === 'Gudang Transfer' && item.toName === 'Outlet Transfer')).toBe(true);

    const received = structuredClone(picState.body.data);
    received.transfers.forEach(item => { item.status = 'received'; item.receivedAt = new Date().toISOString(); });
    received.balances.push(
      { locationId: 'outlet-transfer', variantId: 'variant-transfer-a', quantity: 4 },
      { locationId: 'outlet-transfer', variantId: 'variant-transfer-b', quantity: 6 },
    );
    received.movements.push(
      { id: 'movement-receive-a', locationId: 'outlet-transfer', variantId: 'variant-transfer-a', quantity: 4, type: 'Transfer diterima', note: code, user: 'PIC', createdAt: new Date().toISOString() },
      { id: 'movement-receive-b', locationId: 'outlet-transfer', variantId: 'variant-transfer-b', quantity: 6, type: 'Transfer diterima', note: code, user: 'PIC', createdAt: new Date().toISOString() },
    );
    const accepted = await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${pic.body.token}` }, body: JSON.stringify({ data: received, version: picState.body.version }) });
    expect(accepted.status).toBe(200);

    const finalOwnerState = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const balances = finalOwnerState.body.data.balances;
    expect(balances.find(b => b.locationId === 'warehouse-transfer' && b.variantId === 'variant-transfer-a').quantity).toBe(46);
    expect(balances.find(b => b.locationId === 'warehouse-transfer' && b.variantId === 'variant-transfer-b').quantity).toBe(44);
    expect(balances.find(b => b.locationId === 'outlet-transfer' && b.variantId === 'variant-transfer-a').quantity).toBe(4);
    expect(balances.find(b => b.locationId === 'outlet-transfer' && b.variantId === 'variant-transfer-b').quantity).toBe(6);
    expect(finalOwnerState.body.data.transfers.filter(item => item.transferCode === code).every(item => item.status === 'received')).toBe(true);
  });

  it('commits POS and transfer commands on the server across refreshes', async () => {
    const suffix = `${Date.now()}-commands`;
    const owner = await post('/api/register', { organizationName: 'Command Aman', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    expect(owner.status).toBe(201);
    const initial = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    initial.body.data.locations.push({ id: 'outlet-command', name: 'Outlet Command', type: 'outlet', active: true });
    initial.body.data.products.push({
      id: 'product-command', name: 'Snack Command', category: 'Snack', unit: 'Pcs', active: true,
      variants: [{ id: 'variant-command', name: 'Pedas', sku: 'CMD-001', cost: 1000, price: 2500, resellerPrice: 2000, minStock: 1 }],
    });
    initial.body.data.balances.push({ locationId: 'loc-owner', variantId: 'variant-command', quantity: 20 });
    expect((await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ data: initial.body.data, version: initial.body.version }) })).status).toBe(200);

    const sendProofUrl = `https://example.test/transfers/${suffix}-sent.webp`;
    const receiveProofUrl = `https://example.test/transfers/${suffix}-received.webp`;
    const sent = await post('/api/commands/transfers', { fromId: 'loc-owner', toId: 'outlet-command', sendProofUrl, items: [{ variantId: 'variant-command', quantity: 10 }] }, owner.body.token);
    expect(sent.status).toBe(201);
    const afterSend = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const transferCode = afterSend.body.data.transfers[0].transferCode;
    expect(afterSend.body.data.transfers[0].sendProofUrl).toBe(sendProofUrl);
    expect(afterSend.body.data.transfers[0].createdBy).toBe(owner.body.user.id);
    expect(afterSend.body.data.balances.find(b => b.locationId === 'loc-owner' && b.variantId === 'variant-command').quantity).toBe(10);

    const picEmail = `pic-command-${suffix}@test.local`;
    expect((await post('/api/users', { name: 'PIC Command', email: picEmail, password: 'Password123!', role: 'pic', outletId: 'outlet-command' }, owner.body.token)).status).toBe(201);
    const pic = await post('/api/login', { email: picEmail, password: 'Password123!' });
    expect((await post(`/api/commands/transfers/${encodeURIComponent(transferCode)}/receive`, { receiveProofUrl }, pic.body.token)).status).toBe(201);
    const afterReceive = await request('/api/state', { headers: { authorization: `Bearer ${pic.body.token}` } });
    expect(afterReceive.body.data.balances.find(b => b.locationId === 'outlet-command' && b.variantId === 'variant-command').quantity).toBe(10);
    expect(afterReceive.body.data.transfers.find(item => item.transferCode === transferCode).receiveProofUrl).toBe(receiveProofUrl);
    expect(afterReceive.body.data.transfers.find(item => item.transferCode === transferCode).receivedBy).toBe(pic.body.user.id);

    const sale = await post('/api/commands/sales', { locationId: 'outlet-command', channel: 'offline', payment: 'Tunai', items: [{ variantId: 'variant-command', quantity: 3 }] }, pic.body.token);
    expect(sale.status).toBe(201);
    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${pic.body.token}` } });
    expect(refreshed.body.data.sales).toHaveLength(1);
    expect(refreshed.body.data.sales[0].total).toBe(7500);
    expect(refreshed.body.data.balances.find(b => b.locationId === 'outlet-command' && b.variantId === 'variant-command').quantity).toBe(7);
  });

  it('keeps printed sales pending until confirmation and safely restores stock when print is aborted', async () => {
    const suffix = `${Date.now()}-print-flow`;
    const owner = await post('/api/register', { organizationName: 'Print Flow', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    state.body.data.products.push({ id: `product-${suffix}`, name: 'Produk Print', category: 'Test', unit: 'Pcs', active: true, variants: [{ id: `variant-${suffix}`, name: 'Varian', sku: `SKU-${suffix}`, cost: 100, price: 500, resellerPrice: 400, minStock: 1 }] });
    state.body.data.balances.push({ locationId: 'loc-owner', variantId: `variant-${suffix}`, quantity: 10 });
    expect((await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ data: state.body.data, version: state.body.version }) })).status).toBe(200);

    expect((await post('/api/commands/sales', { locationId: 'loc-owner', channel: 'offline', payment: 'Tunai', requiresPrint: true, items: [{ variantId: `variant-${suffix}`, quantity: 2 }] }, owner.body.token)).status).toBe(201);
    let refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const firstSale = refreshed.body.data.sales[0];
    expect(firstSale.status).toBe('pending_print');
    expect(refreshed.body.data.balances.find(item => item.locationId === 'loc-owner' && item.variantId === `variant-${suffix}`).quantity).toBe(8);
    expect((await post(`/api/commands/sales/${firstSale.id}/finalize-print`, {}, owner.body.token)).status).toBe(201);
    refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.sales.find(item => item.id === firstSale.id)).toEqual(expect.objectContaining({ status: 'completed', printedBy: owner.body.user.id }));
    expect((await post(`/api/commands/sales/${firstSale.id}/finalize-print`, {}, owner.body.token)).status).toBe(400);

    await post('/api/commands/sales', { locationId: 'loc-owner', channel: 'offline', payment: 'Tunai', requiresPrint: true, items: [{ variantId: `variant-${suffix}`, quantity: 3 }] }, owner.body.token);
    refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const abortedSale = refreshed.body.data.sales.find(item => item.status === 'pending_print');
    expect((await post(`/api/commands/sales/${abortedSale.id}/abort-print`, {}, owner.body.token)).status).toBe(201);
    refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.sales.find(item => item.id === abortedSale.id).status).toBe('voided');
    expect(refreshed.body.data.balances.find(item => item.locationId === 'loc-owner' && item.variantId === `variant-${suffix}`).quantity).toBe(8);
  });

  it('commits employee, attendance, loan, and payroll commands without a browser snapshot', async () => {
    const suffix = `${Date.now()}-people`;
    const owner = await post('/api/register', { organizationName: 'SDM Command', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    expect(owner.status).toBe(201);
    const employeeEmail = `employee-${suffix}@test.local`;
    const createdUser = await post('/api/users', { name: 'Staf Gudang', email: employeeEmail, password: 'Password123!', role: 'warehouse', outletId: 'loc-owner' }, owner.body.token);
    expect(createdUser.status).toBe(201);
    const employee = { id: `emp-${suffix}`, userId: createdUser.body.user.id, locationId: 'loc-owner', position: 'Kasir', monthlySalary: 3000000, active: true };
    expect((await post('/api/commands/employees', { employee }, owner.body.token)).status).toBe(201);

    const secondWarehouse = { id: `warehouse-${suffix}`, name: 'Gudang Kedua', type: 'warehouse', active: true };
    expect((await post('/api/commands/locations', { location: secondWarehouse }, owner.body.token)).status).toBe(201);
    expect((await patch(`/api/commands/employees/${employee.id}`, { employee: { ...employee, locationId: secondWarehouse.id } }, owner.body.token)).status).toBe(201);

    const staff = await post('/api/login', { email: employeeEmail, password: 'Password123!' });
    expect(staff.body.user.outletId).toBe(secondWarehouse.id);
    expect((await post('/api/commands/attendance', { kind: 'in', latitude: -6.2, longitude: 106.8, capturedAt: '2026-07-31T01:10:00.000Z' }, staff.body.token)).status).toBe(201);
    expect((await post('/api/commands/attendance', { kind: 'out', latitude: -6.2, longitude: 106.8, capturedAt: '2026-07-31T09:10:00.000Z' }, staff.body.token)).status).toBe(201);
    expect((await post('/api/commands/live-sessions', { session: { name: 'Live tanpa jadwal pasti', platform: 'TikTok', locationId: secondWarehouse.id, hostEmployeeIds: [employee.id], note: 'Uji sesi aktual' } }, owner.body.token)).status).toBe(201);
    let liveState = await request('/api/state', { headers: { authorization: `Bearer ${staff.body.token}` } });
    const liveSession = liveState.body.data.liveSessions.find(item => item.name === 'Live tanpa jadwal pasti');
    expect(liveSession).toEqual(expect.objectContaining({ status: 'scheduled', hostEmployeeIds: [employee.id] }));
    expect(liveSession.scheduledAt).toBeUndefined();
    expect((await post(`/api/commands/live-sessions/${liveSession.id}/start`, { capturedAt: '2026-07-31T10:00:00.000Z' }, staff.body.token)).status).toBe(201);
    expect((await post(`/api/commands/live-sessions/${liveSession.id}/end`, { capturedAt: '2026-07-31T11:20:00.000Z' }, staff.body.token)).status).toBe(201);
    // Nilai cicilan dari browser tidak dipercaya. Server harus menghitung
    // ulang Rp2.000 / 3 menjadi Rp667 dan mengabaikan nilai kiriman yang salah.
    const loan = { id: `loan-${suffix}`, employeeId: employee.id, loanDate: '2026-07-31', amount: 2000, installmentCount: 3, installmentAmount: 1, paidInstallments: 0, status: 'active' };
    expect((await post('/api/commands/loans', { loan: { ...loan, id: `${loan.id}-invalid`, installmentCount: 0 } }, owner.body.token)).status).toBe(400);
    expect((await post('/api/commands/loans', { loan }, owner.body.token)).status).toBe(201);
    expect((await post('/api/commands/loans', { loan }, owner.body.token)).status).toBe(400);
    expect((await post(`/api/commands/loans/${loan.id}/installments`, {}, owner.body.token)).status).toBe(201);
    const payroll = { id: `payroll-${suffix}`, employeeId: employee.id, period: '2026-07', grossAmount: 1, status: 'paid' };
    expect((await post('/api/commands/payrolls', { payroll: { ...payroll, id: `${payroll.id}-invalid`, period: '2026-13' } }, owner.body.token)).status).toBe(400);
    expect((await post('/api/commands/payrolls', { payroll }, owner.body.token)).status).toBe(201);
    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.employees).toContainEqual(expect.objectContaining({ id: employee.id }));
    expect(refreshed.body.data.attendances).toContainEqual(expect.objectContaining({ employeeId: employee.id, checkInAt: expect.any(String), checkOutAt: expect.any(String) }));
    expect(refreshed.body.data.liveSessions).toContainEqual(expect.objectContaining({
      id: liveSession.id,
      status: 'completed',
      startedAt: '2026-07-31T10:00:00.000Z',
      endedAt: '2026-07-31T11:20:00.000Z',
    }));
    expect(refreshed.body.data.loans).toContainEqual(expect.objectContaining({ id: loan.id, amount: 2000, installmentCount: 3, installmentAmount: 667, paidInstallments: 1, status: 'active' }));
    expect(refreshed.body.data.payrolls).toContainEqual(expect.objectContaining({
      id: payroll.id,
      period: '2026-07',
      grossAmount: 3000000,
      employeeName: 'Staf Gudang',
      positionSnapshot: 'Kasir',
      locationNameSnapshot: 'Gudang Kedua',
    }));
  });

  it('keeps master supplier and its receipt reference after refresh', async () => {
    const suffix = `${Date.now()}-supplier`;
    const owner = await post('/api/register', { organizationName: 'Supplier Command', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const supplier = { id: `sup-${suffix}`, name: 'CV Bahan Snack', phone: '08123456789', active: true };
    expect((await post('/api/commands/suppliers', { supplier }, owner.body.token)).status).toBe(201);
    const updatedSupplier = { ...supplier, name: 'CV Bahan Snack Terbarui', address: 'Bandung' };
    expect((await patch(`/api/commands/suppliers/${supplier.id}`, { supplier: updatedSupplier }, owner.body.token)).status).toBe(201);
    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    state.body.data.products.push({ id: `prd-${suffix}`, name: 'Keripik', category: 'Snack', unit: 'Pcs', active: true, variants: [{ id: `var-${suffix}`, name: 'Original', sku: `SUP-${suffix}`, cost: 1000, price: 2000, resellerPrice: 1500, minStock: 1 }] });
    expect((await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ data: state.body.data, version: state.body.version }) })).status).toBe(200);
    const proofUrl = `https://example.test/receipts/${suffix}.webp`;
    expect((await post('/api/commands/receipts', { locationId: 'loc-owner', sourceType: 'supplier', supplierId: supplier.id, supplierName: supplier.name, proofUrl, items: [{ variantId: `var-${suffix}`, quantity: 4, unitCost: 1000 }] }, owner.body.token)).status).toBe(201);
    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.suppliers).toContainEqual(expect.objectContaining({ id: supplier.id, name: updatedSupplier.name, address: 'Bandung' }));
    expect(refreshed.body.data.receipts).toContainEqual(expect.objectContaining({ supplierId: supplier.id, variantId: `var-${suffix}`, proofUrl }));
  });

  it('records packing scans and finalizes an expedition handover batch without duplicates', async () => {
    const suffix = `${Date.now()}-shipping`;
    const owner = await post('/api/register', { organizationName: 'Pengiriman Aman', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const trackingNumber = `SPXID${Date.now()}`;
    expect((await post('/api/commands/shipping/ready', { trackingNumber, locationId: 'loc-owner', marketplace: 'Shopee' }, owner.body.token)).status).toBe(201);
    expect((await post('/api/commands/shipping/ready', { trackingNumber, locationId: 'loc-owner', marketplace: 'Shopee' }, owner.body.token)).status).toBe(400);
    const jneTrackingNumber = `JNE${Date.now()}AUTO`;
    expect((await post('/api/commands/shipping/ready', { trackingNumber: jneTrackingNumber, locationId: 'loc-owner', marketplace: 'Tokopedia' }, owner.body.token)).status).toBe(201);
    const unknownTrackingNumber = `UNKNOWN${Date.now()}`;
    expect((await post('/api/commands/shipping/ready', { trackingNumber: unknownTrackingNumber, locationId: 'loc-owner', marketplace: 'Website' }, owner.body.token)).status).toBe(201);
    const batchCode = `KRM-${Date.now()}`;
    expect((await post('/api/commands/shipping/handover/scan', { trackingNumber, locationId: 'loc-owner', carrier: 'SPX Express', batchCode }, owner.body.token)).status).toBe(201);
    expect((await post('/api/commands/shipping/handover/finalize', { batchCode, courierName: 'Kurir SPX', vehicleNumber: 'B 1234 XYZ' }, owner.body.token)).status).toBe(201);
    const sicepatBatchCode = `KRM-SC-${Date.now()}`;
    expect((await post('/api/commands/shipping/handover/scan', { trackingNumber: unknownTrackingNumber, locationId: 'loc-owner', carrier: 'SiCepat', batchCode: sicepatBatchCode }, owner.body.token)).status).toBe(201);
    expect((await post('/api/commands/shipping/handover/finalize', { batchCode: sicepatBatchCode, courierName: 'Kurir SiCepat' }, owner.body.token)).status).toBe(201);
    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.shipments).toContainEqual(expect.objectContaining({ trackingNumber, carrier: 'SPX Express', status: 'handed_over', handoverBatchCode: batchCode }));
    expect(refreshed.body.data.shipments).toContainEqual(expect.objectContaining({ trackingNumber: jneTrackingNumber, carrier: 'JNE', status: 'ready' }));
    expect(refreshed.body.data.shipments).toContainEqual(expect.objectContaining({ trackingNumber: unknownTrackingNumber, carrier: 'SiCepat', status: 'handed_over', handoverBatchCode: sicepatBatchCode }));
    expect(refreshed.body.data.shipmentHandovers).toContainEqual(expect.objectContaining({ batchCode, status: 'completed', courierName: 'Kurir SPX' }));
  });

  it('supports bulk shipping, restores draft batches, and audits package corrections', async () => {
    const suffix = `${Date.now()}-shipping-correction`;
    const owner = await post('/api/register', { organizationName: 'Pengiriman Koreksi', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const trackingNumbers = [`SPXID${Date.now()}A`, `SPXID${Date.now()}B`];
    expect((await post('/api/commands/shipping/ready/bulk', { trackingNumbers, locationId: 'loc-owner', marketplace: 'Shopee' }, owner.body.token)).status).toBe(201);
    const batchCode = `KRM-CORRECTION-${Date.now()}`;
    expect((await post('/api/commands/shipping/handover/scan/bulk', { trackingNumbers, locationId: 'loc-owner', carrier: 'SPX Express', batchCode }, owner.body.token)).status).toBe(201);

    expect((await post('/api/commands/shipping/handover/remove', { trackingNumber: trackingNumbers[0], batchCode, reason: 'Salah memasukkan paket' }, owner.body.token)).status).toBe(201);
    expect((await post('/api/commands/shipping/handover/remove', { trackingNumber: trackingNumbers[1], batchCode, reason: 'Batch kurir diganti' }, owner.body.token)).status).toBe(201);
    let refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const packageToCancel = refreshed.body.data.shipments.find((item) => item.trackingNumber === trackingNumbers[0]);
    expect(packageToCancel).toEqual(expect.objectContaining({ status: 'ready' }));
    expect(refreshed.body.data.shipmentHandovers).toContainEqual(expect.objectContaining({ batchCode, status: 'cancelled' }));

    expect((await post(`/api/commands/shipping/packages/${packageToCancel.id}/cancel`, { reason: 'Nomor resi salah ditempel' }, owner.body.token)).status).toBe(201);
    expect((await post('/api/commands/shipping/ready', { trackingNumber: trackingNumbers[0], locationId: 'loc-owner', marketplace: 'Shopee' }, owner.body.token)).status).toBe(201);
    refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.shipments.filter((item) => item.trackingNumber === trackingNumbers[0])).toHaveLength(1);
    const restoredPackage = refreshed.body.data.shipments.find((item) => item.trackingNumber === trackingNumbers[0]);
    expect(restoredPackage).toEqual(expect.objectContaining({ trackingNumber: trackingNumbers[0], status: 'ready' }));
    expect(restoredPackage.cancelReason).toBeUndefined();
    expect(refreshed.body.data.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'Koreksi batch pengiriman' }),
      expect.objectContaining({ type: 'Pembatalan paket pengiriman' }),
    ]));
  });

  it('synchronizes a saved HPP recipe to the selected variant master costs', async () => {
    const suffix = `${Date.now()}-hpp-sync`;
    const owner = await post('/api/register', { organizationName: 'HPP Sinkron', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const variantIds = [`variant-a-${suffix}`, `variant-b-${suffix}`];
    const product = {
      id: `product-${suffix}`, name: 'Produk Resep Bersama', category: 'Uji', unit: 'Pcs', active: true,
      variants: variantIds.map((id, index) => ({ id, name: `Varian ${index + 1}`, sku: `HPP-${index}-${suffix}`, cost: 100, price: 2000, resellerPrice: 1500, minStock: 1 })),
    };
    expect((await post('/api/commands/products', { product }, owner.body.token)).status).toBe(201);
    const recipe = {
      id: `recipe-${suffix}`, variantId: variantIds[0], variantIds, name: 'Resep Bersama', yieldQuantity: 5, yieldUnit: 'Pcs', targetMargin: 35, updatedAt: new Date().toISOString(),
      materials: [{ id: 'material-1', name: 'Bahan', quantity: 2, unit: 'Pcs', unitCost: 1000 }],
      additionalCosts: [{ id: 'cost-1', name: 'Kemasan', category: 'kemasan', amount: 500 }],
    };
    const saved = await post('/api/commands/pricing', { pricing: { hppRecipes: [recipe], marketplaceConfigs: [] }, syncVariantCosts: true, syncedRecipeId: recipe.id }, owner.body.token);
    expect(saved.status).toBe(201);
    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    const updatedProduct = refreshed.body.data.products.find(item => item.id === product.id);
    expect(updatedProduct.variants.map(item => item.cost)).toEqual([500, 500]);
  });

  it('publishes an HPP profile to Product & Variant and stores an explicit link atomically', async () => {
    const suffix = `${Date.now()}-hpp-publish`;
    const owner = await post('/api/register', { organizationName: 'HPP Publish', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const profileId = `profile-${suffix}`;
    const batchId = `batch-${suffix}`;
    const packageId = `package-${suffix}`;
    const profile = {
      id: profileId, name: 'Mie Kremes', masterItems: [{ id: `master-${suffix}`, name: 'Mie', unit: 'Gram', unitCost: 32 }],
      packages: [{ id: packageId, name: '150 gram', contentWeight: 150, packagingCost: 400, targetProfit: 3000 }],
      operations: { packingCost: 1000, employeeCost: 500, onlineAdsCost: 2000, tiktokAdditionalCost: 1250, tiktokNetRate: 0.7 },
      batches: [{ id: batchId, name: 'Balado - Pedas', flavor: 'Balado', spiceLevel: 'Pedas', ingredients: [{ id: `line-${suffix}`, masterItemId: `master-${suffix}`, quantity: 3600 }], updatedAt: new Date().toISOString() }],
      updatedAt: new Date().toISOString(),
    };
    expect((await post('/api/commands/pricing', { pricing: { hppProductProfiles: [profile], hppRecipes: [], marketplaceConfigs: [] } }, owner.body.token)).status).toBe(201);

    const product = {
      id: `product-${suffix}`, name: 'Mie Kremes', category: 'Makanan', unit: 'Pcs', active: true,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/mie-kremes.webp',
      variants: [{
        id: `variant-${suffix}`, name: 'Balado · Pedas · 150 gram', sku: `HPP-${suffix}`,
        cost: 6700, price: 9700, resellerPrice: 9700, minStock: 0, active: true,
        hppProfileId: profileId, hppBatchId: batchId, hppPackageId: packageId,
      }],
    };
    const published = await post('/api/commands/pricing/publish-product', { profileId, product }, owner.body.token);
    expect(published.status).toBe(201);

    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.products).toContainEqual(expect.objectContaining({
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
    }));
    const publishedProduct = refreshed.body.data.products.find(item => item.id === product.id);
    expect(publishedProduct.variants).toContainEqual(expect.objectContaining({
      id: product.variants[0].id,
      hppProfileId: profileId,
      hppBatchId: batchId,
      hppPackageId: packageId,
      active: true,
    }));
    expect(refreshed.body.data.pricing.hppProductProfiles[0].productId).toBe(product.id);
    expect(refreshed.body.data.pricing.hppRecipes).toContainEqual(expect.objectContaining({
      profileId,
      variantId: product.variants[0].id,
      batchId,
      packageId,
    }));
  });

  it('serializes concurrent sales so the last unit cannot be oversold', async () => {
    const suffix = `${Date.now()}-concurrent-sale`;
    const owner = await post('/api/register', { organizationName: 'Concurrency Aman', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const product = {
      id: `product-${suffix}`, name: 'Unit Terakhir', category: 'Uji', unit: 'Pcs', active: true,
      variants: [{ id: `variant-${suffix}`, name: 'Reguler', sku: `LAST-${suffix}`, cost: 1000, price: 2000, resellerPrice: 1500, minStock: 0 }],
    };
    expect((await post('/api/commands/products', { product, initialStocks: [{ locationId: 'loc-owner', variantId: `variant-${suffix}`, quantity: 1 }] }, owner.body.token)).status).toBe(201);

    const payload = { locationId: 'loc-owner', channel: 'offline', payment: 'Tunai', items: [{ variantId: `variant-${suffix}`, quantity: 1 }] };
    const results = await Promise.all([post('/api/commands/sales', payload, owner.body.token), post('/api/commands/sales', payload, owner.body.token)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 400]);
    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(state.body.data.sales).toHaveLength(1);
    expect(state.body.data.balances.find(item => item.locationId === 'loc-owner' && item.variantId === `variant-${suffix}`).quantity).toBe(0);
  });

  it('refuses to deactivate a location that still has staff or stock', async () => {
    const suffix = `${Date.now()}-location-guard`;
    const owner = await post('/api/register', { organizationName: 'Lokasi Aman', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const location = { id: `outlet-${suffix}`, name: 'Outlet Aktif', type: 'outlet', address: '', active: true, isCentralWarehouse: false };
    expect((await post('/api/commands/locations', { location }, owner.body.token)).status).toBe(201);
    expect((await post('/api/users', { name: 'PIC Aktif', email: `pic-${suffix}@test.local`, password: 'Password123!', role: 'pic', outletId: location.id }, owner.body.token)).status).toBe(201);
    const denied = await patch(`/api/commands/locations/${location.id}`, { location: { ...location, active: false } }, owner.body.token);
    expect(denied.status).toBe(400);
    expect(denied.body.message).toMatch(/dipakai oleh staf/i);
  });

  it('rejects invalid and duplicate operational input without changing stock', async () => {
    const suffix = `${Date.now()}-negative-cases`;
    const owner = await post('/api/register', { organizationName: 'Validasi Ketat', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const outlet = { id: `outlet-${suffix}`, name: 'Outlet Tujuan', type: 'outlet', active: true };
    expect((await post('/api/commands/locations', { location: outlet }, owner.body.token)).status).toBe(201);
    const product = {
      id: `product-${suffix}`, name: 'Produk Validasi', category: 'Uji', unit: 'Pcs', active: true,
      variants: [{ id: `variant-${suffix}`, name: 'Reguler', sku: `NEG-${suffix}`, barcode: `20${String(Date.now()).slice(-10)}0`, cost: 1000, price: 2000, resellerPrice: 1500, minStock: 0 }],
    };
    expect((await post('/api/commands/products', { product, initialStocks: [{ locationId: 'loc-owner', variantId: `variant-${suffix}`, quantity: 3 }] }, owner.body.token)).status).toBe(201);

    const invalidResults = await Promise.all([
      post('/api/commands/sales', { locationId: 'loc-owner', channel: 'offline', payment: 'Tunai', items: [{ variantId: `variant-${suffix}`, quantity: 4 }] }, owner.body.token),
      post('/api/commands/transfers', { fromId: 'loc-owner', toId: 'loc-owner', items: [{ variantId: `variant-${suffix}`, quantity: 1 }] }, owner.body.token),
      post('/api/commands/transfers', { fromId: 'loc-owner', toId: outlet.id, items: [{ variantId: `variant-${suffix}`, quantity: 4 }] }, owner.body.token),
      post('/api/commands/returns', { type: 'supplier', locationId: 'loc-owner', reason: 'Jumlah melebihi stok', items: [{ variantId: `variant-${suffix}`, quantity: 4 }] }, owner.body.token),
      post('/api/commands/opnames', { locationId: 'loc-owner', items: [{ variantId: `variant-${suffix}`, actualQty: -1, reason: 'Tidak valid' }] }, owner.body.token),
      post('/api/commands/products', { product: { ...product, id: `${product.id}-duplicate`, variants: [{ ...product.variants[0], id: `${product.variants[0].id}-duplicate` }] } }, owner.body.token),
    ]);
    expect(invalidResults.map(result => ({ status: result.status, message: result.body.message }))).toEqual([
      expect.objectContaining({ status: 400 }),
      expect.objectContaining({ status: 400 }),
      expect.objectContaining({ status: 400 }),
      expect.objectContaining({ status: 400 }),
      expect.objectContaining({ status: 400 }),
      expect.objectContaining({ status: 400 }),
    ]);
    expect((await post('/api/users', { name: 'Duplikat', email: owner.body.user.email, password: 'Password123!', role: 'finance' }, owner.body.token)).status).toBe(409);
    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(state.body.data.balances.find(item => item.locationId === 'loc-owner' && item.variantId === `variant-${suffix}`).quantity).toBe(3);
    expect(state.body.data.sales).toHaveLength(0);
    expect(state.body.data.transfers).toHaveLength(0);
    expect(state.body.data.returns).toHaveLength(0);
    expect(state.body.data.stockCounts).toHaveLength(0);
  });

  it('blocks POS oversell even when the organization uses a warning policy', async () => {
    const suffix = `${Date.now()}-oversell-warning`;
    const owner = await post('/api/register', { organizationName: 'POS Tanpa Minus', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    state.body.data.business.negativeStockPolicy = 'WARN';
    state.body.data.products.push({
      id: `product-${suffix}`, name: 'Stok Terbatas', category: 'Uji', unit: 'Kg', active: true,
      variants: [{ id: `variant-${suffix}`, name: 'Reguler', sku: `LIMIT-${suffix}`, cost: 1000, price: 2000, resellerPrice: 1500, minStock: 0 }],
    });
    state.body.data.balances.push({ locationId: 'loc-owner', variantId: `variant-${suffix}`, quantity: 2 });
    expect((await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ data: state.body.data, version: state.body.version }) })).status).toBe(200);

    const oversell = await post('/api/commands/sales', { locationId: 'loc-owner', channel: 'offline', payment: 'Tunai', items: [{ variantId: `variant-${suffix}`, quantity: 3 }] }, owner.body.token);
    expect(oversell.status).toBe(400);
    expect(oversell.body.message).toMatch(/tidak mencukupi.*tersedia 2/i);
    const unchanged = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(unchanged.body.data.balances.find(item => item.variantId === `variant-${suffix}`).quantity).toBe(2);
    expect(unchanged.body.data.sales).toHaveLength(0);
  });

  it('records and cancels operational stock-outs without creating a sale', async () => {
    const suffix = `${Date.now()}-stock-out`;
    const owner = await post('/api/register', { organizationName: 'Stok Keluar Aman', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const variantId = `variant-${suffix}`;
    const secondVariantId = `variant-2-${suffix}`;
    expect((await post('/api/commands/products', {
      product: { id: `product-${suffix}`, name: 'Produk Sampel', category: 'Uji', unit: 'Pcs', active: true, variants: [{ id: variantId, name: 'Reguler', sku: `OUT-${suffix}`, cost: 1000, price: 2000, resellerPrice: 1500, minStock: 0 }, { id: secondVariantId, name: 'Pedas', sku: `OUT-2-${suffix}`, cost: 1200, price: 2200, resellerPrice: 1700, minStock: 0 }] },
      initialStocks: [{ locationId: 'loc-owner', variantId, quantity: 3 }, { locationId: 'loc-owner', variantId: secondVariantId, quantity: 4 }],
    }, owner.body.token)).status).toBe(201);

    expect((await post('/api/commands/stock-outs', { locationId: 'loc-owner', category: 'affiliate_sample', note: 'Evidence tidak aman', proofUrl: 'javascript:alert(1)', items: [{ variantId, quantity: 1 }] }, owner.body.token)).status).toBe(400);

    const proofUrl = `https://example.test/evidence/${suffix}.webp`;
    const created = await post('/api/commands/stock-outs', { locationId: 'loc-owner', category: 'affiliate_sample', note: 'Sampel affiliate Rina', proofUrl, items: [{ variantId, quantity: 2 }, { variantId: secondVariantId, quantity: 1 }] }, owner.body.token);
    expect(created.status).toBe(201);
    let state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(state.body.data.balances.find(item => item.variantId === variantId).quantity).toBe(1);
    expect(state.body.data.sales).toHaveLength(0);
    expect(state.body.data.stockOuts).toHaveLength(2);
    expect(new Set(state.body.data.stockOuts.map(item => item.stockOutCode)).size).toBe(1);
    expect(state.body.data.stockOuts.find(item => item.variantId === variantId).unitCost).toBe(1000);
    expect(state.body.data.movements).toEqual(expect.arrayContaining([expect.objectContaining({ variantId, quantity: -2, type: 'Stok keluar operasional' }), expect.objectContaining({ variantId: secondVariantId, quantity: -1, type: 'Stok keluar operasional' })]));
    expect(state.body.data.stockOuts).toEqual(expect.arrayContaining([expect.objectContaining({ proofUrl })]));

    const rejected = await post('/api/commands/stock-outs', { locationId: 'loc-owner', category: 'promotion', note: 'Melebihi stok', items: [{ variantId, quantity: 2 }] }, owner.body.token);
    expect(rejected.status).toBe(400);
    expect((await post('/api/commands/cancel', { kind: 'stock-out', id: state.body.data.stockOuts[0].id, reason: 'Salah input' }, owner.body.token)).status).toBe(201);
    state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(state.body.data.balances.find(item => item.variantId === variantId).quantity).toBe(3);
    expect(state.body.data.balances.find(item => item.variantId === secondVariantId).quantity).toBe(4);
    expect(state.body.data.stockOuts.every(item => item.status === 'cancelled')).toBe(true);
  });
});
