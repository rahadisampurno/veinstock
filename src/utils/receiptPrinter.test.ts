import { afterEach, describe, expect, it, vi } from "vitest";
import { disconnectPrinter, isPrinterConnected, receiptHtml, reconnectSavedPrinter, systemPrintSale } from "./receiptPrinter";
import type { AppData, Sale } from "../types";

const sale: Sale = {
  id: "sale-12345678",
  locationId: "outlet-1",
  channel: "offline",
  total: 30_000,
  payment: "Tunai",
  cashierId: "cashier-1",
  createdAt: "2026-08-07T03:00:00.000Z",
  status: "completed",
  items: [{ variantId: "variant-1", quantity: 2, unit: "Pcs", unitCost: 8_000, subtotal: 30_000 }],
};

const data = {
  business: { name: "Menengs <Outlet>", ownerName: "Owner", address: "Jl. Contoh 1", phone: "08123456789" },
  users: [{ id: "cashier-1", name: "Rina Kasir", email: "rina@example.com", role: "cashier", active: true }],
  locations: [{ id: "outlet-1", name: "Outlet Utama", type: "outlet", active: true }],
  products: [{ id: "product-1", name: "Keripik", category: "Snack", unit: "Pcs", active: true, variants: [{ id: "variant-1", name: "Balado", sku: "BLD", cost: 8_000, price: 15_000, resellerPrice: 12_000, minStock: 1 }] }],
  balances: [], transfers: [], sales: [sale], movements: [], stockCounts: [],
} as AppData;

describe("receipt printer", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("renders a safe 58 mm receipt with transaction, cashier, items, and total", () => {
    const html = receiptHtml(sale, data, { mode: "system", paperWidth: "58", copies: 1 });
    expect(html).toContain("size:58mm auto");
    expect(html).toContain("TRX-12345678");
    expect(html).toContain("Rina Kasir");
    expect(html).toContain("Keripik - Balado");
    expect(html).toContain("Rp 30.000");
    expect(html).toContain("Menengs &lt;Outlet&gt;");
    expect(html).not.toContain("Menengs <Outlet>");
  });

  it("renders 80 mm paper when configured", () => {
    expect(receiptHtml(sale, data, { mode: "system", paperWidth: "80", copies: 2 })).toContain("size:80mm auto");
  });

  it("prints through a hidden iframe without opening another tab", () => {
    const write = vi.fn(), print = vi.fn(), focus = vi.fn();
    const printWindow = { document: { open: vi.fn(), write, close: vi.fn(), readyState: "complete" }, print, focus } as unknown as Window;
    const frame = { style: {}, setAttribute: vi.fn(), contentWindow: printWindow, remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn(() => frame), body: { appendChild } });
    vi.stubGlobal("window", { open: vi.fn(), setTimeout: (callback: () => void) => { callback(); return 1; } });
    systemPrintSale(sale, data, { mode: "system", paperWidth: "58", copies: 1 });
    expect(write).toHaveBeenCalledWith(expect.stringContaining("TRX-12345678"));
    expect(appendChild).toHaveBeenCalledWith(frame);
    expect(window.open).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
  });

  it("reports when an inline print frame cannot be prepared", () => {
    const frame = { style: {}, setAttribute: vi.fn(), contentWindow: null, remove: vi.fn() };
    vi.stubGlobal("document", { createElement: vi.fn(() => frame), body: { appendChild: vi.fn() } });
    expect(() => systemPrintSale(sale, data, { mode: "system", paperWidth: "58", copies: 1 })).toThrow("Pratinjau cetak tidak dapat disiapkan");
  });

  it("reconnects an already-authorized USB printer without opening a chooser", async () => {
    const device: any = {
      vendorId: 1234,
      productId: 5678,
      serialNumber: "MENENGS-01",
      productName: "Thermal USB",
      opened: false,
      configuration: { interfaces: [{ interfaceNumber: 1, alternates: [{ endpoints: [{ direction: "out", endpointNumber: 2 }] }] }] },
      open: vi.fn(async () => { device.opened = true; }),
      claimInterface: vi.fn(async () => undefined),
      close: vi.fn(async () => { device.opened = false; }),
    };
    const getDevices = vi.fn(async () => [device]);
    vi.stubGlobal("navigator", { usb: { getDevices, addEventListener: vi.fn() } });
    const restored = await reconnectSavedPrinter({ mode: "usb", paperWidth: "58", copies: 1, usbVendorId: 1234, usbProductId: 5678, usbSerialNumber: "MENENGS-01" });
    expect(restored).toBe(true);
    expect(getDevices).toHaveBeenCalledOnce();
    expect(isPrinterConnected("usb")).toBe(true);
    disconnectPrinter("usb");
  });
});
