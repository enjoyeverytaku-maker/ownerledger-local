const fs = require("fs");
const path = require("path");

function createRuntimeLogger(logsDir) {
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `ownerledger-${new Date().toISOString().slice(0, 10)}.log`);
  const write = (level, message, details) => {
    const entry = {
      at: new Date().toISOString(),
      level,
      message,
      details: details instanceof Error ? { name: details.name, message: details.message, stack: details.stack } : details
    };
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");
  };
  return {
    logPath,
    info: (message, details) => write("info", message, details),
    error: (message, details) => write("error", message, details)
  };
}

function stripSqlComment(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("--")) return "";
  return line;
}

function splitSqlStatements(sql) {
  return sql
    .split(/\r?\n/)
    .map(stripSqlComment)
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function sqliteTableExists(prisma, tableName) {
  const rows = await prisma.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    tableName
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function applyInitialSqliteSchema(prisma, migrationSql) {
  const statements = splitSqlStatements(migrationSql);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  return statements.length;
}

module.exports = {
  applyInitialSqliteSchema,
  createRuntimeLogger,
  splitSqlStatements,
  sqliteTableExists
};
