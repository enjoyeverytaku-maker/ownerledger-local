import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

// Electron 側の CommonJS ユーティリティを直接検証するため、この行だけ require を許可します。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseBackupMetadata, validateBackupEntries, verifyBackupDatabaseHash } = require("../electron/backup-safety.cjs") as {
  parseBackupMetadata: (metadataBuffer: Buffer) => { sha256?: string };
  validateBackupEntries: (entryNames: string[]) => string[];
  verifyBackupDatabaseHash: (metadata: { sha256?: string }, databaseBuffer: Buffer) => void;
};

describe("backup safety checks", () => {
  it("復元に必要なファイルがそろっているか確認する", () => {
    expect(validateBackupEntries(["metadata.json", "database.sqlite", "attachments/a.pdf"])).toEqual([
      "metadata.json",
      "database.sqlite",
      "attachments/a.pdf"
    ]);
  });

  it("バックアップ内の危険な展開パスを拒否する", () => {
    expect(() => validateBackupEntries(["metadata.json", "database.sqlite", "../escape.sqlite"])).toThrow("安全でないファイル名");
  });

  it("保存データのハッシュ不一致を拒否する", () => {
    const database = Buffer.from("database");
    const metadata = parseBackupMetadata(Buffer.from(JSON.stringify({
      sha256: createHash("sha256").update(database).digest("hex")
    })));
    expect(() => verifyBackupDatabaseHash(metadata, database)).not.toThrow();
    expect(() => verifyBackupDatabaseHash(metadata, Buffer.from("tampered"))).toThrow("整合性確認");
  });
});
