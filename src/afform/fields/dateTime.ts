/** Whether a date input takes a time: as its `time` setting says, else when the field stores one. */
// deviation:date-time-by-type
export const showsTime = (time: unknown, dataType: string | null | undefined): boolean =>
  time === undefined || time === null ? dataType === "Timestamp" : !!time;
