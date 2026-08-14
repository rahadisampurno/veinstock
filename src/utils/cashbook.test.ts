import { describe, expect, it } from "vitest";
import type { CashEntry } from "../types";
import { calculateNetProfit, summarizeCashbookForReport } from "./cashbook";

const entry = (
  id: string,
  overrides: Partial<CashEntry> = {},
): CashEntry => ({
  id,
  type: "in",
  transactionDate: "2026-08-14",
  locationId: "outlet-a",
  category: "Pendapatan lain",
  amount: 100_000,
  paymentMethod: "Tunai",
  reportTreatment: "other_income",
  createdAt: "2026-08-14T03:00:00.000Z",
  createdBy: "owner-a",
  ...overrides,
});

describe("ringkasan Buku Kas untuk laporan", () => {
  it("hanya memasukkan pendapatan dan beban yang memengaruhi laba", () => {
    const summary = summarizeCashbookForReport([
      entry("income"),
      entry("capital", {
        category: "Modal tambahan",
        amount: 500_000,
        reportTreatment: "excluded",
      }),
      entry("expense", {
        type: "out",
        category: "Listrik",
        amount: 25_000,
        reportTreatment: "operating_expense",
      }),
      entry("asset", {
        type: "out",
        category: "Beli mesin",
        amount: 300_000,
        reportTreatment: "excluded",
      }),
    ]);

    expect(summary.totalCashIn).toBe(600_000);
    expect(summary.totalCashOut).toBe(325_000);
    expect(summary.otherIncome).toBe(100_000);
    expect(summary.operatingExpense).toBe(25_000);
    expect(summary.excludedAmount).toBe(800_000);
    expect(calculateNetProfit(250_000, summary)).toBe(325_000);
  });

  it("mengikuti filter periode dan lokasi", () => {
    const summary = summarizeCashbookForReport(
      [
        entry("selected"),
        entry("old", { transactionDate: "2026-07-31" }),
        entry("other-location", { locationId: "outlet-b" }),
      ],
      {
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        locationId: "outlet-a",
      },
    );

    expect(summary.entries.map((item) => item.id)).toEqual(["selected"]);
    expect(summary.otherIncome).toBe(100_000);
  });

  it("menganggap data lama tanpa klasifikasi sebagai tidak memengaruhi laba", () => {
    const summary = summarizeCashbookForReport([
      entry("legacy", { reportTreatment: undefined }),
    ]);

    expect(summary.otherIncome).toBe(0);
    expect(summary.excludedAmount).toBe(100_000);
    expect(summary.unclassifiedCount).toBe(1);
  });
});
