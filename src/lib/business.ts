export interface ChargeLike {
  totalBilledYen: number;
  paidYen: number;
  status?: string;
}

export interface PaymentLike {
  amountYen: number;
}

export interface AllocationLike {
  amountYen: number;
  status: string;
}

export interface DepositTransactionLike {
  amountYen: number;
  transactionType: string;
}

export interface ExpenseLike {
  amountYen: number;
  category: string;
  propertyId?: string | null;
}

export function calculateUnpaid(charge: ChargeLike): number {
  return Math.max(0, charge.totalBilledYen - charge.paidYen);
}

export function calculateChargeStatus(totalBilledYen: number, paidYen: number): string {
  if (paidYen <= 0) return "請求済";
  if (paidYen < totalBilledYen) return "一部入金";
  if (paidYen === totalBilledYen) return "入金済";
  return "過入金";
}

export function calculatePaymentStatus(payment: PaymentLike, allocations: AllocationLike[]): string {
  const activeAllocated = allocations.filter((item) => item.status === "有効").reduce((sum, item) => sum + item.amountYen, 0);
  if (activeAllocated <= 0) return "未消込";
  if (activeAllocated < payment.amountYen) return "一部消込";
  if (activeAllocated === payment.amountYen) return "消込済";
  return "消込済";
}

export function validateAllocationAmount(paymentRemainingYen: number, chargeRemainingYen: number, amountYen: number): string | null {
  if (amountYen <= 0) return "消込する金額は1円以上で入力してください。";
  if (amountYen > paymentRemainingYen) return "消込する金額が、入金の残額を超えています。金額を確認してください。";
  if (amountYen > chargeRemainingYen) return "消込する金額が、請求の残額を超えています。金額を確認してください。";
  return null;
}

export function calculateDepositBalance(transactions: DepositTransactionLike[]): number {
  return transactions.reduce((balance, item) => {
    if (item.transactionType === "預り" || item.transactionType === "修正") return balance + item.amountYen;
    if (item.transactionType === "控除" || item.transactionType === "返金" || item.transactionType === "振替") return balance - item.amountYen;
    return balance;
  }, 0);
}

export function detectPaymentDuplicateKey(input: { paidAt: string; amountYen: number; payerName: string; description?: string | null }): string {
  return [input.paidAt.slice(0, 10), input.amountYen, input.payerName.trim().replace(/\s+/g, ""), input.description?.trim() ?? ""].join("|");
}

export function aggregateExpensesByCategory(expenses: ExpenseLike[]): Array<{ name: string; value: number }> {
  const map = new Map<string, number>();
  for (const expense of expenses) {
    map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amountYen);
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}
