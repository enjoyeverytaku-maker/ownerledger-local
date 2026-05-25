import { format, parseISO } from "date-fns";

export function formatYen(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? parseISO(value) : value;
  return format(date, "yyyy/MM/dd");
}

export function currentMonth(): string {
  return format(new Date(), "yyyy-MM");
}

export function parseYenInput(value: string): number {
  const normalized = value.replace(/[,\s￥円]/g, "");
  if (normalized === "") return 0;
  return Number.parseInt(normalized, 10);
}

export function formatMonthForDisplay(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}
