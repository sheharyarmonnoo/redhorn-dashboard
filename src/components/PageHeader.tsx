interface PageHeaderProps {
  title: string;
  subtitle: string;
  badge?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, badge, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 sm:mb-7 gap-2">
      <div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h1 className="text-[18px] sm:text-[22px] font-bold text-[#1e1e2d] tracking-tight">{title}</h1>
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[#eef1fe] text-[#4f6ef7]">
              {badge}
            </span>
          )}
        </div>
        <p className="text-[12px] sm:text-[13px] text-[#8b8fa3] mt-0.5 sm:mt-1">{subtitle}</p>
      </div>
      {children && <div className="flex items-center gap-3 flex-wrap">{children}</div>}
    </div>
  );
}
