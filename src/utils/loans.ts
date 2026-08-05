export const calculateLoanInstallment = (amount: number, installmentCount: number) => {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(installmentCount) || installmentCount < 1) return 0;
  return Math.ceil(amount / installmentCount);
};

export const loanInstallmentDue = (loan: { amount?: number; installmentAmount?: number; paidInstallments?: number }) => {
  const amount = Math.max(0, Number(loan.amount || 0));
  const installment = Math.max(0, Number(loan.installmentAmount || 0));
  const paid = Math.max(0, Number(loan.paidInstallments || 0));
  return Math.min(installment, Math.max(0, amount - installment * paid));
};
