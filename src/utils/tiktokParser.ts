import type ExcelJS from "exceljs";

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;

const ORDER_HEADERS = {
  orderId: "order id",
  status: "order status",
  substatus: "order substatus",
  skuId: "sku id",
  sellerSku: "seller sku",
  productName: "product name",
  variation: "variation",
  quantity: "quantity",
  returnedQuantity: "sku quantity of return",
  unitOriginalPrice: "sku unit original price",
  subtotalBeforeDiscount: "sku subtotal before discount",
  platformDiscount: "sku platform discount",
  sellerDiscount: "sku seller discount",
  subtotalAfterDiscount: "sku subtotal after discount",
  createdAt: "created time",
  paidAt: "paid time",
} as const;

const INCOME_HEADERS = {
  orderId: "id pesanan/penyesuaian",
  relatedOrderId: "id pesanan terkait",
  transactionType: "jenis transaksi",
  settlementAmount: "jumlah penyelesaian pembayaran",
  totalRevenue: "total pendapatan",
  totalFee: "total biaya",
} as const;

export type TikTokIgnoredReason =
  | "missing_order_id"
  | "invalid_quantity"
  | "unpaid"
  | "cancelled"
  | "fully_returned";

export interface ParsedTikTokOrder {
  rowNumber: number;
  orderId: string;
  status: string;
  substatus: string;
  skuId: string;
  sellerSku: string;
  externalSku: string;
  productName: string;
  variation: string;
  quantity: number;
  returnedQuantity: number;
  netQuantity: number;
  unitOriginalPrice: number;
  grossAmount: number;
  platformDiscount: number;
  sellerDiscount: number;
  netSalesAmount: number;
  createdAt?: string;
  paidAt?: string;
}

export interface IgnoredTikTokOrder {
  rowNumber: number;
  orderId?: string;
  status?: string;
  reason: TikTokIgnoredReason;
}

export interface TikTokOrderParseResult {
  fingerprint: string;
  sourceFileName: string;
  rows: ParsedTikTokOrder[];
  eligibleRows: ParsedTikTokOrder[];
  ignoredRows: IgnoredTikTokOrder[];
  statusCounts: Record<string, number>;
}

export interface TikTokIncomeOrder {
  orderId: string;
  platformFee: number;
  netPayout: number;
  totalRevenue: number;
}

export interface TikTokIncomeParseResult {
  fingerprint: string;
  sourceFileName: string;
  orders: Record<string, TikTokIncomeOrder>;
  totalPlatformFee: number;
  totalNetPayout: number;
}

type RowRecord = Record<string, unknown>;

const normalizeHeader = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const textValue = (value: unknown) => {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    if ("result" in value) return textValue((value as { result: unknown }).result);
    if ("richText" in value)
      return (value as { richText: Array<{ text?: string }> }).richText
        .map((part) => part.text || "")
        .join("")
        .trim();
    if ("text" in value) return String((value as { text: unknown }).text ?? "").trim();
  }
  return String(value ?? "").trim();
};

const numberValue = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = textValue(value).replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.lastIndexOf(".") > raw.lastIndexOf(",")
      ? raw.replace(/,/g, "")
      : raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const result = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(result) ? result : 0;
};

const roundCurrency = (value: number) => Math.max(0, Math.round(value));

const fingerprint = async (buffer: ArrayBuffer) => {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer.slice(0));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 2166136261;
  for (const byte of new Uint8Array(buffer)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const assertImportFile = (file: File) => {
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("Pilih file Excel TikTok dengan format .xlsx.");
  if (file.size > MAX_IMPORT_BYTES)
    throw new Error("Ukuran file impor maksimal 15 MB.");
};

const loadSafeZip = async (buffer: ArrayBuffer) => {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);
  const uncompressedBytes = Object.values(zip.files).reduce(
    (sum, entry) =>
      sum +
      Number(
        (
          entry as unknown as {
            _data?: { uncompressedSize?: number };
          }
        )._data?.uncompressedSize || 0,
      ),
    0,
  );
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES)
    throw new Error(
      "Isi file Excel terlalu besar untuk diproses dengan aman. Pecah laporan menjadi periode yang lebih pendek.",
    );
  return zip;
};

const buildHeaderColumns = <T extends Record<string, string>>(
  headers: Map<string, number>,
  expected: T,
) => {
  const result = {} as Record<keyof T, number>;
  for (const [key, label] of Object.entries(expected) as Array<[keyof T, string]>)
    result[key] = headers.get(label) || 0;
  return result;
};

const requiredOrderHeaders = ["orderId", "status", "skuId", "productName", "variation", "quantity"] as const;

const validateOrderColumns = (columns: ReturnType<typeof buildHeaderColumns<typeof ORDER_HEADERS>>) => {
  const missing = requiredOrderHeaders.filter((key) => !columns[key]);
  if (missing.length)
    throw new Error(
      `Format laporan pesanan TikTok tidak dikenali. Kolom wajib tidak ditemukan: ${missing
        .map((key) => ORDER_HEADERS[key])
        .join(", ")}.`,
    );
};

const orderFromRecord = (record: RowRecord, rowNumber: number): ParsedTikTokOrder => {
  const quantity = Math.max(0, Math.trunc(numberValue(record.quantity)));
  const returnedQuantity = Math.max(
    0,
    Math.min(quantity, Math.trunc(numberValue(record.returnedQuantity))),
  );
  const netQuantity = Math.max(0, quantity - returnedQuantity);
  const ratio = quantity > 0 ? netQuantity / quantity : 0;
  const unitOriginalPrice = numberValue(record.unitOriginalPrice);
  const subtotalBeforeDiscount =
    numberValue(record.subtotalBeforeDiscount) || unitOriginalPrice * quantity;
  const grossAmount = roundCurrency(subtotalBeforeDiscount * ratio);
  const sellerDiscount = roundCurrency(numberValue(record.sellerDiscount) * ratio);
  const platformDiscount = roundCurrency(numberValue(record.platformDiscount) * ratio);
  const exportedAfterDiscount = roundCurrency(
    numberValue(record.subtotalAfterDiscount) * ratio,
  );
  const netSalesAmount = Math.min(
    grossAmount,
    Math.max(
      0,
      sellerDiscount > 0 || grossAmount > 0
        ? grossAmount - sellerDiscount
        : exportedAfterDiscount,
    ),
  );
  const skuId = textValue(record.skuId);
  const sellerSku = textValue(record.sellerSku);
  const productName = textValue(record.productName);
  const variation = textValue(record.variation);
  return {
    rowNumber,
    orderId: textValue(record.orderId),
    status: textValue(record.status),
    substatus: textValue(record.substatus),
    skuId,
    sellerSku,
    externalSku:
      sellerSku || skuId || `name:${normalizeHeader(`${productName}|${variation}`)}`,
    productName,
    variation,
    quantity,
    returnedQuantity,
    netQuantity,
    unitOriginalPrice: roundCurrency(unitOriginalPrice),
    grossAmount,
    platformDiscount,
    sellerDiscount,
    netSalesAmount,
    createdAt: textValue(record.createdAt) || undefined,
    paidAt: textValue(record.paidAt) || undefined,
  };
};

const ignoredReason = (row: ParsedTikTokOrder): TikTokIgnoredReason | null => {
  if (!row.orderId) return "missing_order_id";
  if (!Number.isInteger(row.quantity) || row.quantity <= 0) return "invalid_quantity";
  if (row.netQuantity <= 0) return "fully_returned";
  const status = normalizeHeader(`${row.status} ${row.substatus}`);
  if (/cancel|dibatalkan|batal|refunded|dikembalikan/.test(status)) return "cancelled";
  if (/unpaid|belum dibayar|menunggu pembayaran/.test(status)) return "unpaid";
  const paidLifecycle = /perlu dikirim|menunggu pengambilan|dikirim|dalam perjalanan|selesai|completed|to ship|shipped|in transit|delivered/.test(
    status,
  );
  if (!row.paidAt && !paidLifecycle) return "unpaid";
  return null;
};

const finalizeOrders = (
  rows: ParsedTikTokOrder[],
  sourceFileName: string,
  fileFingerprint: string,
): TikTokOrderParseResult => {
  rows = rows.filter(
    (row) => normalizeHeader(row.orderId) !== "platform unique order id.",
  );
  const eligibleRows: ParsedTikTokOrder[] = [];
  const ignoredRows: IgnoredTikTokOrder[] = [];
  const statusCounts: Record<string, number> = {};
  for (const row of rows) {
    const statusLabel = row.status || "Tanpa status";
    statusCounts[statusLabel] = (statusCounts[statusLabel] || 0) + 1;
    const reason = ignoredReason(row);
    if (reason)
      ignoredRows.push({
        rowNumber: row.rowNumber,
        orderId: row.orderId || undefined,
        status: row.status || undefined,
        reason,
      });
    else eligibleRows.push(row);
  }
  if (!rows.length)
    throw new Error("Laporan TikTok tidak berisi baris pesanan yang dapat dibaca.");
  return {
    fingerprint: fileFingerprint,
    sourceFileName,
    rows,
    eligibleRows,
    ignoredRows,
    statusCounts,
  };
};

const rowsFromExcelWorksheet = (
  worksheet: ExcelJS.Worksheet,
  expected: typeof ORDER_HEADERS,
) => {
  const headers = new Map<string, number>();
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    const label = normalizeHeader(textValue(cell.value));
    if (label) headers.set(label, column);
  });
  const columns = buildHeaderColumns(headers, expected);
  validateOrderColumns(columns);
  const rows: ParsedTikTokOrder[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const record: RowRecord = {};
    for (const key of Object.keys(expected) as Array<keyof typeof expected>)
      record[key] = columns[key] ? row.getCell(columns[key]).value : "";
    if (Object.values(record).some((value) => textValue(value)))
      rows.push(orderFromRecord(record, rowNumber));
  }
  return rows;
};

const decodeXml = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, decimal) => String.fromCodePoint(parseInt(decimal, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const columnLetters = (address: string) => address.match(/^[A-Z]+/)?.[0] || "";
const rowNumberOf = (address: string) => Number(address.match(/\d+$/)?.[0] || 0);

const rowsFromMalformedTikTokXml = async (
  zip: Awaited<ReturnType<typeof loadSafeZip>>,
) => {
  const sheetPaths = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort();
  for (const sheetPath of sheetPaths) {
    const sheet = zip.file(sheetPath);
    if (!sheet) continue;
    const xml = await sheet.async("string");
    const headersByColumn = new Map<string, string>();
    const desiredColumns = new Map<string, keyof typeof ORDER_HEADERS>();
    const rows: ParsedTikTokOrder[] = [];
    let currentRow = 0;
    let currentRecord: RowRecord = {};
    const flush = () => {
      if (currentRow > 1 && Object.keys(currentRecord).length)
        rows.push(orderFromRecord(currentRecord, currentRow));
      currentRecord = {};
    };
    const cellPattern = /<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g;
    let match: RegExpExecArray | null;
    while ((match = cellPattern.exec(xml))) {
      const address = match[1];
      const rowNumber = rowNumberOf(address);
      const column = columnLetters(address);
      const body = match[0];
      const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/) || body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      const value = decodeXml(valueMatch?.[1] || "");
      if (rowNumber === 1) {
        const label = normalizeHeader(value);
        headersByColumn.set(column, label);
        const key = (Object.keys(ORDER_HEADERS) as Array<keyof typeof ORDER_HEADERS>).find(
          (candidate) => ORDER_HEADERS[candidate] === label,
        );
        if (key) desiredColumns.set(column, key);
        continue;
      }
      if (rowNumber !== currentRow) {
        flush();
        currentRow = rowNumber;
      }
      const key = desiredColumns.get(column);
      if (key) currentRecord[key] = value;
    }
    flush();
    const numericHeaders = new Map<string, number>();
    let index = 1;
    for (const label of headersByColumn.values()) numericHeaders.set(label, index++);
    const columns = buildHeaderColumns(numericHeaders, ORDER_HEADERS);
    try {
      validateOrderColumns(columns);
    } catch {
      continue;
    }
    if (rows.length) return rows;
  }
  throw new Error("Sheet laporan pesanan TikTok tidak ditemukan atau formatnya tidak didukung.");
};

export async function parseTikTokOrders(file: File): Promise<TikTokOrderParseResult> {
  assertImportFile(file);
  const buffer = await file.arrayBuffer();
  const fileFingerprint = await fingerprint(buffer);
  const zip = await loadSafeZip(buffer.slice(0));
  let rows: ParsedTikTokOrder[] = [];
  try {
    const { default: ExcelJSRuntime } = await import("exceljs");
    const workbook = new ExcelJSRuntime.Workbook();
    await workbook.xlsx.load(buffer.slice(0));
    for (const worksheet of workbook.worksheets) {
      try {
        rows = rowsFromExcelWorksheet(worksheet, ORDER_HEADERS);
        if (rows.length) break;
      } catch {
        // Ekspor TikTok tertentu menulis satu tag <row> per sel. ExcelJS tidak
        // dapat membacanya, sehingga parser XML terarah di bawah menjadi fallback.
      }
    }
  } catch {
    // Dilanjutkan ke fallback untuk workbook ekspor TikTok yang tidak standar.
  }
  if (!rows.length) rows = await rowsFromMalformedTikTokXml(zip);
  return finalizeOrders(rows, file.name, fileFingerprint);
}

export async function parseTikTokIncome(file: File): Promise<TikTokIncomeParseResult> {
  assertImportFile(file);
  const buffer = await file.arrayBuffer();
  await loadSafeZip(buffer.slice(0));
  const { default: ExcelJSRuntime } = await import("exceljs");
  const workbook = new ExcelJSRuntime.Workbook();
  await workbook.xlsx.load(buffer.slice(0));
  let target: ExcelJS.Worksheet | undefined;
  let columns: ReturnType<typeof buildHeaderColumns<typeof INCOME_HEADERS>> | undefined;
  for (const worksheet of workbook.worksheets) {
    const headers = new Map<string, number>();
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
      const label = normalizeHeader(textValue(cell.value));
      if (label) headers.set(label, column);
    });
    const candidate = buildHeaderColumns(headers, INCOME_HEADERS);
    if (candidate.orderId && candidate.transactionType && candidate.totalFee) {
      target = worksheet;
      columns = candidate;
      break;
    }
  }
  if (!target || !columns)
    throw new Error("Format laporan pendapatan TikTok tidak dikenali.");

  const orders: Record<string, TikTokIncomeOrder> = {};
  for (let rowNumber = 2; rowNumber <= target.rowCount; rowNumber += 1) {
    const row = target.getRow(rowNumber);
    const orderId =
      textValue(row.getCell(columns.relatedOrderId).value) ||
      textValue(row.getCell(columns.orderId).value);
    if (!orderId) continue;
    const settlement = numberValue(row.getCell(columns.settlementAmount).value);
    const totalRevenue = numberValue(row.getCell(columns.totalRevenue).value);
    const totalFee = numberValue(row.getCell(columns.totalFee).value);
    const current = orders[orderId] || {
      orderId,
      platformFee: 0,
      netPayout: 0,
      totalRevenue: 0,
    };
    current.platformFee += Math.max(0, -totalFee);
    current.netPayout += settlement;
    current.totalRevenue += totalRevenue;
    orders[orderId] = current;
  }
  for (const order of Object.values(orders)) {
    order.platformFee = roundCurrency(order.platformFee);
    order.netPayout = roundCurrency(order.netPayout);
    order.totalRevenue = roundCurrency(order.totalRevenue);
  }
  return {
    fingerprint: await fingerprint(buffer),
    sourceFileName: file.name,
    orders,
    totalPlatformFee: Object.values(orders).reduce((sum, order) => sum + order.platformFee, 0),
    totalNetPayout: Object.values(orders).reduce((sum, order) => sum + order.netPayout, 0),
  };
}
