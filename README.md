# OwnerLedger Local

日本語表示名：オーナーレジャー ローカル

OwnerLedger Local は、不動産オーナーが物件別の家賃収入、入居状況、契約、月次請求、入金、未収、敷金、支出、修繕、ローン、書類、レポート、バックアップをローカル PC 上で管理するためのデスクトップ業務アプリです。

## 現在の実装範囲

- Electron + React + TypeScript + Tailwind CSS の基盤
- Prisma + SQLite のデータモデル
- 初回セットアップウィザード
- ホーム/ダッシュボード
- 物件登録・一覧
- 入居者登録・一覧
- 契約登録・一覧
- 月次請求生成
- スポット請求登録
- スポット請求への入金消込
- 入金手動登録
- 銀行入金 CSV 取込
- 重複入金チェック
- 入金候補の自動照合
- 手動消込
- 消込取消と状態再計算
- 支出登録、証憑未添付チェック、支出取消
- 敷金・預り金台帳、残高マイナス防止、取引取消
- 修繕登録、承認状況管理、修繕から支出への連携
- 定期清掃・点検予定の登録
- 定期清掃、消防設備点検、貯水槽清掃、排水管清掃、エレベーター点検の管理
- 書類・証憑添付
- 添付ファイルのローカルコピー保存
- SHA-256による改ざん確認用情報保存
- 支出への証憑関連付け
- 証憑未添付の支出一覧
- レポート画面
- 年間収入・支出・利益の集計
- 月別収支グラフ
- 物件別損益
- 支出カテゴリ別集計
- 税理士提出用CSV出力
- SQLite DB と添付フォルダをまとめる zip バックアップ
- 復元前の現データ自動退避
- バックアップZIPからの復元
- 監査ログモデルと主要作成処理の記録
- サンプルデータ投入
- Vitest による業務ルール/入力検証/UI テスト
- GitHub Private リポジトリ向けの `.gitignore` と CI

## 起動方法

```bash
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run seed
npm run dev
```

別のターミナルで Electron を起動します。

```bash
npm run electron:dev
```

ブラウザで `npm run dev` だけを開いた場合は、画面確認用のブラウザ保存モードで動きます。実データ保存、SQLite、バックアップは Electron 起動時に使ってください。

## ビルド方法

```bash
npm run build
```

配布用ビルドは次のコマンドです。

```bash
npm run dist
```

## テスト方法

```bash
npm run typecheck
npm run test
npm run build
```

## Prisma マイグレーション

初回：

```bash
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:migrate
```

schema を変更した場合：

```bash
npm run prisma:migrate
```

## サンプルデータ投入

```bash
npm run seed
```

サンプルデータは開発確認用です。本番データとは混ぜないでください。

## バックアップ仕様

バックアップは zip 形式です。

- `database.sqlite`
- `attachments/`
- `metadata.json`

`metadata.json` には作成日時、アプリバージョン、DB バージョン、件数サマリー、DB の sha256 を保存します。復元機能は Phase 7 で UI と安全な退避処理を追加します。
復元時は、現在の保存データを `pre-restore-backups/` に自動退避してから、選択したバックアップの `database.sqlite` と `attachments/` を復元します。

## ディレクトリ構成

```text
electron/                 Electron main/preload
prisma/                   Prisma schema, seed
src/                      React UI, validation, business logic
tests/                    Vitest tests
docs/                     設計・運用ドキュメント
.github/                  CI とテンプレート
```

## GitHub に上げてはいけないファイル

- 本番 SQLite DB
- 添付ファイル
- バックアップ ZIP
- `.env`
- 個人情報入り CSV
- 銀行 CSV
- 契約書 PDF
- 領収書画像
- 保証会社資料
- 税理士提出用の本番資料
- 実在の入居者名や連絡先を含むファイル

`.gitignore` で `*.csv`, `*.xlsx`, `*.pdf`, `*.db`, `attachments/`, `backups/`, `user-data/`, `private-data/` を除外しています。サンプル CSV は `examples/` または `docs/examples/` 配下のみ管理できます。

## GitHub 初回 push 例

GitHub CLI を使う場合：

```bash
gh auth login
gh repo create ownerledger-local --private --source=. --remote=origin --push
```

GitHub 上で Private リポジトリを先に作る場合：

```bash
git init
git add .
git commit -m "Initial commit: OwnerLedger Local"
git branch -M main
git remote add origin git@github.com:enjoyeverytaku-maker/ownerledger-local.git
git push -u origin main
```

GitHub アカウント名が異なる場合は、remote URL の owner 部分を変更してください。

## Phase 記録

### Phase 1-2 基盤/マスター管理

- 実装：Electron、React、Prisma、Tailwind、初回設定、ホーム、物件・入居者・契約登録
- 確認コマンド：`npm run typecheck`, `npm run test`, `npm run build`
- 残課題：部屋単独登録画面、詳細タブ、編集/アーカイブ UI の拡充

### Phase 3 請求・入金・消込

- 実装：月次請求生成、請求一覧、スポット請求登録、入金登録、CSV取込、重複検知、候補照合、月次請求/スポット請求への手動消込、消込取消
- 確認コマンド：`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- 残課題：CSV列マッピングウィザードの完全版、過入金の前受金台帳化、スポット請求の取消/修正履歴UI

### Phase 4 オーナー向け資産管理

- 実装：支出登録、証憑未添付チェック、支出取消、敷金・預り金台帳、敷金残高チェック、修繕登録、定期清掃・点検予定、修繕から支出への連携
- 確認コマンド：`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- 残課題：ローン管理、空室損失計算の詳細画面、物件別収支レポートの精緻化

### Phase 5 書類・証憑

- 実装：書類添付、アプリ専用フォルダへのコピー保存、SHA-256保存、支出への証憑関連付け、証憑未添付支出の表示、書類の使用停止
- 確認コマンド：`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- 残課題：ドラッグ&ドロップ、添付ファイルを開く機能、ハッシュ再検証画面、修繕写真のBefore/After専用UI

### Phase 6 レポート

- 実装：レポート画面、年次集計、月別収支グラフ、物件別損益、支出カテゴリ別集計、未収/敷金/証憑未添付の要約、税理士提出用CSV出力
- 確認コマンド：`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- 残課題：HTML印刷レイアウト、PDF保存導線、レポートメモ、ローン利息一覧の精緻化

### Phase 7 商用レベル仕上げ

- 実装：バックアップ復元、復元前の現データ自動退避、バックアップZIP内容チェック、復元履歴の記録
- 確認コマンド：`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- 残課題：ローン管理、HTML印刷レイアウト、Playwright E2Eテスト、画面分割リファクタリング

### 残課題

- Playwright による E2E テスト

## 注意

このアプリは資料整理と集計補助を目的にしています。税務上の取扱いは税理士に確認してください。
