export function MetricCard({ title, children, accent }: {
  title: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="rounded-2xl bg-ink-2 border border-ink-3 p-6 space-y-3">
      <div className={`text-xs uppercase tracking-widest ${accent ?? "text-fg-dim"}`}>{title}</div>
      {children}
    </div>
  );
}
