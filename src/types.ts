export type Role = 'owner' | 'pic' | 'finance' | 'admin' | 'warehouse' | 'cashier' | 'employee';
export type Channel = 'offline' | 'online' | 'reseller';

export interface User { id: string; name: string; email: string; role: Role; outletId?: string; active: boolean; avatarUrl?: string }
export interface SessionUser extends User { organizationId: string; organizationName: string }
export interface BusinessProfile { name: string; ownerName: string; phone?: string; email?: string; address?: string; logoUrl?: string; negativeStockPolicy?: 'BLOCK' | 'WARN' | 'ALLOW' }
export interface Location { id: string; name: string; type: 'warehouse' | 'outlet'; address?: string; active: boolean; isCentralWarehouse?: boolean }
export type StockUnit = 'Pcs' | 'Botol' | 'Cup' | 'Pack' | 'Box' | 'Dus' | 'Kg' | 'Gram' | 'Liter' | 'Ml' | string;
export interface Variant { id: string; name: string; sku: string; barcode?: string; cost: number; price: number; resellerPrice: number; minStock: number; minStockByLocation?: Record<string, number>; active?: boolean; imageUrl?: string }
export interface Product { id: string; name: string; category: string; unit: StockUnit; active: boolean; imageUrl?: string; variants: Variant[] }
export interface Balance { locationId: string; variantId: string; quantity: number }
export interface Transfer { id: string; transferCode?: string; fromId: string; toId: string; variantId: string; quantity: number; status: 'sent' | 'received' | 'cancelled'; createdAt: string; sendProofUrl?: string; receivedAt?: string; receiveProofUrl?: string; cancelledAt?: string; cancelReason?: string }
export interface SaleItem { variantId: string; quantity: number; unit: StockUnit; unitCost: number; subtotal: number }
export interface Sale { id: string; locationId: string; channel: Channel; customer?: string; total: number; payment: string; createdAt: string; items: SaleItem[]; status?: 'completed' | 'voided'; cancelledAt?: string; cancelReason?: string }
export interface Movement { id: string; variantId: string; locationId: string; type: string; quantity: number; note: string; user: string; createdAt: string }
export interface StockCount { id: string; locationId: string; variantId: string; systemQty: number; actualQty: number; difference: number; reason: string; createdAt: string; status?: "cancelled"; cancelReason?: string; cancelledAt?: string; updatedAt?: string; createdBy?: string; }
export interface Supplier { id: string; name: string; phone?: string; address?: string; active: boolean }
export interface StockReceipt { id: string; receiptCode?: string; sourceType: 'supplier' | 'production'; supplierId?: string; supplierName?: string; locationId: string; variantId: string; quantity: number; unitCost: number; note?: string; proofUrl?: string; createdAt: string; status: 'completed' | 'cancelled'; cancelledAt?: string; cancelReason?: string; createdBy?: string; }
export interface StockReturn { id: string; type: 'customer' | 'supplier'; locationId: string; supplierId?: string; variantId: string; quantity: number; reason: string; proofUrl?: string; createdAt: string; status: 'completed' | 'cancelled'; cancelledAt?: string; cancelReason?: string }
export interface Employee { id: string; userId: string; locationId?: string; position: string; monthlySalary: number; active: boolean }
export interface AttendanceSetting { locationId: string; checkInStart: string; checkInEnd: string; checkOutStart: string; checkOutEnd: string; lateToleranceMinutes: number }
export interface Attendance { id: string; employeeId: string; locationId: string; date: string; checkInAt?: string; checkOutAt?: string; checkInGps?: string; checkOutGps?: string; lateMinutes?: number }
export interface Loan { id: string; employeeId: string; loanDate: string; amount: number; installmentCount: number; installmentAmount: number; paidInstallments: number; note?: string; status: 'active' | 'paid' }
export interface Payroll { id: string; employeeId: string; period: string; grossAmount: number; status: 'paid'; paidAt: string; note?: string; proofUrl?: string }
export interface ShipmentPackage { id: string; trackingNumber: string; marketplace: string; carrier: string; locationId: string; status: 'ready' | 'handover_scanned' | 'handed_over'; packedAt: string; packedBy: string; handoverBatchCode?: string; handedOverAt?: string; handedOverBy?: string }
export interface ShipmentHandover { id: string; batchCode: string; carrier: string; locationId: string; courierName?: string; vehicleNumber?: string; proofUrl?: string; status: 'draft' | 'completed'; createdAt: string; createdBy: string; completedAt?: string; completedBy?: string }
export interface HppMaterial { id: string; name: string; quantity: number; unit: string; unitCost: number }
export interface HppAdditionalCost { id: string; name: string; amount: number; category?: 'tenaga_kerja' | 'kemasan' | 'overhead' | 'lainnya' }
export interface HppRecipe { id: string; variantId?: string; variantIds?: string[]; name: string; yieldQuantity: number; yieldUnit: string; materials: HppMaterial[]; additionalCosts: HppAdditionalCost[]; targetMargin: number; sellingPrice?: number; updatedAt: string }
export interface MarketplaceConfig { platform: string; adminFee: number; paymentFee: number; shippingFee: number; affiliateFee?: number; fixedFee: number; discount: number; updatedAt: string }
export interface RolePolicy { menus: string[]; permissions: string[] }
export type RolePolicies = Partial<Record<Exclude<Role, 'owner'>, RolePolicy>>;
export interface PricingData { hppRecipes?: HppRecipe[]; marketplaceConfigs?: MarketplaceConfig[] }
export interface AppData { business?: BusinessProfile; users: User[]; locations: Location[]; products: Product[]; balances: Balance[]; transfers: Transfer[]; sales: Sale[]; movements: Movement[]; stockCounts: StockCount[]; suppliers?: Supplier[]; receipts?: StockReceipt[]; returns?: StockReturn[]; employees?: Employee[]; attendanceSettings?: AttendanceSetting[]; attendances?: Attendance[]; loans?: Loan[]; payrolls?: Payroll[]; shipments?: ShipmentPackage[]; shipmentHandovers?: ShipmentHandover[]; pricing?: PricingData; rolePolicies?: RolePolicies }
