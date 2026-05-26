const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const { parseBackupMetadata, validateBackupEntries, verifyBackupDatabaseHash } = require("./backup-safety.cjs");
const { applyInitialSqliteSchema, createRuntimeLogger, sqliteTableExists } = require("./runtime-safety.cjs");

const userDataDir = app.getPath("userData");
const dataDir = path.join(userDataDir, "user-data");
const dbPath = path.join(dataDir, "ownerledger.sqlite");
const attachmentsDir = path.join(dataDir, "attachments");
const logsDir = path.join(userDataDir, "logs");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(attachmentsDir, { recursive: true });
process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, "/")}`;

const { PrismaClient } = require("@prisma/client");
let prisma = new PrismaClient();
const logger = createRuntimeLogger(logsDir);

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
let mainWindow = null;

function serialize(value) {
  return JSON.parse(JSON.stringify(value));
}

function reconnectPrisma() {
  prisma = new PrismaClient();
}

function bundledMigrationPath() {
  return path.join(__dirname, "..", "prisma", "migrations", "20260525061708_init", "migration.sql");
}

async function ensureDatabaseReady() {
  const hasSettingsTable = await sqliteTableExists(prisma, "AppSetting");
  if (hasSettingsTable) {
    logger.info("Database schema is ready.", { dbPath });
    return;
  }
  const migrationPath = bundledMigrationPath();
  if (!fs.existsSync(migrationPath)) {
    throw new Error("初期データベース定義が見つかりません。アプリを再インストールしてください。");
  }
  const statementCount = await applyInitialSqliteSchema(prisma, fs.readFileSync(migrationPath, "utf8"));
  logger.info("Initial database schema was applied.", { dbPath, migrationPath, statementCount });
}

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason instanceof Error ? reason : { reason });
});

async function audit(actionType, targetTable, targetId, beforeValue, afterValue, memo) {
  await prisma.auditLog.create({
    data: {
      actionType,
      targetTable,
      targetId,
      beforeJson: beforeValue ? JSON.stringify(beforeValue) : null,
      afterJson: afterValue ? JSON.stringify(afterValue) : null,
      memo
    }
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: "オーナーレジャー ローカル",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow = win;
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (isDev) {
    await win.loadURL("http://127.0.0.1:5173");
  } else {
    await win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function sendToMainWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setupApplicationMenu() {
  const template = [
    {
      label: "ファイル",
      submenu: [
        { label: "ホームを開く", click: () => sendToMainWindow("screen:set", "ホーム") },
        { label: "バックアップを開く", click: () => sendToMainWindow("screen:set", "バックアップ") },
        { type: "separator" },
        { label: "終了", role: "quit" }
      ]
    },
    {
      label: "かんたん操作",
      submenu: [
        { label: "入金を確認する", click: () => sendToMainWindow("screen:set", "家賃・入金") },
        { label: "支出を登録する", click: () => sendToMainWindow("screen:set", "支出") },
        { label: "書類を添付する", click: () => sendToMainWindow("screen:set", "書類") },
        { label: "バックアップする", click: () => sendToMainWindow("screen:set", "バックアップ") }
      ]
    },
    {
      label: "表示",
      submenu: [
        { label: "文字サイズ: 標準", click: () => sendToMainWindow("font-size:set", "standard") },
        { label: "文字サイズ: 大きい", click: () => sendToMainWindow("font-size:set", "large") },
        { label: "文字サイズ: 特大", click: () => sendToMainWindow("font-size:set", "extra-large") },
        { type: "separator" },
        { label: "拡大", role: "zoomIn" },
        { label: "縮小", role: "zoomOut" },
        { label: "拡大率を戻す", role: "resetZoom" }
      ]
    },
    {
      label: "ヘルプ",
      submenu: [
        {
          label: "このアプリについて",
          click: () => dialog.showMessageBox(mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined, {
            type: "info",
            title: "オーナーレジャー ローカルについて",
            message: "オーナーレジャー ローカル",
            detail: "家賃、入金、支出、敷金、書類をローカル保存で管理するためのアプリです。"
          })
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function monthDate(targetMonth, day) {
  const [year, month] = targetMonth.split("-").map(Number);
  return new Date(year, month - 1, Math.min(day, 28));
}

function localDate(value) {
  const dateText = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10);
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysInTargetMonth(targetMonth) {
  const [year, month] = targetMonth.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function prorateAmount(amountYen, billableDays, daysInMonth) {
  return Math.round((amountYen * billableDays) / daysInMonth);
}

function calculateProratedMonthlyCharge(input) {
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
  const rentYen = prorateAmount(input.rentYen, billableDays, daysInMonth);
  const commonFeeYen = prorateAmount(input.commonFeeYen, billableDays, daysInMonth);
  const managementFeeYen = prorateAmount(input.managementFeeYen, billableDays, daysInMonth);
  const parkingFeeYen = prorateAmount(input.parkingFeeYen, billableDays, daysInMonth);
  const otherMonthlyFeeYen = prorateAmount(input.otherMonthlyFeeYen, billableDays, daysInMonth);
  return {
    rentYen,
    commonFeeYen,
    managementFeeYen,
    parkingFeeYen,
    otherMonthlyFeeYen,
    totalBilledYen: rentYen + commonFeeYen + managementFeeYen + parkingFeeYen + otherMonthlyFeeYen,
    memo: billableDays !== daysInMonth ? `日割り計算: ${dateKey(billStart)}から${dateKey(billEnd)}まで ${billableDays}/${daysInMonth}日` : null
  };
}

function isRenewalMonth(targetMonth, renewalDate) {
  const dateText = renewalDate instanceof Date ? renewalDate.toISOString().slice(0, 7) : String(renewalDate || "").slice(0, 7);
  return Boolean(dateText && dateText === targetMonth);
}

function paymentDuplicateKey(input) {
  const paidAt = new Date(input.paidAt).toISOString().slice(0, 10);
  const payer = String(input.payerName || "").trim().replace(/\s+/g, "");
  const description = String(input.description || "").trim();
  return `${paidAt}|${input.amountYen}|${payer}|${description}`;
}

function chargeStatus(totalBilledYen, paidYen) {
  if (paidYen <= 0) return "請求済";
  if (paidYen < totalBilledYen) return "一部入金";
  if (paidYen === totalBilledYen) return "入金済";
  return "過入金";
}

async function refreshMonthlyCharge(tx, monthlyChargeId) {
  const charge = await tx.monthlyCharge.findUniqueOrThrow({
    where: { id: monthlyChargeId },
    include: { allocations: true }
  });
  const paidYen = charge.allocations
    .filter((allocation) => allocation.status === "有効")
    .reduce((sum, allocation) => sum + allocation.amountYen, 0);
  const unpaidYen = Math.max(0, charge.totalBilledYen - paidYen);
  return tx.monthlyCharge.update({
    where: { id: monthlyChargeId },
    data: { paidYen, unpaidYen, status: chargeStatus(charge.totalBilledYen, paidYen) }
  });
}

async function refreshPayment(tx, paymentId) {
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { allocations: true }
  });
  const allocatedYen = payment.allocations
    .filter((allocation) => allocation.status === "有効")
    .reduce((sum, allocation) => sum + allocation.amountYen, 0);
  let status = "未消込";
  if (allocatedYen > 0 && allocatedYen < payment.amountYen) status = "一部消込";
  if (allocatedYen >= payment.amountYen) status = "消込済";
  return tx.payment.update({ where: { id: paymentId }, data: { status } });
}

async function refreshSpotCharge(tx, spotChargeId) {
  const spot = await tx.spotCharge.findUniqueOrThrow({ where: { id: spotChargeId } });
  const allocations = await tx.allocation.findMany({ where: { spotChargeId, status: "有効", archivedAt: null } });
  const allocatedYen = allocations.reduce((sum, allocation) => sum + allocation.amountYen, 0);
  let paidStatus = "未入金";
  if (allocatedYen > 0 && allocatedYen < spot.amountYen) paidStatus = "一部入金";
  if (allocatedYen >= spot.amountYen) paidStatus = "入金済";
  return tx.spotCharge.update({ where: { id: spotChargeId }, data: { paidStatus } });
}

function paymentView(payment) {
  const allocatedYen = payment.allocations
    .filter((allocation) => allocation.status === "有効")
    .reduce((sum, allocation) => sum + allocation.amountYen, 0);
  return { ...payment, allocatedYen, remainingYen: Math.max(0, payment.amountYen - allocatedYen) };
}

async function spotChargeView(spotCharge) {
  const allocations = await prisma.allocation.findMany({ where: { spotChargeId: spotCharge.id, status: "有効", archivedAt: null } });
  const allocatedYen = allocations.reduce((sum, allocation) => sum + allocation.amountYen, 0);
  return {
    ...spotCharge,
    tenantName: spotCharge.contract.tenant.displayName,
    propertyName: spotCharge.contract.property.name,
    roomNumber: spotCharge.contract.unit.roomNumber,
    allocatedYen,
    remainingYen: Math.max(0, spotCharge.amountYen - allocatedYen)
  };
}

function mimeFromExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".csv") return "text/csv";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

function documentView(document) {
  return {
    ...document,
    propertyName: document.property?.name,
    roomNumber: document.unit?.roomNumber,
    tenantName: document.contract?.tenant?.displayName
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ].join("\r\n");
}

function makeBackupZip(backupPath, metadataMemo) {
  const zip = new AdmZip();
  if (fs.existsSync(dbPath)) zip.addLocalFile(dbPath, "", "database.sqlite");
  if (fs.existsSync(attachmentsDir)) zip.addLocalFolder(attachmentsDir, "attachments");
  const metadata = {
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    dbVersion: "1",
    sha256: fs.existsSync(dbPath) ? crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex") : null,
    memo: metadataMemo,
    summary: {}
  };
  zip.addFile("metadata.json", Buffer.from(JSON.stringify(metadata, null, 2), "utf8"));
  zip.writeZip(backupPath);
}

async function buildReportSummary(targetYear) {
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = new Date(targetYear + 1, 0, 1);
  const [properties, charges, expenses, deposits] = await Promise.all([
    prisma.property.findMany({ where: { archivedAt: null } }),
    prisma.monthlyCharge.findMany({
      where: { targetMonth: { gte: `${targetYear}-01`, lte: `${targetYear}-12` }, archivedAt: null },
      include: { contract: { include: { property: true } } }
    }),
    prisma.expense.findMany({
      where: { spentAt: { gte: yearStart, lt: yearEnd }, archivedAt: null, status: { not: "取消" } },
      include: { property: true }
    }),
    prisma.depositTransaction.findMany({ where: { archivedAt: null, status: "有効" } })
  ]);
  const annualRentIncomeYen = charges.reduce((sum, item) => sum + item.rentYen, 0);
  const annualCommonFeeIncomeYen = charges.reduce((sum, item) => sum + item.commonFeeYen + item.managementFeeYen, 0);
  const annualOtherIncomeYen = charges.reduce((sum, item) => sum + item.parkingFeeYen + item.otherMonthlyFeeYen + item.spotChargeTotalYen, 0);
  const annualExpenseYen = expenses.reduce((sum, item) => sum + item.amountYen, 0);
  const incomeTotal = annualRentIncomeYen + annualCommonFeeIncomeYen + annualOtherIncomeYen;
  const depositBalanceYen = deposits.reduce((balance, item) => {
    if (item.transactionType === "預り" || item.transactionType === "修正") return balance + item.amountYen;
    return balance - item.amountYen;
  }, 0);
  const propertyRows = properties.map((property) => {
    const incomeYen = charges.filter((item) => item.contract.propertyId === property.id).reduce((sum, item) => sum + item.paidYen, 0);
    const expenseYen = expenses.filter((item) => item.propertyId === property.id).reduce((sum, item) => sum + item.amountYen, 0);
    return { propertyId: property.id, propertyName: property.name, incomeYen, expenseYen, profitYen: incomeYen - expenseYen };
  });
  const categoryMap = new Map();
  for (const expense of expenses) categoryMap.set(expense.category, (categoryMap.get(expense.category) || 0) + expense.amountYen);
  const monthlyRows = Array.from({ length: 12 }).map((_, index) => {
    const month = `${targetYear}-${String(index + 1).padStart(2, "0")}`;
    const incomeYen = charges.filter((item) => item.targetMonth === month).reduce((sum, item) => sum + item.paidYen, 0);
    const expenseYen = expenses.filter((item) => item.spentAt.toISOString().startsWith(month)).reduce((sum, item) => sum + item.amountYen, 0);
    return { month, incomeYen, expenseYen, profitYen: incomeYen - expenseYen };
  });
  return {
    targetYear,
    annualRentIncomeYen,
    annualCommonFeeIncomeYen,
    annualOtherIncomeYen,
    annualExpenseYen,
    annualProfitYen: incomeTotal - annualExpenseYen,
    unpaidTotalYen: charges.reduce((sum, item) => sum + item.unpaidYen, 0),
    depositBalanceYen,
    missingReceiptExpenseCount: expenses.filter((item) => !item.hasReceipt).length,
    propertyRows,
    expenseCategoryRows: Array.from(categoryMap.entries()).map(([category, amountYen]) => ({ category, amountYen })),
    monthlyRows
  };
}

ipcMain.handle("app:isReady", async () => {
  const setting = await prisma.appSetting.findUnique({ where: { key: "setupCompleted" } });
  return setting?.value === "true";
});

ipcMain.handle("setup:complete", async (_event, payload) => {
  await prisma.$transaction(async (tx) => {
    const property = await tx.property.create({
      data: {
        name: payload.propertyName,
        propertyType: payload.propertyType,
        address: payload.propertyAddress || null,
        totalUnits: payload.totalUnits,
        managementType: "自主管理",
        status: "保有中"
      }
    });
    const unit = await tx.unit.create({
      data: {
        propertyId: property.id,
        roomNumber: payload.roomNumber,
        expectedRentYen: payload.rentYen,
        currentRentYen: payload.unitStatus === "入居中" ? payload.rentYen : 0,
        status: payload.unitStatus
      }
    });
    await tx.appSetting.upsert({ where: { key: "ownerName" }, update: { value: payload.ownerName }, create: { key: "ownerName", value: payload.ownerName } });
    await tx.appSetting.upsert({ where: { key: "ownerEmail" }, update: { value: payload.email || "" }, create: { key: "ownerEmail", value: payload.email || "" } });
    await tx.appSetting.upsert({ where: { key: "purpose" }, update: { value: payload.purpose }, create: { key: "purpose", value: payload.purpose } });
    await tx.appSetting.upsert({ where: { key: "backupDirectory" }, update: { value: payload.backupDirectory || "" }, create: { key: "backupDirectory", value: payload.backupDirectory || "" } });
    await tx.appSetting.upsert({ where: { key: "setupCompleted" }, update: { value: "true" }, create: { key: "setupCompleted", value: "true" } });
    await tx.auditLog.create({ data: { actionType: "初回設定完了", targetTable: "AppSetting", targetId: "setup", afterJson: JSON.stringify({ propertyId: property.id, unitId: unit.id }) } });
  });
});

ipcMain.handle("dashboard:get", async (_event, targetMonth) => {
  const monthPrefix = `${targetMonth}-`;
  const year = Number(targetMonth.slice(0, 4));
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const [properties, units, charges, expenses, annualCharges, annualExpenses, deposits, repairs, loans, latestBackup] = await Promise.all([
    prisma.property.findMany({ where: { archivedAt: null } }),
    prisma.unit.findMany({ where: { archivedAt: null } }),
    prisma.monthlyCharge.findMany({ where: { targetMonth, archivedAt: null } }),
    prisma.expense.findMany({ where: { spentAt: { gte: new Date(`${monthPrefix}01`), lt: new Date(year, Number(targetMonth.slice(5, 7)), 1) }, archivedAt: null } }),
    prisma.monthlyCharge.findMany({ where: { createdAt: { gte: yearStart, lt: yearEnd }, archivedAt: null } }),
    prisma.expense.findMany({ where: { spentAt: { gte: yearStart, lt: yearEnd }, archivedAt: null } }),
    prisma.depositTransaction.findMany({ where: { archivedAt: null, status: "有効" } }),
    prisma.repair.findMany({ where: { archivedAt: null } }),
    prisma.loan.findMany({ where: { archivedAt: null } }),
    prisma.backupHistory.findFirst({ orderBy: { backedUpAt: "desc" } })
  ]);
  const monthlyExpectedRentYen = charges.reduce((sum, item) => sum + item.totalBilledYen, 0);
  const monthlyPaidYen = charges.reduce((sum, item) => sum + item.paidYen, 0);
  const monthlyUnpaidYen = charges.reduce((sum, item) => sum + item.unpaidYen, 0);
  const monthlyExpenseYen = expenses.reduce((sum, item) => sum + item.amountYen, 0);
  const annualIncomeYen = annualCharges.reduce((sum, item) => sum + item.paidYen, 0);
  const annualExpenseYen = annualExpenses.reduce((sum, item) => sum + item.amountYen, 0);
  const occupied = units.filter((unit) => unit.status === "入居中").length;
  const vacantUnits = units.filter((unit) => unit.status !== "入居中").length;
  const depositBalanceYen = deposits.reduce((balance, item) => {
    if (item.transactionType === "預り" || item.transactionType === "修正") return balance + item.amountYen;
    return balance - item.amountYen;
  }, 0);
  const overdueCharges = charges.filter((item) => item.unpaidYen > 0 && item.status !== "取消");
  const noReceiptExpenses = expenses.filter((item) => !item.hasReceipt).length;
  const actionCards = [];
  if (monthlyUnpaidYen > 0) actionCards.push({ title: "家賃が未入金の入居者がいます", description: "今月の家賃予定額のうち、まだ入金確認できていない金額があります。", severity: "warning", destination: "未収・滞納" });
  if (overdueCharges.length > 0) actionCards.push({ title: "30日を超えている滞納があります", description: "支払期限を過ぎた請求があります。対応状況を確認してください。", severity: "danger", destination: "未収・滞納" });
  if (noReceiptExpenses > 0) actionCards.push({ title: "証憑が未添付の支出があります", description: "領収書・請求書などの証明書類が未添付の支出があります。", severity: "warning", destination: "支出" });
  if (!latestBackup || Date.now() - new Date(latestBackup.backedUpAt).getTime() > 30 * 24 * 60 * 60 * 1000) actionCards.push({ title: "バックアップが30日以上作成されていません", description: "大切なデータを守るため、バックアップを作成してください。", severity: "warning", destination: "バックアップ" });
  const monthlyTrend = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date(year, Number(targetMonth.slice(5, 7)) - 6 + index, 1);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const incomeYen = annualCharges.filter((item) => item.targetMonth === month).reduce((sum, item) => sum + item.paidYen, 0);
    const expenseYen = annualExpenses.filter((item) => item.spentAt.toISOString().startsWith(month)).reduce((sum, item) => sum + item.amountYen, 0);
    return { month, incomeYen, expenseYen, cashFlowYen: incomeYen - expenseYen };
  });
  const expenseCategoryBreakdown = Array.from(expenses.reduce((map, item) => map.set(item.category, (map.get(item.category) || 0) + item.amountYen), new Map()).entries()).map(([name, value]) => ({ name, value }));
  return serialize({
    targetMonth,
    monthlyExpectedRentYen,
    monthlyPaidYen,
    monthlyUnpaidYen,
    monthlyExpenseYen,
    monthlyCashFlowYen: monthlyPaidYen - monthlyExpenseYen,
    annualIncomeYen,
    annualExpenseYen,
    annualProfitYen: annualIncomeYen - annualExpenseYen,
    occupancyRate: units.length === 0 ? 0 : Math.round((occupied / units.length) * 100),
    vacantUnits,
    delinquencyCount: overdueCharges.length,
    delinquencyTotalYen: monthlyUnpaidYen,
    depositBalanceYen,
    repairPlannedCount: repairs.filter((item) => item.workStatus !== "完了" && item.workStatus !== "支払済").length,
    repairApprovalWaitingCount: repairs.filter((item) => item.approvalStatus === "承認待ち").length,
    loanBalanceYen: loans.reduce((sum, item) => sum + item.currentBalanceYen, 0),
    propertyCount: properties.length,
    actionCards,
    monthlyTrend,
    propertyProfitRanking: properties.map((property) => ({ name: property.name, profitYen: 0 })).slice(0, 5),
    expenseCategoryBreakdown
  });
});

ipcMain.handle("properties:list", async () => serialize(await prisma.property.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" } })));
ipcMain.handle("properties:create", async (_event, input) => {
  const property = await prisma.property.create({ data: input });
  await audit("物件作成", "Property", property.id, null, property, "物件を登録しました。");
  return serialize(property);
});
ipcMain.handle("properties:archive", async (_event, id) => {
  const before = await prisma.property.findUniqueOrThrow({ where: { id } });
  const after = await prisma.property.update({ where: { id }, data: { archivedAt: new Date(), status: "管理停止" } });
  await audit("物件アーカイブ", "Property", id, before, after, "物件を使用停止にしました。");
});

ipcMain.handle("units:list", async () => {
  const units = await prisma.unit.findMany({ where: { archivedAt: null }, include: { property: true }, orderBy: { createdAt: "desc" } });
  return serialize(units.map((unit) => ({ ...unit, propertyName: unit.property.name })));
});
ipcMain.handle("units:create", async (_event, input) => {
  const unit = await prisma.unit.create({ data: input });
  await audit("部屋作成", "Unit", unit.id, null, unit, "部屋を登録しました。");
  return serialize(unit);
});

ipcMain.handle("tenants:list", async () => serialize(await prisma.tenant.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" } })));
ipcMain.handle("tenants:create", async (_event, input) => {
  const tenant = await prisma.tenant.create({ data: input });
  await audit("入居者作成", "Tenant", tenant.id, null, tenant, "入居者を登録しました。");
  return serialize(tenant);
});

ipcMain.handle("contracts:list", async () => {
  const contracts = await prisma.contract.findMany({ where: { archivedAt: null }, include: { property: true, unit: true, tenant: true }, orderBy: { createdAt: "desc" } });
  return serialize(contracts.map((contract) => ({ ...contract, propertyName: contract.property.name, roomNumber: contract.unit.roomNumber, tenantName: contract.tenant.displayName })));
});
ipcMain.handle("contracts:create", async (_event, input) => {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        ...input,
        startDate: new Date(input.startDate),
        endDate: input.endDate ? new Date(input.endDate) : null,
        renewalDate: input.renewalDate ? new Date(input.renewalDate) : null
      }
    });
    await tx.unit.update({ where: { id: input.unitId }, data: { status: "入居中", currentRentYen: input.rentYen } });
    let balance = 0;
    const createInitialDeposit = async (depositType, amountYen, description) => {
      if (amountYen <= 0) return;
      balance += amountYen;
      await tx.depositTransaction.create({
        data: {
          contractId: contract.id,
          transactedAt: contract.startDate,
          depositType,
          transactionType: "預り",
          amountYen,
          description,
          balanceAfterYen: balance,
          memo: "契約登録時に自動作成"
        }
      });
    };
    await createInitialDeposit("敷金", contract.securityDepositYen, "契約時敷金の預り");
    await createInitialDeposit("保証金", contract.guaranteeDepositYen, "契約時保証金の預り");
    if (contract.keyMoneyYen > 0) {
      await tx.spotCharge.create({
        data: {
          contractId: contract.id,
          billedAt: contract.startDate,
          dueDate: contract.startDate,
          chargeType: "礼金",
          description: "契約時礼金",
          amountYen: contract.keyMoneyYen,
          taxType: "税理士確認",
          memo: "契約登録時に自動作成"
        }
      });
    }
    await tx.auditLog.create({ data: { actionType: "契約作成", targetTable: "Contract", targetId: contract.id, afterJson: JSON.stringify(contract), memo: "契約を登録しました。" } });
    return serialize(contract);
  });
});

ipcMain.handle("charges:generateMonthly", async (_event, targetMonth) => {
  const contracts = await prisma.contract.findMany({ where: { status: { in: ["契約中", "退去予定"] }, archivedAt: null } });
  let created = 0;
  let skipped = 0;
  for (const contract of contracts) {
    const exists = await prisma.monthlyCharge.findUnique({ where: { targetMonth_contractId: { targetMonth, contractId: contract.id } } });
    if (exists) {
      skipped += 1;
      continue;
    }
    const prorated = calculateProratedMonthlyCharge({
      targetMonth,
      startDate: contract.startDate,
      endDate: contract.endDate,
      rentYen: contract.rentYen,
      commonFeeYen: contract.commonFeeYen,
      managementFeeYen: contract.managementFeeYen,
      parkingFeeYen: contract.parkingFeeYen,
      otherMonthlyFeeYen: contract.otherMonthlyFeeYen
    });
    if (!prorated) {
      skipped += 1;
      continue;
    }
    const renewalAmountYen = isRenewalMonth(targetMonth, contract.renewalDate) ? contract.renewalFeeYen + contract.renewalAdminFeeYen : 0;
    const memo = [prorated.memo, renewalAmountYen > 0 ? `更新料・更新事務手数料を含む: ${renewalAmountYen.toLocaleString("ja-JP")}円` : null].filter(Boolean).join(" / ") || null;
    const charge = await prisma.monthlyCharge.create({
      data: {
        targetMonth,
        contractId: contract.id,
        rentYen: prorated.rentYen,
        commonFeeYen: prorated.commonFeeYen,
        managementFeeYen: prorated.managementFeeYen,
        parkingFeeYen: prorated.parkingFeeYen,
        otherMonthlyFeeYen: prorated.otherMonthlyFeeYen,
        spotChargeTotalYen: renewalAmountYen,
        totalBilledYen: prorated.totalBilledYen + renewalAmountYen,
        unpaidYen: prorated.totalBilledYen + renewalAmountYen,
        dueDate: monthDate(targetMonth, contract.paymentDueDay),
        fixedAt: new Date(),
        memo
      }
    });
    await audit("請求作成", "MonthlyCharge", charge.id, null, charge, `${targetMonth}の月次請求を生成しました。`);
    created += 1;
  }
  return { created, skipped };
});

ipcMain.handle("charges:list", async (_event, targetMonth) => {
  const charges = await prisma.monthlyCharge.findMany({
    where: { archivedAt: null, ...(targetMonth ? { targetMonth } : {}) },
    include: { contract: { include: { tenant: true, property: true, unit: true } } },
    orderBy: [{ targetMonth: "desc" }, { createdAt: "desc" }]
  });
  return serialize(charges.map((charge) => ({
    ...charge,
    tenantName: charge.contract.tenant.displayName,
    propertyName: charge.contract.property.name,
    roomNumber: charge.contract.unit.roomNumber
  })));
});

ipcMain.handle("spotCharges:list", async () => {
  const spotCharges = await prisma.spotCharge.findMany({
    where: { archivedAt: null },
    include: { contract: { include: { tenant: true, property: true, unit: true } } },
    orderBy: { billedAt: "desc" }
  });
  return serialize(await Promise.all(spotCharges.map(spotChargeView)));
});

ipcMain.handle("spotCharges:create", async (_event, input) => {
  const spotCharge = await prisma.spotCharge.create({
    data: {
      contractId: input.contractId,
      monthlyChargeId: input.monthlyChargeId || null,
      billedAt: new Date(input.billedAt),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      chargeType: input.chargeType,
      description: input.description,
      amountYen: input.amountYen,
      taxType: input.taxType,
      memo: input.memo || null,
      status: input.status || "請求済",
      paidStatus: input.paidStatus || "未入金"
    },
    include: { contract: { include: { tenant: true, property: true, unit: true } } }
  });
  await audit("スポット請求作成", "SpotCharge", spotCharge.id, null, spotCharge, "通常の家賃とは別の請求を登録しました。");
  return serialize(await spotChargeView(spotCharge));
});

ipcMain.handle("payments:list", async () => {
  const payments = await prisma.payment.findMany({
    where: { archivedAt: null },
    include: { allocations: true },
    orderBy: { paidAt: "desc" }
  });
  return serialize(payments.map(paymentView));
});

ipcMain.handle("payments:create", async (_event, input) => {
  const duplicateKey = paymentDuplicateKey(input);
  const duplicate = await prisma.payment.findFirst({ where: { duplicateKey, archivedAt: null } });
  if (duplicate) throw new Error("同じ日付・金額・振込名義・摘要の入金がすでに登録されています。二重登録を避けるため保存しませんでした。");
  const payment = await prisma.payment.create({
    data: {
      paidAt: new Date(input.paidAt),
      amountYen: input.amountYen,
      payerName: input.payerName,
      description: input.description || null,
      bankAccount: input.bankAccount || null,
      source: input.source || "手動登録",
      duplicateKey,
      memo: input.memo || null
    },
    include: { allocations: true }
  });
  await audit("入金登録", "Payment", payment.id, null, payment, "入金を登録しました。");
  return serialize(paymentView(payment));
});

ipcMain.handle("allocations:candidates", async (_event, paymentId) => {
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const charges = await prisma.monthlyCharge.findMany({
    where: { archivedAt: null, status: { notIn: ["入金済", "取消", "免除"] }, unpaidYen: { gt: 0 } },
    include: { contract: { include: { tenant: true, property: true, unit: true } } },
    orderBy: [{ targetMonth: "desc" }, { dueDate: "asc" }]
  });
  const spotCharges = await prisma.spotCharge.findMany({
    where: { archivedAt: null, status: { notIn: ["取消", "免除"] }, paidStatus: { not: "入金済" } },
    include: { contract: { include: { tenant: true, property: true, unit: true } } },
    orderBy: [{ billedAt: "desc" }, { dueDate: "asc" }]
  });
  const normalizedPayer = payment.payerName.replace(/\s+/g, "").toUpperCase();
  const monthlyCandidates = charges.map((charge) => {
    const reasons = [];
    let score = 0;
    const transferName = (charge.contract.tenant.bankTransferName || charge.contract.tenant.displayName).replace(/\s+/g, "").toUpperCase();
    if (normalizedPayer.includes(transferName) || transferName.includes(normalizedPayer)) {
      score += 55;
      reasons.push("振込名義が入居者情報と近い");
    }
    if (payment.amountYen === charge.unpaidYen) {
      score += 35;
      reasons.push("金額が未入金額と一致");
    } else if (Math.abs(payment.amountYen - charge.unpaidYen) <= 1000) {
      score += 20;
      reasons.push("金額が近い");
    }
    if (payment.description && payment.description.includes(charge.contract.unit.roomNumber)) {
      score += 15;
      reasons.push("摘要に部屋番号が含まれる");
    }
    return {
      monthlyChargeId: charge.id,
      chargeKind: "月次請求",
      targetMonth: charge.targetMonth,
      tenantName: charge.contract.tenant.displayName,
      propertyName: charge.contract.property.name,
      roomNumber: charge.contract.unit.roomNumber,
      totalBilledYen: charge.totalBilledYen,
      unpaidYen: charge.unpaidYen,
      score,
      reasons: reasons.length ? reasons : ["手動確認が必要"]
    };
  });
  const spotCandidates = [];
  for (const spot of spotCharges) {
    const allocations = await prisma.allocation.findMany({ where: { spotChargeId: spot.id, status: "有効", archivedAt: null } });
    const allocatedYen = allocations.reduce((sum, item) => sum + item.amountYen, 0);
    const remainingYen = Math.max(0, spot.amountYen - allocatedYen);
    if (remainingYen <= 0) continue;
    const reasons = [];
    let score = 8;
    const transferName = (spot.contract.tenant.bankTransferName || spot.contract.tenant.displayName).replace(/\s+/g, "").toUpperCase();
    if (normalizedPayer.includes(transferName) || transferName.includes(normalizedPayer)) {
      score += 55;
      reasons.push("振込名義が入居者情報と近い");
    }
    if (payment.amountYen === remainingYen) {
      score += 35;
      reasons.push("金額がスポット請求の未入金額と一致");
    }
    if (payment.description && (payment.description.includes(spot.chargeType) || payment.description.includes(spot.description))) {
      score += 20;
      reasons.push("摘要が請求内容に近い");
    }
    spotCandidates.push({
      spotChargeId: spot.id,
      chargeKind: "スポット請求",
      tenantName: spot.contract.tenant.displayName,
      propertyName: spot.contract.property.name,
      roomNumber: spot.contract.unit.roomNumber,
      totalBilledYen: spot.amountYen,
      unpaidYen: remainingYen,
      description: `${spot.chargeType}: ${spot.description}`,
      score,
      reasons: reasons.length ? reasons : ["手動確認が必要"]
    });
  }
  return serialize([...monthlyCandidates, ...spotCandidates].sort((a, b) => b.score - a.score).slice(0, 10));
});

ipcMain.handle("allocations:create", async (_event, input) => {
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId }, include: { allocations: true } });
    const allocatedYen = payment.allocations.filter((item) => item.status === "有効").reduce((sum, item) => sum + item.amountYen, 0);
    const paymentRemainingYen = payment.amountYen - allocatedYen;
    if (input.amountYen <= 0) throw new Error("消込する金額は1円以上で入力してください。");
    if (input.amountYen > paymentRemainingYen) throw new Error("消込する金額が、入金の残額を超えています。金額を確認してください。");
    let charge = null;
    let spotCharge = null;
    let chargeRemainingYen = 0;
    if (input.monthlyChargeId) {
      charge = await tx.monthlyCharge.findUniqueOrThrow({ where: { id: input.monthlyChargeId } });
      chargeRemainingYen = charge.unpaidYen;
    } else if (input.spotChargeId) {
      spotCharge = await tx.spotCharge.findUniqueOrThrow({ where: { id: input.spotChargeId } });
      const spotAllocations = await tx.allocation.findMany({ where: { spotChargeId: input.spotChargeId, status: "有効", archivedAt: null } });
      chargeRemainingYen = spotCharge.amountYen - spotAllocations.reduce((sum, item) => sum + item.amountYen, 0);
    } else {
      throw new Error("どの請求に充てるか選んでください。");
    }
    if (input.amountYen > chargeRemainingYen) throw new Error("消込する金額が、請求の残額を超えています。金額を確認してください。");
    const allocation = await tx.allocation.create({
      data: {
        paymentId: input.paymentId,
        monthlyChargeId: input.monthlyChargeId || null,
        spotChargeId: input.spotChargeId || null,
        contractId: charge?.contractId || spotCharge?.contractId || null,
        amountYen: input.amountYen,
        memo: input.memo || null
      }
    });
    const updatedCharge = input.monthlyChargeId ? await refreshMonthlyCharge(tx, input.monthlyChargeId) : null;
    const updatedSpotCharge = input.spotChargeId ? await refreshSpotCharge(tx, input.spotChargeId) : null;
    const updatedPayment = await refreshPayment(tx, input.paymentId);
    await tx.auditLog.create({
      data: {
        actionType: "消込",
        targetTable: "Allocation",
        targetId: allocation.id,
        afterJson: JSON.stringify({ allocation, updatedCharge, updatedSpotCharge, updatedPayment }),
        memo: "入金を請求に充てました。"
      }
    });
  });
});

ipcMain.handle("allocations:cancel", async (_event, id) => {
  await prisma.$transaction(async (tx) => {
    const before = await tx.allocation.findUniqueOrThrow({ where: { id } });
    const after = await tx.allocation.update({ where: { id }, data: { status: "取消", canceledAt: new Date() } });
    let updatedCharge = null;
    let updatedSpotCharge = null;
    if (before.monthlyChargeId) updatedCharge = await refreshMonthlyCharge(tx, before.monthlyChargeId);
    if (before.spotChargeId) updatedSpotCharge = await refreshSpotCharge(tx, before.spotChargeId);
    const updatedPayment = await refreshPayment(tx, before.paymentId);
    await tx.auditLog.create({
      data: {
        actionType: "消込取消",
        targetTable: "Allocation",
        targetId: id,
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify({ after, updatedCharge, updatedSpotCharge, updatedPayment }),
        memo: "消込を取り消し、入金と請求の状態を再計算しました。"
      }
    });
  });
});

ipcMain.handle("allocations:list", async (_event, paymentId) => {
  const allocations = await prisma.allocation.findMany({
    where: { archivedAt: null, ...(paymentId ? { paymentId } : {}) },
    include: { monthlyCharge: { include: { contract: { include: { tenant: true, property: true, unit: true } } } } },
    orderBy: { allocatedAt: "desc" }
  });
  const spots = await prisma.spotCharge.findMany({ where: { id: { in: allocations.map((item) => item.spotChargeId).filter(Boolean) } }, include: { contract: { include: { tenant: true, property: true, unit: true } } } });
  return serialize(allocations.map((allocation) => {
    const spot = spots.find((item) => item.id === allocation.spotChargeId);
    return {
      ...allocation,
      tenantName: allocation.monthlyCharge?.contract.tenant.displayName || spot?.contract.tenant.displayName,
      propertyName: allocation.monthlyCharge?.contract.property.name || spot?.contract.property.name,
      roomNumber: allocation.monthlyCharge?.contract.unit.roomNumber || spot?.contract.unit.roomNumber,
      targetMonth: allocation.monthlyCharge?.targetMonth,
      chargeKind: allocation.spotChargeId ? "スポット請求" : "月次請求",
      description: spot ? `${spot.chargeType}: ${spot.description}` : undefined
    };
  }));
});

ipcMain.handle("payments:importCsv", async (_event, payload) => {
  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  const batch = await prisma.importBatch.create({ data: { importType: "入金CSV", fileName: payload.fileName, status: "取込中", totalRows: payload.rows.length } });
  for (const [index, row] of payload.rows.entries()) {
    try {
      const duplicateKey = paymentDuplicateKey(row);
      const duplicate = await prisma.payment.findFirst({ where: { duplicateKey, archivedAt: null } });
      if (duplicate) {
        duplicates += 1;
        await prisma.importRow.create({ data: { importBatchId: batch.id, rowNumber: index + 1, rawJson: JSON.stringify(row), status: "重複候補", errorMessage: "同じ入金がすでに登録されています。" } });
        continue;
      }
      const payment = await prisma.payment.create({
        data: {
          paidAt: new Date(row.paidAt),
          amountYen: row.amountYen,
          payerName: row.payerName,
          description: row.description || null,
          bankAccount: row.bankAccount || null,
          source: "CSV取込",
          duplicateKey
        }
      });
      imported += 1;
      await prisma.importRow.create({ data: { importBatchId: batch.id, rowNumber: index + 1, rawJson: JSON.stringify(row), status: "取込済", createdPaymentId: payment.id } });
    } catch (error) {
      errors += 1;
      await prisma.importRow.create({ data: { importBatchId: batch.id, rowNumber: index + 1, rawJson: JSON.stringify(row), status: "エラー", errorMessage: error instanceof Error ? error.message : "取込できませんでした。" } });
    }
  }
  await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "完了", importedRows: imported, duplicateRows: duplicates, errorRows: errors } });
  await audit("データ一括取込", "ImportBatch", batch.id, null, { imported, duplicates, errors }, "入金CSVを取り込みました。");
  return { imported, duplicates, errors };
});

ipcMain.handle("expenses:list", async () => {
  const expenses = await prisma.expense.findMany({
    where: { archivedAt: null },
    include: { property: true, unit: true },
    orderBy: { spentAt: "desc" }
  });
  return serialize(expenses.map((expense) => ({
    ...expense,
    propertyName: expense.property?.name,
    roomNumber: expense.unit?.roomNumber
  })));
});

ipcMain.handle("expenses:create", async (_event, input) => {
  const expense = await prisma.expense.create({
    data: {
      spentAt: new Date(input.spentAt),
      payee: input.payee,
      propertyId: input.propertyId || null,
      unitId: input.unitId || null,
      category: input.category,
      amountYen: input.amountYen,
      taxType: input.taxType,
      paymentMethod: input.paymentMethod,
      hasReceipt: Boolean(input.hasReceipt),
      accountingMemo: input.accountingMemo || null,
      taxReturnCategory: input.taxReturnCategory || null,
      memo: input.memo || null,
      status: input.status || "有効"
    },
    include: { property: true, unit: true }
  });
  await audit("支出登録", "Expense", expense.id, null, expense, "支出を登録しました。");
  return serialize({ ...expense, propertyName: expense.property?.name, roomNumber: expense.unit?.roomNumber });
});

ipcMain.handle("expenses:cancel", async (_event, id) => {
  const before = await prisma.expense.findUniqueOrThrow({ where: { id } });
  const after = await prisma.expense.update({ where: { id }, data: { status: "取消", archivedAt: new Date() } });
  await audit("支出取消", "Expense", id, before, after, "支出を取り消しました。");
});

async function calculateDepositBalanceForContract(tx, contractId) {
  const transactions = await tx.depositTransaction.findMany({ where: { contractId, archivedAt: null, status: "有効" }, orderBy: { transactedAt: "asc" } });
  return transactions.reduce((balance, item) => {
    if (item.transactionType === "預り" || item.transactionType === "修正") return balance + item.amountYen;
    return balance - item.amountYen;
  }, 0);
}

ipcMain.handle("deposits:list", async () => {
  const deposits = await prisma.depositTransaction.findMany({
    where: { archivedAt: null },
    include: { contract: { include: { tenant: true, property: true, unit: true } } },
    orderBy: { transactedAt: "desc" }
  });
  return serialize(deposits.map((deposit) => ({
    ...deposit,
    tenantName: deposit.contract.tenant.displayName,
    propertyName: deposit.contract.property.name,
    roomNumber: deposit.contract.unit.roomNumber
  })));
});

ipcMain.handle("deposits:create", async (_event, input) => {
  return prisma.$transaction(async (tx) => {
    const currentBalance = await calculateDepositBalanceForContract(tx, input.contractId);
    const nextBalance = input.transactionType === "預り" || input.transactionType === "修正" ? currentBalance + input.amountYen : currentBalance - input.amountYen;
    if (nextBalance < 0) throw new Error("敷金・預り金の残高がマイナスになります。金額または取引種別を確認してください。");
    const deposit = await tx.depositTransaction.create({
      data: {
        contractId: input.contractId,
        transactedAt: new Date(input.transactedAt),
        depositType: input.depositType,
        transactionType: input.transactionType,
        amountYen: input.amountYen,
        description: input.description,
        balanceAfterYen: nextBalance,
        memo: input.memo || null,
        status: input.status || "有効"
      },
      include: { contract: { include: { tenant: true, property: true, unit: true } } }
    });
    await tx.auditLog.create({
      data: {
        actionType: "敷金取引登録",
        targetTable: "DepositTransaction",
        targetId: deposit.id,
        afterJson: JSON.stringify(deposit),
        memo: "敷金・預り金の取引を登録しました。"
      }
    });
    return serialize({ ...deposit, tenantName: deposit.contract.tenant.displayName, propertyName: deposit.contract.property.name, roomNumber: deposit.contract.unit.roomNumber });
  });
});

ipcMain.handle("deposits:cancel", async (_event, id) => {
  await prisma.$transaction(async (tx) => {
    const before = await tx.depositTransaction.findUniqueOrThrow({ where: { id } });
    const after = await tx.depositTransaction.update({ where: { id }, data: { status: "取消", archivedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        actionType: "敷金取引取消",
        targetTable: "DepositTransaction",
        targetId: id,
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify(after),
        memo: "敷金・預り金の取引を取り消しました。"
      }
    });
  });
});

ipcMain.handle("moveOuts:settle", async (_event, input) => {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.findUniqueOrThrow({ where: { id: input.contractId }, include: { tenant: true, property: true, unit: true } });
    let balance = await calculateDepositBalanceForContract(tx, input.contractId);
    const deductionTotal = input.unpaidRentYen + input.restorationFeeYen + input.cleaningFeeYen + input.keyReplacementFeeYen + input.otherDeductionYen;
    const depositDeductionYen = Math.min(deductionTotal, balance);
    const shortageYen = Math.max(0, deductionTotal - depositDeductionYen);
    if (input.additionalChargeYen < shortageYen) throw new Error(`敷金・保証金で足りない金額が${shortageYen.toLocaleString("ja-JP")}円あります。追加請求額に入力してください。`);
    if (input.refundYen > balance - depositDeductionYen) throw new Error("返金額が退去精算後の敷金・保証金残高を超えています。");
    const createdTransactions = [];
    const moveOutDate = new Date(input.moveOutDate);
    const createDeposit = async (transactionType, amountYen, description) => {
      if (amountYen <= 0) return;
      balance = transactionType === "預り" || transactionType === "修正" ? balance + amountYen : balance - amountYen;
      const deposit = await tx.depositTransaction.create({
        data: {
          contractId: input.contractId,
          transactedAt: moveOutDate,
          depositType: "退去精算預り",
          transactionType,
          amountYen,
          description,
          balanceAfterYen: balance,
          memo: input.memo || null
        }
      });
      createdTransactions.push(deposit);
    };
    const breakdown = [`未収家賃等 ${input.unpaidRentYen}円`, `原状回復 ${input.restorationFeeYen}円`, `清掃 ${input.cleaningFeeYen}円`, `鍵交換 ${input.keyReplacementFeeYen}円`, `その他 ${input.otherDeductionYen}円`].join(" / ");
    await createDeposit("控除", depositDeductionYen, `退去精算控除: ${breakdown}`);
    await createDeposit("返金", input.refundYen, "退去精算による敷金・保証金返金");
    let createdSpotCharge = false;
    if (input.additionalChargeYen > 0) {
      await tx.spotCharge.create({
        data: {
          contractId: input.contractId,
          billedAt: moveOutDate,
          dueDate: moveOutDate,
          chargeType: "退去精算",
          description: "敷金・保証金残高を超える退去精算追加請求",
          amountYen: input.additionalChargeYen,
          taxType: "税理士確認",
          memo: input.memo || null
        }
      });
      createdSpotCharge = true;
    }
    const updatedContract = await tx.contract.update({ where: { id: input.contractId }, data: { status: "終了", endDate: moveOutDate, moveOutDate } });
    await tx.unit.update({ where: { id: contract.unitId }, data: { status: "空室", currentRentYen: 0 } });
    await tx.auditLog.create({
      data: {
        actionType: "退去精算",
        targetTable: "Contract",
        targetId: input.contractId,
        beforeJson: JSON.stringify(contract),
        afterJson: JSON.stringify({ updatedContract, createdTransactions, createdSpotCharge, depositBalanceYen: balance }),
        memo: "退去精算を登録しました。"
      }
    });
    return { depositBalanceYen: balance, createdTransactions: createdTransactions.length, createdSpotCharge };
  });
});

ipcMain.handle("repairs:list", async () => {
  const repairs = await prisma.repair.findMany({
    where: { archivedAt: null },
    include: { property: true, unit: true },
    orderBy: { occurredAt: "desc" }
  });
  return serialize(repairs.map((repair) => ({ ...repair, propertyName: repair.property.name, roomNumber: repair.unit?.roomNumber })));
});

ipcMain.handle("repairs:create", async (_event, input) => {
  const repair = await prisma.repair.create({
    data: {
      propertyId: input.propertyId,
      unitId: input.unitId || null,
      occurredAt: new Date(input.occurredAt),
      description: input.description,
      repairType: input.repairType,
      vendorName: input.vendorName || null,
      estimateAmountYen: input.estimateAmountYen || null,
      finalAmountYen: input.finalAmountYen || null,
      approvalStatus: input.approvalStatus,
      workStatus: input.workStatus,
      memo: input.memo || null
    },
    include: { property: true, unit: true }
  });
  await audit("修繕登録", "Repair", repair.id, null, repair, "修繕を登録しました。");
  return serialize({ ...repair, propertyName: repair.property.name, roomNumber: repair.unit?.roomNumber });
});

ipcMain.handle("repairs:linkExpense", async (_event, input) => {
  await prisma.$transaction(async (tx) => {
    const repair = await tx.repair.findUniqueOrThrow({ where: { id: input.repairId }, include: { property: true, unit: true } });
    const amountYen = repair.finalAmountYen || repair.estimateAmountYen || 0;
    if (amountYen <= 0) throw new Error("支出に連携するには、見積金額または確定金額を入力してください。");
    const expense = await tx.expense.create({
      data: {
        spentAt: new Date(),
        payee: repair.vendorName || "修繕業者",
        propertyId: repair.propertyId,
        unitId: repair.unitId,
        category: repair.repairType === "原状回復" ? "原状回復費" : "修繕費",
        amountYen,
        taxType: "課税",
        paymentMethod: input.paymentMethod || "振込",
        hasReceipt: false,
        memo: `修繕「${repair.description}」から連携`
      }
    });
    const updatedRepair = await tx.repair.update({ where: { id: repair.id }, data: { linkedExpenseId: expense.id, workStatus: repair.workStatus === "完了" ? "支払済" : repair.workStatus } });
    await tx.auditLog.create({
      data: {
        actionType: "修繕支出連携",
        targetTable: "Repair",
        targetId: repair.id,
        beforeJson: JSON.stringify(repair),
        afterJson: JSON.stringify({ updatedRepair, expense }),
        memo: "修繕から支出を作成しました。"
      }
    });
  });
});

ipcMain.handle("documents:list", async () => {
  const documents = await prisma.document.findMany({
    where: { archivedAt: null },
    include: { property: true, unit: true, contract: { include: { tenant: true } } },
    orderBy: { createdAt: "desc" }
  });
  return serialize(documents.map(documentView));
});

ipcMain.handle("documents:attach", async (_event, input) => {
  let sourcePath = input.sourcePath;
  if (!sourcePath) {
    const result = await dialog.showOpenDialog({
      title: "添付する書類を選んでください",
      properties: ["openFile"],
      filters: [
        { name: "書類・画像", extensions: ["pdf", "png", "jpg", "jpeg", "csv", "xlsx"] },
        { name: "すべてのファイル", extensions: ["*"] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) throw new Error("添付するファイルが選ばれていません。");
    sourcePath = result.filePaths[0];
  }
  if (!fs.existsSync(sourcePath)) throw new Error("選択したファイルが見つかりません。保存場所を確認してください。");
  const originalFileName = path.basename(sourcePath);
  const extension = path.extname(originalFileName);
  const storedFileName = `${crypto.randomUUID()}${extension}`;
  const storedPath = path.join(attachmentsDir, storedFileName);
  fs.copyFileSync(sourcePath, storedPath);
  const fileBuffer = fs.readFileSync(storedPath);
  const sha256Hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const stats = fs.statSync(storedPath);
  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        displayName: input.displayName,
        documentType: input.documentType,
        originalFileName,
        originalPath: sourcePath,
        storedPath,
        mimeType: mimeFromExtension(sourcePath),
        sizeBytes: stats.size,
        sha256Hash,
        propertyId: input.propertyId || null,
        unitId: input.unitId || null,
        contractId: input.contractId || null,
        expenseId: input.expenseId || null,
        repairId: input.repairId || null,
        issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
        receivedAt: input.receivedAt ? new Date(input.receivedAt) : null,
        amountYen: input.amountYen || null,
        counterparty: input.counterparty || null,
        memo: input.memo || null,
        status: input.status || "有効"
      },
      include: { property: true, unit: true, contract: { include: { tenant: true } } }
    });
    if (input.expenseId) {
      await tx.expense.update({ where: { id: input.expenseId }, data: { hasReceipt: true } });
    }
    await tx.auditLog.create({
      data: {
        actionType: "ファイル添付",
        targetTable: "Document",
        targetId: created.id,
        afterJson: JSON.stringify(created),
        memo: "書類・証憑を添付しました。"
      }
    });
    return created;
  });
  return serialize(documentView(document));
});

ipcMain.handle("documents:archive", async (_event, id) => {
  const before = await prisma.document.findUniqueOrThrow({ where: { id } });
  const after = await prisma.document.update({ where: { id }, data: { status: "使用停止", archivedAt: new Date() } });
  await audit("ファイル削除", "Document", id, before, after, "書類を使用停止にしました。ファイル本体は保管済みです。");
});

ipcMain.handle("reports:summary", async (_event, targetYear) => serialize(await buildReportSummary(Number(targetYear))));

ipcMain.handle("reports:exportTaxCsv", async (_event, targetYear) => {
  const year = Number(targetYear);
  const output = await dialog.showSaveDialog({
    title: "税理士提出用CSVの保存先を選んでください",
    defaultPath: `ownerledger-tax-export-${year}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
  if (output.canceled || !output.filePath) throw new Error("保存先が選ばれていません。");
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const [charges, spotCharges, spotAllocations, expenses, deposits, documents] = await Promise.all([
    prisma.monthlyCharge.findMany({
      where: { targetMonth: { gte: `${year}-01`, lte: `${year}-12` }, archivedAt: null },
      include: { contract: { include: { tenant: true, property: true, unit: true } } }
    }),
    prisma.spotCharge.findMany({
      where: { billedAt: { gte: yearStart, lt: yearEnd }, archivedAt: null, status: { not: "取消" } },
      include: { contract: { include: { tenant: true, property: true, unit: true } } }
    }),
    prisma.allocation.findMany({
      where: { allocatedAt: { gte: yearStart, lt: yearEnd }, archivedAt: null, status: "有効", spotChargeId: { not: null } }
    }),
    prisma.expense.findMany({
      where: { spentAt: { gte: yearStart, lt: yearEnd }, archivedAt: null, status: { not: "取消" } },
      include: { property: true, unit: true, documents: true }
    }),
    prisma.depositTransaction.findMany({
      where: { transactedAt: { gte: yearStart, lt: yearEnd }, archivedAt: null, status: "有効" },
      include: { contract: { include: { tenant: true, property: true, unit: true } } }
    }),
    prisma.document.findMany({
      where: {
        archivedAt: null,
        OR: [
          { receivedAt: { gte: yearStart, lt: yearEnd } },
          { issuedAt: { gte: yearStart, lt: yearEnd } }
        ]
      },
      include: { property: true, unit: true, contract: { include: { tenant: true, property: true, unit: true } }, expense: { include: { property: true, unit: true } } }
    })
  ]);
  const headers = [
    "No",
    "大分類",
    "取引日",
    "対象年月",
    "物件名",
    "部屋番号",
    "入居者",
    "取引先",
    "取引内容",
    "勘定科目候補",
    "税区分",
    "入金額",
    "支出額",
    "預り金増加",
    "預り金減少",
    "家賃",
    "共益費",
    "管理費",
    "駐車場代",
    "その他月額",
    "更新料等",
    "請求合計",
    "未入金額",
    "支払入金方法",
    "証憑有無",
    "証憑ファイル名",
    "ステータス",
    "メモ"
  ];
  const baseRow = () => Object.fromEntries(headers.map((header) => [header, ""]));
  const detailRows = [
    ...charges.map((item) => ({
      ...baseRow(),
      大分類: "収入",
      取引日: item.dueDate?.toISOString().slice(0, 10) || item.targetMonth,
      対象年月: item.targetMonth,
      物件名: item.contract.property.name,
      部屋番号: item.contract.unit.roomNumber,
      入居者: item.contract.tenant.displayName,
      取引先: item.contract.tenant.displayName,
      取引内容: "月次請求",
      勘定科目候補: "賃貸料収入",
      税区分: "税理士確認",
      入金額: item.paidYen,
      家賃: item.rentYen,
      共益費: item.commonFeeYen,
      管理費: item.managementFeeYen,
      駐車場代: item.parkingFeeYen,
      その他月額: item.otherMonthlyFeeYen,
      更新料等: item.spotChargeTotalYen,
      請求合計: item.totalBilledYen,
      未入金額: item.unpaidYen,
      支払入金方法: item.contract.paymentMethod,
      ステータス: item.status,
      メモ: item.memo || "税務上の取扱いは税理士に確認してください"
    })),
    ...spotCharges.map((item) => {
      const paidYen = spotAllocations.filter((allocation) => allocation.spotChargeId === item.id).reduce((sum, allocation) => sum + allocation.amountYen, 0);
      const unpaidYen = Math.max(0, item.amountYen - paidYen);
      return {
        ...baseRow(),
        大分類: "収入",
        取引日: item.billedAt.toISOString().slice(0, 10),
        対象年月: item.billedAt.toISOString().slice(0, 7),
        物件名: item.contract.property.name,
        部屋番号: item.contract.unit.roomNumber,
        入居者: item.contract.tenant.displayName,
        取引先: item.contract.tenant.displayName,
        取引内容: item.chargeType,
        勘定科目候補: item.chargeType === "礼金" ? "礼金収入" : "雑収入",
        税区分: item.taxType,
        入金額: paidYen,
        更新料等: item.amountYen,
        請求合計: item.amountYen,
        未入金額: unpaidYen,
        証憑有無: "",
        ステータス: item.paidStatus,
        メモ: item.description || item.memo || ""
      };
    }),
    ...expenses.map((item) => ({
      ...baseRow(),
      大分類: "支出",
      取引日: item.spentAt.toISOString().slice(0, 10),
      対象年月: item.spentAt.toISOString().slice(0, 7),
      物件名: item.property?.name || "",
      部屋番号: item.unit?.roomNumber || "",
      取引先: item.payee,
      取引内容: item.category,
      勘定科目候補: item.taxReturnCategory || item.category,
      税区分: item.taxType,
      支出額: item.amountYen,
      支払入金方法: item.paymentMethod,
      証憑有無: item.hasReceipt ? "あり" : "未添付",
      証憑ファイル名: item.documents.map((document) => document.originalFileName).join(" / "),
      ステータス: item.status,
      メモ: item.accountingMemo || item.memo || ""
    })),
    ...deposits.map((item) => {
      const isIncrease = item.transactionType === "預り" || item.transactionType === "修正";
      return {
        ...baseRow(),
        大分類: "預り金",
        取引日: item.transactedAt.toISOString().slice(0, 10),
        対象年月: item.transactedAt.toISOString().slice(0, 7),
        物件名: item.contract.property.name,
        部屋番号: item.contract.unit.roomNumber,
        入居者: item.contract.tenant.displayName,
        取引先: item.contract.tenant.displayName,
        取引内容: `${item.depositType}/${item.transactionType}`,
        勘定科目候補: "預り金",
        税区分: "対象外",
        預り金増加: isIncrease ? item.amountYen : "",
        預り金減少: isIncrease ? "" : item.amountYen,
        ステータス: item.status,
        メモ: `${item.description} / 収益とは分けて管理`
      };
    }),
    ...documents.map((item) => ({
      ...baseRow(),
      大分類: "証憑",
      取引日: item.receivedAt?.toISOString().slice(0, 10) || item.issuedAt?.toISOString().slice(0, 10) || "",
      対象年月: item.receivedAt?.toISOString().slice(0, 7) || item.issuedAt?.toISOString().slice(0, 7) || "",
      物件名: item.property?.name || item.unit?.property?.name || item.contract?.property.name || item.expense?.property?.name || "",
      部屋番号: item.unit?.roomNumber || item.contract?.unit.roomNumber || item.expense?.unit?.roomNumber || "",
      入居者: item.contract?.tenant.displayName || "",
      取引先: item.counterparty || "",
      取引内容: item.documentType,
      支出額: item.expense ? item.expense.amountYen : "",
      証憑有無: "あり",
      証憑ファイル名: item.originalFileName,
      ステータス: item.status,
      メモ: item.displayName
    }))
  ];
  const rows = detailRows
    .sort((a, b) => String(a["取引日"]).localeCompare(String(b["取引日"])) || String(a["大分類"]).localeCompare(String(b["大分類"])))
    .map((row, index) => ({ ...row, No: index + 1 }));
  const csv = "\uFEFF" + toCsv(headers, rows);
  fs.writeFileSync(output.filePath, csv, "utf8");
  await audit("データ一括出力", "Report", String(year), null, { outputPath: output.filePath, rowCount: rows.length }, "税理士提出用CSVを出力しました。");
  return { outputPath: output.filePath };
});

ipcMain.handle("backup:create", async (_event, directory) => {
  const setting = await prisma.appSetting.findUnique({ where: { key: "backupDirectory" } });
  let backupDirectory = directory || setting?.value;
  if (!backupDirectory) {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], title: "バックアップの保存先を選んでください" });
    if (result.canceled || !result.filePaths[0]) throw new Error("バックアップ保存先が選ばれていません。");
    backupDirectory = result.filePaths[0];
  }
  fs.mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDirectory, `ownerledger-backup-${timestamp}.zip`);
  const [propertyCount, unitCount, tenantCount, contractCount] = await Promise.all([
    prisma.property.count({ where: { archivedAt: null } }),
    prisma.unit.count({ where: { archivedAt: null } }),
    prisma.tenant.count({ where: { archivedAt: null } }),
    prisma.contract.count({ where: { archivedAt: null } })
  ]);
  const zip = new AdmZip();
  if (fs.existsSync(dbPath)) zip.addLocalFile(dbPath, "", "database.sqlite");
  if (fs.existsSync(attachmentsDir)) zip.addLocalFolder(attachmentsDir, "attachments");
  const metadata = {
    createdAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    dbVersion: "1",
    sha256: fs.existsSync(dbPath) ? crypto.createHash("sha256").update(fs.readFileSync(dbPath)).digest("hex") : null,
    summary: { propertyCount, unitCount, tenantCount, contractCount }
  };
  zip.addFile("metadata.json", Buffer.from(JSON.stringify(metadata, null, 2), "utf8"));
  zip.writeZip(backupPath);
  const history = await prisma.backupHistory.create({ data: { backupPath, appVersion: app.getVersion(), dbVersion: "1", propertyCount, unitCount, tenantCount, contractCount } });
  await audit("バックアップ", "BackupHistory", history.id, null, history, "バックアップを作成しました。");
  return { backupPath };
});

ipcMain.handle("backup:restore", async () => {
  const result = await dialog.showOpenDialog({
    title: "復元するバックアップファイルを選んでください",
    properties: ["openFile"],
    filters: [{ name: "OwnerLedger Backup", extensions: ["zip"] }]
  });
  if (result.canceled || !result.filePaths[0]) throw new Error("復元するバックアップファイルが選ばれていません。");
  const restorePath = result.filePaths[0];
  logger.info("Backup restore requested.", { restorePath });
  const zip = new AdmZip(restorePath);
  validateBackupEntries(zip.getEntries().map((entry) => entry.entryName));
  const metadataEntry = zip.getEntry("metadata.json");
  const databaseEntry = zip.getEntry("database.sqlite");
  if (!metadataEntry || !databaseEntry) throw new Error("バックアップファイルの形式が正しくありません。");
  const metadata = parseBackupMetadata(metadataEntry.getData());
  verifyBackupDatabaseHash(metadata, databaseEntry.getData());

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safetyDir = path.join(dataDir, "pre-restore-backups");
  fs.mkdirSync(safetyDir, { recursive: true });
  const safetyBackupPath = path.join(safetyDir, `ownerledger-before-restore-${timestamp}.zip`);
  makeBackupZip(safetyBackupPath, `復元前の自動退避: ${restorePath}`);

  const stagingDir = path.join(dataDir, `restore-staging-${crypto.randomUUID()}`);
  fs.mkdirSync(stagingDir, { recursive: true });
  let disconnectedForRestore = false;
  try {
    zip.extractAllTo(stagingDir, true);
    const stagedDbPath = path.join(stagingDir, "database.sqlite");
    const stagedAttachmentsDir = path.join(stagingDir, "attachments");
    if (!fs.existsSync(stagedDbPath)) throw new Error("復元用の保存データを展開できませんでした。");

    await prisma.$disconnect();
    disconnectedForRestore = true;
    fs.copyFileSync(stagedDbPath, dbPath);
    fs.rmSync(attachmentsDir, { recursive: true, force: true });
    fs.mkdirSync(attachmentsDir, { recursive: true });
    if (fs.existsSync(stagedAttachmentsDir)) {
      fs.cpSync(stagedAttachmentsDir, attachmentsDir, { recursive: true });
    }
    reconnectPrisma();
    disconnectedForRestore = false;
  } finally {
    if (disconnectedForRestore) reconnectPrisma();
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  const [propertyCount, unitCount, tenantCount, contractCount] = await Promise.all([
    prisma.property.count({ where: { archivedAt: null } }),
    prisma.unit.count({ where: { archivedAt: null } }),
    prisma.tenant.count({ where: { archivedAt: null } }),
    prisma.contract.count({ where: { archivedAt: null } })
  ]);
  const history = await prisma.backupHistory.create({
    data: {
      backupPath: restorePath,
      appVersion: app.getVersion(),
      dbVersion: "1",
      propertyCount,
      unitCount,
      tenantCount,
      contractCount,
      status: "復元",
      memo: `復元前退避: ${safetyBackupPath}`
    }
  });
  await audit("復元", "BackupHistory", history.id, null, { restoredFrom: restorePath, safetyBackupPath }, "バックアップから復元しました。");
  logger.info("Backup restore completed.", { restorePath, safetyBackupPath });
  return { restoredFrom: restorePath, safetyBackupPath };
});

app.whenReady().then(async () => {
  try {
    setupApplicationMenu();
    await ensureDatabaseReady();
    await createWindow();
  } catch (error) {
    logger.error("Application startup failed.", error);
    dialog.showErrorBox("起動できませんでした", error instanceof Error ? error.message : "保存データの準備中にエラーが発生しました。");
    app.quit();
  }
});
app.on("window-all-closed", async () => {
  await prisma.$disconnect();
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
