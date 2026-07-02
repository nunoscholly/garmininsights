export function baselineOf(values: (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => typeof v === "number");
  if (xs.length < 3) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function deltaOf(
  current: number | null | undefined,
  reference: number | null | undefined,
): number | null {
  if (typeof current !== "number" || typeof reference !== "number") return null;
  return current - reference;
}

export function trendDirection(
  values: (number | null | undefined)[],
  threshold: number,
): "up" | "down" | "flat" | null {
  const xs = values.filter((v): v is number => typeof v === "number");
  if (xs.length < 2) return null;
  const diff = xs[xs.length - 1] - xs[0];
  if (diff > threshold) return "up";
  if (diff < -threshold) return "down";
  return "flat";
}
