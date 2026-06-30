export const fmtMin = (sec: number | null | undefined) => {
  if (!sec) return "–";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
};

export const fmtInt = (n: number | null | undefined) => n == null ? "–" : n.toLocaleString("de-DE");

export const fmtPace = (mPerS: number | null | undefined) => {
  if (!mPerS) return "–";
  const secPerKm = 1000 / mPerS;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60).toString().padStart(2, "0");
  return `${m}:${s} /km`;
};
