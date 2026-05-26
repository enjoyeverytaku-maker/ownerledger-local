import { Archive, Building2, ChevronRight, DatabaseBackup, FileText, Home, ReceiptText, Save, Search, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Papa from "papaparse";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { z } from "zod";
import { getApi } from "./api/browser-api";
import { currentMonth, formatDate, formatMonthForDisplay, formatYen, parseYenInput } from "./lib/format";
import { allocationSchema, contractSchema, depositTransactionSchema, documentSchema, expenseSchema, friendlyZodError, moveOutSettlementSchema, paymentSchema, propertySchema, repairSchema, setupSchema, spotChargeSchema, tenantSchema } from "./lib/validation";
import type { AllocationCandidate, AllocationRecord, ContractRecord, DashboardSummary, DepositTransactionRecord, DocumentRecord, ExpenseRecord, FontSizePreference, MonthlyChargeRecord, PaymentCsvRow, PaymentRecord, PropertyRecord, RepairRecord, ReportSummary, SetupPayload, SpotChargeRecord, TenantRecord, UnitRecord } from "./types";

const api = getApi();

const navItems = [
  { key: "ホーム", icon: Home },
  { key: "物件", icon: Building2 },
  { key: "入居者", icon: Users },
  { key: "家賃・入金", icon: ReceiptText },
  { key: "支出", icon: FileText },
  { key: "退去", icon: ShieldCheck },
  { key: "書類", icon: FileText },
  { key: "レポート", icon: FileText },
  { key: "バックアップ", icon: DatabaseBackup }
] as const;

const propertyTypes = ["アパート", "マンション", "戸建", "区分マンション", "店舗", "事務所", "駐車場", "その他"];
const unitStatuses = ["入居中", "空室", "退去予定", "募集中", "修繕中", "募集停止"];
const expenseCategories = ["管理委託料", "修繕費", "原状回復費", "清掃費", "広告費", "仲介手数料", "固定資産税", "都市計画税", "火災保険料", "地震保険料", "ローン利息", "ローン元金", "税理士報酬", "司法書士報酬", "水道光熱費", "消耗品費", "通信費", "その他"];
const repairTypes = ["原状回復", "設備交換", "緊急修繕", "定期修繕", "共用部修繕", "定期清掃", "消防設備点検", "貯水槽清掃", "排水管清掃", "エレベーター点検", "その他"];
const recurringMaintenanceTypes = ["定期清掃", "消防設備点検", "貯水槽清掃", "排水管清掃", "エレベーター点検", "共用部点検", "植栽管理", "その他"];
const documentTypes = ["契約書", "領収書", "請求書", "見積書", "固定資産税通知書", "保険証券", "ローン返済予定表", "その他"];
const spotChargeTypes = ["更新料", "更新事務手数料", "鍵交換代", "原状回復費", "水道代精算", "違約金", "退去精算", "駐車場追加請求", "その他"];
const fontSizeOptions: Array<{ value: FontSizePreference; label: string }> = [
  { value: "standard", label: "標準" },
  { value: "large", label: "大きい" },
  { value: "extra-large", label: "特大" }
];

function readFontSizePreference(): FontSizePreference {
  const stored = localStorage.getItem("ownerledger-font-size");
  if (stored === "large" || stored === "extra-large") return stored;
  return "standard";
}

function yenInput(value: FormDataEntryValue | null): number {
  return parseYenInput(String(value ?? "0"));
}

function textInput(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

function inferExpenseTaxType(category: string): string {
  if (["固定資産税", "都市計画税", "火災保険料", "地震保険料", "ローン利息", "ローン元金"].includes(category)) return "対象外";
  if (["管理委託料", "修繕費", "原状回復費", "清掃費", "広告費", "仲介手数料", "税理士報酬", "司法書士報酬", "水道光熱費", "消耗品費", "通信費"].includes(category)) return "課税";
  return "税理士確認";
}

function inferSpotChargeTaxType(chargeType: string): string {
  if (["更新料", "更新事務手数料", "礼金", "駐車場追加請求"].includes(chargeType)) return "税理士確認";
  if (["鍵交換代", "原状回復費", "水道代精算", "退去精算"].includes(chargeType)) return "課税";
  if (["違約金"].includes(chargeType)) return "対象外";
  return "税理士確認";
}

function todayText(): string {
  return new Date().toISOString().slice(0, 10);
}

function App() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [screen, setScreen] = useState("ホーム");
  const [message, setMessage] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<FontSizePreference>(() => readFontSizePreference());

  const refreshReady = useCallback(async () => {
    setReady(await api.isReady());
  }, []);

  useEffect(() => {
    void refreshReady();
  }, [refreshReady]);

  useEffect(() => {
    document.documentElement.dataset.fontSize = fontSize;
    localStorage.setItem("ownerledger-font-size", fontSize);
  }, [fontSize]);

  useEffect(() => {
    const offScreen = api.onSetScreen?.((nextScreen) => setScreen(nextScreen));
    const offFontSize = api.onSetFontSize?.((nextSize) => setFontSize(nextSize));
    return () => {
      offScreen?.();
      offFontSize?.();
    };
  }, []);

  if (ready === null) {
    return <FullPageMessage title="準備しています" body="保存データを確認しています。" />;
  }

  if (!ready) {
    return <SetupWizard onCompleted={() => void refreshReady()} />;
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="brand-block">
          <div className="brand-mark">OL</div>
          <div>
            <div className="brand-title">OwnerLedger</div>
            <div className="brand-subtitle">Local</div>
          </div>
        </div>
        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`nav-item ${screen === item.key ? "nav-item-active" : ""}`}
                onClick={() => setScreen(item.key)}
              >
                <Icon size={19} />
                <span>{item.key}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <h1 className="text-2xl font-bold">{screen}</h1>
            <p className="text-sm text-slate-600">収支、入金、証憑をローカルで整理します。</p>
          </div>
          <div className="topbar-actions">
            <FontSizeControl value={fontSize} onChange={setFontSize} />
            <button className="btn btn-primary" onClick={() => setScreen("バックアップ")}><DatabaseBackup className="mr-2 inline" size={18} />バックアップ</button>
          </div>
        </header>
        {message ? <div className="status-message">{message}</div> : null}
        <section className="content">
          {screen === "ホーム" && <Dashboard onNavigate={setScreen} />}
          {screen === "物件" && <MasterDataPage kind="property" onMessage={setMessage} />}
          {screen === "入居者" && <MasterDataPage kind="tenant" onMessage={setMessage} />}
          {screen === "家賃・入金" && <RentPage onMessage={setMessage} />}
          {screen === "支出" && <ExpensePage onMessage={setMessage} />}
          {screen === "退去" && <MoveOutPage onMessage={setMessage} />}
          {screen === "書類" && <DocumentPage onMessage={setMessage} />}
          {screen === "レポート" && <ReportPage onMessage={setMessage} />}
          {screen === "バックアップ" && <BackupPage onMessage={setMessage} />}
        </section>
        <EasyActionBar onNavigate={setScreen} />
      </main>
    </div>
  );
}

function FontSizeControl({ value, onChange }: { value: FontSizePreference; onChange: (value: FontSizePreference) => void }) {
  return (
    <div className="font-size-control" aria-label="文字サイズ">
      <span>文字サイズ</span>
      <div className="segmented-control">
        {fontSizeOptions.map((option) => (
          <button
            key={option.value}
            className={value === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function EasyActionBar({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const actions = [
    { label: "入金を見る", screen: "家賃・入金" },
    { label: "支出を入れる", screen: "支出" },
    { label: "書類を残す", screen: "書類" },
    { label: "控えを作る", screen: "バックアップ" }
  ];
  return (
    <div className="easy-action-bar" aria-label="かんたん操作">
      <div>
        <div className="easy-action-title">かんたん操作</div>
        <div className="easy-action-subtitle">迷ったら目的を選んでください。</div>
      </div>
      <div className="easy-action-buttons">
        {actions.map((action) => (
          <button key={action.label} className="btn btn-secondary" onClick={() => onNavigate(action.screen)} type="button">{action.label}</button>
        ))}
      </div>
    </div>
  );
}

function FullPageMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="card max-w-lg p-8 text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-slate-600">{body}</p>
      </div>
    </div>
  );
}

function SetupWizard({ onCompleted }: { onCompleted: () => void }) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SetupPayload>({
    ownerName: "",
    email: "",
    purpose: "全部管理したい",
    propertyName: "",
    propertyAddress: "",
    propertyType: "アパート",
    totalUnits: 1,
    roomNumber: "101",
    rentYen: 0,
    unitStatus: "空室",
    backupDirectory: ""
  });
  const steps = ["アプリの説明", "オーナー情報", "最初の物件", "最初の部屋", "バックアップ", "完了"];

  const update = (patch: Partial<SetupPayload>) => setData((current) => ({ ...current, ...patch }));
  const finish = async () => {
    const parsed = setupSchema.safeParse(data);
    if (!parsed.success) {
      setError(friendlyZodError(parsed.error));
      return;
    }
    await api.completeSetup(parsed.data);
    onCompleted();
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">オーナーレジャー ローカル 初回設定</h1>
          <p className="mt-2 text-slate-600">最初に必要な項目だけ登録します。詳しい情報は後から追加できます。</p>
        </div>
        <div className="mb-5 grid grid-cols-6 gap-2">
          {steps.map((label, index) => <div key={label} className={`rounded-lg px-3 py-2 text-center text-sm font-bold ${index <= step ? "bg-primary text-white" : "bg-white text-slate-500"}`}>{label}</div>)}
        </div>
        <div className="card p-8">
          {error ? <div className="mb-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 font-bold text-red-800">{error}</div> : null}
          {step === 0 && <StepIntro />}
          {step === 1 && (
            <div className="grid gap-5">
              <Input label="名前または屋号" required value={data.ownerName} onChange={(value) => update({ ownerName: value })} placeholder="例：山田不動産" />
              <Input label="メールアドレス" hint="あとで入力できます" value={data.email ?? ""} onChange={(value) => update({ email: value })} placeholder="例：owner@example.com" />
              <Select label="主な利用目的" value={data.purpose} onChange={(value) => update({ purpose: value })} options={["家賃管理", "確定申告資料の整理", "物件別収支の確認", "修繕・書類管理", "全部管理したい"]} />
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-5">
              <Input label="物件名" required value={data.propertyName} onChange={(value) => update({ propertyName: value })} placeholder="例：山田ハイツ" />
              <Input label="所在地" hint="あとで入力できます" value={data.propertyAddress ?? ""} onChange={(value) => update({ propertyAddress: value })} placeholder="例：東京都..." />
              <Select label="物件種別" value={data.propertyType} onChange={(value) => update({ propertyType: value })} options={propertyTypes} />
              <Input label="総戸数" required value={String(data.totalUnits)} onChange={(value) => update({ totalUnits: Number(value) || 1 })} placeholder="例：6" />
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-5">
              <Input label="部屋番号" required value={data.roomNumber} onChange={(value) => update({ roomNumber: value })} placeholder="例：101" />
              <Input label="家賃" required value={data.rentYen ? data.rentYen.toLocaleString("ja-JP") : ""} onChange={(value) => update({ rentYen: parseYenInput(value) })} placeholder="例：65,000" />
              <Select label="入居状況" value={data.unitStatus} onChange={(value) => update({ unitStatus: value })} options={unitStatuses} />
            </div>
          )}
          {step === 4 && (
            <div className="grid gap-5">
              <p className="text-lg font-bold">大切なデータを守るため、バックアップの保存先を設定してください。</p>
              <Input label="バックアップ保存先" hint="あとで設定できます" value={data.backupDirectory ?? ""} onChange={(value) => update({ backupDirectory: value })} placeholder="例：D:\OwnerLedgerBackups" />
            </div>
          )}
          {step === 5 && (
            <div className="grid gap-4">
              <h2 className="text-2xl font-bold">準備が完了しました</h2>
              <p className="text-slate-700">まずは物件情報を登録して、毎月の収支を見える化しましょう。</p>
              <SummaryLine label="オーナー" value={data.ownerName} />
              <SummaryLine label="物件" value={`${data.propertyName} / ${data.totalUnits}戸`} />
              <SummaryLine label="部屋" value={`${data.roomNumber} / ${formatYen(data.rentYen)}`} />
            </div>
          )}
          <div className="mt-8 flex justify-between">
            <button className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-bold" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>戻る</button>
            {step < 5 ? (
              <button className="rounded-lg bg-primary px-6 py-3 font-bold text-white" onClick={() => { setError(null); setStep((value) => value + 1); }}>次へ進む<ChevronRight className="ml-2 inline" size={18} /></button>
            ) : (
              <button className="rounded-lg bg-primary px-6 py-3 font-bold text-white" onClick={() => void finish()}><Save className="mr-2 inline" size={18} />設定を保存して始める</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIntro() {
  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-bold">このアプリでできること</h2>
      <p className="text-lg text-slate-700">このアプリでは、物件ごとの家賃収入、支出、未収、敷金、書類をまとめて管理できます。</p>
      <div className="grid grid-cols-2 gap-4">
        {["完全ローカル保存", "請求・入金・敷金を別管理", "バックアップ作成", "税理士提出用データ整理"].map((item) => <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-bold">{item}</div>)}
      </div>
    </div>
  );
}

function Dashboard({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  useEffect(() => {
    void api.getDashboard(currentMonth()).then(setSummary);
  }, []);
  if (!summary) return <FullWidthCard title="集計しています" body="保存データから今月の状況を確認しています。" />;
  const cards = [
    ["今月入る予定の家賃", summary.monthlyExpectedRentYen, "今月の家賃予定額です。"],
    ["今月入金済みの金額", summary.monthlyPaidYen, "すでに入金確認できた金額です。"],
    ["まだ入っていない金額", summary.monthlyUnpaidYen, "今月の家賃予定額のうち、まだ入金確認できていない金額です。"],
    ["今月の支出", summary.monthlyExpenseYen, "今月登録した支出の合計です。"],
    ["今月の手残り", summary.monthlyCashFlowYen, "収入から支出を差し引いた目安です。"],
    ["空室数", summary.vacantUnits, "入居中ではない部屋数です。"],
    ["滞納件数", summary.delinquencyCount, "支払期限を過ぎて未入金の件数です。"],
    ["登録済み物件数", summary.propertyCount, "使用中の物件数です。"]
  ] as const;
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-4 gap-4">
        {cards.map(([label, value, help]) => <MetricCard key={label} label={label} value={typeof value === "number" && label.includes("金額") || label.includes("家賃") || label.includes("支出") || label.includes("手残り") ? formatYen(value) : String(value)} help={help} />)}
      </div>
      <div className="grid grid-cols-[1.4fr_1fr] gap-5">
        <div className="card p-5">
          <h2 className="mb-4 text-xl font-bold">月別の収入・支出・手残り</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10000)}万`} />
                <Tooltip formatter={(value) => formatYen(Number(value))} />
                <Legend />
                <Bar dataKey="incomeYen" name="入金済み" fill="#19736b" />
                <Bar dataKey="expenseYen" name="支出" fill="#b45309" />
                <Bar dataKey="cashFlowYen" name="手残り" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-4 text-xl font-bold">支出カテゴリ</h2>
          {summary.expenseCategoryBreakdown.length === 0 ? <EmptyState title="支出はまだありません" action="支出を登録する" onClick={() => onNavigate("支出")} /> : (
            <ResponsiveContainer width="100%" height={288}>
              <PieChart>
                <Pie data={summary.expenseCategoryBreakdown} dataKey="value" nameKey="name" outerRadius={95} label>
                  {summary.expenseCategoryBreakdown.map((_, index) => <Cell key={index} fill={["#19736b", "#b45309", "#2563eb", "#9333ea"][index % 4]} />)}
                </Pie>
                <Tooltip formatter={(value) => formatYen(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <div className="card p-5">
        <h2 className="mb-4 text-xl font-bold">確認が必要なこと</h2>
        <div className="grid gap-3">
          {summary.actionCards.length === 0 ? <p className="text-slate-600">今すぐ対応が必要な項目はありません。</p> : summary.actionCards.map((card) => (
            <div key={card.title} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="font-bold">{card.title}</div>
                <div className="text-sm text-slate-600">{card.description}</div>
              </div>
              <button className="rounded-lg bg-primary px-4 py-2 font-bold text-white" onClick={() => onNavigate(card.destination)}>確認する</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MasterDataPage({ kind, onMessage }: { kind: "property" | "tenant"; onMessage: (message: string) => void }) {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tenantPropertyId, setTenantPropertyId] = useState("");

  const reload = useCallback(async () => {
    const [propertyList, unitList, tenantList, contractList] = await Promise.all([api.listProperties(), api.listUnits(), api.listTenants(), api.listContracts()]);
    setProperties(propertyList);
    setUnits(unitList);
    setTenants(tenantList);
    setContracts(contractList);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (kind !== "tenant") return;
    if (properties.length === 1) {
      setTenantPropertyId(properties[0].id);
      return;
    }
    if (!properties.some((property) => property.id === tenantPropertyId)) setTenantPropertyId("");
  }, [kind, properties, tenantPropertyId]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      if (kind === "property") {
        const input = propertySchema.parse({
          name: textInput(form.get("name")),
          propertyType: textInput(form.get("propertyType")),
          address: textInput(form.get("address")),
          totalUnits: Number(form.get("totalUnits")),
          managementType: "自主管理",
          status: "保有中",
          memo: textInput(form.get("memo"))
        });
        await api.createProperty(input);
        onMessage("物件を保存しました。");
      } else {
        const propertyId = textInput(form.get("propertyId"));
        const roomNumber = textInput(form.get("roomNumber"));
        const rentYen = yenInput(form.get("rentYen"));
        const commonFeeYen = yenInput(form.get("commonFeeYen"));
        const managementFeeYen = yenInput(form.get("managementFeeYen"));
        const parkingFeeYen = yenInput(form.get("parkingFeeYen"));
        const otherMonthlyFeeYen = yenInput(form.get("otherMonthlyFeeYen"));
        const startDate = textInput(form.get("startDate")) || todayText();
        if (!propertyId) throw new Error("入居する物件を選んでください。");
        if (!roomNumber) throw new Error("部屋番号を入力してください。");
        if (rentYen <= 0) throw new Error("家賃を1円以上で入力してください。");
        const activeContract = contracts.find((contract) => contract.propertyId === propertyId && contract.roomNumber === roomNumber && contract.status === "契約中");
        if (activeContract) throw new Error("この部屋には契約中の入居者が登録されています。部屋番号を確認してください。");
        const input = tenantSchema.parse({
          displayName: textInput(form.get("displayName")),
          kanaName: textInput(form.get("kanaName")),
          tenantType: textInput(form.get("tenantType")),
          phone: textInput(form.get("phone")),
          email: textInput(form.get("email")),
          bankTransferName: textInput(form.get("bankTransferName")),
          status: textInput(form.get("status")),
          memo: textInput(form.get("memo"))
        });
        const tenant = await api.createTenant(input);
        const existingUnit = units.find((unit) => unit.propertyId === propertyId && unit.roomNumber === roomNumber);
        const unit = existingUnit ?? await api.createUnit({
          propertyId,
          roomNumber,
          expectedRentYen: rentYen,
          currentRentYen: rentYen,
          commonFeeYen,
          parkingFeeYen,
          otherMonthlyFeeYen,
          status: "入居中",
          memo: "入居者登録から作成"
        });
        const contractInput = contractSchema.parse({
          propertyId,
          unitId: unit.id,
          tenantId: tenant.id,
          startDate,
          endDate: textInput(form.get("endDate")),
          renewalDate: textInput(form.get("renewalDate")),
          rentYen,
          commonFeeYen,
          managementFeeYen,
          parkingFeeYen,
          otherMonthlyFeeYen,
          securityDepositYen: yenInput(form.get("securityDepositYen")),
          keyMoneyYen: yenInput(form.get("keyMoneyYen")),
          guaranteeDepositYen: yenInput(form.get("guaranteeDepositYen")),
          renewalFeeYen: yenInput(form.get("renewalFeeYen")),
          renewalAdminFeeYen: yenInput(form.get("renewalAdminFeeYen")),
          paymentDueDay: Number(form.get("paymentDueDay")) || 27,
          paymentMethod: textInput(form.get("paymentMethod")),
          status: "契約中",
          memo: "入居者登録から作成"
        });
        const contract = await api.createContract(contractInput);
        if (form.get("attachLeaseContract") === "on") {
          try {
            await api.attachDocument({
              displayName: `${input.displayName} 賃貸借契約書`,
              documentType: "契約書",
              propertyId,
              unitId: unit.id,
              contractId: contract.id,
              issuedAt: startDate,
              receivedAt: todayText(),
              amountYen: 0,
              counterparty: input.displayName,
              memo: "入居者登録時に添付"
            });
            onMessage("入居者・契約・初期費用を保存し、賃貸借契約書を添付しました。");
          } catch (attachError) {
            onMessage(`入居者・契約・初期費用を保存しました。契約書の添付は完了していません: ${attachError instanceof Error ? attachError.message : "ファイルが選ばれていません。"}`);
          }
        } else {
          onMessage("入居者・契約・初期費用を保存しました。");
        }
        setTenantPropertyId(properties.length === 1 ? properties[0].id : "");
      }
      event.currentTarget.reset();
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "保存できませんでした。入力内容を確認してください。");
    }
  };
  return (
    <div className="grid grid-cols-[420px_1fr] gap-6">
      <form className="card grid gap-4 p-5" onSubmit={(event) => void submit(event)}>
        <h2 className="text-xl font-bold">{kind === "property" ? "物件を登録する" : "入居者・契約を登録する"}</h2>
        <p className="text-sm text-slate-600">必須項目だけで保存できます。詳しい情報は後から追加できます。</p>
        {error ? <div className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</div> : null}
        {kind === "property" ? (
          <>
            <FormInput name="name" label="物件名" required placeholder="例：山田ハイツ" />
            <FormSelect name="propertyType" label="物件種別" options={propertyTypes} />
            <FormInput name="totalUnits" label="総戸数" required placeholder="例：6" />
            <FormInput name="address" label="所在地" placeholder="あとで入力できます" />
            <FormInput name="memo" label="メモ" placeholder="管理会社や注意点など" />
          </>
        ) : (
          <>
            <FormInput name="displayName" label="氏名/法人名" required placeholder="例：田中 太郎" />
            <FormSelect
              name="propertyId"
              label="入居する物件"
              value={tenantPropertyId}
              onChange={setTenantPropertyId}
              options={[
                ...(properties.length === 1 ? [] : [{ label: "選択してください", value: "" }]),
                ...properties.map((item) => ({ label: item.name, value: item.id }))
              ]}
            />
            <FormInput name="roomNumber" label="部屋番号" required placeholder="例：101" />
            <FormInput name="rentYen" label="家賃" required placeholder="例：65000" />
            <FormInput name="startDate" label="入居開始日" required type="date" defaultValue={todayText()} />
            <FormInput name="endDate" label="契約終了日" type="date" />
            <FormInput name="renewalDate" label="次回更新日" type="date" />
            <FormInput name="commonFeeYen" label="共益費" placeholder="0" />
            <FormInput name="managementFeeYen" label="管理費" placeholder="0" />
            <FormInput name="parkingFeeYen" label="駐車場代" placeholder="0" />
            <FormInput name="otherMonthlyFeeYen" label="その他月額費用" placeholder="0" />
            <FormInput name="securityDepositYen" label="敷金" placeholder="0" />
            <FormInput name="keyMoneyYen" label="礼金" placeholder="0" />
            <FormInput name="guaranteeDepositYen" label="保証金" placeholder="0" />
            <FormInput name="renewalFeeYen" label="更新料" placeholder="0" />
            <FormInput name="renewalAdminFeeYen" label="更新事務手数料" placeholder="0" />
            <FormInput name="paymentDueDay" label="支払期日" required placeholder="27" defaultValue="27" />
            <FormSelect name="paymentMethod" label="入金方法" options={["振込", "口座振替", "保証会社送金", "現金", "その他"]} />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 font-bold">
              <input name="attachLeaseContract" type="checkbox" />
              賃貸借契約書を一緒に添付する
            </label>
            <FormInput name="kanaName" label="フリガナ" placeholder="あとで入力できます" />
            <FormSelect name="tenantType" label="区分" options={["個人", "法人"]} />
            <FormInput name="phone" label="電話番号" placeholder="あとで入力できます" />
            <FormInput name="email" label="メール" placeholder="あとで入力できます" />
            <FormInput name="bankTransferName" label="振込名義" placeholder="例：タナカタロウ" />
            <FormSelect name="status" label="状態" options={["入居中", "退去済", "申込中", "トラブルあり"]} />
            <FormInput name="memo" label="メモ" placeholder="必要な連絡メモなど" />
          </>
        )}
        <button className="mt-2 rounded-lg bg-primary px-5 py-3 font-bold text-white"><Save className="mr-2 inline" size={18} />保存する</button>
      </form>
      <div className="grid gap-5">
        <SearchBox value={search} onChange={setSearch} placeholder="入居者名・物件名・部屋番号で検索" />
        {kind === "property" ? <PropertyList properties={properties.filter((item) => item.name.includes(search) || (item.address ?? "").includes(search))} units={units} contracts={contracts} /> : <TenantList tenants={tenants.filter((item) => item.displayName.includes(search) || (item.kanaName ?? "").includes(search) || contracts.some((contract) => contract.tenantId === item.id && (`${contract.propertyName ?? ""} ${contract.roomNumber ?? ""}`).includes(search)))} contracts={contracts} />}
      </div>
    </div>
  );
}

function RentPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [charges, setCharges] = useState<MonthlyChargeRecord[]>([]);
  const [spotCharges, setSpotCharges] = useState<SpotChargeRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [candidates, setCandidates] = useState<AllocationCandidate[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [tab, setTab] = useState<"請求" | "入金確認" | "スポット請求" | "入金" | "消込">("請求");
  const [targetMonth, setTargetMonth] = useState(currentMonth());
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [contractList, chargeList, spotChargeList, paymentList, allocationList] = await Promise.all([api.listContracts(), api.listMonthlyCharges(targetMonth), api.listSpotCharges(), api.listPayments(), api.listAllocations()]);
    setContracts(contractList);
    setCharges(chargeList);
    setSpotCharges(spotChargeList);
    setPayments(paymentList);
    setAllocations(allocationList);
  }, [targetMonth]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const generateCharges = async () => {
    const result = await api.generateMonthlyCharges(targetMonth);
    onMessage(`${formatMonthForDisplay(targetMonth)}の月次請求を作成しました。作成 ${result.created}件、作成済み ${result.skipped}件。`);
    await reload();
  };
  const submitPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const input = paymentSchema.parse({
        paidAt: textInput(form.get("paidAt")),
        amountYen: yenInput(form.get("amountYen")),
        payerName: textInput(form.get("payerName")),
        description: textInput(form.get("description")),
        bankAccount: textInput(form.get("bankAccount")),
        memo: textInput(form.get("memo"))
      });
      const payment = await api.createPayment(input);
      onMessage("入金を登録しました。続けて、どの請求に充てるか確認できます。");
      event.currentTarget.reset();
      setSelectedPayment(payment);
      setCandidates(await api.findAllocationCandidates(payment.id));
      setTab("消込");
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "入金を保存できませんでした。入力内容を確認してください。");
    }
  };
  const submitSpotCharge = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const chargeType = textInput(form.get("chargeType"));
      const input = spotChargeSchema.parse({
        contractId: textInput(form.get("contractId")),
        monthlyChargeId: textInput(form.get("monthlyChargeId")),
        billedAt: textInput(form.get("billedAt")),
        dueDate: textInput(form.get("dueDate")),
        chargeType,
        description: textInput(form.get("description")),
        amountYen: yenInput(form.get("amountYen")),
        taxType: inferSpotChargeTaxType(chargeType),
        memo: textInput(form.get("memo"))
      });
      await api.createSpotCharge(input);
      event.currentTarget.reset();
      onMessage("スポット請求を登録しました。通常の家賃とは別に管理します。");
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "スポット請求を保存できませんでした。");
    }
  };
  const choosePayment = async (payment: PaymentRecord) => {
    setSelectedPayment(payment);
    setCandidates(await api.findAllocationCandidates(payment.id));
    setTab("消込");
  };
  const allocate = async (candidate: AllocationCandidate) => {
    if (!selectedPayment) return;
    const amountYen = Math.min(selectedPayment.remainingYen, candidate.unpaidYen);
    const parsed = allocationSchema.safeParse({ paymentId: selectedPayment.id, monthlyChargeId: candidate.monthlyChargeId, spotChargeId: candidate.spotChargeId, amountYen });
    if (!parsed.success) {
      setError(friendlyZodError(parsed.error));
      return;
    }
    await api.createAllocation(parsed.data);
    onMessage("入金を請求に充てました。請求と入金の状態を再計算しました。");
    setSelectedPayment(null);
    setCandidates([]);
    await reload();
  };
  const cancelAllocation = async (allocation: AllocationRecord) => {
    const answer = window.confirm("この消込を取り消します。入金と請求の状態が再計算されます。よろしいですか？");
    if (!answer) return;
    await api.cancelAllocation(allocation.id);
    onMessage("消込を取り消しました。入金と請求の状態を再計算しました。");
    await reload();
  };
  const confirmPassbookPayment = async (input: { kind: "monthly" | "spot"; id: string; paidAt: string; amountYen: number; payerName: string; description: string }) => {
    const payment = await api.createPayment({
      paidAt: input.paidAt,
      amountYen: input.amountYen,
      payerName: input.payerName,
      description: input.description,
      bankAccount: "通帳確認",
      memo: "紙の通帳を見ながら入金確認"
    });
    await api.createAllocation({
      paymentId: payment.id,
      monthlyChargeId: input.kind === "monthly" ? input.id : undefined,
      spotChargeId: input.kind === "spot" ? input.id : undefined,
      amountYen: input.amountYen,
      memo: "通帳確認から自動消込"
    });
    onMessage("通帳確認から入金登録と消込を行いました。");
    await reload();
  };
  const importCsv = async (file: File | null) => {
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const rows: PaymentCsvRow[] = result.data.map((row) => ({
          paidAt: row["入金日"]?.replaceAll("/", "-") ?? "",
          amountYen: parseYenInput(row["金額"] ?? "0"),
          payerName: row["振込名義"] ?? "",
          description: row["摘要"] ?? "",
          bankAccount: row["口座名"] ?? ""
        })).filter((row) => row.paidAt && row.amountYen > 0 && row.payerName);
        const answer = window.confirm(`CSVから${rows.length}件の入金を取り込みます。重複候補は取り込まず、取込履歴に残します。よろしいですか？`);
        if (!answer) return;
        const summary = await api.importPaymentCsv(rows, file.name);
        onMessage(`CSV取込が完了しました。取込 ${summary.imported}件、重複候補 ${summary.duplicates}件、エラー ${summary.errors}件。`);
        await reload();
      },
      error: () => setError("CSVを読み込めませんでした。ファイル形式を確認してください。")
    });
  };
  return (
    <div className="grid gap-6">
      <div className="card p-5">
        <h2 className="text-xl font-bold">月次請求を生成する</h2>
        <p className="mt-1 text-slate-600">契約中の部屋について、対象月の「今月入る予定の金額」を作成します。入居月・退去月の日割りと更新料も自動反映します。</p>
        <div className="mt-4 flex items-end gap-3">
          <div className="field">
            <label>対象月</label>
            <input type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} />
          </div>
          <button className="rounded-lg bg-primary px-5 py-3 font-bold text-white" onClick={() => void generateCharges()}>月次請求を生成</button>
        </div>
      </div>
      <div className="flex gap-2">
        {(["請求", "入金確認", "スポット請求", "入金", "消込"] as const).map((item) => (
          <button key={item} className={`rounded-lg px-5 py-3 font-bold ${tab === item ? "bg-primary text-white" : "border border-slate-300 bg-white"}`} onClick={() => setTab(item)}>{item}</button>
        ))}
      </div>
      {error ? <div className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</div> : null}
      {tab === "請求" && <ChargeList charges={charges} />}
      {tab === "入金確認" && <PaymentConfirmationPanel charges={charges} spotCharges={spotCharges} onConfirm={(input) => void confirmPassbookPayment(input)} />}
      {tab === "スポット請求" && (
        <div className="grid grid-cols-[420px_1fr] gap-6">
          <form className="card grid gap-4 p-5" onSubmit={(event) => void submitSpotCharge(event)}>
            <h2 className="text-xl font-bold">スポット請求を登録する</h2>
            <p className="text-sm text-slate-600">通常の家賃とは別に請求するものです。入金時は家賃請求と分けて消込できます。</p>
            <FormSelect name="contractId" label="契約" options={contracts.map((item) => ({ label: `${item.tenantName} / ${item.propertyName} ${item.roomNumber}`, value: item.id }))} />
            <FormSelect name="monthlyChargeId" label="関連する月次請求" options={[{ label: "選択しない", value: "" }, ...charges.map((item) => ({ label: `${item.tenantName} / ${formatMonthForDisplay(item.targetMonth)}`, value: item.id }))]} />
            <FormInput name="billedAt" label="請求日" required type="date" />
            <FormInput name="dueDate" label="支払期限" type="date" />
            <FormSelect name="chargeType" label="請求種別" options={spotChargeTypes} />
            <FormInput name="description" label="内容" required placeholder="例：契約更新料" />
            <FormInput name="amountYen" label="金額" required placeholder="例：78000" />
            <FormInput name="memo" label="メモ" placeholder="補足" />
            <button className="rounded-lg bg-primary px-5 py-3 font-bold text-white"><Save className="mr-2 inline" size={18} />スポット請求を保存する</button>
          </form>
          <SpotChargeList spotCharges={spotCharges} />
        </div>
      )}
      {tab === "入金" && (
        <div className="grid grid-cols-[420px_1fr] gap-6">
          <form className="card grid gap-4 p-5" onSubmit={(event) => void submitPayment(event)}>
            <h2 className="text-xl font-bold">入金を登録する</h2>
            <p className="text-sm text-slate-600">入金を登録しても、自動では収益扱いしません。どの請求に充てるかを確認してから反映します。</p>
            <FormInput name="paidAt" label="入金日" required type="date" />
            <FormInput name="amountYen" label="入金額" required placeholder="例：81000" />
            <FormInput name="payerName" label="振込名義" required placeholder="例：タナカタロウ" />
            <FormInput name="description" label="摘要" placeholder="通帳や明細の内容" />
            <FormInput name="bankAccount" label="口座名" placeholder="例：メイン口座" />
            <FormInput name="memo" label="メモ" placeholder="あとで確認したいこと" />
            <button className="rounded-lg bg-primary px-5 py-3 font-bold text-white"><Save className="mr-2 inline" size={18} />入金を保存する</button>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="font-bold">CSV取込</div>
              <p className="mt-1 text-sm text-slate-600">銀行からダウンロードした入金明細CSVを選んでください。列名は「入金日, 金額, 振込名義, 摘要, 口座名」に対応しています。</p>
              <input className="mt-3" type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event.target.files?.[0] ?? null)} />
            </div>
          </form>
          <PaymentList payments={payments} onChoose={(payment) => void choosePayment(payment)} />
        </div>
      )}
      {tab === "消込" && (
        <AllocationPanel selectedPayment={selectedPayment} payments={payments} candidates={candidates} allocations={allocations} onChoose={(payment) => void choosePayment(payment)} onAllocate={(candidate) => void allocate(candidate)} onCancel={(allocation) => void cancelAllocation(allocation)} />
      )}
    </div>
  );
}

function ChargeList({ charges }: { charges: MonthlyChargeRecord[] }) {
  if (charges.length === 0) return <EmptyState title="この月の請求はまだありません" action="上のボタンから月次請求を生成する" />;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-bold">月次請求一覧</h2>
        <p className="mt-1 text-sm text-slate-600">「今月入る予定の金額」「すでに入った金額」「まだ入っていない金額」を分けて確認できます。</p>
      </div>
      <div className="divide-y divide-slate-200">
        {charges.map((charge) => (
          <div key={charge.id} className="grid grid-cols-[1.2fr_120px_150px_150px_120px] items-center gap-4 p-4">
            <div>
              <div className="font-bold">{charge.tenantName}</div>
              <div className="text-sm text-slate-600">{charge.propertyName} {charge.roomNumber} / {formatMonthForDisplay(charge.targetMonth)}</div>
              {charge.memo ? <div className="text-xs font-bold text-emerald-700">{charge.memo}</div> : null}
            </div>
            <span className={`badge ${charge.status === "入金済" ? "badge-ok" : charge.status === "一部入金" ? "badge-warn" : "badge-muted"}`}>{charge.status}</span>
            <div><div className="text-xs text-slate-500">予定額</div><div className="font-bold">{formatYen(charge.totalBilledYen)}</div></div>
            <div><div className="text-xs text-slate-500">入金済み</div><div className="font-bold">{formatYen(charge.paidYen)}</div></div>
            <div><div className="text-xs text-slate-500">未入金</div><div className="font-bold text-red-700">{formatYen(charge.unpaidYen)}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentConfirmationPanel({ charges, spotCharges, onConfirm }: { charges: MonthlyChargeRecord[]; spotCharges: SpotChargeRecord[]; onConfirm: (input: { kind: "monthly" | "spot"; id: string; paidAt: string; amountYen: number; payerName: string; description: string }) => void }) {
  const [paidAt, setPaidAt] = useState(todayText());
  const unpaidMonthly = charges.filter((charge) => charge.unpaidYen > 0 && !["入金済", "取消", "免除"].includes(String(charge.status)));
  const unpaidSpot = spotCharges.filter((charge) => charge.remainingYen > 0 && !["入金済"].includes(String(charge.paidStatus)));
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="text-xl font-bold">銀行API連携</h2>
          <p className="mt-1 text-sm text-slate-600">銀行APIや外部明細サービスから入金明細を取り込み、振込名義と金額で自動消込する方式です。</p>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">準備中: 先にCSV取込と通帳確認で運用できます。</div>
        </div>
        <div className="card p-5">
          <h2 className="text-xl font-bold">通帳を見ながら確認</h2>
          <p className="mt-1 text-sm text-slate-600">紙の通帳やネットバンキング画面で入金を見つけたら、該当行のボタンで入金登録と消込をまとめて行います。</p>
          <div className="field mt-4">
            <label>確認した入金日</label>
            <input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
          </div>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-bold">未入金チェックリスト</h2>
        </div>
        {unpaidMonthly.length === 0 && unpaidSpot.length === 0 ? (
          <div className="p-5 text-slate-600">未入金の請求はありません。</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {unpaidMonthly.map((charge) => (
              <div key={charge.id} className="grid grid-cols-[1fr_150px_150px] items-center gap-4 p-4">
                <div>
                  <div className="font-bold">{charge.tenantName}</div>
                  <div className="text-sm text-slate-600">{charge.propertyName} {charge.roomNumber} / {formatMonthForDisplay(charge.targetMonth)} / 月次請求</div>
                </div>
                <div><div className="text-xs text-slate-500">未入金</div><div className="font-bold text-red-700">{formatYen(charge.unpaidYen)}</div></div>
                <button className="rounded-lg bg-primary px-4 py-2 font-bold text-white" onClick={() => onConfirm({ kind: "monthly", id: charge.id, paidAt, amountYen: charge.unpaidYen, payerName: charge.tenantName ?? "通帳確認", description: `${formatMonthForDisplay(charge.targetMonth)} 家賃入金` })}>入金あり</button>
              </div>
            ))}
            {unpaidSpot.map((charge) => (
              <div key={charge.id} className="grid grid-cols-[1fr_150px_150px] items-center gap-4 p-4">
                <div>
                  <div className="font-bold">{charge.tenantName}</div>
                  <div className="text-sm text-slate-600">{charge.propertyName} {charge.roomNumber} / {charge.chargeType}</div>
                  <div className="text-sm text-slate-600">{charge.description}</div>
                </div>
                <div><div className="text-xs text-slate-500">未入金</div><div className="font-bold text-red-700">{formatYen(charge.remainingYen)}</div></div>
                <button className="rounded-lg bg-primary px-4 py-2 font-bold text-white" onClick={() => onConfirm({ kind: "spot", id: charge.id, paidAt, amountYen: charge.remainingYen, payerName: charge.tenantName ?? "通帳確認", description: `${charge.chargeType} 入金` })}>入金あり</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SpotChargeList({ spotCharges }: { spotCharges: SpotChargeRecord[] }) {
  if (spotCharges.length === 0) return <EmptyState title="スポット請求はまだありません" action="左のフォームからスポット請求を登録する" />;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-bold">スポット請求一覧</h2>
        <p className="mt-1 text-sm text-slate-600">通常の家賃とは別に請求するものです。家賃収入・敷金・支出とは分けて管理します。</p>
      </div>
      <div className="divide-y divide-slate-200">
        {spotCharges.map((charge) => (
          <div key={charge.id} className="grid grid-cols-[1fr_130px_130px_130px_120px] items-center gap-4 p-4">
            <div>
              <div className="font-bold">{charge.tenantName}</div>
              <div className="text-sm text-slate-600">{charge.propertyName} {charge.roomNumber} / {charge.chargeType}</div>
              <div className="text-sm text-slate-600">{charge.description}</div>
            </div>
            <span className={`badge ${charge.paidStatus === "入金済" ? "badge-ok" : charge.paidStatus === "一部入金" ? "badge-warn" : "badge-muted"}`}>{charge.paidStatus}</span>
            <div><div className="text-xs text-slate-500">請求額</div><div className="font-bold">{formatYen(charge.amountYen)}</div></div>
            <div><div className="text-xs text-slate-500">未入金</div><div className="font-bold text-red-700">{formatYen(charge.remainingYen)}</div></div>
            <div className="text-sm text-slate-600">{formatDate(charge.dueDate)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentList({ payments, onChoose }: { payments: PaymentRecord[]; onChoose: (payment: PaymentRecord) => void }) {
  if (payments.length === 0) return <EmptyState title="入金はまだ登録されていません" action="左のフォームから入金を登録する" />;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-bold">入金一覧</h2>
        <p className="mt-1 text-sm text-slate-600">未消込の入金は、どの請求に充てるか確認してください。</p>
      </div>
      <div className="divide-y divide-slate-200">
        {payments.map((payment) => (
          <div key={payment.id} className="grid grid-cols-[1fr_130px_130px_120px] items-center gap-4 p-4">
            <div>
              <div className="font-bold">{payment.payerName}</div>
              <div className="text-sm text-slate-600">{formatDate(payment.paidAt)} / {payment.description || "摘要なし"}</div>
            </div>
            <div className="font-bold">{formatYen(payment.amountYen)}</div>
            <span className={`badge ${payment.status === "消込済" ? "badge-ok" : payment.status === "一部消込" ? "badge-warn" : "badge-muted"}`}>{payment.status}</span>
            <button className="rounded-lg bg-primary px-4 py-2 font-bold text-white" onClick={() => onChoose(payment)}>確認する</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AllocationPanel({ selectedPayment, payments, candidates, allocations, onChoose, onAllocate, onCancel }: { selectedPayment: PaymentRecord | null; payments: PaymentRecord[]; candidates: AllocationCandidate[]; allocations: AllocationRecord[]; onChoose: (payment: PaymentRecord) => void; onAllocate: (candidate: AllocationCandidate) => void; onCancel: (allocation: AllocationRecord) => void }) {
  const openPayments = payments.filter((payment) => payment.status !== "消込済" && payment.remainingYen > 0);
  return (
    <div className="grid grid-cols-[360px_1fr] gap-6">
      <div className="card p-5">
        <h2 className="text-xl font-bold">入金を選ぶ</h2>
        <p className="mt-1 text-sm text-slate-600">消込は、入金をどの請求に充てるか確認する作業です。自動確定はしません。</p>
        <div className="mt-4 grid gap-3">
          {openPayments.length === 0 ? <p className="text-slate-600">確認が必要な入金はありません。</p> : openPayments.map((payment) => (
            <button key={payment.id} className={`rounded-lg border p-3 text-left ${selectedPayment?.id === payment.id ? "border-primary bg-emerald-50" : "border-slate-200 bg-white"}`} onClick={() => onChoose(payment)}>
              <div className="font-bold">{payment.payerName}</div>
              <div className="text-sm text-slate-600">{formatYen(payment.remainingYen)} / {formatDate(payment.paidAt)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <h2 className="text-xl font-bold">候補となる請求</h2>
        {!selectedPayment ? (
          <EmptyState title="左から入金を選んでください" action="未消込の入金を確認する" />
        ) : (
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="font-bold">選択中の入金</div>
              <div className="mt-1 text-slate-700">{selectedPayment.payerName} / 入金額 {formatYen(selectedPayment.amountYen)} / 残額 {formatYen(selectedPayment.remainingYen)}</div>
            </div>
            {candidates.length === 0 ? <p className="text-slate-600">候補がありません。月次請求を生成してから確認してください。</p> : candidates.map((candidate) => (
              <div key={candidate.monthlyChargeId} className="grid grid-cols-[1fr_130px_110px] items-center gap-4 rounded-lg border border-slate-200 p-4">
                <div>
                  <div className="font-bold">{candidate.tenantName}</div>
                  <div className="text-sm text-slate-600">{candidate.propertyName} {candidate.roomNumber} / {candidate.chargeKind === "月次請求" && candidate.targetMonth ? formatMonthForDisplay(candidate.targetMonth) : candidate.description}</div>
                  <span className={`badge mt-2 ${candidate.chargeKind === "スポット請求" ? "badge-warn" : "badge-muted"}`}>{candidate.chargeKind}</span>
                  <div className="mt-2 flex flex-wrap gap-2">{candidate.reasons.map((reason) => <span key={reason} className="badge badge-muted">{reason}</span>)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">未入金額</div>
                  <div className="font-bold">{formatYen(candidate.unpaidYen)}</div>
                  <div className="text-xs text-slate-500">一致度 {candidate.score}</div>
                </div>
                <button className="rounded-lg bg-primary px-4 py-3 font-bold text-white" onClick={() => onAllocate(candidate)}>この請求に充てる</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card col-span-2 p-5">
        <h2 className="text-xl font-bold">消込履歴</h2>
        <p className="mt-1 text-sm text-slate-600">間違えた場合は取消できます。取消後は、入金と請求の状態を自動で再計算します。</p>
        <div className="mt-4 grid gap-3">
          {allocations.length === 0 ? <p className="text-slate-600">消込履歴はまだありません。</p> : allocations.map((allocation) => (
            <div key={allocation.id} className="grid grid-cols-[1fr_130px_100px_120px] items-center gap-4 rounded-lg border border-slate-200 p-4">
              <div>
                <div className="font-bold">{allocation.tenantName || "請求情報"}</div>
                <div className="text-sm text-slate-600">{allocation.propertyName} {allocation.roomNumber} / {allocation.targetMonth ? formatMonthForDisplay(allocation.targetMonth) : allocation.description || "-"}</div>
                <span className="badge badge-muted mt-2">{allocation.chargeKind || "月次請求"}</span>
              </div>
              <div className="font-bold">{formatYen(allocation.amountYen)}</div>
              <span className={`badge ${allocation.status === "有効" ? "badge-ok" : "badge-muted"}`}>{allocation.status}</span>
              <button className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-bold text-red-700 disabled:opacity-50" disabled={allocation.status !== "有効"} onClick={() => onCancel(allocation)}>取消する</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpensePage({ onMessage }: { onMessage: (message: string) => void }) {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [view, setView] = useState<"支出" | "修繕">("支出");
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [propertyList, unitList, expenseList] = await Promise.all([api.listProperties(), api.listUnits(), api.listExpenses()]);
    setProperties(propertyList);
    setUnits(unitList);
    setExpenses(expenseList);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const category = textInput(form.get("category"));
      const input = expenseSchema.parse({
        spentAt: textInput(form.get("spentAt")),
        payee: textInput(form.get("payee")),
        propertyId: textInput(form.get("propertyId")),
        unitId: textInput(form.get("unitId")),
        category,
        amountYen: yenInput(form.get("amountYen")),
        taxType: inferExpenseTaxType(category),
        paymentMethod: textInput(form.get("paymentMethod")),
        hasReceipt: form.get("hasReceipt") === "on",
        accountingMemo: textInput(form.get("accountingMemo")),
        taxReturnCategory: textInput(form.get("taxReturnCategory")),
        memo: textInput(form.get("memo"))
      });
      await api.createExpense(input);
      event.currentTarget.reset();
      onMessage("支出を登録しました。領収書・請求書などの証明書類がない場合は一覧で確認できます。");
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "支出を保存できませんでした。");
    }
  };
  const cancel = async (expense: ExpenseRecord) => {
    if (!window.confirm("この支出を取り消します。支出集計から外れますが、操作履歴には残ります。よろしいですか？")) return;
    await api.cancelExpense(expense.id);
    onMessage("支出を取り消しました。");
    await reload();
  };
  const total = expenses.filter((item) => item.status !== "取消").reduce((sum, item) => sum + item.amountYen, 0);
  const noReceipt = expenses.filter((item) => item.status !== "取消" && !item.hasReceipt).length;
  const tabs = (
    <div className="flex gap-2">
      {(["支出", "修繕"] as const).map((item) => (
        <button key={item} className={`rounded-lg px-5 py-3 font-bold ${view === item ? "bg-primary text-white" : "border border-slate-300 bg-white"}`} onClick={() => setView(item)}>{item}</button>
      ))}
    </div>
  );
  if (view === "修繕") {
    return (
      <div className="grid gap-6">
        {tabs}
        <RepairPage onMessage={onMessage} />
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      {tabs}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="登録済み支出" value={formatYen(total)} help="取消されていない支出の合計です。" />
        <MetricCard label="領収書なし" value={`${noReceipt}件`} help="領収書・請求書などの証明書類が未確認の支出です。" />
        <MetricCard label="登録件数" value={`${expenses.length}件`} help="支出として登録した内容です。" />
      </div>
      <div className="grid grid-cols-[420px_1fr] gap-6">
        <form className="card grid gap-4 p-5" onSubmit={(event) => void submit(event)}>
          <h2 className="text-xl font-bold">支出を登録する</h2>
          <p className="text-sm text-slate-600">領収書・請求書などの証明書類があるかも一緒に記録します。</p>
          {error ? <div className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</div> : null}
          <FormInput name="spentAt" label="支出日" required type="date" />
          <FormInput name="payee" label="支払先" required placeholder="例：山田工務店" />
          <FormSelect name="propertyId" label="物件" options={[{ label: "選択しない", value: "" }, ...properties.map((item) => ({ label: item.name, value: item.id }))]} />
          <FormSelect name="unitId" label="部屋" options={[{ label: "選択しない", value: "" }, ...units.map((item) => ({ label: `${item.propertyName ?? ""} ${item.roomNumber}`, value: item.id }))]} />
          <FormSelect name="category" label="カテゴリ" options={expenseCategories} />
          <FormInput name="amountYen" label="金額" required placeholder="例：12000" />
          <FormSelect name="paymentMethod" label="支払方法" options={["振込", "口座振替", "現金", "クレジットカード", "その他"]} />
          <label className="flex items-center gap-2 font-bold"><input name="hasReceipt" type="checkbox" />領収書・請求書などの証明書類あり</label>
          <FormInput name="taxReturnCategory" label="確定申告用カテゴリ" placeholder="あとで入力できます" />
          <FormInput name="accountingMemo" label="会計処理メモ" placeholder="税理士に確認したいことなど" />
          <FormInput name="memo" label="メモ" placeholder="補足" />
          <button className="rounded-lg bg-primary px-5 py-3 font-bold text-white"><Save className="mr-2 inline" size={18} />支出を保存する</button>
        </form>
        <ExpenseList expenses={expenses} onCancel={(expense) => void cancel(expense)} />
      </div>
    </div>
  );
}

function ExpenseList({ expenses, onCancel }: { expenses: ExpenseRecord[]; onCancel: (expense: ExpenseRecord) => void }) {
  if (expenses.length === 0) return <EmptyState title="支出はまだ登録されていません" action="左のフォームから支出を登録する" />;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-bold">支出一覧</h2></div>
      <div className="divide-y divide-slate-200">
        {expenses.map((expense) => (
          <div key={expense.id} className="grid grid-cols-[1fr_130px_120px_120px] items-center gap-4 p-4">
            <div>
              <div className="font-bold">{expense.payee}</div>
              <div className="text-sm text-slate-600">{formatDate(expense.spentAt)} / {expense.propertyName || "物件未指定"} / {expense.category}</div>
              {!expense.hasReceipt ? <span className="badge badge-warn mt-2">領収書なし</span> : null}
            </div>
            <div className="font-bold">{formatYen(expense.amountYen)}</div>
            <span className={`badge ${expense.status === "取消" ? "badge-muted" : "badge-ok"}`}>{expense.status}</span>
            <button className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-bold text-red-700 disabled:opacity-50" disabled={expense.status === "取消"} onClick={() => onCancel(expense)}>取消する</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveOutPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [deposits, setDeposits] = useState<DepositTransactionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdjustment, setShowAdjustment] = useState(false);
  const reload = useCallback(async () => {
    const [contractList, depositList] = await Promise.all([api.listContracts(), api.listDepositTransactions()]);
    setContracts(contractList);
    setDeposits(depositList);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const settleMoveOut = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const input = moveOutSettlementSchema.parse({
        contractId: textInput(form.get("contractId")),
        moveOutDate: textInput(form.get("moveOutDate")),
        unpaidRentYen: yenInput(form.get("unpaidRentYen")),
        restorationFeeYen: yenInput(form.get("restorationFeeYen")),
        cleaningFeeYen: yenInput(form.get("cleaningFeeYen")),
        keyReplacementFeeYen: yenInput(form.get("keyReplacementFeeYen")),
        otherDeductionYen: yenInput(form.get("otherDeductionYen")),
        refundYen: yenInput(form.get("refundYen")),
        additionalChargeYen: yenInput(form.get("additionalChargeYen")),
        memo: textInput(form.get("memo"))
      });
      const result = await api.settleMoveOut(input);
      event.currentTarget.reset();
      onMessage(`退去精算を登録しました。敷金・保証金の残高は${formatYen(result.depositBalanceYen)}です。`);
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "退去精算を保存できませんでした。");
    }
  };
  const cancel = async (deposit: DepositTransactionRecord) => {
    if (!window.confirm("この敷金・預り金の取引を取り消します。残高の確認が必要です。よろしいですか？")) return;
    await api.cancelDepositTransaction(deposit.id);
    onMessage("敷金・預り金の取引を取り消しました。");
    await reload();
  };
  const submitAdjustment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const input = depositTransactionSchema.parse({
        contractId: textInput(form.get("contractId")),
        transactedAt: textInput(form.get("transactedAt")),
        depositType: textInput(form.get("depositType")),
        transactionType: textInput(form.get("transactionType")),
        amountYen: yenInput(form.get("amountYen")),
        description: textInput(form.get("description")),
        memo: textInput(form.get("memo"))
      });
      await api.createDepositTransaction(input);
      event.currentTarget.reset();
      onMessage("敷金・保証金の個別調整を登録しました。");
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "個別調整を保存できませんでした。");
    }
  };
  const depositBalance = deposits.filter((item) => item.status === "有効").reduce((sum, item) => item.transactionType === "預り" || item.transactionType === "修正" ? sum + item.amountYen : sum - item.amountYen, 0);
  return (
    <div className="grid gap-6">
      <div className="card p-5">
        <h2 className="text-xl font-bold">退去精算</h2>
        <p className="mt-1 text-slate-600">退去時の控除、返金、追加請求をまとめて登録します。保存すると契約は終了し、部屋は空室になります。</p>
        <div className="mt-4 text-3xl font-bold">{formatYen(depositBalance)}</div>
        <p className="mt-1 text-sm text-slate-600">敷金・保証金の現在残高です。</p>
      </div>
      <div className="grid grid-cols-[420px_1fr] gap-6">
        <form className="card grid gap-4 p-5" onSubmit={(event) => void settleMoveOut(event)}>
          <h2 className="text-xl font-bold">退去精算を登録する</h2>
          {error ? <div className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</div> : null}
          <FormSelect name="contractId" label="契約" options={contracts.filter((item) => item.status !== "終了").map((item) => ({ label: `${item.tenantName} / ${item.propertyName} ${item.roomNumber}`, value: item.id }))} />
          <FormInput name="moveOutDate" label="退去日" required type="date" defaultValue={todayText()} />
          <FormInput name="unpaidRentYen" label="未収家賃・日割り差額" placeholder="0" />
          <FormInput name="restorationFeeYen" label="原状回復費" placeholder="0" />
          <FormInput name="cleaningFeeYen" label="清掃費" placeholder="0" />
          <FormInput name="keyReplacementFeeYen" label="鍵交換費" placeholder="0" />
          <FormInput name="otherDeductionYen" label="その他控除" placeholder="0" />
          <FormInput name="refundYen" label="返金額" placeholder="0" />
          <FormInput name="additionalChargeYen" label="追加請求額" placeholder="0" />
          <FormInput name="memo" label="メモ" placeholder="立会い結果や精算メモ" />
          <button className="rounded-lg bg-primary px-5 py-3 font-bold text-white"><Save className="mr-2 inline" size={18} />退去精算を保存する</button>
        </form>
        <DepositList deposits={deposits} onCancel={(deposit) => void cancel(deposit)} />
      </div>
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">敷金・保証金の個別調整</h2>
            <p className="mt-1 text-sm text-slate-600">通常は入居者登録と退去精算で自動管理します。残高修正が必要な場合だけ使います。</p>
          </div>
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-bold" onClick={() => setShowAdjustment((value) => !value)}>{showAdjustment ? "閉じる" : "個別調整を開く"}</button>
        </div>
        {showAdjustment ? (
          <form className="mt-5 grid grid-cols-4 gap-4" onSubmit={(event) => void submitAdjustment(event)}>
            <FormSelect name="contractId" label="契約" options={contracts.map((item) => ({ label: `${item.tenantName} / ${item.propertyName} ${item.roomNumber}`, value: item.id }))} />
            <FormInput name="transactedAt" label="取引日" required type="date" defaultValue={todayText()} />
            <FormSelect name="depositType" label="種類" options={["敷金", "保証金", "預り金", "退去精算預り", "その他預り金"]} />
            <FormSelect name="transactionType" label="取引種別" options={["預り", "控除", "返金", "振替", "修正"]} />
            <FormInput name="amountYen" label="金額" required placeholder="例：78000" />
            <FormInput name="description" label="内容" required placeholder="例：残高調整" />
            <FormInput name="memo" label="メモ" placeholder="補足" />
            <div className="flex items-end"><button className="rounded-lg bg-primary px-5 py-3 font-bold text-white"><Save className="mr-2 inline" size={18} />保存する</button></div>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function DepositList({ deposits, onCancel }: { deposits: DepositTransactionRecord[]; onCancel: (deposit: DepositTransactionRecord) => void }) {
  if (deposits.length === 0) return <EmptyState title="敷金・預り金の取引はまだありません" action="左のフォームから取引を登録する" />;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-bold">敷金台帳</h2></div>
      <div className="divide-y divide-slate-200">
        {deposits.map((deposit) => (
          <div key={deposit.id} className="grid grid-cols-[1fr_120px_130px_120px] items-center gap-4 p-4">
            <div>
              <div className="font-bold">{deposit.tenantName}</div>
              <div className="text-sm text-slate-600">{formatDate(deposit.transactedAt)} / {deposit.depositType} / {deposit.transactionType}</div>
              <div className="text-sm text-slate-600">{deposit.description}</div>
            </div>
            <div className="font-bold">{formatYen(deposit.amountYen)}</div>
            <div><div className="text-xs text-slate-500">登録後残高</div><div className="font-bold">{formatYen(deposit.balanceAfterYen)}</div></div>
            <button className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-bold text-red-700 disabled:opacity-50" disabled={deposit.status === "取消"} onClick={() => onCancel(deposit)}>取消する</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RepairPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [propertyList, unitList, repairList] = await Promise.all([api.listProperties(), api.listUnits(), api.listRepairs()]);
    setProperties(propertyList);
    setUnits(unitList);
    setRepairs(repairList);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const input = repairSchema.parse({
        propertyId: textInput(form.get("propertyId")),
        unitId: textInput(form.get("unitId")),
        occurredAt: textInput(form.get("occurredAt")),
        description: textInput(form.get("description")),
        repairType: textInput(form.get("repairType")),
        vendorName: textInput(form.get("vendorName")),
        estimateAmountYen: yenInput(form.get("estimateAmountYen")),
        finalAmountYen: yenInput(form.get("finalAmountYen")),
        approvalStatus: textInput(form.get("approvalStatus")),
        workStatus: textInput(form.get("workStatus")),
        memo: textInput(form.get("memo"))
      });
      await api.createRepair(input);
      event.currentTarget.reset();
      onMessage("修繕を登録しました。完了後は支出へ連携できます。");
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "修繕を保存できませんでした。");
    }
  };
  const linkExpense = async (repair: RepairRecord) => {
    if (!window.confirm("この修繕内容から支出を作成します。領収書・請求書はあとで添付確認してください。よろしいですか？")) return;
    await api.linkRepairExpense({ repairId: repair.id, paymentMethod: "振込" });
    onMessage("修繕から支出を作成しました。");
    await reload();
  };
  const submitRecurring = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const interval = textInput(form.get("intervalMonths"));
      const input = repairSchema.parse({
        propertyId: textInput(form.get("propertyId")),
        unitId: "",
        occurredAt: textInput(form.get("nextDueDate")),
        description: textInput(form.get("description")) || `${textInput(form.get("repairType"))}の予定`,
        repairType: textInput(form.get("repairType")),
        vendorName: textInput(form.get("vendorName")),
        estimateAmountYen: yenInput(form.get("estimateAmountYen")),
        finalAmountYen: 0,
        approvalStatus: "承認待ち",
        workStatus: "手配中",
        memo: `定期予定 / 周期: ${interval || "未設定"}か月 / ${textInput(form.get("memo"))}`
      });
      await api.createRepair(input);
      event.currentTarget.reset();
      onMessage("定期清掃・点検の予定を登録しました。次回予定として一覧に表示されます。");
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "定期予定を保存できませんでした。");
    }
  };
  const recurringRepairs = repairs.filter((repair) => ["定期清掃", "消防設備点検", "貯水槽清掃", "排水管清掃", "エレベーター点検"].includes(repair.repairType) && repair.workStatus !== "完了" && repair.workStatus !== "支払済");
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="修繕・点検予定" value={`${repairs.filter((item) => item.workStatus !== "完了" && item.workStatus !== "支払済").length}件`} help="未完了の修繕・点検・清掃予定です。" />
        <MetricCard label="定期清掃・点検" value={`${recurringRepairs.length}件`} help="次回予定として登録されている定期作業です。" />
        <MetricCard label="承認待ち" value={`${repairs.filter((item) => item.approvalStatus === "承認待ち").length}件`} help="見積や作業の確認が必要な件数です。" />
      </div>
      {error ? <div className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</div> : null}
      <div className="grid grid-cols-[420px_1fr] gap-6">
        <div className="grid gap-6">
          <form className="card grid gap-4 p-5" onSubmit={(event) => void submitRecurring(event)}>
            <h2 className="text-xl font-bold">定期清掃・点検を登録する</h2>
            <p className="text-sm text-slate-600">共用部清掃や法定点検など、忘れたくない定期作業を次回予定として登録します。</p>
            <FormSelect name="propertyId" label="物件" options={properties.map((item) => ({ label: item.name, value: item.id }))} />
            <FormInput name="nextDueDate" label="次回予定日" required type="date" />
            <FormSelect name="repairType" label="定期作業の種類" options={recurringMaintenanceTypes} />
            <FormInput name="description" label="内容" placeholder="例：共用部の月次清掃" />
            <FormInput name="vendorName" label="業者名" placeholder="例：〇〇清掃サービス" />
            <FormInput name="intervalMonths" label="周期（月）" placeholder="例：1" />
            <FormInput name="estimateAmountYen" label="概算金額" placeholder="例：15000" />
            <FormInput name="memo" label="メモ" placeholder="作業範囲や注意点" />
            <button className="rounded-lg bg-primary px-5 py-3 font-bold text-white"><Save className="mr-2 inline" size={18} />定期予定を保存する</button>
          </form>
          <form className="card grid gap-4 p-5" onSubmit={(event) => void submit(event)}>
            <h2 className="text-xl font-bold">修繕を登録する</h2>
            <FormSelect name="propertyId" label="物件" options={properties.map((item) => ({ label: item.name, value: item.id }))} />
            <FormSelect name="unitId" label="部屋" options={[{ label: "共用部・物件全体", value: "" }, ...units.map((item) => ({ label: `${item.propertyName ?? ""} ${item.roomNumber}`, value: item.id }))]} />
            <FormInput name="occurredAt" label="発生日" required type="date" />
            <FormInput name="description" label="修繕内容" required placeholder="例：給湯器交換" />
            <FormSelect name="repairType" label="修繕種別" options={repairTypes} />
            <FormInput name="vendorName" label="業者名" placeholder="あとで入力できます" />
            <FormInput name="estimateAmountYen" label="見積金額" placeholder="0" />
            <FormInput name="finalAmountYen" label="確定金額" placeholder="0" />
            <FormSelect name="approvalStatus" label="承認状況" options={["未確認", "承認待ち", "承認済", "却下", "保留"]} />
            <FormSelect name="workStatus" label="工事状況" options={["未着手", "手配中", "工事中", "完了", "支払済"]} />
            <FormInput name="memo" label="メモ" placeholder="補足" />
            <button className="rounded-lg bg-primary px-5 py-3 font-bold text-white"><Save className="mr-2 inline" size={18} />修繕を保存する</button>
          </form>
        </div>
        <div className="grid gap-6">
          <RecurringMaintenanceList repairs={recurringRepairs} />
          <RepairList repairs={repairs} onLinkExpense={(repair) => void linkExpense(repair)} />
        </div>
      </div>
    </div>
  );
}

function RecurringMaintenanceList({ repairs }: { repairs: RepairRecord[] }) {
  if (repairs.length === 0) return <EmptyState title="定期清掃・点検の予定はまだありません" action="左のフォームから定期予定を登録する" />;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-bold">次回の定期清掃・点検</h2>
      </div>
      <div className="divide-y divide-slate-200">
        {repairs.map((repair) => (
          <div key={repair.id} className="grid grid-cols-[1fr_120px_120px] items-center gap-4 p-4">
            <div>
              <div className="font-bold">{repair.description}</div>
              <div className="text-sm text-slate-600">{repair.propertyName} / {repair.repairType} / {repair.vendorName || "業者未定"}</div>
            </div>
            <div><div className="text-xs text-slate-500">次回予定</div><div className="font-bold">{formatDate(repair.occurredAt)}</div></div>
            <span className={`badge ${repair.approvalStatus === "承認待ち" ? "badge-warn" : "badge-muted"}`}>{repair.workStatus}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RepairList({ repairs, onLinkExpense }: { repairs: RepairRecord[]; onLinkExpense: (repair: RepairRecord) => void }) {
  if (repairs.length === 0) return <EmptyState title="修繕はまだ登録されていません" action="左のフォームから修繕を登録する" />;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5"><h2 className="text-xl font-bold">修繕一覧</h2></div>
      <div className="divide-y divide-slate-200">
        {repairs.map((repair) => (
          <div key={repair.id} className="grid grid-cols-[1fr_120px_120px_150px] items-center gap-4 p-4">
            <div>
              <div className="font-bold">{repair.description}</div>
              <div className="text-sm text-slate-600">{repair.propertyName} {repair.roomNumber || "共用部"} / {formatDate(repair.occurredAt)} / {repair.repairType}</div>
            </div>
            <span className={`badge ${repair.approvalStatus === "承認待ち" ? "badge-warn" : repair.approvalStatus === "承認済" ? "badge-ok" : "badge-muted"}`}>{repair.approvalStatus}</span>
            <span className="badge badge-muted">{repair.workStatus}</span>
            <button className="rounded-lg bg-primary px-4 py-2 font-bold text-white disabled:opacity-50" disabled={Boolean(repair.linkedExpenseId)} onClick={() => onLinkExpense(repair)}>{repair.linkedExpenseId ? "支出連携済み" : "支出へ連携"}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [contracts, setContracts] = useState<ContractRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const [propertyList, unitList, contractList, expenseList, repairList, documentList] = await Promise.all([api.listProperties(), api.listUnits(), api.listContracts(), api.listExpenses(), api.listRepairs(), api.listDocuments()]);
    setProperties(propertyList);
    setUnits(unitList);
    setContracts(contractList);
    setExpenses(expenseList);
    setRepairs(repairList);
    setDocuments(documentList);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const input = documentSchema.parse({
        displayName: textInput(form.get("displayName")),
        documentType: textInput(form.get("documentType")),
        propertyId: textInput(form.get("propertyId")),
        unitId: textInput(form.get("unitId")),
        contractId: textInput(form.get("contractId")),
        expenseId: textInput(form.get("expenseId")),
        repairId: textInput(form.get("repairId")),
        issuedAt: textInput(form.get("issuedAt")),
        receivedAt: textInput(form.get("receivedAt")),
        amountYen: yenInput(form.get("amountYen")),
        counterparty: textInput(form.get("counterparty")),
        memo: textInput(form.get("memo"))
      });
      await api.attachDocument(input);
      event.currentTarget.reset();
      onMessage("書類を添付しました。アプリ専用フォルダにコピーし、改ざん確認用情報も保存しました。");
      await reload();
    } catch (caught) {
      setError(caught instanceof z.ZodError ? friendlyZodError(caught) : caught instanceof Error ? caught.message : "書類を添付できませんでした。");
    }
  };
  const archive = async (document: DocumentRecord) => {
    if (!window.confirm("この書類を使用停止にします。登録情報は保管され、操作履歴にも残ります。よろしいですか？")) return;
    await api.archiveDocument(document.id);
    onMessage("書類を使用停止にしました。");
    await reload();
  };
  const missingReceiptExpenses = expenses.filter((expense) => expense.status !== "取消" && !expense.hasReceipt);
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="登録済み書類" value={`${documents.filter((item) => item.status !== "使用停止").length}件`} help="契約書・領収書・請求書などの登録件数です。" />
        <MetricCard label="領収書なし支出" value={`${missingReceiptExpenses.length}件`} help="領収書・請求書などの証明書類が未確認の支出です。" />
        <MetricCard label="改ざん確認" value="保存中" help="添付時にファイルの改ざん確認用情報を保存します。" />
      </div>
      <div className="grid grid-cols-[430px_1fr] gap-6">
        <form className="card grid gap-4 p-5" onSubmit={(event) => void submit(event)}>
          <h2 className="text-xl font-bold">書類を添付する</h2>
          <p className="text-sm text-slate-600">領収書や契約書を選ぶと、アプリ専用フォルダにコピーして管理します。</p>
          {error ? <div className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</div> : null}
          <FormInput name="displayName" label="書類名" required placeholder="例：101号室 5月分領収書" />
          <FormSelect name="documentType" label="書類の種類" options={documentTypes} />
          <FormSelect name="propertyId" label="関連物件" options={[{ label: "選択しない", value: "" }, ...properties.map((item) => ({ label: item.name, value: item.id }))]} />
          <FormSelect name="unitId" label="関連部屋" options={[{ label: "選択しない", value: "" }, ...units.map((item) => ({ label: `${item.propertyName ?? ""} ${item.roomNumber}`, value: item.id }))]} />
          <FormSelect name="contractId" label="関連契約" options={[{ label: "選択しない", value: "" }, ...contracts.map((item) => ({ label: `${item.tenantName} / ${item.propertyName} ${item.roomNumber}`, value: item.id }))]} />
          <FormSelect name="expenseId" label="関連支出" options={[{ label: "選択しない", value: "" }, ...expenses.map((item) => ({ label: `${formatDate(item.spentAt)} ${item.payee} ${formatYen(item.amountYen)}`, value: item.id }))]} />
          <FormSelect name="repairId" label="関連修繕" options={[{ label: "選択しない", value: "" }, ...repairs.map((item) => ({ label: `${item.description} / ${item.propertyName}`, value: item.id }))]} />
          <FormInput name="issuedAt" label="発行日" type="date" />
          <FormInput name="receivedAt" label="受領日" type="date" />
          <FormInput name="amountYen" label="金額" placeholder="0" />
          <FormInput name="counterparty" label="取引先" placeholder="例：山田工務店" />
          <FormInput name="memo" label="メモ" placeholder="補足" />
          <button className="rounded-lg bg-primary px-5 py-3 font-bold text-white"><FileText className="mr-2 inline" size={18} />ファイルを選んで添付する</button>
        </form>
        <div className="grid gap-5">
          {missingReceiptExpenses.length > 0 ? (
            <div className="card p-5">
              <h2 className="text-xl font-bold">領収書・請求書が未確認の支出</h2>
              <div className="mt-3 grid gap-2">
                {missingReceiptExpenses.slice(0, 5).map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <span className="font-bold">{expense.payee} / {formatYen(expense.amountYen)}</span>
                    <span className="badge badge-warn">領収書なし</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <DocumentList documents={documents} onArchive={(document) => void archive(document)} />
        </div>
      </div>
    </div>
  );
}

function DocumentList({ documents, onArchive }: { documents: DocumentRecord[]; onArchive: (document: DocumentRecord) => void }) {
  if (documents.length === 0) return <EmptyState title="書類はまだ添付されていません" action="左のフォームから書類を添付する" />;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h2 className="text-xl font-bold">書類一覧</h2>
      </div>
      <div className="divide-y divide-slate-200">
        {documents.map((document) => (
          <div key={document.id} className="grid grid-cols-[1fr_120px_160px_120px] items-center gap-4 p-4">
            <div>
              <div className="font-bold">{document.displayName}</div>
              <div className="text-sm text-slate-600">{document.documentType} / {document.propertyName || "物件未指定"} {document.roomNumber || ""}</div>
              <div className="text-xs text-slate-500">改ざん確認用情報: {document.sha256Hash.slice(0, 12)}...</div>
            </div>
            <span className={`badge ${document.status === "有効" ? "badge-ok" : "badge-muted"}`}>{document.status}</span>
            <div className="text-sm text-slate-600">{document.originalFileName}</div>
            <button className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-bold text-red-700 disabled:opacity-50" disabled={document.status !== "有効"} onClick={() => onArchive(document)}>使用停止</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setSummary(await api.getReportSummary(targetYear));
  }, [targetYear]);
  useEffect(() => { void reload(); }, [reload]);
  const exportCsv = async () => {
    const answer = window.confirm("税理士提出用データをCSVで出力します。税務上の判断は税理士にご確認ください。よろしいですか？");
    if (!answer) return;
    try {
      const result = await api.exportTaxCsv(targetYear);
      onMessage(`税理士提出用CSVを出力しました。保存先：${result.outputPath}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CSVを出力できませんでした。");
    }
  };
  if (!summary) return <FullWidthCard title="集計しています" body="保存データからレポートを作成しています。" />;
  return (
    <div className="grid gap-6">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">レポート</h2>
            <p className="mt-1 text-slate-600">目的に合わせて、収支・滞納・敷金・証憑の状況を確認できます。</p>
          </div>
          <div className="field w-40">
            <label>対象年</label>
            <input type="number" value={targetYear} onChange={(event) => setTargetYear(Number(event.target.value))} />
          </div>
        </div>
      </div>
      {error ? <div className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{error}</div> : null}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="年間家賃収入" value={formatYen(summary.annualRentIncomeYen)} help="対象年の家賃請求額の合計です。" />
        <MetricCard label="年間支出" value={formatYen(summary.annualExpenseYen)} help="取消されていない支出の合計です。" />
        <MetricCard label="年間利益" value={formatYen(summary.annualProfitYen)} help="収入から支出を差し引いた目安です。" />
        <MetricCard label="証憑未添付" value={`${summary.missingReceiptExpenseCount}件`} help="領収書・請求書などが未確認の支出です。" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {["今月の収支を確認する", "年間の収支を確認する", "税理士に渡す資料を作る", "物件別の利益を見る", "滞納一覧を見る", "敷金残高を見る"].map((item) => (
          <div key={item} className="card p-5">
            <div className="font-bold">{item}</div>
            <p className="mt-2 text-sm text-slate-600">必要な集計を下の一覧で確認できます。</p>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h2 className="text-xl font-bold">税理士提出用データ</h2>
        <p className="mt-1 text-slate-600">家賃・共益費・更新料・支出・預り金・証憑を、内訳付きのCSVで出力できます。税務上の判断は税理士にご確認ください。</p>
        <button className="mt-4 rounded-lg bg-primary px-5 py-3 font-bold text-white" onClick={() => void exportCsv()}><FileText className="mr-2 inline" size={18} />税理士提出用CSVを出力する</button>
      </div>
      <div className="grid grid-cols-[1.2fr_1fr] gap-6">
        <div className="card p-5">
          <h2 className="text-xl font-bold">月別収支</h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.monthlyRows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 10000)}万`} />
                <Tooltip formatter={(value) => formatYen(Number(value))} />
                <Legend />
                <Bar dataKey="incomeYen" name="収入" fill="#19736b" />
                <Bar dataKey="expenseYen" name="支出" fill="#b45309" />
                <Bar dataKey="profitYen" name="利益" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="text-xl font-bold">支出カテゴリ別</h2>
          <div className="mt-4 grid gap-3">
            {summary.expenseCategoryRows.length === 0 ? <p className="text-slate-600">支出はまだありません。</p> : summary.expenseCategoryRows.map((row) => (
              <div key={row.category} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                <span className="font-bold">{row.category}</span>
                <span>{formatYen(row.amountYen)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-bold">物件別損益</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {summary.propertyRows.length === 0 ? <div className="p-5 text-slate-600">物件はまだ登録されていません。</div> : summary.propertyRows.map((row) => (
            <div key={row.propertyId} className="grid grid-cols-[1fr_150px_150px_150px] gap-4 p-4">
              <div className="font-bold">{row.propertyName}</div>
              <div><div className="text-xs text-slate-500">収入</div><div className="font-bold">{formatYen(row.incomeYen)}</div></div>
              <div><div className="text-xs text-slate-500">支出</div><div className="font-bold">{formatYen(row.expenseYen)}</div></div>
              <div><div className="text-xs text-slate-500">利益</div><div className="font-bold">{formatYen(row.profitYen)}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="未収総額" value={formatYen(summary.unpaidTotalYen)} help="請求済みだが、まだ入金されていない金額です。" />
        <MetricCard label="敷金・預り金残高" value={formatYen(summary.depositBalanceYen)} help="入居者から預かっているお金の残高です。" />
        <MetricCard label="共益費・管理費等" value={formatYen(summary.annualCommonFeeIncomeYen + summary.annualOtherIncomeYen)} help="家賃以外の月額収入の合計です。" />
      </div>
    </div>
  );
}

function BackupPage({ onMessage }: { onMessage: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.createBackup();
      onMessage(`バックアップが完了しました。保存先：${result.backupPath}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "バックアップを作成できませんでした。保存先や空き容量を確認してください。");
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    const answer = window.confirm("バックアップから復元すると、現在のデータは復元前の状態に戻ります。念のため、現在のデータも自動退避してから復元します。よろしいですか？");
    if (!answer) return;
    setRestoreBusy(true);
    setError(null);
    try {
      const result = await api.restoreBackup();
      onMessage(`復元が完了しました。復元元：${result.restoredFrom} / 復元前の自動退避：${result.safetyBackupPath}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "バックアップから復元できませんでした。選択したファイルを確認してください。");
    } finally {
      setRestoreBusy(false);
    }
  };
  return (
    <div className="card max-w-3xl p-6">
      <h2 className="text-2xl font-bold">バックアップ</h2>
      <p className="mt-3 text-slate-700">バックアップは、PCの故障や誤操作に備えて、現在のデータを別ファイルに保存する機能です。</p>
      {error ? <div className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 font-bold text-red-800">{error}</div> : null}
      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="font-bold">保存されるもの</div>
        <p className="mt-1 text-slate-600">保存データ、添付ファイル、作成日時や件数の情報を zip 形式でまとめます。</p>
      </div>
      <button className="mt-6 rounded-lg bg-primary px-6 py-3 font-bold text-white disabled:opacity-60" disabled={busy} onClick={() => void create()}>
        <DatabaseBackup className="mr-2 inline" size={18} />{busy ? "バックアップ中..." : "今すぐバックアップする"}
      </button>
      <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="font-bold text-red-800">バックアップから復元する</div>
        <p className="mt-1 text-sm text-red-800">復元すると、現在の保存データはバックアップ時点の内容に戻ります。実行前に現在のデータを自動退避します。</p>
        <button className="mt-4 rounded-lg border border-red-300 bg-white px-6 py-3 font-bold text-red-700 disabled:opacity-60" disabled={restoreBusy} onClick={() => void restore()}>
          <DatabaseBackup className="mr-2 inline" size={18} />{restoreBusy ? "復元中..." : "バックアップから復元する"}
        </button>
      </div>
    </div>
  );
}

function MetricCard({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-bold text-slate-600">{label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <p className="mt-2 text-sm text-slate-500">{help}</p>
    </div>
  );
}

function PropertyList({ properties, units, contracts }: { properties: PropertyRecord[]; units: UnitRecord[]; contracts: ContractRecord[] }) {
  if (properties.length === 0) return <EmptyState title="物件はまだ登録されていません" action="左のフォームから物件を登録する" />;
  return (
    <div className="grid gap-3">
      {properties.map((property) => {
        const propertyUnits = units.filter((unit) => unit.propertyId === property.id);
        const occupied = propertyUnits.filter((unit) => unit.status === "入居中").length;
        return (
          <div key={property.id} className="card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold">{property.name}</h3>
                <p className="text-slate-600">{property.address || "所在地はあとで入力できます"}</p>
              </div>
              <span className="badge badge-ok">{property.status}</span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-3">
              <SummaryTile label="種別" value={property.propertyType} />
              <SummaryTile label="総戸数" value={`${property.totalUnits}戸`} />
              <SummaryTile label="入居率" value={propertyUnits.length ? `${Math.round((occupied / propertyUnits.length) * 100)}%` : "-"} />
              <SummaryTile label="契約数" value={`${contracts.filter((contract) => contract.propertyId === property.id).length}件`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TenantList({ tenants, contracts }: { tenants: TenantRecord[]; contracts: ContractRecord[] }) {
  if (tenants.length === 0) return <EmptyState title="入居者はまだ登録されていません" action="左のフォームから入居者を登録する" />;
  return (
    <div className="grid gap-3">
      {tenants.map((tenant) => {
        const activeContract = contracts.find((contract) => contract.tenantId === tenant.id && contract.status === "契約中") ?? contracts.find((contract) => contract.tenantId === tenant.id);
        return (
          <div key={tenant.id} className="card flex items-center justify-between p-5">
            <div>
              <h3 className="text-lg font-bold">{tenant.displayName}</h3>
              <p className="text-sm text-slate-600">
                {activeContract ? `${activeContract.propertyName ?? "物件"} ${activeContract.roomNumber ?? ""} / ${formatYen(activeContract.rentYen)}` : "入居する物件・部屋は未登録です"}
              </p>
              <p className="text-sm text-slate-600">{tenant.bankTransferName ? `振込名義：${tenant.bankTransferName}` : "振込名義はあとで入力できます"}</p>
            </div>
            <span className={`badge ${tenant.status === "トラブルあり" ? "badge-danger" : "badge-ok"}`}>{tenant.status}</span>
          </div>
        );
      })}
    </div>
  );
}

function FormInput({ name, label, placeholder, required, type = "text", defaultValue }: { name: string; label: string; placeholder?: string; required?: boolean; type?: string; defaultValue?: string }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label} {required ? <span className="text-red-700">必須</span> : <span className="text-sm text-slate-500">あとで入力できます</span>}</label>
      <input id={name} name={name} placeholder={placeholder} type={type} defaultValue={defaultValue} />
    </div>
  );
}

function FormSelect({ name, label, options, defaultValue, value, onChange }: { name: string; label: string; options: Array<string | { label: string; value: string }>; defaultValue?: string; value?: string; onChange?: (value: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={(event) => onChange?.(event.target.value)}>
        {options.map((option) => typeof option === "string" ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, required, hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; hint?: string }) {
  return (
    <div className="field">
      <label>{label} {required ? <span className="text-red-700">必須</span> : hint ? <span className="text-sm text-slate-500">{hint}</span> : null}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <Search size={22} className="text-slate-500" />
      <input className="w-full border-0 bg-transparent text-lg outline-none" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function EmptyState({ title, action, onClick }: { title: string; action: string; onClick?: () => void }) {
  return (
    <div className="empty-state">
      <Archive className="mx-auto text-slate-400" size={38} />
      <h3 className="mt-3 text-lg font-bold">{title}</h3>
      {onClick ? (
        <button className="btn btn-primary mt-4" onClick={onClick}>{action}</button>
      ) : (
        <p className="mt-3 text-sm font-bold text-slate-500">{action}</p>
      )}
    </div>
  );
}

function FullWidthCard({ title, body }: { title: string; body: string }) {
  return <div className="card p-6"><h2 className="text-xl font-bold">{title}</h2><p className="mt-2 text-slate-600">{body}</p></div>;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-sm text-slate-500">{label}</div><div className="font-bold">{value}</div></div>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between rounded-lg bg-slate-50 p-3"><span className="font-bold">{label}</span><span>{value}</span></div>;
}

export default App;
