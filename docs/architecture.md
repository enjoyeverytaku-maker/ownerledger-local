# Architecture

OwnerLedger Local は完全ローカル動作を前提にした Electron アプリです。

- UI: React + TypeScript
- Desktop shell: Electron
- DB: SQLite
- DB access: Prisma
- Validation: Zod
- Chart: Recharts
- Tests: Vitest

## 境界

- `electron/main.cjs`: SQLite/Prisma、バックアップ、ファイル操作、監査ログ
- `electron/preload.cjs`: 画面に公開する安全な API
- `src/App.tsx`: 日本語 UI
- `src/lib/business.ts`: 請求、消込、敷金、支出集計などの業務ロジック
- `src/lib/validation.ts`: Zod 入力検証

請求、入金、消込、敷金、支出は DB モデルを分けています。入金があっても自動で収益扱いせず、ユーザー確認後の消込で状態を更新する設計です。

## レポート

レポート集計は Electron 側で Prisma から読み出して作成します。税理士提出用CSVはローカルファイルとして保存し、操作履歴に出力操作を記録します。アプリ内では税務判断を断定せず、資料整理と集計補助に限定します。
