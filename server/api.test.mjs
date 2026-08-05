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

beforeAll(async () => {
  server = spawn(process.execPath, ['server/index.mjs'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), DB_HOST: '', JWT_SECRET: 'integration-test-secret', ALLOW_SELF_REGISTRATION: 'true', ALLOW_LEGACY_SNAPSHOT: 'true' }, stdio: 'ignore' });
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* server belum siap */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Server pengujian tidak siap');
});
afterAll(() => server?.kill('SIGTERM'));

describe('multi-tenant API', () => {
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
    expect(afterSend.body.data.balances.find(b => b.locationId === 'loc-owner' && b.variantId === 'variant-command').quantity).toBe(10);

    const picEmail = `pic-command-${suffix}@test.local`;
    expect((await post('/api/users', { name: 'PIC Command', email: picEmail, password: 'Password123!', role: 'pic', outletId: 'outlet-command' }, owner.body.token)).status).toBe(201);
    const pic = await post('/api/login', { email: picEmail, password: 'Password123!' });
    expect((await post(`/api/commands/transfers/${encodeURIComponent(transferCode)}/receive`, { receiveProofUrl }, pic.body.token)).status).toBe(201);
    const afterReceive = await request('/api/state', { headers: { authorization: `Bearer ${pic.body.token}` } });
    expect(afterReceive.body.data.balances.find(b => b.locationId === 'outlet-command' && b.variantId === 'variant-command').quantity).toBe(10);
    expect(afterReceive.body.data.transfers.find(item => item.transferCode === transferCode).receiveProofUrl).toBe(receiveProofUrl);

    const sale = await post('/api/commands/sales', { locationId: 'outlet-command', channel: 'offline', payment: 'Tunai', items: [{ variantId: 'variant-command', quantity: 3 }] }, pic.body.token);
    expect(sale.status).toBe(201);
    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${pic.body.token}` } });
    expect(refreshed.body.data.sales).toHaveLength(1);
    expect(refreshed.body.data.sales[0].total).toBe(7500);
    expect(refreshed.body.data.balances.find(b => b.locationId === 'outlet-command' && b.variantId === 'variant-command').quantity).toBe(7);
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

    const staff = await post('/api/login', { email: employeeEmail, password: 'Password123!' });
    expect((await post('/api/commands/attendance', { kind: 'in', latitude: -6.2, longitude: 106.8, capturedAt: '2026-07-31T01:10:00.000Z' }, staff.body.token)).status).toBe(201);
    expect((await post('/api/commands/attendance', { kind: 'out', latitude: -6.2, longitude: 106.8, capturedAt: '2026-07-31T09:10:00.000Z' }, staff.body.token)).status).toBe(201);
    // Nilai cicilan dari browser tidak dipercaya. Server harus menghitung
    // ulang Rp2.000 / 3 menjadi Rp667 dan mengabaikan nilai kiriman yang salah.
    const loan = { id: `loan-${suffix}`, employeeId: employee.id, loanDate: '2026-07-31', amount: 2000, installmentCount: 3, installmentAmount: 1, paidInstallments: 0, status: 'active' };
    expect((await post('/api/commands/loans', { loan: { ...loan, id: `${loan.id}-invalid`, installmentCount: 0 } }, owner.body.token)).status).toBe(400);
    expect((await post('/api/commands/loans', { loan }, owner.body.token)).status).toBe(201);
    expect((await post('/api/commands/loans', { loan }, owner.body.token)).status).toBe(400);
    expect((await post(`/api/commands/loans/${loan.id}/installments`, {}, owner.body.token)).status).toBe(201);
    const payroll = { id: `payroll-${suffix}`, employeeId: employee.id, period: '2026-07', grossAmount: 3000000, status: 'paid' };
    expect((await post('/api/commands/payrolls', { payroll }, owner.body.token)).status).toBe(201);
    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.employees).toContainEqual(expect.objectContaining({ id: employee.id }));
    expect(refreshed.body.data.attendances).toContainEqual(expect.objectContaining({ employeeId: employee.id, checkInAt: expect.any(String), checkOutAt: expect.any(String) }));
    expect(refreshed.body.data.loans).toContainEqual(expect.objectContaining({ id: loan.id, amount: 2000, installmentCount: 3, installmentAmount: 667, paidInstallments: 1, status: 'active' }));
    expect(refreshed.body.data.payrolls).toContainEqual(expect.objectContaining({ id: payroll.id, period: '2026-07' }));
  });

  it('keeps master supplier and its receipt reference after refresh', async () => {
    const suffix = `${Date.now()}-supplier`;
    const owner = await post('/api/register', { organizationName: 'Supplier Command', name: 'Owner', email: `owner-${suffix}@test.local`, password: 'Password123!' });
    const supplier = { id: `sup-${suffix}`, name: 'CV Bahan Snack', phone: '08123456789', active: true };
    expect((await post('/api/commands/suppliers', { supplier }, owner.body.token)).status).toBe(201);
    const state = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    state.body.data.products.push({ id: `prd-${suffix}`, name: 'Keripik', category: 'Snack', unit: 'Pcs', active: true, variants: [{ id: `var-${suffix}`, name: 'Original', sku: `SUP-${suffix}`, cost: 1000, price: 2000, resellerPrice: 1500, minStock: 1 }] });
    expect((await request('/api/state', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${owner.body.token}` }, body: JSON.stringify({ data: state.body.data, version: state.body.version }) })).status).toBe(200);
    const proofUrl = `https://example.test/receipts/${suffix}.webp`;
    expect((await post('/api/commands/receipts', { locationId: 'loc-owner', sourceType: 'supplier', supplierId: supplier.id, supplierName: supplier.name, proofUrl, items: [{ variantId: `var-${suffix}`, quantity: 4, unitCost: 1000 }] }, owner.body.token)).status).toBe(201);
    const refreshed = await request('/api/state', { headers: { authorization: `Bearer ${owner.body.token}` } });
    expect(refreshed.body.data.suppliers).toContainEqual(expect.objectContaining({ id: supplier.id, name: supplier.name }));
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
});
