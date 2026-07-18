// 270° speedometer gauge (open at the bottom), drawn as deterministic SVG arc
// paths. Shared by /analytics and /group. Geometry unit-checked: start bottom-left
// (225°), sweep clockwise, 50% lands at top.
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function pt(c: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180; // 0deg = top, clockwise
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
}
function arc(c: number, r: number, startDeg: number, span: number): string {
  const [x1, y1] = pt(c, r, startDeg);
  const [x2, y2] = pt(c, r, startDeg + span);
  const large = span > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}
const START = 225;

export function Gauge({
  pct, color, size = 116, stroke = 11, track = "var(--line)", children, label,
}: {
  pct: number;
  color: string;
  size?: number;
  stroke?: number;
  track?: string;
  children: React.ReactNode;
  label: string;
}) {
  const c = size / 2;
  const r = c - stroke;
  const p = clamp(pct);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={arc(c, r, START, 270)} fill="none" stroke={track} strokeWidth={stroke} strokeLinecap="round" />
        {p > 0 && (
          <path d={arc(c, r, START, 270 * p)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">{children}</div>
    </div>
  );
}
