import type { CashEntry } from "../types";

export interface CashbookReportFilters {
  dateFrom?: string;
  dateTo?: string;
  locationId?: string;
  scopeLocationId?: string;
}

export interface CashbookReportSummary {
  entries: CashEntry[];
  totalCashIn: number;
  totalCashOut: number;
  otherIncome: number;
  operatingExpense: number;
  excludedAmount: number;
  unclassifiedCount: number;
}

export function summarizeCashbookForReport(
  entries: CashEntry[] = [],
  filters: CashbookReportFilters = {},
): CashbookReportSummary {
  const selected = entries.filter(
    (entry) =>
      (!filters.dateFrom || entry.transactionDate >= filters.dateFrom) &&
      (!filters.dateTo || entry.transactionDate <= filters.dateTo) &&
      (!filters.locationId || entry.locationId === filters.locationId) &&
      (!filters.scopeLocationId || entry.locationId === filters.scopeLocationId),
  );

  return selected.reduce<CashbookReportSummary>(
    (summary, entry) => {
      const amount = Number(entry.amount) || 0;
      if (entry.type === "in") summary.totalCashIn += amount;
      if (entry.type === "out") summary.totalCashOut += amount;

      if (entry.reportTreatment === "other_income" && entry.type === "in") {
        summary.otherIncome += amount;
      } else if (
        entry.reportTreatment === "operating_expense" &&
        entry.type === "out"
      ) {
        summary.operatingExpense += amount;
      } else {
        summary.excludedAmount += amount;
        // `excluded` adalah pilihan akuntansi yang valid. Hanya data warisan
        // tanpa klasifikasi yang perlu ditandai untuk pemeriksaan.
        if (!entry.reportTreatment) summary.unclassifiedCount += 1;
      }
      return summary;
    },
    {
      entries: selected,
      totalCashIn: 0,
      totalCashOut: 0,
      otherIncome: 0,
      operatingExpense: 0,
      excludedAmount: 0,
      unclassifiedCount: 0,
    },
  );
}

export function calculateNetProfit(
  grossProfit: number,
  summary: Pick<CashbookReportSummary, "otherIncome" | "operatingExpense">,
) {
  return grossProfit + summary.otherIncome - summary.operatingExpense;
}
