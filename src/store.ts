import type { AppData, Balance, Movement, SessionUser } from './types';

const now = () => new Date().toISOString();
const ids = { warehouse: 'loc-owner', outlet: 'loc-outlet-1' };

export const seedData: AppData = {
  business: { name: 'Meneng', ownerName: 'Owner Meneng', email: 'owner@meneng.id' },
  users: [
    { id: 'u-owner', name: 'Owner Meneng', email: 'owner@meneng.id', role: 'owner', active: true },
    { id: 'u-pic', name: 'Rina - PIC Outlet', email: 'pic@meneng.id', role: 'pic', outletId: ids.outlet, active: true },
    { id: 'u-fin', name: 'Dewi - Keuangan', email: 'finance@meneng.id', role: 'finance', active: true },
  ],
  locations: [
    { id: ids.warehouse, name: 'Gudang Owner', type: 'warehouse', active: true },
    { id: ids.outlet, name: 'Outlet Meneng 1', type: 'outlet', active: true },
  ],
  products: [{
    id: 'prod-cemilan', name: 'Cemilan Mix Meneng', category: 'Cemilan', unit: 'gram', active: true,
    variants: [
      { id: 'v-balado', name: 'Balado', sku: 'MNG-BLD-001', cost: 52, price: 100, resellerPrice: 82, minStock: 1500 },
      { id: 'v-jagung', name: 'Jagung Bakar', sku: 'MNG-JGB-002', cost: 50, price: 100, resellerPrice: 80, minStock: 1500 },
      { id: 'v-keju', name: 'Keju', sku: 'MNG-KJU-003', cost: 56, price: 110, resellerPrice: 88, minStock: 1200 },
      { id: 'v-pedas', name: 'Pedas Daun Jeruk', sku: 'MNG-PDJ-004', cost: 54, price: 110, resellerPrice: 86, minStock: 1200 },
      { id: 'v-original', name: 'Original', sku: 'MNG-ORI-005', cost: 47, price: 95, resellerPrice: 76, minStock: 1500 },
    ],
  }],
  balances: [
    ...['v-balado','v-jagung','v-keju','v-pedas','v-original'].map((variantId, i) => ({ locationId: ids.warehouse, variantId, quantity: 9000 - i * 400 })),
    ...['v-balado','v-jagung','v-keju','v-pedas','v-original'].map((variantId, i) => ({ locationId: ids.outlet, variantId, quantity: 2100 - i * 180 })),
  ],
  transfers: [], stockCounts: [], suppliers: [], receipts: [], returns: [],
  sales: [
    { id: 'sale-1', locationId: ids.outlet, channel: 'offline', total: 1850000, payment: 'QRIS', createdAt: now(), items: [{ variantId: 'v-balado', quantity: 800, unit: 'gram', unitCost: 52, subtotal: 80000 }], status: 'completed' },
    { id: 'sale-2', locationId: ids.warehouse, channel: 'online', total: 975000, payment: 'Transfer', createdAt: now(), items: [{ variantId: 'v-original', quantity: 500, unit: 'gram', unitCost: 47, subtotal: 47500 }], status: 'completed' },
    { id: 'sale-3', locationId: ids.warehouse, channel: 'reseller', customer: 'Reseller Nisa', total: 620000, payment: 'Transfer', createdAt: now(), items: [{ variantId: 'v-keju', quantity: 700, unit: 'gram', unitCost: 56, subtotal: 77000 }], status: 'completed' },
  ],
  movements: [{ id: 'mov-seed', variantId: 'v-balado', locationId: ids.warehouse, type: 'Stok awal', quantity: 9000, note: 'Saldo awal sistem', user: 'Owner Meneng', createdAt: now() }],
};

export const createEmptyData = (organizationName: string, owner: Pick<SessionUser,'id'|'name'|'email'>): AppData => ({
  business: { name: organizationName, ownerName: owner.name, email: owner.email },
  users: [{ id: owner.id, name: owner.name, email: owner.email, role: 'owner', active: true }],
  locations: [{ id: 'loc-owner', name: `Gudang ${organizationName}`, type: 'warehouse', active: true }],
  products: [], balances: [], transfers: [], sales: [], movements: [], stockCounts: [], suppliers: [], receipts: [], returns: [], employees: [], attendanceSettings: [], attendances: [], loans: [], payrolls: [],
});

export const normalizeData = (data: AppData): AppData => {
  const locations = data.locations || [];
  return {
    ...data,
    business: data.business || { name: 'Usaha Saya', ownerName: data.users?.find(item=>item.role==='owner')?.name || 'Owner' },
    users: data.users || [],
    locations,
    products: data.products || [],
    balances: data.balances || [],
    transfers: data.transfers || [],
    // Data sebelum kanal penjualan tersedia tetap harus muncul di analitik.
    // Lokasi outlet berarti penjualan langsung; transaksi dari gudang diperlakukan sebagai online.
    sales: (data.sales || []).map((sale) => {
      if (sale.channel === 'offline' || sale.channel === 'online' || sale.channel === 'reseller') return sale;
      const location = locations.find((item) => item.id === sale.locationId);
      return { ...sale, channel: location?.type === 'outlet' ? 'offline' : 'online' };
    }),
    movements: data.movements || [],
    stockCounts: data.stockCounts || [],
    suppliers: data.suppliers || [],
    receipts: data.receipts || [],
    returns: data.returns || [], employees: data.employees || [], attendanceSettings: data.attendanceSettings || [], attendances: data.attendances || [], loans: data.loans || [], payrolls: data.payrolls || []
  };
};

const keyFor = (organizationId = 'demo') => `veinstock_data_v2_${organizationId}`;
export const loadData = (organizationId?: string): AppData => { try { return normalizeData(JSON.parse(localStorage.getItem(keyFor(organizationId)) || '')) } catch { return normalizeData(seedData) } };
export const saveData = (data: AppData, organizationId?: string) => localStorage.setItem(keyFor(organizationId), JSON.stringify(data));
export const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
export const getBalance = (balances: Balance[], locationId: string, variantId: string) => balances.find(b => b.locationId === locationId && b.variantId === variantId)?.quantity || 0;
export const adjustBalance = (balances: Balance[], locationId: string, variantId: string, delta: number) => {
  const found = balances.find(b => b.locationId === locationId && b.variantId === variantId);
  return found ? balances.map(b => b === found ? { ...b, quantity: b.quantity + delta } : b) : [...balances, { locationId, variantId, quantity: delta }];
};
export const movement = (variantId: string, locationId: string, type: string, quantity: number, note: string, user: string): Movement => ({ id: newId('mov'), variantId, locationId, type, quantity, note, user, createdAt: now() });
