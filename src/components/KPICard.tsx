interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  sparkline?: number[]; // optional mini trend data
  icon?: any;
  iconBg?: string;
  iconColor?: string;
}

function Sparkline({ data, up }: { data: number[]; up?: boolean }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 48;
  const h = 16;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const color = up ? "#16a34a" : up === false ? "#dc2626" : "#a1a1aa";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendUp,
  color = "text-[#18181b]",
  sparkline,
}: KPICardProps) {
  return (
    <div className="bg-white border border-[#e4e4e7] rounded p-3 sm:p-4">
      <div className="flex items-start justify-between">
        <p className="text-[11px] text-[#71717a] font-medium uppercase tracking-wide">{title}</p>
        {sparkline && <Sparkline data={sparkline} up={trendUp} />}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <p className={`text-[20px] sm:text-[24px] font-semibold tracking-tight leading-none ${color}`}>{value}</p>
        {trend && (
          <span className={`text-[11px] font-medium ${trendUp ? "text-[#16a34a]" : "text-[#dc2626]"}`}>
            {trendUp ? "+" : ""}{trend}
          </span>
        )}
      </div>
      {subtitle && <p className="text-[11px] text-[#a1a1aa] mt-1">{subtitle}</p>}
    </div>
  );
}
