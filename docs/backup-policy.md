# Backup Policy

バックアップは PC 故障や誤操作に備えるための機能です。

## 形式

`.zip`

## 中身

- `database.sqlite`
- `attachments/`
- `metadata.json`

## metadata

- 作成日時
- アプリバージョン
- DB バージョン
- 件数サマリー
- DB sha256

## 復元方針

復元前に現在の保存データを `pre-restore-backups/` へ自動退避してから復元します。

復元時の確認:

- ZIP 内に `database.sqlite` があること
- ZIP 内に `metadata.json` があること
- 現在の DB と添付ファイルを復元前バックアップとして保存すること
- 復元操作を操作履歴に残すこと

復元すると現在の保存データはバックアップ時点の内容に戻ります。画面では必ず確認ダイアログを表示します。
