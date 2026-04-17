interface PageHeaderProps {
  title: string;
  subtitle: string;
  badge?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, badge, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-5 sm:mb-6 gap-2">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[18px] sm:text-[22px] font-semibold text-[#18181b] dark:text-[#fafafa] tracking-tight">{title}</h1>
          {badge && (
            <span className="text-[10px] font-medium text-[#71717a] dark:text-[#a1a1aa] uppercase tracking-wider">{badge}</span>
          )}
        </div>
        <p className="text-[12px] sm:text-[13px] text-[#a1a1aa] dark:text-[#71717a] mt-0.5">{subtitle}</p>
      </div>
      {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
    </div>
  );
}
