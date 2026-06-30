"use client";
import { motion } from "framer-motion";

export function HeroNumber({ value, label, color, suffix }: {
  value: string | number; label: string; color: string; suffix?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="space-y-1"
    >
      <div className={`font-display text-7xl tabular-nums ${color}`}>
        {value}{suffix && <span className="text-3xl ml-1 opacity-60">{suffix}</span>}
      </div>
      <div className="text-fg-dim uppercase tracking-widest text-xs">{label}</div>
    </motion.div>
  );
}
