import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Electron 側の CommonJS ユーティリティを直接検証するため、この行だけ require を許可します。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createRuntimeLogger, splitSqlStatements } = require("../electron/runtime-safety.cjs") as {
  createRuntimeLogger: (logsDir: string) => { logPath: string; info: (message: string, details?: unknown) => void; error: (message: string, details?: unknown) => void };
  splitSqlStatements: (sql: string) => string[];
};

describe("runtime safety helpers", () => {
  it("初期スキーマ SQL を実行単位に分割する", () => {
    expect(splitSqlStatements(`
      -- comment
      CREATE TABLE "A" ("id" TEXT);
      CREATE INDEX "A_id_idx" ON "A"("id");
    `)).toEqual([
      'CREATE TABLE "A" ("id" TEXT)',
      'CREATE INDEX "A_id_idx" ON "A"("id")'
    ]);
  });

  it("問い合わせ用の実行ログを JSON Lines で保存する", () => {
    const dir = mkdtempSync(join(tmpdir(), "ownerledger-logs-"));
    try {
      const logger = createRuntimeLogger(dir);
      logger.info("started", { version: "test" });
      logger.error("failed", new Error("boom"));
      const lines = readFileSync(logger.logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      expect(lines[0]).toMatchObject({ level: "info", message: "started", details: { version: "test" } });
      expect(lines[1].details).toMatchObject({ name: "Error", message: "boom" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
