/** Whether a date input takes a time: as its `time` setting says, else when the field stores one. */
// deviation:date-time-by-type
export const showsTime = (time: unknown, dataType: string | null | undefined): boolean =>
  time === undefined || time === null ? dataType === "Timestamp" : !!time;

/** "2026-09-29 14:30:00" <-> "2026-09-29T14:30" for datetime-local; a bare date shows midnight. */
export function toLocalDateTime(value: unknown): string {
  if (typeof value !== "string") return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00`
    : value.replace(" ", "T").slice(0, 16);
}
export function fromLocalDateTime(value: string): string | null {
  return value ? `${value.replace("T", " ")}:00` : null;
}
