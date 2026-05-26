const crypto = require("crypto");
const path = require("path");

function normalizedZipEntryName(entryName) {
  return String(entryName || "").replace(/\\/g, "/");
}

function validateBackupEntries(entryNames) {
  const normalized = entryNames.map(normalizedZipEntryName);
  const invalidEntry = normalized.find((entryName) => {
    if (!entryName) return true;
    if (path.isAbsolute(entryName)) return true;
    return entryName.split("/").some((part) => part === "..");
  });
  if (invalidEntry) {
    throw new Error("バックアップ内に安全でないファイル名が含まれています。別のバックアップを選んでください。");
  }
  if (!normalized.includes("database.sqlite")) {
    throw new Error("バックアップ内に保存データが見つかりません。正しいバックアップファイルを選んでください。");
  }
  if (!normalized.includes("metadata.json")) {
    throw new Error("バックアップ情報が見つかりません。正しいバックアップファイルを選んでください。");
  }
  return normalized;
}

function parseBackupMetadata(metadataBuffer) {
  try {
    return JSON.parse(Buffer.from(metadataBuffer).toString("utf8"));
  } catch {
    throw new Error("バックアップ情報を読み取れません。ファイルが壊れていないか確認してください。");
  }
}

function verifyBackupDatabaseHash(metadata, databaseBuffer) {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("バックアップ情報の形式が正しくありません。");
  }
  if (!metadata.sha256) return;
  const actualHash = crypto.createHash("sha256").update(databaseBuffer).digest("hex");
  if (metadata.sha256 !== actualHash) {
    throw new Error("バックアップの整合性確認に失敗しました。別のバックアップを選んでください。");
  }
}

module.exports = {
  normalizedZipEntryName,
  parseBackupMetadata,
  validateBackupEntries,
  verifyBackupDatabaseHash
};
