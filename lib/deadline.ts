const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u;
const ONE_MINUTE_MS = 60_000;
const ONE_DAY_MS = 86_400_000;
export const TWENTY_FOUR_HOURS_SECONDS = 86_400n;

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error("The browser returned an unsupported local timezone.");
  }
}

function partsFromFormatter(value: Date, timeZone: string): DateTimeParts {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function parseLocalInput(value: string): DateTimeParts {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) throw new Error("Choose a valid delivery deadline.");
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const roundTrip = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  ));
  if (
    roundTrip.getUTCFullYear() !== parts.year
    || roundTrip.getUTCMonth() + 1 !== parts.month
    || roundTrip.getUTCDate() !== parts.day
    || roundTrip.getUTCHours() !== parts.hour
    || roundTrip.getUTCMinutes() !== parts.minute
  ) {
    throw new Error("Choose a valid delivery deadline.");
  }
  return parts;
}

function equalParts(left: DateTimeParts, right: DateTimeParts): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute;
}

function timezoneOffsetMinutes(atMs: number, timeZone: string): number {
  const rounded = Math.floor(atMs / ONE_MINUTE_MS) * ONE_MINUTE_MS;
  const parts = partsFromFormatter(new Date(rounded), timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  return Math.round((representedAsUtc - rounded) / ONE_MINUTE_MS);
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function localInputFromParts(parts: DateTimeParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function localDateTimeToUnixSeconds(value: string, timeZone: string): bigint {
  const target = parseLocalInput(value);
  const wallClockAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );
  const possibleOffsets = new Set([
    timezoneOffsetMinutes(wallClockAsUtc - ONE_DAY_MS, timeZone),
    timezoneOffsetMinutes(wallClockAsUtc, timeZone),
    timezoneOffsetMinutes(wallClockAsUtc + ONE_DAY_MS, timeZone),
  ]);
  const candidates = [...possibleOffsets]
    .map((offset) => wallClockAsUtc - (offset * ONE_MINUTE_MS))
    .filter((candidate) => equalParts(partsFromFormatter(new Date(candidate), timeZone), target))
    .sort((left, right) => left - right);
  const selected = candidates[0];
  if (selected === undefined) {
    throw new Error("That local clock time does not exist because the timezone clock changes then.");
  }
  return BigInt(Math.floor(selected / 1_000));
}

export function unixSecondsToLocalInput(value: bigint, timeZone: string): string {
  const milliseconds = Number(value) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) throw new RangeError("Deadline is outside the supported date range.");
  return localInputFromParts(partsFromFormatter(new Date(milliseconds), timeZone));
}

export function formatUtcDeadline(value: bigint): string {
  const milliseconds = Number(value) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) throw new RangeError("Deadline is outside the supported date range.");
  return new Date(milliseconds).toISOString().replace(".000Z", "Z");
}

export function timezoneOffsetLabel(value: bigint, timeZone: string): string {
  const minutes = timezoneOffsetMinutes(Number(value) * 1_000, timeZone);
  const sign = minutes < 0 ? "−" : "+";
  const absolute = Math.abs(minutes);
  return `UTC${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

export function formatLocalDeadline(value: bigint, timeZone: string): string {
  const localInput = unixSecondsToLocalInput(value, timeZone);
  return `${localInput.replace("T", " ")} (${timeZone} · ${timezoneOffsetLabel(value, timeZone)})`;
}

export function contractDeadlineFromLocalInput(
  value: string,
  timeZone: string,
  nowSeconds = BigInt(Math.floor(Date.now() / 1_000)),
): bigint {
  const deadline = localDateTimeToUnixSeconds(value, timeZone);
  if (deadline <= nowSeconds) throw new Error("Delivery deadline must be in the future.");
  return deadline;
}

export function twentyFourHourDeadline(
  nowSeconds = BigInt(Math.floor(Date.now() / 1_000)),
): bigint {
  return nowSeconds + TWENTY_FOUR_HOURS_SECONDS;
}
