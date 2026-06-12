import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface FanChartProps {
  data: {
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
}

export const FanChart: React.FC<FanChartProps> = ({ data }) => {
  // Check if we have data to plot
  if (!data || !data.p5 || data.p5.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 font-medium border border-dashed border-slate-800 rounded-2xl">
        Nenhum dado de simulação disponível. Execute uma simulação de Monte Carlo para visualizar.
      </div>
    );
  }

  // Map data to the format Recharts expects: an array of objects
  const chartData = data.p5.map((_, index) => ({
    name: `Dia ${index + 1}`,
    p5: Number(data.p5[index].toFixed(2)),
    p25: Number(data.p25[index].toFixed(2)),
    p50: Number(data.p50[index].toFixed(2)),
    p75: Number(data.p75[index].toFixed(2)),
    p95: Number(data.p95[index].toFixed(2)),
  }));

  return (
    <div className="w-full h-80 relative">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
          <XAxis
            dataKey="name"
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              color: "#f1f5f9",
            }}
          />
          
          {/* Worst-case to Best-case Outer Range (P5 to P95) */}
          <Area
            type="monotone"
            dataKey="p95"
            stroke="none"
            fill="rgba(99, 102, 241, 0.05)"
            fillOpacity={1}
            name="P95 (Melhor Caso)"
          />
          <Area
            type="monotone"
            dataKey="p5"
            stroke="none"
            fill="rgba(244, 63, 94, 0.05)"
            fillOpacity={1}
            name="P5 (Pior Caso)"
          />

          {/* Inner Range (P25 to P75) */}
          <Area
            type="monotone"
            dataKey="p75"
            stroke="none"
            fill="rgba(99, 102, 241, 0.12)"
            fillOpacity={1}
            name="P75"
          />
          <Area
            type="monotone"
            dataKey="p25"
            stroke="none"
            fill="rgba(99, 102, 241, 0.12)"
            fillOpacity={1}
            name="P25"
          />

          {/* Median Case (P50) */}
          <Area
            type="monotone"
            dataKey="p50"
            stroke="#6366f1"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorP50)"
            name="P50 (Mediana)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
