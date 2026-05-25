import { describe, expect, it } from "vitest";
import { aggregateExpensesByCategory, calculateChargeStatus, calculateDepositBalance, calculatePaymentStatus, calculateUnpaid, detectPaymentDuplicateKey, validateAllocationAmount } from "../src/lib/business";
import { contractSchema, propertySchema, setupSchema } from "../src/lib/validation";

describe("OwnerLedger business rules", () => {
  it("月次請求の未収と状態を計算する", () => {
    expect(calculateUnpaid({ totalBilledYen: 100000, paidYen: 30000 })).toBe(70000);
    expect(calculateChargeStatus(100000, 0)).toBe("請求済");
    expect(calculateChargeStatus(100000, 50000)).toBe("一部入金");
    expect(calculateChargeStatus(100000, 100000)).toBe("入金済");
    expect(calculateChargeStatus(100000, 120000)).toBe("過入金");
  });

  it("分割消込と消込取消後の入金状態を計算する", () => {
    expect(calculatePaymentStatus({ amountYen: 100000 }, [{ amountYen: 40000, status: "有効" }])).toBe("一部消込");
    expect(calculatePaymentStatus({ amountYen: 100000 }, [{ amountYen: 40000, status: "取消" }])).toBe("未消込");
    expect(validateAllocationAmount(50000, 40000, 45000)).toBe("消込する金額が、請求の残額を超えています。金額を確認してください。");
  });

  it("敷金残高を収益と分けて計算する", () => {
    const balance = calculateDepositBalance([
      { transactionType: "預り", amountYen: 80000 },
      { transactionType: "控除", amountYen: 12000 },
      { transactionType: "返金", amountYen: 68000 }
    ]);
    expect(balance).toBe(0);
  });

  it("支出集計と物件別収支に使うカテゴリ合計を作る", () => {
    expect(aggregateExpensesByCategory([
      { category: "修繕費", amountYen: 30000 },
      { category: "修繕費", amountYen: 12000 },
      { category: "清掃費", amountYen: 8000 }
    ])).toEqual([
      { name: "修繕費", value: 42000 },
      { name: "清掃費", value: 8000 }
    ]);
  });

  it("CSV取込の重複検知キーを作る", () => {
    const first = detectPaymentDuplicateKey({ paidAt: "2026-05-25", amountYen: 81000, payerName: " ヤマダ　タロウ ", description: "家賃" });
    const second = detectPaymentDuplicateKey({ paidAt: "2026-05-25T10:00:00.000Z", amountYen: 81000, payerName: "ヤマダ　タロウ", description: "家賃" });
    expect(first).toBe(second);
  });
});

describe("Japanese validation messages", () => {
  it("初回セットアップ完了に必要な項目を検証する", () => {
    const result = setupSchema.safeParse({ ownerName: "", purpose: "", propertyName: "", propertyType: "", totalUnits: 0, roomNumber: "", rentYen: 0, unitStatus: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("名前または屋号");
  });

  it("必須項目の入力エラーを日本語で返す", () => {
    const result = propertySchema.safeParse({ name: "", propertyType: "", totalUnits: 0, managementType: "自主管理", status: "保有中" });
    expect(result.success).toBe(false);
  });

  it("契約終了日は開始日以降にする", () => {
    const result = contractSchema.safeParse({
      propertyId: "p1",
      unitId: "u1",
      tenantId: "t1",
      startDate: "2026-05-01",
      endDate: "2026-04-30",
      rentYen: 80000,
      commonFeeYen: 0,
      managementFeeYen: 0,
      parkingFeeYen: 0,
      otherMonthlyFeeYen: 0,
      securityDepositYen: 0,
      keyMoneyYen: 0,
      guaranteeDepositYen: 0,
      paymentDueDay: 27,
      paymentMethod: "振込",
      status: "契約中"
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("契約終了日");
  });
});
