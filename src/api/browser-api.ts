import type { AllocationCandidate, AllocationRecord, ContractRecord, DashboardSummary, DepositTransactionRecord, DocumentRecord, ExpenseRecord, MonthlyChargeRecord, OwnerLedgerApi, PaymentCsvRow, PaymentRecord, PropertyRecord, RepairRecord, SetupPayload, SpotChargeRecord, TenantRecord, UnitRecord } from "../types";
import { currentMonth } from "../lib/format";

const key = "ownerledger-local-browser-data";

interface Store {
  setupCompleted: boolean;
  properties: PropertyRecord[];
  units: UnitRecord[];
  tenants: TenantRecord[];
  contracts: ContractRecord[];
  charges: MonthlyChargeRecord[];
  spotCharges: SpotChargeRecord[];
  payments: PaymentRecord[];
  allocations: AllocationRecord[];
  expenses: ExpenseRecord[];
  deposits: DepositTransactionRecord[];
  repairs: RepairRecord[];
  documents: DocumentRecord[];
}

function load(): Store {
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw) as Store;
  return { setupCompleted: false, properties: [], units: [], tenants: [], contracts: [], charges: [], spotCharges: [], payments: [], allocations: [], expenses: [], deposits: [], repairs: [], documents: [] };
}

function save(store: Store): void {
  localStorage.setItem(key, JSON.stringify(store));
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export const browserApi: OwnerLedgerApi = {
  async isReady() {
    return load().setupCompleted;
  },
  async completeSetup(payload: SetupPayload) {
    const store = load();
    const property: PropertyRecord = {
      id: id("property"),
      name: payload.propertyName,
      propertyType: payload.propertyType,
      address: payload.propertyAddress,
      totalUnits: payload.totalUnits,
      managementType: "自主管理",
      status: "保有中"
    };
    const unit: UnitRecord = {
      id: id("unit"),
      propertyId: property.id,
      propertyName: property.name,
      roomNumber: payload.roomNumber,
      expectedRentYen: payload.rentYen,
      currentRentYen: payload.unitStatus === "入居中" ? payload.rentYen : 0,
      commonFeeYen: 0,
      parkingFeeYen: 0,
      otherMonthlyFeeYen: 0,
      status: payload.unitStatus
    };
    save({ ...store, setupCompleted: true, properties: [property], units: [unit] });
  },
  async getDashboard(targetMonth: string = currentMonth()): Promise<DashboardSummary> {
    const store = load();
    const expected = store.contracts.reduce((sum, item) => sum + item.rentYen + item.commonFeeYen + item.managementFeeYen + item.parkingFeeYen + item.otherMonthlyFeeYen, 0);
    const occupied = store.units.filter((item) => item.status === "入居中").length;
    const vacant = store.units.length - occupied;
    return {
      targetMonth,
      monthlyExpectedRentYen: expected,
      monthlyPaidYen: 0,
      monthlyUnpaidYen: expected,
      monthlyExpenseYen: 0,
      monthlyCashFlowYen: 0,
      annualIncomeYen: 0,
      annualExpenseYen: 0,
      annualProfitYen: 0,
      occupancyRate: store.units.length ? Math.round((occupied / store.units.length) * 100) : 0,
      vacantUnits: vacant,
      delinquencyCount: expected > 0 ? store.contracts.length : 0,
      delinquencyTotalYen: expected,
      depositBalanceYen: store.contracts.reduce((sum, item) => sum + item.securityDepositYen + item.guaranteeDepositYen, 0),
      repairPlannedCount: 0,
      repairApprovalWaitingCount: 0,
      loanBalanceYen: 0,
      propertyCount: store.properties.length,
      actionCards: expected > 0 ? [{ title: "家賃が未入金の入居者がいます", description: "月次請求を生成し、入金確認を進めてください。", severity: "warning", destination: "家賃・入金" }] : [],
      monthlyTrend: [],
      propertyProfitRanking: store.properties.map((item) => ({ name: item.name, profitYen: 0 })),
      expenseCategoryBreakdown: []
    };
  },
  async listProperties() {
    return load().properties;
  },
  async createProperty(input) {
    const store = load();
    const property = { ...input, id: id("property") };
    save({ ...store, properties: [property, ...store.properties] });
    return property;
  },
  async archiveProperty(idValue) {
    const store = load();
    save({ ...store, properties: store.properties.filter((item) => item.id !== idValue) });
  },
  async listUnits() {
    const store = load();
    return store.units.map((unit) => ({ ...unit, propertyName: store.properties.find((property) => property.id === unit.propertyId)?.name }));
  },
  async createUnit(input) {
    const store = load();
    const propertyName = store.properties.find((property) => property.id === input.propertyId)?.name;
    const unit = { ...input, id: id("unit"), propertyName };
    save({ ...store, units: [unit, ...store.units] });
    return unit;
  },
  async listTenants() {
    return load().tenants;
  },
  async createTenant(input) {
    const store = load();
    const tenant = { ...input, id: id("tenant") };
    save({ ...store, tenants: [tenant, ...store.tenants] });
    return tenant;
  },
  async listContracts() {
    const store = load();
    return store.contracts.map((contract) => ({
      ...contract,
      propertyName: store.properties.find((item) => item.id === contract.propertyId)?.name,
      roomNumber: store.units.find((item) => item.id === contract.unitId)?.roomNumber,
      tenantName: store.tenants.find((item) => item.id === contract.tenantId)?.displayName
    }));
  },
  async createContract(input) {
    const store = load();
    const contract = { ...input, id: id("contract") };
    save({ ...store, contracts: [contract, ...store.contracts] });
    return contract;
  },
  async generateMonthlyCharges(targetMonth: string) {
    const store = load();
    let created = 0;
    let skipped = 0;
    const charges = [...store.charges];
    for (const contract of store.contracts) {
      if (charges.some((charge) => charge.contractId === contract.id && charge.targetMonth === targetMonth)) {
        skipped += 1;
        continue;
      }
      const total = contract.rentYen + contract.commonFeeYen + contract.managementFeeYen + contract.parkingFeeYen + contract.otherMonthlyFeeYen;
      charges.push({
        id: id("charge"),
        targetMonth,
        contractId: contract.id,
        tenantName: store.tenants.find((item) => item.id === contract.tenantId)?.displayName,
        propertyName: store.properties.find((item) => item.id === contract.propertyId)?.name,
        roomNumber: store.units.find((item) => item.id === contract.unitId)?.roomNumber,
        rentYen: contract.rentYen,
        commonFeeYen: contract.commonFeeYen,
        managementFeeYen: contract.managementFeeYen,
        parkingFeeYen: contract.parkingFeeYen,
        otherMonthlyFeeYen: contract.otherMonthlyFeeYen,
        spotChargeTotalYen: 0,
        totalBilledYen: total,
        paidYen: 0,
        unpaidYen: total,
        status: "請求済"
      });
      created += 1;
    }
    save({ ...store, charges });
    return { created, skipped };
  },
  async listMonthlyCharges(targetMonth?: string) {
    const store = load();
    return store.charges.filter((charge) => !targetMonth || charge.targetMonth === targetMonth);
  },
  async listSpotCharges() {
    return load().spotCharges;
  },
  async createSpotCharge(input) {
    const store = load();
    const contract = store.contracts.find((item) => item.id === input.contractId);
    const spotCharge: SpotChargeRecord = {
      ...input,
      id: id("spot"),
      tenantName: store.tenants.find((item) => item.id === contract?.tenantId)?.displayName,
      propertyName: store.properties.find((item) => item.id === contract?.propertyId)?.name,
      roomNumber: store.units.find((item) => item.id === contract?.unitId)?.roomNumber,
      allocatedYen: 0,
      remainingYen: input.amountYen,
      status: input.status ?? "請求済",
      paidStatus: input.paidStatus ?? "未入金"
    };
    save({ ...store, spotCharges: [spotCharge, ...store.spotCharges] });
    return spotCharge;
  },
  async listPayments() {
    return load().payments;
  },
  async createPayment(input) {
    const store = load();
    const payment: PaymentRecord = { ...input, id: id("payment"), source: input.source ?? "手動登録", status: "未消込", allocatedYen: 0, remainingYen: input.amountYen };
    save({ ...store, payments: [payment, ...store.payments] });
    return payment;
  },
  async findAllocationCandidates(paymentId: string) {
    const store = load();
    const payment = store.payments.find((item) => item.id === paymentId);
    if (!payment) return [];
    const monthlyCandidates: AllocationCandidate[] = store.charges
      .filter((charge) => charge.unpaidYen > 0)
      .map((charge) => ({
        chargeKind: "月次請求" as const,
        monthlyChargeId: charge.id,
        targetMonth: charge.targetMonth,
        tenantName: charge.tenantName ?? "",
        propertyName: charge.propertyName ?? "",
        roomNumber: charge.roomNumber ?? "",
        totalBilledYen: charge.totalBilledYen,
        unpaidYen: charge.unpaidYen,
        score: payment.amountYen === charge.unpaidYen ? 80 : 20,
        reasons: payment.amountYen === charge.unpaidYen ? ["金額が未入金額と一致"] : ["手動確認が必要"]
      }));
    const spotCandidates: AllocationCandidate[] = store.spotCharges.filter((spot) => spot.remainingYen > 0).map((spot) => ({
        chargeKind: "スポット請求" as const,
        spotChargeId: spot.id,
        tenantName: spot.tenantName ?? "",
        propertyName: spot.propertyName ?? "",
        roomNumber: spot.roomNumber ?? "",
        totalBilledYen: spot.amountYen,
        unpaidYen: spot.remainingYen,
        description: `${spot.chargeType}: ${spot.description}`,
        score: payment.amountYen === spot.remainingYen ? 80 : 20,
        reasons: payment.amountYen === spot.remainingYen ? ["金額がスポット請求の未入金額と一致"] : ["手動確認が必要"]
      }));
    return [...monthlyCandidates, ...spotCandidates];
  },
  async createAllocation(input) {
    const store = load();
    const allocation: AllocationRecord = { ...input, id: id("allocation"), status: "有効", allocatedAt: new Date().toISOString() };
    const charges = store.charges.map((charge) => charge.id === input.monthlyChargeId ? { ...charge, paidYen: charge.paidYen + input.amountYen, unpaidYen: Math.max(0, charge.unpaidYen - input.amountYen), status: charge.unpaidYen - input.amountYen <= 0 ? "入金済" : "一部入金" } : charge);
    const spotCharges = store.spotCharges.map((spot) => spot.id === input.spotChargeId ? { ...spot, allocatedYen: spot.allocatedYen + input.amountYen, remainingYen: Math.max(0, spot.remainingYen - input.amountYen), paidStatus: spot.remainingYen - input.amountYen <= 0 ? "入金済" : "一部入金" } : spot);
    const payments = store.payments.map((payment) => payment.id === input.paymentId ? { ...payment, allocatedYen: payment.allocatedYen + input.amountYen, remainingYen: Math.max(0, payment.remainingYen - input.amountYen), status: payment.remainingYen - input.amountYen <= 0 ? "消込済" : "一部消込" } : payment);
    save({ ...store, charges, spotCharges, payments, allocations: [allocation, ...store.allocations] });
  },
  async cancelAllocation(idValue: string) {
    const store = load();
    const target = store.allocations.find((item) => item.id === idValue);
    if (!target || target.status !== "有効") return;
    const charges = store.charges.map((charge) => charge.id === target.monthlyChargeId ? {
      ...charge,
      paidYen: Math.max(0, charge.paidYen - target.amountYen),
      unpaidYen: charge.unpaidYen + target.amountYen,
      status: charge.paidYen - target.amountYen <= 0 ? "請求済" : "一部入金"
    } : charge);
    const spotCharges = store.spotCharges.map((spot) => spot.id === target.spotChargeId ? {
      ...spot,
      allocatedYen: Math.max(0, spot.allocatedYen - target.amountYen),
      remainingYen: spot.remainingYen + target.amountYen,
      paidStatus: spot.allocatedYen - target.amountYen <= 0 ? "未入金" : "一部入金"
    } : spot);
    const payments = store.payments.map((payment) => payment.id === target.paymentId ? {
      ...payment,
      allocatedYen: Math.max(0, payment.allocatedYen - target.amountYen),
      remainingYen: payment.remainingYen + target.amountYen,
      status: payment.allocatedYen - target.amountYen <= 0 ? "未消込" : "一部消込"
    } : payment);
    save({ ...store, charges, spotCharges, payments, allocations: store.allocations.map((item) => item.id === idValue ? { ...item, status: "取消" } : item) });
  },
  async importPaymentCsv(rows: PaymentCsvRow[]) {
    const store = load();
    const payments = rows.map((row) => ({ ...row, id: id("payment"), status: "未消込", source: "CSV取込", allocatedYen: 0, remainingYen: row.amountYen }));
    save({ ...store, payments: [...payments, ...store.payments] });
    return { imported: payments.length, duplicates: 0, errors: 0 };
  },
  async listAllocations(paymentId?: string) {
    const store = load();
    return store.allocations.filter((item) => !paymentId || item.paymentId === paymentId);
  },
  async createBackup() {
    return { backupPath: "ブラウザ確認モードではバックアップファイルは作成されません。Electronで起動してください。" };
  },
  async listExpenses() {
    return load().expenses;
  },
  async createExpense(input) {
    const store = load();
    const property = store.properties.find((item) => item.id === input.propertyId);
    const unit = store.units.find((item) => item.id === input.unitId);
    const expense: ExpenseRecord = { ...input, id: id("expense"), propertyName: property?.name, roomNumber: unit?.roomNumber, status: input.status ?? "有効" };
    save({ ...store, expenses: [expense, ...store.expenses] });
    return expense;
  },
  async cancelExpense(idValue: string) {
    const store = load();
    save({ ...store, expenses: store.expenses.map((item) => item.id === idValue ? { ...item, status: "取消" } : item) });
  },
  async listDepositTransactions() {
    return load().deposits;
  },
  async createDepositTransaction(input) {
    const store = load();
    const contract = store.contracts.find((item) => item.id === input.contractId);
    const currentBalance = store.deposits.filter((item) => item.contractId === input.contractId && item.status === "有効").at(0)?.balanceAfterYen ?? 0;
    const balanceAfterYen = input.transactionType === "預り" || input.transactionType === "修正" ? currentBalance + input.amountYen : currentBalance - input.amountYen;
    if (balanceAfterYen < 0) throw new Error("敷金・預り金の残高がマイナスになります。金額または取引種別を確認してください。");
    const deposit: DepositTransactionRecord = {
      ...input,
      id: id("deposit"),
      balanceAfterYen,
      status: input.status ?? "有効",
      tenantName: store.tenants.find((item) => item.id === contract?.tenantId)?.displayName,
      propertyName: store.properties.find((item) => item.id === contract?.propertyId)?.name,
      roomNumber: store.units.find((item) => item.id === contract?.unitId)?.roomNumber
    };
    save({ ...store, deposits: [deposit, ...store.deposits] });
    return deposit;
  },
  async cancelDepositTransaction(idValue: string) {
    const store = load();
    save({ ...store, deposits: store.deposits.map((item) => item.id === idValue ? { ...item, status: "取消" } : item) });
  },
  async listRepairs() {
    return load().repairs;
  },
  async createRepair(input) {
    const store = load();
    const property = store.properties.find((item) => item.id === input.propertyId);
    const unit = store.units.find((item) => item.id === input.unitId);
    const repair: RepairRecord = { ...input, id: id("repair"), propertyName: property?.name, roomNumber: unit?.roomNumber, linkedExpenseId: null };
    save({ ...store, repairs: [repair, ...store.repairs] });
    return repair;
  },
  async linkRepairExpense(input) {
    const store = load();
    const repair = store.repairs.find((item) => item.id === input.repairId);
    if (!repair) return;
    const amountYen = repair.finalAmountYen || repair.estimateAmountYen || 0;
    if (amountYen <= 0) throw new Error("支出に連携するには、見積金額または確定金額を入力してください。");
    const expense: ExpenseRecord = {
      id: id("expense"),
      spentAt: new Date().toISOString(),
      payee: repair.vendorName || "修繕業者",
      propertyId: repair.propertyId,
      propertyName: repair.propertyName,
      unitId: repair.unitId,
      roomNumber: repair.roomNumber,
      category: repair.repairType === "原状回復" ? "原状回復費" : "修繕費",
      amountYen,
      taxType: "課税",
      paymentMethod: input.paymentMethod || "振込",
      hasReceipt: false,
      status: "有効",
      memo: `修繕「${repair.description}」から連携`
    };
    save({ ...store, expenses: [expense, ...store.expenses], repairs: store.repairs.map((item) => item.id === repair.id ? { ...item, linkedExpenseId: expense.id } : item) });
  },
  async listDocuments() {
    return load().documents;
  },
  async attachDocument(input) {
    const store = load();
    const property = store.properties.find((item) => item.id === input.propertyId);
    const unit = store.units.find((item) => item.id === input.unitId);
    const contract = store.contracts.find((item) => item.id === input.contractId);
    const document: DocumentRecord = {
      ...input,
      id: id("document"),
      originalFileName: "browser-preview-file.pdf",
      storedPath: "ブラウザ確認モード",
      mimeType: "application/pdf",
      sizeBytes: 0,
      sha256Hash: "browser-preview",
      propertyName: property?.name,
      roomNumber: unit?.roomNumber,
      tenantName: store.tenants.find((item) => item.id === contract?.tenantId)?.displayName,
      status: input.status ?? "有効"
    };
    const expenses = input.expenseId ? store.expenses.map((expense) => expense.id === input.expenseId ? { ...expense, hasReceipt: true } : expense) : store.expenses;
    save({ ...store, expenses, documents: [document, ...store.documents] });
    return document;
  },
  async archiveDocument(idValue) {
    const store = load();
    save({ ...store, documents: store.documents.map((item) => item.id === idValue ? { ...item, status: "使用停止" } : item) });
  },
  async getReportSummary(targetYear: number) {
    const store = load();
    const charges = store.charges.filter((item) => item.targetMonth.startsWith(String(targetYear)));
    const expenses = store.expenses.filter((item) => item.spentAt.startsWith(String(targetYear)) && item.status !== "取消");
    const annualRentIncomeYen = charges.reduce((sum, item) => sum + item.rentYen, 0);
    const annualCommonFeeIncomeYen = charges.reduce((sum, item) => sum + item.commonFeeYen + item.managementFeeYen, 0);
    const annualOtherIncomeYen = charges.reduce((sum, item) => sum + item.parkingFeeYen + item.otherMonthlyFeeYen + item.spotChargeTotalYen, 0);
    const annualExpenseYen = expenses.reduce((sum, item) => sum + item.amountYen, 0);
    return {
      targetYear,
      annualRentIncomeYen,
      annualCommonFeeIncomeYen,
      annualOtherIncomeYen,
      annualExpenseYen,
      annualProfitYen: annualRentIncomeYen + annualCommonFeeIncomeYen + annualOtherIncomeYen - annualExpenseYen,
      unpaidTotalYen: charges.reduce((sum, item) => sum + item.unpaidYen, 0),
      depositBalanceYen: store.deposits.filter((item) => item.status === "有効").reduce((sum, item) => item.transactionType === "預り" || item.transactionType === "修正" ? sum + item.amountYen : sum - item.amountYen, 0),
      missingReceiptExpenseCount: expenses.filter((item) => !item.hasReceipt).length,
      propertyRows: store.properties.map((property) => {
        const incomeYen = charges.filter((charge) => charge.propertyName === property.name).reduce((sum, charge) => sum + charge.paidYen, 0);
        const expenseYen = expenses.filter((expense) => expense.propertyId === property.id).reduce((sum, expense) => sum + expense.amountYen, 0);
        return { propertyId: property.id, propertyName: property.name, incomeYen, expenseYen, profitYen: incomeYen - expenseYen };
      }),
      expenseCategoryRows: expenseCategoriesForBrowser(expenses),
      monthlyRows: Array.from({ length: 12 }).map((_, index) => {
        const month = `${targetYear}-${String(index + 1).padStart(2, "0")}`;
        const incomeYen = charges.filter((item) => item.targetMonth === month).reduce((sum, item) => sum + item.paidYen, 0);
        const expenseYen = expenses.filter((item) => item.spentAt.startsWith(month)).reduce((sum, item) => sum + item.amountYen, 0);
        return { month, incomeYen, expenseYen, profitYen: incomeYen - expenseYen };
      })
    };
  },
  async exportTaxCsv(targetYear: number) {
    return { outputPath: `ブラウザ確認モード: ownerledger-tax-export-${targetYear}.csv` };
  },
  async restoreBackup() {
    return {
      restoredFrom: "ブラウザ確認モードでは復元ファイルは読み込まれません。",
      safetyBackupPath: "ブラウザ確認モード"
    };
  }
};

function expenseCategoriesForBrowser(expenses: ExpenseRecord[]): Array<{ category: string; amountYen: number }> {
  const map = new Map<string, number>();
  for (const expense of expenses) map.set(expense.category, (map.get(expense.category) ?? 0) + expense.amountYen);
  return Array.from(map.entries()).map(([category, amountYen]) => ({ category, amountYen }));
}

export function getApi(): OwnerLedgerApi {
  return window.ownerLedger ?? browserApi;
}
