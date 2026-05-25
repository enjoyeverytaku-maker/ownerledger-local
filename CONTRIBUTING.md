# Contributing

OwnerLedger Local は Private リポジトリで管理する前提です。

## ブランチ

- `main` は常に安定版にします。
- 開発は `feature/*` ブランチで行います。
- 大きな機能追加は Pull Request 単位で確認します。

## 開発前チェック

```bash
npm install
Copy-Item .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

## Pull Request 前チェック

```bash
npm run typecheck
npm run test
npm run build
```

## データ保護

本番 DB、添付ファイル、バックアップ、銀行 CSV、契約書 PDF、領収書画像、個人情報を含むファイルはコミットしないでください。
