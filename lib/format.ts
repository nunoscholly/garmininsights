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

export const fmtSigned = (n: number, digits = 0) => {
  const s = n.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits); // -0.4 at 0 digits rounds to "0", not "-0"
  return s.startsWith("-") ? s : `+${s}`;
};

export const fmtSignedMin = (sec: number) => {
  const totalMin = Math.round(Math.abs(sec) / 60);
  if (totalMin === 0) return "0m";
  const sign = sec > 0 ? "+" : "−";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return sign + (h ? `${h}h ${m}m` : `${m}m`);
};
