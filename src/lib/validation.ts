import { z } from "zod";

const yen = z.number({ required_error: "金額を入力してください。" }).int("円単位の整数で入力してください。").min(0, "金額は0円以上で入力してください。");
const positiveYen = z.number({ required_error: "金額を入力してください。" }).int("円単位の整数で入力してください。").positive("金額は1円以上で入力してください。");
const dateText = z.string().min(1, "日付を選んでください。");

export const propertySchema = z.object({
  name: z.string().min(1, "物件名を入力してください。例：山田ハイツ"),
  propertyType: z.string().min(1, "物件種別を選んでください。"),
  address: z.string().optional(),
  totalUnits: z.number().int("総戸数は整数で入力してください。").min(1, "総戸数は1戸以上で入力してください。"),
  managementType: z.string().default("自主管理"),
  status: z.string().default("保有中"),
  memo: z.string().optional()
});

export const unitSchema = z.object({
  propertyId: z.string().min(1, "物件を選んでください。"),
  roomNumber: z.string().min(1, "部屋番号を入力してください。例：101"),
  expectedRentYen: yen,
  currentRentYen: yen,
  commonFeeYen: yen,
  parkingFeeYen: yen,
  otherMonthlyFeeYen: yen,
  status: z.string().min(1, "入居状況を選んでください。"),
  memo: z.string().optional()
});

export const tenantSchema = z.object({
  displayName: z.string().min(1, "氏名または法人名を入力してください。"),
  kanaName: z.string().optional(),
  tenantType: z.string().min(1, "個人・法人の区分を選んでください。"),
  phone: z.string().optional(),
  email: z.union([z.literal(""), z.string().email("メールアドレスの形式を確認してください。")]).optional(),
  bankTransferName: z.string().optional(),
  status: z.string().min(1, "状態を選んでください。"),
  memo: z.string().optional()
});

export const contractSchema = z.object({
  propertyId: z.string().min(1, "物件を選んでください。"),
  unitId: z.string().min(1, "部屋を選んでください。"),
  tenantId: z.string().min(1, "入居者を選んでください。"),
  startDate: dateText,
  endDate: z.string().optional(),
  rentYen: positiveYen,
  commonFeeYen: yen,
  managementFeeYen: yen,
  parkingFeeYen: yen,
  otherMonthlyFeeYen: yen,
  securityDepositYen: yen,
  keyMoneyYen: yen,
  guaranteeDepositYen: yen,
  paymentDueDay: z.number().int("支払期日は整数で入力してください。").min(1, "支払期日は1日から31日の間で入力してください。").max(31, "支払期日は1日から31日の間で入力してください。"),
  paymentMethod: z.string().min(1, "入金方法を選んでください。"),
  status: z.string().min(1, "契約状態を選んでください。"),
  memo: z.string().optional()
}).refine((value) => !value.endDate || value.endDate >= value.startDate, {
  path: ["endDate"],
  message: "契約終了日は、契約開始日より後の日付を選んでください。"
});

export const setupSchema = z.object({
  ownerName: z.string().min(1, "名前または屋号を入力してください。"),
  email: z.union([z.literal(""), z.string().email("メールアドレスの形式を確認してください。")]).optional(),
  purpose: z.string().min(1, "主な利用目的を選んでください。"),
  propertyName: z.string().min(1, "最初の物件名を入力してください。"),
  propertyAddress: z.string().optional(),
  propertyType: z.string().min(1, "物件種別を選んでください。"),
  totalUnits: z.number().int().min(1, "総戸数は1戸以上で入力してください。"),
  roomNumber: z.string().min(1, "部屋番号を入力してください。"),
  rentYen: positiveYen,
  unitStatus: z.string().min(1, "入居状況を選んでください。"),
  backupDirectory: z.string().optional()
});

export const paymentSchema = z.object({
  paidAt: dateText,
  amountYen: positiveYen,
  payerName: z.string().min(1, "振込名義を入力してください。通帳や明細に表示された名前を入力します。"),
  description: z.string().optional(),
  bankAccount: z.string().optional(),
  source: z.string().optional(),
  memo: z.string().optional()
});

export const allocationSchema = z.object({
  paymentId: z.string().min(1, "入金を選んでください。"),
  monthlyChargeId: z.string().optional(),
  spotChargeId: z.string().optional(),
  amountYen: positiveYen,
  memo: z.string().optional()
}).refine((value) => Boolean(value.monthlyChargeId || value.spotChargeId), {
  message: "どの請求に充てるか選んでください。",
  path: ["monthlyChargeId"]
});

export const spotChargeSchema = z.object({
  contractId: z.string().min(1, "契約を選んでください。"),
  monthlyChargeId: z.string().optional(),
  billedAt: dateText,
  dueDate: z.string().optional(),
  chargeType: z.string().min(1, "請求種別を選んでください。"),
  description: z.string().min(1, "内容を入力してください。例：更新料"),
  amountYen: positiveYen,
  taxType: z.string().min(1, "税区分を選んでください。"),
  memo: z.string().optional()
});

export const expenseSchema = z.object({
  spentAt: dateText,
  payee: z.string().min(1, "支払先を入力してください。例：山田工務店"),
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  category: z.string().min(1, "支出カテゴリを選んでください。"),
  amountYen: positiveYen,
  taxType: z.string().min(1, "税区分を選んでください。"),
  paymentMethod: z.string().min(1, "支払方法を選んでください。"),
  hasReceipt: z.boolean(),
  accountingMemo: z.string().optional(),
  taxReturnCategory: z.string().optional(),
  memo: z.string().optional()
});

export const depositTransactionSchema = z.object({
  contractId: z.string().min(1, "契約を選んでください。"),
  transactedAt: dateText,
  depositType: z.string().min(1, "預り金の種類を選んでください。"),
  transactionType: z.string().min(1, "取引種別を選んでください。"),
  amountYen: positiveYen,
  description: z.string().min(1, "内容を入力してください。例：契約時敷金の預り"),
  memo: z.string().optional()
});

export const repairSchema = z.object({
  propertyId: z.string().min(1, "物件を選んでください。"),
  unitId: z.string().optional(),
  occurredAt: dateText,
  description: z.string().min(1, "修繕内容を入力してください。例：給湯器交換"),
  repairType: z.string().min(1, "修繕種別を選んでください。"),
  vendorName: z.string().optional(),
  estimateAmountYen: yen.optional(),
  finalAmountYen: yen.optional(),
  approvalStatus: z.string().min(1, "承認状況を選んでください。"),
  workStatus: z.string().min(1, "工事状況を選んでください。"),
  memo: z.string().optional()
});

export const documentSchema = z.object({
  displayName: z.string().min(1, "書類名を入力してください。例：101号室 5月分領収書"),
  documentType: z.string().min(1, "書類の種類を選んでください。"),
  propertyId: z.string().optional(),
  unitId: z.string().optional(),
  contractId: z.string().optional(),
  expenseId: z.string().optional(),
  repairId: z.string().optional(),
  issuedAt: z.string().optional(),
  receivedAt: z.string().optional(),
  amountYen: yen.optional(),
  counterparty: z.string().optional(),
  memo: z.string().optional()
});

export function friendlyZodError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "入力内容を確認してください。";
}
