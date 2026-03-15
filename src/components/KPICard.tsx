interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  icon?: any;
  iconBg?: string;
  iconColor?: string;
}

export default function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendUp,
  color = "text-[#18181b]",
}: KPICardProps) {
  return (
    <div className="bg-white border border-[#e4e4e7] rounded p-3 sm:p-4">
      <p className="text-[11px] text-[#71717a] font-medium uppercase tracking-wide">{title}</p>
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
