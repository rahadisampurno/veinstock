export type Role = 'owner' | 'pic' | 'finance' | 'admin' | 'warehouse' | 'cashier';
export type Channel = 'offline' | 'online' | 'reseller';

export interface User { id: string; name: string; email: string; role: Role; outletId?: string; active: boolean; avatarUrl?: string }
export interface SessionUser extends User { organizationId: string; organizationName: string }
export interface BusinessProfile { name: string; ownerName: string; phone?: string; email?: string; address?: string; logoUrl?: string }
export interface Location { id: string; name: string; type: 'warehouse' | 'outlet'; address?: string; active: boolean }
export type StockUnit = 'gram' | 'pcs' | 'ml';
export interface Variant { id: string; name: string; sku: string; cost: number; price: number; resellerPrice: number; minStock: number; minStockByLocation?: Record<string, number>; gramsPerCup?: number; active?: boolean; imageUrl?: string }
export interface Product { id: string; name: string; category: string; unit: StockUnit; active: boolean; imageUrl?: string; variants: Variant[] }
export interface Balance { locationId: string; variantId: string; quantity: number }
export interface Transfer { id: string; fromId: string; toId: string; variantId: string; quantity: number; status: 'sent' | 'received' | 'cancelled'; createdAt: string; receivedAt?: string; cancelledAt?: string; cancelReason?: string }
export interface SaleItem { variantId: string; quantity: number; unit: StockUnit; cups?: number }
export interface Sale { id: string; locationId: string; channel: Channel; customer?: string; total: number; payment: string; createdAt: string; items: SaleItem[]; status?: 'completed' | 'cancelled'; cancelledAt?: string; cancelReason?: string }
export interface Movement { id: string; variantId: string; locationId: string; type: string; quantity: number; note: string; user: string; createdAt: string }
export interface StockCount { id: string; locationId: string; variantId: string; systemQty: number; actualQty: number; difference: number; reason: string; createdAt: string; status?: "cancelled"; cancelReason?: string; cancelledAt?: string; updatedAt?: string; }
export interface Supplier { id: string; name: string; phone?: string; address?: string; active: boolean }
export interface StockReceipt { id: string; sourceType: 'supplier' | 'production'; supplierId?: string; supplierName?: string; locationId: string; variantId: string; quantity: number; unitCost: number; note?: string; createdAt: string; status: 'completed' | 'cancelled'; cancelledAt?: string; cancelReason?: string }
export interface StockReturn { id: string; type: 'customer' | 'supplier'; locationId: string; supplierId?: string; variantId: string; quantity: number; reason: string; createdAt: string; status: 'completed' | 'cancelled'; cancelledAt?: string; cancelReason?: string }
export interface AppData { business?: BusinessProfile; users: User[]; locations: Location[]; products: Product[]; balances: Balance[]; transfers: Transfer[]; sales: Sale[]; movements: Movement[]; stockCounts: StockCount[]; suppliers?: Supplier[]; receipts?: StockReceipt[]; returns?: StockReturn[] }
