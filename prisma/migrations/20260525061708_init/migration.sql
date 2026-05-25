-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "address" TEXT,
    "acquiredDate" DATETIME,
    "acquisitionPriceYen" INTEGER,
    "landPriceYen" INTEGER,
    "buildingPriceYen" INTEGER,
    "structure" TEXT,
    "builtYearMonth" TEXT,
    "totalUnits" INTEGER NOT NULL,
    "managementType" TEXT NOT NULL DEFAULT '自主管理',
    "managementCompanyName" TEXT,
    "managementCompanyContact" TEXT,
    "fixedAssetTaxMemo" TEXT,
    "fireInsuranceMemo" TEXT,
    "status" TEXT NOT NULL DEFAULT '保有中',
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "roomNumber" TEXT NOT NULL,
    "layout" TEXT,
    "areaSqm" TEXT,
    "usage" TEXT,
    "expectedRentYen" INTEGER NOT NULL DEFAULT 0,
    "currentRentYen" INTEGER NOT NULL DEFAULT 0,
    "commonFeeYen" INTEGER NOT NULL DEFAULT 0,
    "parkingFeeYen" INTEGER NOT NULL DEFAULT 0,
    "otherMonthlyFeeYen" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT '空室',
    "vacantSince" DATETIME,
    "listingStartedAt" DATETIME,
    "listingRentYen" INTEGER,
    "viewingCount" INTEGER NOT NULL DEFAULT 0,
    "applicationCount" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "kanaName" TEXT,
    "tenantType" TEXT NOT NULL DEFAULT '個人',
    "phone" TEXT,
    "email" TEXT,
    "emergencyContact" TEXT,
    "bankTransferName" TEXT,
    "guaranteeCompany" TEXT,
    "guaranteeContractNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT '入居中',
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "renewalDate" DATETIME,
    "cancellationPlannedDate" DATETIME,
    "moveOutDate" DATETIME,
    "rentYen" INTEGER NOT NULL,
    "commonFeeYen" INTEGER NOT NULL DEFAULT 0,
    "managementFeeYen" INTEGER NOT NULL DEFAULT 0,
    "parkingFeeYen" INTEGER NOT NULL DEFAULT 0,
    "otherMonthlyFeeYen" INTEGER NOT NULL DEFAULT 0,
    "securityDepositYen" INTEGER NOT NULL DEFAULT 0,
    "keyMoneyYen" INTEGER NOT NULL DEFAULT 0,
    "guaranteeDepositYen" INTEGER NOT NULL DEFAULT 0,
    "renewalFeeYen" INTEGER NOT NULL DEFAULT 0,
    "renewalAdminFeeYen" INTEGER NOT NULL DEFAULT 0,
    "paymentDueDay" INTEGER NOT NULL DEFAULT 27,
    "paymentMethod" TEXT NOT NULL DEFAULT '振込',
    "status" TEXT NOT NULL DEFAULT '契約中',
    "fireInsuranceExpiresAt" DATETIME,
    "guaranteeCompanyRenewalAt" DATETIME,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Contract_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetMonth" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "rentYen" INTEGER NOT NULL,
    "commonFeeYen" INTEGER NOT NULL DEFAULT 0,
    "managementFeeYen" INTEGER NOT NULL DEFAULT 0,
    "parkingFeeYen" INTEGER NOT NULL DEFAULT 0,
    "otherMonthlyFeeYen" INTEGER NOT NULL DEFAULT 0,
    "spotChargeTotalYen" INTEGER NOT NULL DEFAULT 0,
    "carriedOverDueYen" INTEGER NOT NULL DEFAULT 0,
    "advanceAppliedYen" INTEGER NOT NULL DEFAULT 0,
    "totalBilledYen" INTEGER NOT NULL,
    "paidYen" INTEGER NOT NULL DEFAULT 0,
    "unpaidYen" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT '請求済',
    "dueDate" DATETIME,
    "fixedAt" DATETIME,
    "canceledAt" DATETIME,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "MonthlyCharge_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpotCharge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "monthlyChargeId" TEXT,
    "billedAt" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "chargeType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountYen" INTEGER NOT NULL,
    "taxType" TEXT NOT NULL DEFAULT '対象外',
    "status" TEXT NOT NULL DEFAULT '請求済',
    "paidStatus" TEXT NOT NULL DEFAULT '未入金',
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "SpotCharge_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SpotCharge_monthlyChargeId_fkey" FOREIGN KEY ("monthlyChargeId") REFERENCES "MonthlyCharge" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paidAt" DATETIME NOT NULL,
    "amountYen" INTEGER NOT NULL,
    "payerName" TEXT NOT NULL,
    "description" TEXT,
    "bankAccount" TEXT,
    "source" TEXT NOT NULL DEFAULT '手動登録',
    "status" TEXT NOT NULL DEFAULT '未消込',
    "duplicateKey" TEXT,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "monthlyChargeId" TEXT,
    "spotChargeId" TEXT,
    "contractId" TEXT,
    "amountYen" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT '有効',
    "allocatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canceledAt" DATETIME,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Allocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Allocation_monthlyChargeId_fkey" FOREIGN KEY ("monthlyChargeId") REFERENCES "MonthlyCharge" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Allocation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DepositTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "transactedAt" DATETIME NOT NULL,
    "depositType" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "amountYen" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "relatedChargeId" TEXT,
    "relatedExpenseId" TEXT,
    "balanceAfterYen" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT '有効',
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "DepositTransaction_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spentAt" DATETIME NOT NULL,
    "payee" TEXT NOT NULL,
    "propertyId" TEXT,
    "unitId" TEXT,
    "category" TEXT NOT NULL,
    "amountYen" INTEGER NOT NULL,
    "taxType" TEXT NOT NULL DEFAULT '対象外',
    "paymentMethod" TEXT NOT NULL DEFAULT '振込',
    "hasReceipt" BOOLEAN NOT NULL DEFAULT false,
    "accountingMemo" TEXT,
    "taxReturnCategory" TEXT,
    "status" TEXT NOT NULL DEFAULT '有効',
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Expense_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "unitId" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "repairType" TEXT NOT NULL,
    "vendorName" TEXT,
    "estimateAmountYen" INTEGER,
    "finalAmountYen" INTEGER,
    "approvalStatus" TEXT NOT NULL DEFAULT '未確認',
    "workStatus" TEXT NOT NULL DEFAULT '未着手',
    "linkedExpenseId" TEXT,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Repair_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Repair_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyId" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "borrowedAt" DATETIME NOT NULL,
    "initialPrincipalYen" INTEGER NOT NULL,
    "currentBalanceYen" INTEGER NOT NULL,
    "interestRate" TEXT NOT NULL,
    "interestType" TEXT NOT NULL DEFAULT '固定',
    "monthlyPaymentYen" INTEGER NOT NULL,
    "principalPartYen" INTEGER NOT NULL DEFAULT 0,
    "interestPartYen" INTEGER NOT NULL DEFAULT 0,
    "paymentDay" INTEGER NOT NULL DEFAULT 27,
    "expectedPayoffDate" DATETIME,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Loan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "totalAmountYen" INTEGER NOT NULL,
    "principalYen" INTEGER NOT NULL,
    "interestYen" INTEGER NOT NULL,
    "balanceAfterYen" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "originalPath" TEXT,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "sha256Hash" TEXT NOT NULL,
    "propertyId" TEXT,
    "unitId" TEXT,
    "contractId" TEXT,
    "spotChargeId" TEXT,
    "depositTransactionId" TEXT,
    "expenseId" TEXT,
    "repairId" TEXT,
    "loanId" TEXT,
    "issuedAt" DATETIME,
    "receivedAt" DATETIME,
    "amountYen" INTEGER,
    "counterparty" TEXT,
    "status" TEXT NOT NULL DEFAULT '有効',
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "Document_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_spotChargeId_fkey" FOREIGN KEY ("spotChargeId") REFERENCES "SpotCharge" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_depositTransactionId_fkey" FOREIGN KEY ("depositTransactionId") REFERENCES "DepositTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReportMemo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportType" TEXT NOT NULL,
    "targetMonth" TEXT,
    "targetYear" INTEGER,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '確認中',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importBatchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdPaymentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "ImportRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "backedUpAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "backupPath" TEXT NOT NULL,
    "appVersion" TEXT NOT NULL,
    "dbVersion" TEXT NOT NULL,
    "propertyCount" INTEGER NOT NULL DEFAULT 0,
    "unitCount" INTEGER NOT NULL DEFAULT 0,
    "tenantCount" INTEGER NOT NULL DEFAULT 0,
    "contractCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT '完了',
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_propertyId_roomNumber_key" ON "Unit"("propertyId", "roomNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyCharge_targetMonth_contractId_key" ON "MonthlyCharge"("targetMonth", "contractId");

-- CreateIndex
CREATE INDEX "Payment_paidAt_amountYen_payerName_idx" ON "Payment"("paidAt", "amountYen", "payerName");
