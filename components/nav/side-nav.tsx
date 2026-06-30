// components/nav/side-nav.tsx
import Link from "next/link";

const links = [
  { href: "/today",    label: "Today",    color: "text-fg" },
  { href: "/training", label: "Training", color: "text-magenta" },
  { href: "/sleep",    label: "Sleep",    color: "text-cyan" },
  { href: "/wellness", label: "Wellness", color: "text-warm" },
];

export function SideNav() {
  return (
    <nav className="fixed inset-y-0 left-0 w-48 border-r border-ink-3 bg-ink-2 p-6 flex flex-col gap-1">
      <div className="font-display text-xl mb-8">garmininsights</div>
      {links.map(l => (
        <Link key={l.href} href={l.href}
          className={`px-3 py-2 rounded hover:bg-ink-3 ${l.color}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
