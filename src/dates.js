// Calendar-date helpers. Pure arithmetic; never touches local time zone.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year, month) {
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[month - 1];
}

/** Returns {year,month,day} for a real ISO YYYY-MM-DD calendar date, else null. */
export function parseIsoDate(text) {
  if (typeof text !== 'string') return null;
  const m = ISO_DATE.exec(text);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidIsoDate(text) {
  return parseIsoDate(text) !== null;
}

/**
 * Days since 1970-01-01 (proleptic Gregorian), computed arithmetically
 * (Howard Hinnant's days_from_civil). Null for invalid dates.
 */
export function toDayNumber(text) {
  const p = parseIsoDate(text);
  if (!p) return null;
  const y = p.month <= 2 ? p.year - 1 : p.year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = p.month > 2 ? p.month - 3 : p.month + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + p.day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Negative, zero or positive like a comparator. Both inputs must be valid. */
export function compareDates(a, b) {
  const da = toDayNumber(a);
  const db = toDayNumber(b);
  if (da === null || db === null) throw new Error('compareDates requires valid ISO dates');
  return da - db;
}
