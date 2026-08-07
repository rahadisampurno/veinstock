import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData, Payroll } from "../types";
import { payrollSlipHtml, printPayrollSlip } from "./payrollSlip";

const payroll: Payroll = { id: "payroll-abcdef", employeeId: "employee-1", period: "2026-08", grossAmount: 2_000_000, status: "paid", paidAt: "2026-08-07T03:00:00.000Z", note: "Transfer BCA" };
const data = { business: { name: "Menengs <Official>", ownerName: "Owner Meneng" }, users: [{ id: "user-1", name: "Rina", email: "rina@example.com", role: "cashier", active: true }], employees: [{ id: "employee-1", userId: "user-1", locationId: "location-1", position: "Kasir", monthlySalary: 2_000_000, active: true }], locations: [{ id: "location-1", name: "Outlet Utama", type: "outlet", active: true }], products: [], balances: [], transfers: [], sales: [], movements: [], stockCounts: [] } as AppData;

describe("payroll slip", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders employee, period, salary, note, and safe business data", () => {
    const html = payrollSlipHtml(payroll, data);
    expect(html).toContain("Agustus 2026");
    expect(html).toContain("Rina");
    expect(html).toContain("Rp 2.000.000");
    expect(html).toContain("Transfer BCA");
    expect(html).toContain("Menengs &lt;Official&gt;");
    expect(html).toContain("tidak dipotong otomatis");
    expect(html).toContain("7 Agustus 2026, 10.00 WIB");
    expect(html).toContain("TOTAL DITERIMA");
    expect(html).toContain("PENGHASILAN");
    expect(html).toContain("POTONGAN");
    expect(html).toContain("LUNAS");
  });

  it("keeps the historical identity snapshot when current employee data changes", () => {
    const html = payrollSlipHtml({ ...payroll, employeeName: "Rina Lama", positionSnapshot: "Kasir Senior", locationNameSnapshot: "Outlet Lama" }, data);
    expect(html).toContain("Rina Lama");
    expect(html).toContain("Kasir Senior");
    expect(html).toContain("Outlet Lama");
  });

  it("prints through a reserved browser window", () => {
    const write = vi.fn(), print = vi.fn();
    const reservedWindow = { document: { open: vi.fn(), write, close: vi.fn() }, focus: vi.fn(), print } as unknown as Window;
    vi.stubGlobal("window", { open: vi.fn(), setTimeout: (callback: () => void) => { callback(); return 1; } });
    printPayrollSlip(payroll, data, reservedWindow);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("SLIP GAJI"));
    expect(print).toHaveBeenCalledOnce();
  });

  it("reports when the browser blocks the print popup", () => {
    vi.stubGlobal("window", { open: vi.fn(() => null), setTimeout: vi.fn() });
    expect(() => printPayrollSlip(payroll, data)).toThrow("Izinkan popup browser");
  });
});
