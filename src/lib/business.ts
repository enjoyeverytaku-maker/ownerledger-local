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

export interface ProratedChargeInput {
  targetMonth: string;
  startDate: string;
  endDate?: string | null;
  rentYen: number;
  commonFeeYen: number;
  managementFeeYen: number;
  parkingFeeYen: number;
  otherMonthlyFeeYen: number;
}

export interface ProratedChargeResult {
  billableDays: number;
  daysInMonth: number;
  rentYen: number;
  commonFeeYen: number;
  managementFeeYen: number;
  parkingFeeYen: number;
  otherMonthlyFeeYen: number;
  totalBilledYen: number;
  memo: string | null;
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

function localDate(dateText: string): Date {
  const [year, month, day] = dateText.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysInTargetMonth(targetMonth: string): number {
  const [year, month] = targetMonth.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function prorate(amountYen: number, billableDays: number, daysInMonth: number): number {
  return Math.round((amountYen * billableDays) / daysInMonth);
}

export function calculateProratedMonthlyCharge(input: ProratedChargeInput): ProratedChargeResult | null {
  const [year, month] = input.targetMonth.split("-").map(Number);
  const daysInMonth = daysInTargetMonth(input.targetMonth);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth);
  const startDate = localDate(input.startDate);
  const endDate = input.endDate ? localDate(input.endDate) : null;
  const billStart = startDate > monthStart ? startDate : monthStart;
  const billEnd = endDate && endDate < monthEnd ? endDate : monthEnd;
  if (billStart > billEnd) return null;
  const billableDays = Math.floor((billEnd.getTime() - billStart.getTime()) / 86400000) + 1;
  const rentYen = prorate(input.rentYen, billableDays, daysInMonth);
  const commonFeeYen = prorate(input.commonFeeYen, billableDays, daysInMonth);
  const managementFeeYen = prorate(input.managementFeeYen, billableDays, daysInMonth);
  const parkingFeeYen = prorate(input.parkingFeeYen, billableDays, daysInMonth);
  const otherMonthlyFeeYen = prorate(input.otherMonthlyFeeYen, billableDays, daysInMonth);
  const isProrated = billableDays !== daysInMonth;
  return {
    billableDays,
    daysInMonth,
    rentYen,
    commonFeeYen,
    managementFeeYen,
    parkingFeeYen,
    otherMonthlyFeeYen,
    totalBilledYen: rentYen + commonFeeYen + managementFeeYen + parkingFeeYen + otherMonthlyFeeYen,
    memo: isProrated ? `日割り計算: ${dateKey(billStart)}から${dateKey(billEnd)}まで ${billableDays}/${daysInMonth}日` : null
  };
}

export function isRenewalMonth(targetMonth: string, renewalDate?: string | null): boolean {
  return Boolean(renewalDate && renewalDate.slice(0, 7) === targetMonth);
}
