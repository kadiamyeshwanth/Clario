/**
 * services/periods.js — calendar maths in the user's own timezone.
 *
 * "This month" for someone in Los Angeles is not the server's UTC month. These
 * helpers return real Date instants for local-midnight boundaries.
 */

/** Offset in minutes between UTC and `timeZone` at instant `date`. */
const tzOffsetMinutes = (date, timeZone) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).reduce((a, p) => ((a[p.type] = p.value), a), {});
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return 0;
  }
};

/** Local calendar parts (y, m 0-based, d) of an instant in a timezone. */
const localParts = (date, timeZone) => {
  const shifted = new Date(date.getTime() + tzOffsetMinutes(date, timeZone) * 60000);
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate(), dow: shifted.getUTCDay() };
};

/** The instant of local midnight on (y, m, d) in a timezone. */
const localMidnight = (y, m, d, timeZone) => {
  const guess = new Date(Date.UTC(y, m, d));
  return new Date(guess.getTime() - tzOffsetMinutes(guess, timeZone) * 60000);
};

const monthRange = (now = new Date(), timeZone = 'UTC', offset = 0) => {
  const { y, m } = localParts(now, timeZone);
  const from = localMidnight(y, m + offset, 1, timeZone);
  const to = localMidnight(y, m + offset + 1, 1, timeZone);
  return { from, to }; // [from, to)
};

const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

const dayRange = (now = new Date(), timeZone = 'UTC', offset = 0) => {
  const { y, m, d } = localParts(now, timeZone);
  return { from: localMidnight(y, m, d + offset, timeZone), to: localMidnight(y, m, d + offset + 1, timeZone) };
};

/** YYYY-MM-DD of an instant in a timezone. */
const localDayKey = (date, timeZone = 'UTC') => {
  const { y, m, d } = localParts(date, timeZone);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

module.exports = { tzOffsetMinutes, localParts, localMidnight, monthRange, dayRange, daysInMonth, localDayKey };
