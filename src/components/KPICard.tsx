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

export default function KPICard({ title, value, subtitle, icon: Icon, trend, trendUp, color = "text-gray-900" }: KPICardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
          {trend && (
            <p className={`text-xs mt-2 ${trendUp ? "text-emerald-600" : "text-red-500"}`}>
              {trendUp ? "+" : ""}{trend}
            </p>
          )}
        </div>
        <div className="p-2 bg-[#eef1fe] rounded-lg">
          <Icon size={20} className="text-[#4f6ef7]" />
        </div>
      </div>
    </div>
  );
}
