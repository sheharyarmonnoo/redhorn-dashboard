import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: string;
  iconBg?: string;
  iconColor?: string;
}

export default function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
  color = "text-[#1e1e2d]",
  iconBg = "bg-[#eef1fe]",
  iconColor = "text-[#4f6ef7]",
}: KPICardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e8eaef] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${iconBg}`}>
          <Icon size={20} className={iconColor} strokeWidth={1.8} />
        </div>
        {trend && (
          <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-lg ${
            trendUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
          }`}>
            {trendUp ? "↑ " : "↓ "}{trend}
          </span>
        )}
      </div>
      <p className={`text-[26px] font-bold tracking-tight leading-none ${color}`}>{value}</p>
      <p className="text-[12px] text-[#8b8fa3] font-medium mt-1.5">{title}</p>
      {subtitle && <p className="text-[11px] text-[#b0b4c5] mt-0.5">{subtitle}</p>}
    </div>
  );
}
