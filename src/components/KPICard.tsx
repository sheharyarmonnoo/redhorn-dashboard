import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: string;
}

export default function KPICard({ title, value, subtitle, icon: Icon, trend, trendUp, color = "text-white" }: KPICardProps) {
  return (
    <div className="bg-[#141414] border border-[#262626] rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <p className={`text-xs mt-2 ${trendUp ? "text-emerald-400" : "text-red-400"}`}>
              {trendUp ? "+" : ""}{trend}
            </p>
          )}
        </div>
        <div className="p-2 bg-[#1a1a1a] rounded-lg">
          <Icon size={20} className="text-gray-500" />
        </div>
      </div>
    </div>
  );
}
