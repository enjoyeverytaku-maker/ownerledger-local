export type PropertyType = "アパート" | "マンション" | "戸建" | "区分マンション" | "店舗" | "事務所" | "駐車場" | "その他";
export type UnitStatus = "入居中" | "空室" | "退去予定" | "募集中" | "修繕中" | "募集停止";
export type TenantType = "個人" | "法人";
export type ContractStatus = "契約中" | "退去予定" | "終了" | "申込中";
export type ChargeStatus = "未請求" | "請求済" | "一部入金" | "入金済" | "過入金" | "免除" | "取消";
export type PaymentStatus = "未消込" | "一部消込" | "消込済" | "不明入金" | "返金済";

export interface PropertyRecord {
  id: string;
  name: string;
  propertyType: PropertyType | string;
  address?: string | null;
  totalUnits: number;
  managementType: string;
  status: string;
  memo?: string | null;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
}

export interface UnitRecord {
  id: string;
  propertyId: string;
  propertyName?: string;
  roomNumber: string;
  expectedRentYen: number;
  currentRentYen: number;
  commonFeeYen: number;
  parkingFeeYen: number;
  otherMonthlyFeeYen: number;
  status: UnitStatus | string;
  memo?: string | null;
}

export interface TenantRecord {
  id: string;
  displayName: string;
  kanaName?: string | null;
  tenantType: TenantType | string;
  phone?: string | null;
  email?: string | null;
  bankTransferName?: string | null;
  status: string;
  memo?: string | null;
}

export interface ContractRecord {
  id: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  propertyName?: string;
  roomNumber?: string;
  tenantName?: string;
  startDate: string;
  endDate?: string | null;
  renewalDate?: string | null;
  rentYen: number;
  commonFeeYen: number;
  managementFeeYen: number;
  parkingFeeYen: number;
  otherMonthlyFeeYen: number;
  securityDepositYen: number;
  keyMoneyYen: number;
  guaranteeDepositYen: number;
  renewalFeeYen: number;
  renewalAdminFeeYen: number;
  paymentDueDay: number;
  paymentMethod: string;
  status: ContractStatus | string;
  memo?: string | null;
}

export interface MonthlyChargeRecord {
  id: string;
  targetMonth: string;
  contractId: string;
  tenantName?: string;
  propertyName?: string;
  roomNumber?: string;
  rentYen: number;
  commonFeeYen: number;
  managementFeeYen: number;
  parkingFeeYen: number;
  otherMonthlyFeeYen: number;
  spotChargeTotalYen: number;
  totalBilledYen: number;
  paidYen: number;
  unpaidYen: number;
  status: ChargeStatus | string;
  dueDate?: string | null;
  memo?: string | null;
}

export interface SpotChargeRecord {
  id: string;
  contractId: string;
  monthlyChargeId?: string | null;
  tenantName?: string;
  propertyName?: string;
  roomNumber?: string;
  billedAt: string;
  dueDate?: string | null;
  chargeType: string;
  description: string;
  amountYen: number;
  allocatedYen: number;
  remainingYen: number;
  taxType: string;
  status: string;
  paidStatus: string;
  memo?: string | null;
}

export interface PaymentRecord {
  id: string;
  paidAt: string;
  amountYen: number;
  payerName: string;
  description?: string | null;
  bankAccount?: string | null;
  source: string;
  status: PaymentStatus | string;
  allocatedYen: number;
  remainingYen: number;
  memo?: string | null;
}

export interface AllocationRecord {
  id: string;
  paymentId: string;
  monthlyChargeId?: string | null;
  spotChargeId?: string | null;
  amountYen: number;
  status: string;
  allocatedAt: string;
  tenantName?: string;
  propertyName?: string;
  roomNumber?: string;
  targetMonth?: string;
  chargeKind?: "月次請求" | "スポット請求";
  description?: string;
}

export interface AllocationCandidate {
  chargeKind: "月次請求" | "スポット請求";
  monthlyChargeId?: string;
  spotChargeId?: string;
  targetMonth?: string;
  tenantName: string;
  propertyName: string;
  roomNumber: string;
  totalBilledYen: number;
  unpaidYen: number;
  description?: string;
  score: number;
  reasons: string[];
}

export interface PaymentCsvRow {
  paidAt: string;
  amountYen: number;
  payerName: string;
  description?: string;
  bankAccount?: string;
}

export interface ExpenseRecord {
  id: string;
  spentAt: string;
  payee: string;
  propertyId?: string | null;
  propertyName?: string | null;
  unitId?: string | null;
  roomNumber?: string | null;
  category: string;
  amountYen: number;
  taxType: string;
  paymentMethod: string;
  hasReceipt: boolean;
  accountingMemo?: string | null;
  taxReturnCategory?: string | null;
  status: string;
  memo?: string | null;
}

export interface DepositTransactionRecord {
  id: string;
  contractId: string;
  tenantName?: string;
  propertyName?: string;
  roomNumber?: string;
  transactedAt: string;
  depositType: string;
  transactionType: string;
  amountYen: number;
  description: string;
  balanceAfterYen: number;
  status: string;
  memo?: string | null;
}

export interface RepairRecord {
  id: string;
  propertyId: string;
  propertyName?: string;
  unitId?: string | null;
  roomNumber?: string | null;
  occurredAt: string;
  description: string;
  repairType: string;
  vendorName?: string | null;
  estimateAmountYen?: number | null;
  finalAmountYen?: number | null;
  approvalStatus: string;
  workStatus: string;
  linkedExpenseId?: string | null;
  memo?: string | null;
}

export interface DocumentRecord {
  id: string;
  displayName: string;
  documentType: string;
  originalFileName: string;
  originalPath?: string | null;
  storedPath: string;
  mimeType?: string | null;
  sizeBytes: number;
  sha256Hash: string;
  propertyId?: string | null;
  propertyName?: string | null;
  unitId?: string | null;
  roomNumber?: string | null;
  contractId?: string | null;
  tenantName?: string | null;
  expenseId?: string | null;
  repairId?: string | null;
  issuedAt?: string | null;
  receivedAt?: string | null;
  amountYen?: number | null;
  counterparty?: string | null;
  status: string;
  memo?: string | null;
}

export interface DashboardSummary {
  targetMonth: string;
  monthlyExpectedRentYen: number;
  monthlyPaidYen: number;
  monthlyUnpaidYen: number;
  monthlyExpenseYen: number;
  monthlyCashFlowYen: number;
  annualIncomeYen: number;
  annualExpenseYen: number;
  annualProfitYen: number;
  occupancyRate: number;
  vacantUnits: number;
  delinquencyCount: number;
  delinquencyTotalYen: number;
  depositBalanceYen: number;
  repairPlannedCount: number;
  repairApprovalWaitingCount: number;
  loanBalanceYen: number;
  propertyCount: number;
  actionCards: ActionCard[];
  monthlyTrend: Array<{ month: string; incomeYen: number; expenseYen: number; cashFlowYen: number }>;
  propertyProfitRanking: Array<{ name: string; profitYen: number }>;
  expenseCategoryBreakdown: Array<{ name: string; value: number }>;
}

export interface ReportSummary {
  targetYear: number;
  annualRentIncomeYen: number;
  annualCommonFeeIncomeYen: number;
  annualOtherIncomeYen: number;
  annualExpenseYen: number;
  annualProfitYen: number;
  unpaidTotalYen: number;
  depositBalanceYen: number;
  missingReceiptExpenseCount: number;
  propertyRows: Array<{
    propertyId: string;
    propertyName: string;
    incomeYen: number;
    expenseYen: number;
    profitYen: number;
  }>;
  expenseCategoryRows: Array<{ category: string; amountYen: number }>;
  monthlyRows: Array<{ month: string; incomeYen: number; expenseYen: number; profitYen: number }>;
}

export interface ActionCard {
  title: string;
  description: string;
  severity: "info" | "warning" | "danger";
  destination: string;
}

export interface SetupPayload {
  ownerName: string;
  email?: string;
  purpose: string;
  propertyName: string;
  propertyAddress?: string;
  propertyType: string;
  totalUnits: number;
  roomNumber: string;
  rentYen: number;
  unitStatus: string;
  backupDirectory?: string;
}

export interface OwnerLedgerApi {
  onSetScreen?(handler: (screen: string) => void): () => void;
  onSetFontSize?(handler: (size: FontSizePreference) => void): () => void;
  isReady(): Promise<boolean>;
  completeSetup(payload: SetupPayload): Promise<void>;
  getDashboard(targetMonth: string): Promise<DashboardSummary>;
  listProperties(): Promise<PropertyRecord[]>;
  createProperty(input: Omit<PropertyRecord, "id">): Promise<PropertyRecord>;
  archiveProperty(id: string): Promise<void>;
  listUnits(): Promise<UnitRecord[]>;
  createUnit(input: Omit<UnitRecord, "id" | "propertyName">): Promise<UnitRecord>;
  listTenants(): Promise<TenantRecord[]>;
  createTenant(input: Omit<TenantRecord, "id">): Promise<TenantRecord>;
  listContracts(): Promise<ContractRecord[]>;
  createContract(input: Omit<ContractRecord, "id" | "propertyName" | "roomNumber" | "tenantName">): Promise<ContractRecord>;
  generateMonthlyCharges(targetMonth: string): Promise<{ created: number; skipped: number }>;
  listMonthlyCharges(targetMonth?: string): Promise<MonthlyChargeRecord[]>;
  listSpotCharges(): Promise<SpotChargeRecord[]>;
  createSpotCharge(input: Omit<SpotChargeRecord, "id" | "tenantName" | "propertyName" | "roomNumber" | "allocatedYen" | "remainingYen" | "status" | "paidStatus"> & { status?: string; paidStatus?: string }): Promise<SpotChargeRecord>;
  listPayments(): Promise<PaymentRecord[]>;
  createPayment(input: Omit<PaymentRecord, "id" | "status" | "source" | "allocatedYen" | "remainingYen"> & { source?: string }): Promise<PaymentRecord>;
  findAllocationCandidates(paymentId: string): Promise<AllocationCandidate[]>;
  createAllocation(input: { paymentId: string; monthlyChargeId?: string; spotChargeId?: string; amountYen: number; memo?: string }): Promise<void>;
  cancelAllocation(id: string): Promise<void>;
  importPaymentCsv(rows: PaymentCsvRow[], fileName: string): Promise<{ imported: number; duplicates: number; errors: number }>;
  listAllocations(paymentId?: string): Promise<AllocationRecord[]>;
  listExpenses(): Promise<ExpenseRecord[]>;
  createExpense(input: Omit<ExpenseRecord, "id" | "propertyName" | "roomNumber" | "status"> & { status?: string }): Promise<ExpenseRecord>;
  cancelExpense(id: string): Promise<void>;
  listDepositTransactions(): Promise<DepositTransactionRecord[]>;
  createDepositTransaction(input: Omit<DepositTransactionRecord, "id" | "tenantName" | "propertyName" | "roomNumber" | "balanceAfterYen" | "status"> & { status?: string }): Promise<DepositTransactionRecord>;
  cancelDepositTransaction(id: string): Promise<void>;
  listRepairs(): Promise<RepairRecord[]>;
  createRepair(input: Omit<RepairRecord, "id" | "propertyName" | "roomNumber" | "linkedExpenseId">): Promise<RepairRecord>;
  linkRepairExpense(input: { repairId: string; paymentMethod?: string }): Promise<void>;
  listDocuments(): Promise<DocumentRecord[]>;
  attachDocument(input: Omit<DocumentRecord, "id" | "originalFileName" | "storedPath" | "mimeType" | "sizeBytes" | "sha256Hash" | "propertyName" | "roomNumber" | "tenantName" | "status"> & { sourcePath?: string; status?: string }): Promise<DocumentRecord>;
  archiveDocument(id: string): Promise<void>;
  getReportSummary(targetYear: number): Promise<ReportSummary>;
  exportTaxCsv(targetYear: number): Promise<{ outputPath: string }>;
  createBackup(directory?: string): Promise<{ backupPath: string }>;
  restoreBackup(): Promise<{ restoredFrom: string; safetyBackupPath: string }>;
}

export type FontSizePreference = "standard" | "large" | "extra-large";

declare global {
  interface Window {
    ownerLedger?: OwnerLedgerApi;
  }
}
