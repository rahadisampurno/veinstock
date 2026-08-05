import { describe, expect, it } from "vitest";
import { calculateLoanInstallment, loanInstallmentDue } from "./loans";

describe("loan installment calculation", () => {
  it("updates the estimate from amount and installment count", () => {
    expect(calculateLoanInstallment(2000, 1)).toBe(2000);
    expect(calculateLoanInstallment(2000, 2)).toBe(1000);
    expect(calculateLoanInstallment(2000, 3)).toBe(667);
  });

  it("keeps the final installment equal to the exact remaining loan", () => {
    const loan = { amount: 2000, installmentAmount: 667 };
    expect(loanInstallmentDue({ ...loan, paidInstallments: 0 })).toBe(667);
    expect(loanInstallmentDue({ ...loan, paidInstallments: 1 })).toBe(667);
    expect(loanInstallmentDue({ ...loan, paidInstallments: 2 })).toBe(666);
    expect(loanInstallmentDue({ ...loan, paidInstallments: 3 })).toBe(0);
  });

  it("returns zero for invalid inputs", () => {
    expect(calculateLoanInstallment(0, 3)).toBe(0);
    expect(calculateLoanInstallment(2000, 0)).toBe(0);
  });
});
