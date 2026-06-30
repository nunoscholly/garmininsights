import { formatInTimeZone } from "date-fns-tz";

export const TZ = "Europe/Berlin";
export const todayBerlin = () =>
  formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
export const yesterdayBerlin = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
};
