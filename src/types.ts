export type Role =
  "owner" | "pic" | "finance" | "admin" | "warehouse" | "cashier" | "employee";
export type Channel = "offline" | "online" | "reseller";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  outletId?: string;
  active: boolean;
  avatarUrl?: string;
}
export interface SessionUser extends User {
  organizationId: string;
  organizationName: string;
}
export interface BusinessProfile {
  name: string;
  ownerName: string;
  phone?: string;
  email?: string;
  address?: string;
  logoUrl?: string;
  negativeStockPolicy?: "BLOCK" | "WARN" | "ALLOW";
}
export interface Location {
  id: string;
  name: string;
  type: "warehouse" | "outlet";
  address?: string;
  active: boolean;
  isCentralWarehouse?: boolean;
}
export type StockUnit =
  | "Pcs"
  | "Botol"
  | "Cup"
  | "Pack"
  | "Box"
  | "Dus"
  | "Kg"
  | "Gram"
  | "Liter"
  | "Ml"
  | string;
export interface Variant {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  packageWeight?: string;
  flavor?: string;
  spiceLevel?: string;
  cost: number;
  price: number;
  /** HPP yang dipakai ketika kanal transaksi adalah online. */
  onlineCost?: number;
  /** Harga jual yang dipakai ketika kanal transaksi adalah online. */
  onlinePrice?: number;
  resellerPrice: number;
  minStock: number;
  minStockByLocation?: Record<string, number>;
  active?: boolean;
  imageUrl?: string;
  hppProfileId?: string;
  hppBatchId?: string;
  hppPackageId?: string;
}
export interface Product {
  id: string;
  name: string;
  category: string;
  unit: StockUnit;
  active: boolean;
  imageUrl?: string;
  imageUrls?: string[];
  variants: Variant[];
}
export interface Balance {
  locationId: string;
  variantId: string;
  quantity: number;
}
export interface Transfer {
  id: string;
  transferCode?: string;
  fromId: string;
  toId: string;
  variantId: string;
  quantity: number;
  status: "sent" | "received" | "cancelled";
  createdAt: string;
  createdBy?: string;
  sendProofUrl?: string;
  receivedAt?: string;
  receivedBy?: string;
  receiveProofUrl?: string;
  cancelledAt?: string;
  cancelReason?: string;
}
export interface SaleItem {
  variantId: string;
  quantity: number;
  unit: StockUnit;
  /** Snapshot HPP sesuai kanal pada saat transaksi dibuat. */
  unitCost?: number;
  /** Snapshot harga satuan sesuai kanal sebelum diskon. */
  price?: number;
  /** Bagian diskon transaksi yang dialokasikan ke baris ini. */
  discount?: number;
  /** Jumlah × harga satuan sebelum diskon. */
  subtotal: number;
}
export interface Sale {
  id: string;
  locationId: string;
  channel: Channel;
  customer?: string;
  note?: string;
  /** Total seluruh baris sebelum diskon. Data lama memakai `total`. */
  grossTotal?: number;
  /** Diskon nominal pembeli pada tingkat transaksi. */
  discountAmount?: number;
  /** Cara diskon dimasukkan saat transaksi dibuat. */
  discountType?: "nominal" | "percentage";
  /** Nilai input asli: rupiah untuk nominal atau angka persen. */
  discountValue?: number;
  total: number;
  /** Biaya admin/layanan marketplace yang mengurangi laba bersih. */
  platformFee?: number;
  /** Dana bersih yang tercatat pada laporan pencairan marketplace. */
  netPayout?: number;
  /** Sumber transaksi impor, misalnya TikTok. */
  sourcePlatform?: string;
  /** ID batch impor untuk rekonsiliasi dan pencegahan duplikat. */
  sourceImportId?: string;
  payment: string;
  createdAt: string;
  items: SaleItem[];
  cashierId?: string;
  status?: "pending_print" | "completed" | "voided";
  printedAt?: string;
  printedBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface MarketplaceSkuMapping {
  platform: string;
  externalSku: string;
  variantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceImportRecord {
  id: string;
  platform: string;
  fingerprint: string;
  incomeFingerprint?: string;
  sourceFileName: string;
  incomeFileName?: string;
  locationId: string;
  saleId: string;
  /** Hanya ada selama transaksi impor; database menyimpannya sebagai hash. */
  externalOrderIds?: string[];
  rowCount: number;
  ignoredRowCount: number;
  duplicateOrderCount: number;
  totalQuantity: number;
  grossTotal: number;
  discountAmount: number;
  platformFee: number;
  netPayout: number;
  createdAt: string;
  createdBy?: string;
}
export interface Movement {
  id: string;
  variantId: string;
  locationId: string;
  type: string;
  quantity: number;
  note: string;
  user: string;
  createdAt: string;
}
export interface StockCount {
  id: string;
  locationId: string;
  variantId: string;
  systemQty: number;
  actualQty: number;
  difference: number;
  reason: string;
  createdAt: string;
  status?: "cancelled";
  cancelReason?: string;
  cancelledAt?: string;
  updatedAt?: string;
  createdBy?: string;
}
export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  active: boolean;
}
export interface StockReceipt {
  id: string;
  receiptCode?: string;
  sourceType: "supplier" | "production";
  supplierId?: string;
  supplierName?: string;
  locationId: string;
  variantId: string;
  quantity: number;
  unitCost: number;
  note?: string;
  proofUrl?: string;
  createdAt: string;
  status: "completed" | "cancelled";
  cancelledAt?: string;
  cancelReason?: string;
  createdBy?: string;
}
export interface StockReturn {
  id: string;
  type: "customer" | "supplier";
  locationId: string;
  supplierId?: string;
  variantId: string;
  quantity: number;
  reason: string;
  proofUrl?: string;
  createdAt: string;
  status: "completed" | "cancelled";
  cancelledAt?: string;
  cancelReason?: string;
}
export interface StockOut {
  id: string;
  stockOutCode?: string;
  category: "affiliate_sample" | "promotion" | "damaged" | "internal" | "other";
  locationId: string;
  variantId: string;
  quantity: number;
  unitCost?: number;
  note: string;
  proofUrl?: string;
  createdBy?: string;
  createdAt: string;
  status: "completed" | "cancelled";
  cancelledAt?: string;
  cancelReason?: string;
}
export interface Employee {
  id: string;
  userId: string;
  locationId?: string;
  position: string;
  monthlySalary: number;
  active: boolean;
  joinDate?: string;
}
export interface AttendanceSetting {
  locationId: string;
  checkInStart: string;
  checkInEnd: string;
  checkOutStart: string;
  checkOutEnd: string;
  lateToleranceMinutes: number;
}
export interface Attendance {
  id: string;
  employeeId: string;
  locationId: string;
  date: string;
  checkInAt?: string;
  checkOutAt?: string;
  checkInGps?: string;
  checkOutGps?: string;
  lateMinutes?: number;
}
export type LiveSessionStatus =
  | "scheduled"
  | "live"
  | "completed"
  | "cancelled";
export interface LiveSession {
  id: string;
  name: string;
  platform: string;
  locationId: string;
  hostEmployeeIds: string[];
  scheduledAt?: string;
  note?: string;
  status: LiveSessionStatus;
  startedAt?: string;
  endedAt?: string;
  startedBy?: string;
  endedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface Loan {
  id: string;
  employeeId: string;
  loanDate: string;
  amount: number;
  installmentCount: number;
  installmentAmount: number;
  paidInstallments: number;
  note?: string;
  status: "active" | "paid";
}
export interface Payroll {
  id: string;
  employeeId: string;
  period: string;
  grossAmount: number;
  status: "paid";
  paidAt: string;
  note?: string;
  proofUrl?: string;
  employeeName?: string;
  positionSnapshot?: string;
  locationNameSnapshot?: string;
}
export type CashEntryType = "in" | "out";
export type CashEntryReportTreatment =
  | "other_income"
  | "operating_expense"
  | "excluded";
export interface CashEntry {
  id: string;
  type: CashEntryType;
  transactionDate: string;
  locationId: string;
  category: string;
  amount: number;
  paymentMethod: string;
  /**
   * Menentukan pengaruh transaksi manual terhadap laba bersih. Data lama yang
   * belum memiliki nilai ini diperlakukan sebagai `excluded` agar modal,
   * piutang, pembelian aset, atau pembayaran utang tidak salah dihitung laba.
   */
  reportTreatment?: CashEntryReportTreatment;
  note?: string;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
}
export interface DebtEntry {
  id: string;
  type: "debt" | "receivable";
  transactionDate: string;
  dueDate?: string;
  locationId: string;
  partyName: string;
  amount: number;
  note?: string;
  proofUrl?: string;
  status: "unpaid" | "paid";
  paidAt?: string;
  paidProofUrl?: string;
  createdAt: string;
  createdBy: string;
  createdByName?: string;
}
export interface ShipmentPackage {
  id: string;
  trackingNumber: string;
  marketplace: string;
  carrier: string;
  locationId: string;
  status: "ready" | "handover_scanned" | "handed_over" | "cancelled";
  packedAt: string;
  packedBy: string;
  handoverBatchCode?: string;
  handedOverAt?: string;
  handedOverBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  packingEvidence?: {
    id: string;
    status: "available" | "resolved";
    available: boolean;
    capturedAt: string;
    capturedBy: string;
    expiresAt: string;
    bytes: number;
    width: number;
    height: number;
    format: string;
    deletedAt?: string;
    deletionReason?: "retention_30_days";
  };
}
export interface ShipmentHandover {
  id: string;
  batchCode: string;
  carrier: string;
  locationId: string;
  courierName?: string;
  vehicleNumber?: string;
  proofUrl?: string;
  status: "draft" | "completed" | "cancelled";
  createdAt: string;
  createdBy: string;
  completedAt?: string;
  completedBy?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
}
export interface HppMaterial {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  purchaseQuantity?: number;
  purchaseCost?: number;
}
export interface HppAdditionalCost {
  id: string;
  name: string;
  amount: number;
  category?: "tenaga_kerja" | "kemasan" | "overhead" | "lainnya";
  allocation?: "per_batch" | "per_unit";
}
export interface HppMasterItem {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
}
export interface HppPackageOption {
  id: string;
  name: string;
  contentWeight: number;
  packagingCost: number;
  targetProfit: number;
}
export interface HppOperationalDefaults {
  packingCost: number;
  employeeCost: number;
  onlineAdsCost: number;
  tiktokAdditionalCost: number;
  tiktokNetRate: number;
}
export interface HppBatchIngredient {
  id: string;
  masterItemId: string;
  quantity: number;
}
export interface HppBatch {
  id: string;
  productId?: string;
  name: string;
  flavor: string;
  spiceLevel: string;
  ingredients: HppBatchIngredient[];
  updatedAt: string;
}
export interface HppProductProfile {
  id: string;
  name: string;
  productId?: string;
  masterItems: HppMasterItem[];
  packages: HppPackageOption[];
  operations: HppOperationalDefaults;
  batches: HppBatch[];
  updatedAt: string;
}
export interface HppRecipe {
  id: string;
  profileId?: string;
  variantId?: string;
  variantIds?: string[];
  batchId?: string;
  packageId?: string;
  name: string;
  yieldQuantity: number;
  yieldUnit: string;
  wastePercent?: number;
  materials: HppMaterial[];
  additionalCosts: HppAdditionalCost[];
  targetMargin: number;
  sellingPrice?: number;
  updatedAt: string;
}
export interface MarketplaceConfig {
  platform: string;
  adminFee: number;
  paymentFee: number;
  shippingFee: number;
  affiliateFee?: number;
  fixedFee: number;
  discount: number;
  updatedAt: string;
}
export interface RolePolicy {
  menus: string[];
  permissions: string[];
}
export type RolePolicies = Partial<Record<Exclude<Role, "owner">, RolePolicy>>;
export interface PricingData {
  hppProductProfiles?: HppProductProfile[];
  hppMasterItems?: HppMasterItem[];
  hppPackages?: HppPackageOption[];
  hppOperationalDefaults?: HppOperationalDefaults;
  hppBatches?: HppBatch[];
  hppRecipes?: HppRecipe[];
  marketplaceConfigs?: MarketplaceConfig[];
}
export interface AppData {
  business?: BusinessProfile;
  users: User[];
  locations: Location[];
  products: Product[];
  balances: Balance[];
  transfers: Transfer[];
  sales: Sale[];
  movements: Movement[];
  stockCounts: StockCount[];
  suppliers?: Supplier[];
  receipts?: StockReceipt[];
  returns?: StockReturn[];
  stockOuts?: StockOut[];
  employees?: Employee[];
  attendanceSettings?: AttendanceSetting[];
  attendances?: Attendance[];
  liveSessions?: LiveSession[];
  loans?: Loan[];
  payrolls?: Payroll[];
  cashEntries?: CashEntry[];
  debtEntries?: DebtEntry[];
  shipments?: ShipmentPackage[];
  shipmentHandovers?: ShipmentHandover[];
  pricing?: PricingData;
  marketplaceSkuMappings?: MarketplaceSkuMapping[];
  marketplaceImports?: MarketplaceImportRecord[];
  rolePolicies?: RolePolicies;
}
