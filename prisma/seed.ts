import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.monthlyCharge.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.property.deleteMany();
  await prisma.appSetting.deleteMany();

  const property = await prisma.property.create({
    data: {
      name: "サンプル山田ハイツ",
      propertyType: "アパート",
      address: "東京都千代田区サンプル1-2-3",
      totalUnits: 4,
      managementType: "自主管理",
      status: "保有中"
    }
  });
  const unit101 = await prisma.unit.create({
    data: {
      propertyId: property.id,
      roomNumber: "101",
      expectedRentYen: 78000,
      currentRentYen: 78000,
      commonFeeYen: 3000,
      status: "入居中"
    }
  });
  await prisma.unit.create({
    data: {
      propertyId: property.id,
      roomNumber: "102",
      expectedRentYen: 76000,
      currentRentYen: 0,
      commonFeeYen: 3000,
      status: "空室",
      vacantSince: new Date("2026-04-01")
    }
  });
  const tenant = await prisma.tenant.create({
    data: {
      displayName: "サンプル入居者",
      kanaName: "サンプルニュウキョシャ",
      tenantType: "個人",
      bankTransferName: "サンプルニユウキヨシヤ",
      status: "入居中"
    }
  });
  const contract = await prisma.contract.create({
    data: {
      propertyId: property.id,
      unitId: unit101.id,
      tenantId: tenant.id,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2027-12-31"),
      rentYen: 78000,
      commonFeeYen: 3000,
      securityDepositYen: 78000,
      keyMoneyYen: 78000,
      paymentDueDay: 27,
      paymentMethod: "振込",
      status: "契約中"
    }
  });
  await prisma.monthlyCharge.create({
    data: {
      targetMonth: "2026-05",
      contractId: contract.id,
      rentYen: 78000,
      commonFeeYen: 3000,
      totalBilledYen: 81000,
      paidYen: 0,
      unpaidYen: 81000,
      status: "請求済",
      dueDate: new Date("2026-05-27"),
      fixedAt: new Date()
    }
  });
  await prisma.expense.create({
    data: {
      spentAt: new Date("2026-05-10"),
      payee: "サンプル清掃会社",
      propertyId: property.id,
      category: "清掃費",
      amountYen: 12000,
      taxType: "課税",
      paymentMethod: "振込",
      hasReceipt: false,
      memo: "共用部清掃"
    }
  });
  await prisma.appSetting.createMany({
    data: [
      { key: "setupCompleted", value: "true" },
      { key: "ownerName", value: "サンプルオーナー" },
      { key: "purpose", value: "全部管理したい" }
    ]
  });
  await prisma.auditLog.create({
    data: {
      actionType: "サンプルデータ投入",
      targetTable: "AppSetting",
      targetId: "seed",
      afterJson: JSON.stringify({ propertyId: property.id, contractId: contract.id }),
      memo: "開発用のサンプルデータです。本番データとは混ぜないでください。"
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
