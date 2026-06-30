export function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-fg-dim">–</span>;
  const color = {
    productive: "bg-lime/20 text-lime",
    maintaining: "bg-warm/20 text-warm",
    recovery: "bg-cyan/20 text-cyan",
    strained: "bg-amber/20 text-amber",
    overreaching: "bg-red/20 text-red",
    unproductive: "bg-red/20 text-red",
  }[status] ?? "bg-fg/10 text-fg";
  return <span className={`px-3 py-1 rounded-full text-sm ${color}`}>{status}</span>;
}
