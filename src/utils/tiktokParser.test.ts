import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { parseTikTokIncome, parseTikTokOrders } from "./tiktokParser";

const fileFromWorkbook = async (workbook: ExcelJS.Workbook, name: string) => {
  const bytes = await workbook.xlsx.writeBuffer();
  return new File([bytes], name);
};

describe("TikTok marketplace import", () => {
  it("membaca pesanan berdasarkan header dan hanya memilih status layak", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("OrderSKUList");
    sheet.addRow([
      "Variation",
      "Order Status",
      "Order ID",
      "Product Name",
      "Seller SKU",
      "SKU ID",
      "Quantity",
      "Sku Quantity of return",
      "SKU Unit Original Price",
      "SKU Subtotal Before Discount",
      "SKU Platform Discount",
      "SKU Seller Discount",
      "SKU Subtotal After Discount",
      "Created Time",
      "Paid Time",
      "Order Substatus",
    ]);
    sheet.addRow([
      "Balado 250g",
      "Selesai",
      "order-paid",
      "Keripik",
      "TIK-BLD-250",
      "platform-1",
      2,
      0,
      10_000,
      20_000,
      1_000,
      2_000,
      17_000,
      "01/09/2026 10:00:00",
      "01/09/2026 10:01:00",
      "Selesai",
    ]);
    sheet.addRow([
      "Keju 250g",
      "Belum dibayar",
      "order-unpaid",
      "Keripik",
      "TIK-KJU-250",
      "platform-2",
      1,
      0,
      12_000,
      12_000,
      0,
      0,
      12_000,
      "01/09/2026 11:00:00",
      "",
      "Belum dibayar",
    ]);
    sheet.addRow([
      "Balado 250g",
      "Selesai",
      "order-return",
      "Keripik",
      "TIK-BLD-250",
      "platform-1",
      2,
      1,
      10_000,
      20_000,
      0,
      2_000,
      18_000,
      "01/09/2026 12:00:00",
      "01/09/2026 12:01:00",
      "Selesai",
    ]);

    const result = await parseTikTokOrders(
      await fileFromWorkbook(workbook, "Semua pesanan-test.xlsx"),
    );

    expect(result.rows).toHaveLength(3);
    expect(result.eligibleRows).toHaveLength(2);
    expect(result.ignoredRows).toEqual([
      expect.objectContaining({ orderId: "order-unpaid", reason: "unpaid" }),
    ]);
    expect(result.eligibleRows[0]).toMatchObject({
      externalSku: "TIK-BLD-250",
      grossAmount: 20_000,
      sellerDiscount: 2_000,
      netSalesAmount: 18_000,
    });
    expect(result.eligibleRows[1]).toMatchObject({
      netQuantity: 1,
      grossAmount: 10_000,
      sellerDiscount: 1_000,
      netSalesAmount: 9_000,
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("membaca ekspor TikTok yang menulis satu tag row untuk setiap sel", async () => {
    const cells = [
      ["A1", "Order ID"],
      ["B1", "Order Status"],
      ["C1", "Order Substatus"],
      ["F1", "SKU ID"],
      ["H1", "Product Name"],
      ["I1", "Variation"],
      ["J1", "Quantity"],
      ["K1", "Sku Quantity of return"],
      ["L1", "SKU Unit Original Price"],
      ["M1", "SKU Subtotal Before Discount"],
      ["N1", "SKU Platform Discount"],
      ["O1", "SKU Seller Discount"],
      ["P1", "SKU Subtotal After Discount"],
      ["AD1", "Created Time"],
      ["AE1", "Paid Time"],
      ["A3", "order-xml"],
      ["B3", "Selesai"],
      ["C3", "Selesai"],
      ["F3", "sku-xml"],
      ["H3", "Keripik &amp; Kacang"],
      ["I3", "Pedas"],
      ["J3", "1"],
      ["K3", "0"],
      ["L3", "15000"],
      ["M3", "15000"],
      ["N3", "1000"],
      ["O3", "0"],
      ["P3", "14000"],
      ["AE3", "01/09/2026 08:00:00"],
    ]
      .map(
        ([address, value]) =>
          `<row r="${address.match(/\d+$/)?.[0]}"><c r="${address}" t="str"><v>${value}</v></c></row>`,
      )
      .join("");
    const zip = new JSZip();
    zip.file(
      "xl/worksheets/sheet2.xml",
      `<?xml version="1.0"?><worksheet><sheetData>${cells}</sheetData></worksheet>`,
    );
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const result = await parseTikTokOrders(
      new File([bytes], "Semua pesanan-malformed.xlsx"),
    );

    expect(result.eligibleRows).toEqual([
      expect.objectContaining({
        orderId: "order-xml",
        externalSku: "sku-xml",
        productName: "Keripik & Kacang",
        netSalesAmount: 15_000,
      }),
    ]);
  });

  it("merekonsiliasi biaya dan pencairan per ID pesanan", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Detail pesanan");
    sheet.addRow([
      "Jenis transaksi",
      "ID pesanan terkait",
      "Total Biaya",
      "Jumlah penyelesaian pembayaran",
      "Total Pendapatan",
      "ID Pesanan/Penyesuaian",
    ]);
    sheet.addRow(["Pesanan", "order-1", -7_500, 22_500, 30_000, "order-1"]);
    sheet.addRow(["Penyesuaian", "order-1", -500, 0, 0, "adjustment-1"]);

    const result = await parseTikTokIncome(
      await fileFromWorkbook(workbook, "income_test.xlsx"),
    );

    expect(result.orders["order-1"]).toEqual({
      orderId: "order-1",
      platformFee: 8_000,
      netPayout: 22_500,
      totalRevenue: 30_000,
    });
    expect(result.totalPlatformFee).toBe(8_000);
    expect(result.totalNetPayout).toBe(22_500);
  });
});
