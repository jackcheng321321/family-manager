export const APP_TIME_ZONE = "Asia/Shanghai";

interface DateParts {
  year: number;
  month: number;
  day: number;
}

interface DateTimeParts extends DateParts {
  hour: number;
}

function partsToDateString(parts: DateParts): string {
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function getFormatter(timeZone = APP_TIME_ZONE, withHour = false) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withHour ? { hour: "2-digit", hourCycle: "h23" as const } : {}),
  });
}

export function getDateTimePartsInTimeZone(date = new Date(), timeZone = APP_TIME_ZONE): DateTimeParts {
  const parts = getFormatter(timeZone, true).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
  };
}

export function getBusinessToday(date = new Date()): string {
  return partsToDateString(getDateTimePartsInTimeZone(date));
}

export function normalizeDateString(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidDateParts(year, month, day)) return null;

  return partsToDateString({ year, month, day });
}

export function getPeriodDateRange(period: string, date?: string) {
  const basis = normalizeDateString(date) || getBusinessToday();
  const { year, month } = parseDateString(basis);

  if (period === "day") {
    return { start: basis, end: basis };
  }

  if (period === "year") {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }

  if (period === "quarter") {
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const quarterEndMonth = quarterStartMonth + 2;
    return {
      start: `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`,
      end: `${year}-${String(quarterEndMonth).padStart(2, "0")}-${String(daysInMonth(year, quarterEndMonth)).padStart(2, "0")}`,
    };
  }

  return getMonthDateRange(basis);
}

export function getMonthDateRange(date?: string) {
  const basis = normalizeDateString(date) || getBusinessToday();
  const { year, month } = parseDateString(basis);

  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`,
  };
}

export function getPreviousMonth(date?: string) {
  const basis = normalizeDateString(date) || getBusinessToday();
  const { year, month } = parseDateString(basis);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  return previous;
}

function parseDateString(date: string): DateParts {
  const normalized = normalizeDateString(date);
  if (!normalized) {
    throw new Error(`Invalid date string: ${date}`);
  }

  const [year, month, day] = normalized.split("-").map(Number);
  return { year, month, day };
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) {
    return false;
  }

  return day <= daysInMonth(year, month);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
