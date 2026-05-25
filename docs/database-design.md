# Database Design

Prisma schema は `prisma/schema.prisma` にあります。

## 主要モデル

- `Property`: 物件
- `Unit`: 部屋
- `Tenant`: 入居者
- `Contract`: 契約
- `MonthlyCharge`: 月次請求
- `SpotCharge`: 通常家賃とは別の請求
- `Payment`: 入金
- `Allocation`: 入金を請求に充てる処理
- `DepositTransaction`: 敷金・保証金・預り金
- `Expense`: 支出
- `Repair`: 修繕
- `Loan`, `LoanPayment`: ローン
- `Document`: 書類・証憑
- `AuditLog`: 操作履歴
- `ImportBatch`, `ImportRow`: CSV 取込履歴
- `BackupHistory`: バックアップ履歴

## 金額

金額はすべて円単位の整数で保存します。小数は使いません。

## 削除方針

原則として物理削除せず、`archivedAt` や状態で「使用停止」「取消」を表現します。

## 実務上の分離

- 家賃などの請求は `MonthlyCharge`
- 入金は `Payment`
- 入金を請求に充てる処理は `Allocation`
- 敷金・保証金・預り金は `DepositTransaction`
- 経費や修繕費は `Expense`
- 契約書・領収書・請求書などは `Document`

敷金・預り金は収益として扱わず、残高がマイナスにならないよう登録時に確認します。

`Document` は関連物件、部屋、契約、支出、修繕に紐づけできます。支出に書類を添付した場合、支出側の「領収書・請求書などの証明書類あり」も更新します。
