export function SleepStagesBar({ deep, light, rem, awake }: {
  deep: number; light: number; rem: number; awake: number;
}) {
  const total = deep + light + rem + awake || 1;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div className="h-3 flex rounded-full overflow-hidden bg-ink-3">
      <div style={{ width: `${pct(deep)}%`  }} className="bg-cyan" />
      <div style={{ width: `${pct(rem)}%`   }} className="bg-cyan/70" />
      <div style={{ width: `${pct(light)}%` }} className="bg-cyan/40" />
      <div style={{ width: `${pct(awake)}%` }} className="bg-fg-dim/60" />
    </div>
  );
}
