import React, { ReactNode } from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  className = "",
}) => {
  return (
    <div className={`glass-card p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden ${className}`}>
      {/* Decorative backdrop light */}
      <div className="absolute -right-8 -top-8 w-24 h-24 bg-indigo-500/5 blur-2xl rounded-full pointer-events-none" />

      <div className="flex items-center justify-between mb-4">
        <span className="text-slate-400 text-sm font-medium tracking-wide uppercase">{title}</span>
        <div className="p-2.5 bg-slate-800/60 rounded-xl border border-slate-700/50 text-indigo-400">
          {icon}
        </div>
      </div>

      <div>
        <h3 className="text-2xl font-bold text-slate-100 tracking-tight mb-1">
          {value}
        </h3>
        
        <div className="flex items-center gap-2">
          {trend && (
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                trend.isPositive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/10"
              }`}
            >
              {trend.value}
            </span>
          )}
          {subtitle && (
            <span className="text-slate-500 text-xs">{subtitle}</span>
          )}
        </div>
      </div>
    </div>
  );
};
