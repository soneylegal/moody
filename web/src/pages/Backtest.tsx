import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { MetricCard } from "../components/MetricCard";
import { FanChart } from "../components/FanChart";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Play,
  Sliders,
  Sparkles,
  ShieldAlert,
  Award,
  AlertCircle,
  Activity,
  LineChart as LucideLineChart,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface AssetUniverse {
  b3: string[];
  crypto: string[];
  all: string[];
}

interface BacktestMetrics {
  total_return: number;
  win_rate: number;
  max_drawdown: number;
  sharpe_ratio: number;
  insight_summary?: string | null;
  insight_tone: string;
}

interface MonteCarloMetrics {
  var_95: number;
  cvar_95: number;
  probability_of_ruin: number;
  median_final_equity: number;
  best_case_equity: number;
  worst_case_equity: number;
}

interface MonteCarloResponse {
  metrics: MonteCarloMetrics;
  fan_chart: {
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
  simulations_run: number;
}

interface BacktestResponse {
  period_label: string;
  metrics: BacktestMetrics;
  equity_curve: number[];
  equity_dates?: string[];
  monte_carlo?: MonteCarloResponse | null;
}

export const Backtest: React.FC = () => {
  const [assets, setAssets] = useState<AssetUniverse | null>(null);
  const [selectedAsset, setSelectedAsset] = useState("BTC");
  const [periodLabel, setPeriodLabel] = useState("6 Months");

  // Monte Carlo parameters
  const [numSimulations, setNumSimulations] = useState(1000);
  const [numDays, setNumDays] = useState(252);

  // Results state
  const [backtestResult, setBacktestResult] = useState<BacktestResponse | null>(null);
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResponse | null>(null);

  // Status state
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [runningBacktest, setRunningBacktest] = useState(false);
  const [runningMonteCarlo, setRunningMonteCarlo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAssets = async () => {
      try {
        const data = await api.request<AssetUniverse>("/backtest/assets");
        setAssets(data);
        if (data.all && data.all.length > 0) {
          // Find if BTC exists or use first asset
          const defaultAsset = data.all.includes("BTC") ? "BTC" : data.all[0];
          setSelectedAsset(defaultAsset);
        }
      } catch (err: any) {
        setError("Erro ao carregar lista de ativos.");
      } finally {
        setLoadingAssets(false);
      }
    };
    fetchAssets();
  }, []);

  const handleRunBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRunningBacktest(true);
    setBacktestResult(null);
    setMonteCarloResult(null);

    try {
      const result = await api.request<BacktestResponse>("/backtest/run", {
        method: "POST",
        body: JSON.stringify({
          asset: selectedAsset,
          period_label: periodLabel,
        }),
      });
      setBacktestResult(result);
      if (result.monte_carlo) {
        setMonteCarloResult(result.monte_carlo);
      }
    } catch (err: any) {
      setError(err.message || "Erro ao executar backtest.");
    } finally {
      setRunningBacktest(false);
    }
  };

  const handleRunMonteCarlo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRunningMonteCarlo(true);
    setMonteCarloResult(null);

    try {
      const result = await api.request<MonteCarloResponse>("/backtest/montecarlo", {
        method: "POST",
        body: JSON.stringify({
          asset: selectedAsset,
          period_label: periodLabel,
          n_simulations: numSimulations,
          n_days: numDays,
        }),
      });
      setMonteCarloResult(result);
    } catch (err: any) {
      setError(err.message || "Erro ao executar simulação de Monte Carlo.");
    } finally {
      setRunningMonteCarlo(false);
    }
  };

  // Map equity curve for recharts rendering
  const getEquityChartData = () => {
    if (!backtestResult || !backtestResult.equity_curve) return [];
    
    return backtestResult.equity_curve.map((val, idx) => {
      const dateStr = backtestResult.equity_dates && backtestResult.equity_dates[idx]
        ? new Date(backtestResult.equity_dates[idx]).toLocaleDateString("pt-BR")
        : `Ponto ${idx + 1}`;
        
      return {
        name: dateStr,
        patrimonio: Number(val.toFixed(2)),
      };
    });
  };

  if (loadingAssets) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="text-indigo-500 animate-spin" size={36} />
          <span className="text-slate-400 font-semibold">Carregando universo de ativos...</span>
        </div>
      </div>
    );
  }

  const equityChartData = getEquityChartData();

  return (
    <div className="space-y-8">
      {/* Intro Header */}
      <div className="glass-panel p-6 rounded-3xl flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-200">Backtesting & Simulações de Risco</h2>
          <p className="text-slate-400 text-sm">
            Teste sua estratégia de cruzamento de médias contra dados históricos e projete riscos futuros usando Monte Carlo.
          </p>
        </div>
        <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl hidden md:block">
          <LucideLineChart size={24} />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-2xl flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5" size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Grid of Inputs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Backtest Config Card */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
              <Sliders size={18} className="text-indigo-400" />
              Configuração do Backtest Histórico
            </h3>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  Ativo Selecionado
                </label>
                <select
                  value={selectedAsset}
                  onChange={(e) => setSelectedAsset(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-slate-200 focus:outline-none focus:border-indigo-500/50 text-sm"
                >
                  <optgroup label="Ações Brasileiras (B3)">
                    {assets?.b3.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Criptomoedas">
                    {assets?.crypto.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  Período do Histórico
                </label>
                <select
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-slate-200 focus:outline-none focus:border-indigo-500/50 text-sm"
                >
                  <option value="1 Month">1 Mês</option>
                  <option value="6 Months">6 Meses</option>
                  <option value="1 Year">1 Ano</option>
                </select>
              </div>
            </div>
          </div>
          <button
            onClick={handleRunBacktest}
            disabled={runningBacktest || runningMonteCarlo}
            className="w-full mt-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/50 text-white font-bold rounded-xl flex items-center justify-center gap-2 border border-indigo-500/30 shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            {runningBacktest ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                Processando Histórico...
              </>
            ) : (
              <>
                <Play size={18} />
                Executar Backtest Histórico
              </>
            )}
          </button>
        </div>

        {/* Monte Carlo Config Card */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-400" />
              Simulação Estocástica de Monte Carlo
            </h3>
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    Número de Simulações
                  </label>
                  <span className="text-xs font-bold px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 rounded">
                    {numSimulations} caminhos
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="5000"
                  step="50"
                  value={numSimulations}
                  onChange={(e) => setNumSimulations(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-[9px] text-slate-600 font-semibold uppercase">
                  <span>50</span>
                  <span>5.000</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    Dias de Projeção Futura
                  </label>
                  <span className="text-xs font-bold px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 rounded">
                    {numDays} dias úteis
                  </span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="500"
                  step="10"
                  value={numDays}
                  onChange={(e) => setNumDays(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <div className="flex justify-between text-[9px] text-slate-600 font-semibold uppercase">
                  <span>20 dias</span>
                  <span>500 dias</span>
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleRunMonteCarlo}
            disabled={runningBacktest || runningMonteCarlo || !backtestResult}
            className="w-full mt-8 py-3.5 bg-indigo-950/40 border border-indigo-500/20 hover:border-indigo-500/40 hover:bg-indigo-950/60 disabled:opacity-40 text-indigo-400 font-bold rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
            title={!backtestResult ? "Execute um backtest primeiro para obter a curva base." : ""}
          >
            {runningMonteCarlo ? (
              <>
                <RefreshCw className="animate-spin" size={18} />
                Calculando Projeções...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Simular Riscos (Monte Carlo)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Backtest Results Section */}
      {backtestResult && (
        <div className="space-y-8 animate-fadeIn">
          <div className="border-t border-slate-900 pt-6">
            <h3 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
              <Activity size={18} className="text-indigo-400" />
              Resultados do Backtest Histórico: {backtestResult.period_label}
            </h3>
          </div>

          {/* AI Insights banner */}
          {backtestResult.metrics.insight_summary && (
            <div className={`p-5 rounded-2xl border flex items-start gap-4 ${
              backtestResult.metrics.insight_tone === "positive"
                ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-300"
                : backtestResult.metrics.insight_tone === "negative"
                ? "bg-rose-500/5 border-rose-500/10 text-rose-300"
                : "bg-indigo-500/5 border-indigo-500/10 text-indigo-300"
            }`}>
              <div className="p-2 bg-slate-900/60 rounded-xl shrink-0 mt-0.5 border border-slate-800">
                <Sparkles size={18} className={
                  backtestResult.metrics.insight_tone === "positive"
                    ? "text-emerald-400"
                    : backtestResult.metrics.insight_tone === "negative"
                    ? "text-rose-400"
                    : "text-indigo-400"
                } />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Análise de Performance</h4>
                <p className="text-sm leading-relaxed">{backtestResult.metrics.insight_summary}</p>
              </div>
            </div>
          )}

          {/* Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <MetricCard
              title="Retorno Total"
              value={`${(backtestResult.metrics.total_return * 100).toFixed(2)}%`}
              icon={<TrendingUp size={20} />}
              trend={{
                value: backtestResult.metrics.total_return >= 0 ? "Lucro" : "Prejuízo",
                isPositive: backtestResult.metrics.total_return >= 0,
              }}
            />
            <MetricCard
              title="Taxa de Acerto (Win Rate)"
              value={`${(backtestResult.metrics.win_rate * 100).toFixed(1)}%`}
              icon={<Award size={20} />}
            />
            <MetricCard
              title="Rebaixamento Máximo (Drawdown)"
              value={`${(backtestResult.metrics.max_drawdown * 100).toFixed(2)}%`}
              icon={<TrendingDown size={20} />}
              trend={{
                value: "Risco Máximo",
                isPositive: false,
              }}
            />
            <MetricCard
              title="Índice Sharpe"
              value={backtestResult.metrics.sharpe_ratio.toFixed(2)}
              icon={<Activity size={20} />}
            />
          </div>

          {/* Equity Curve Chart */}
          <div className="glass-panel p-6 rounded-3xl">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Curva de Patrimônio Acumulada</h4>
            <div className="w-full h-80 relative">
              {equityChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorPatrimonio" x1="0" y1="0" x2="0" y2="1">
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
                      tickFormatter={(v) => `R$ ${v.toLocaleString()}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(15, 23, 42, 0.95)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: "12px",
                        color: "#f1f5f9",
                      }}
                      formatter={(value: any) => [`R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, "Patrimônio"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="patrimonio"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorPatrimonio)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 font-medium">
                  Nenhum dado de curva patrimonial para exibir.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Monte Carlo Results Section */}
      {monteCarloResult && (
        <div className="space-y-8 animate-fadeIn border-t border-slate-900 pt-8">
          <div>
            <h3 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
              <Sparkles size={18} className="text-indigo-400" />
              Projeções de Risco: Simulação de Monte Carlo ({monteCarloResult.simulations_run} iterações)
            </h3>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <MetricCard
              title="Value at Risk (VaR 95%)"
              value={`-${(monteCarloResult.metrics.var_95 * 100).toFixed(2)}%`}
              icon={<ShieldAlert size={20} className="text-rose-400" />}
              subtitle="Perda limite esperada em 95% dos casos"
            />
            <MetricCard
              title="CVaR 95% (Conditional VaR)"
              value={`-${(monteCarloResult.metrics.cvar_95 * 100).toFixed(2)}%`}
              icon={<ShieldAlert size={20} className="text-rose-500" />}
              subtitle="Média das piores perdas além do VaR"
            />
            <MetricCard
              title="Probabilidade de Ruína"
              value={`${(monteCarloResult.metrics.probability_of_ruin * 100).toFixed(2)}%`}
              icon={<ShieldAlert size={20} className={monteCarloResult.metrics.probability_of_ruin > 0.05 ? "text-rose-400 animate-pulse" : "text-slate-400"} />}
              subtitle="Chance do capital zerar nas projeções"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Mediana Final</span>
              <span className="text-lg font-bold text-indigo-400">
                R$ {monteCarloResult.metrics.median_final_equity.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Melhor Caso (P95)</span>
              <span className="text-lg font-bold text-emerald-400">
                R$ {monteCarloResult.metrics.best_case_equity.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-5 rounded-2xl border border-slate-900 bg-slate-950/40">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block mb-1">Pior Caso (P5)</span>
              <span className="text-lg font-bold text-rose-400">
                R$ {monteCarloResult.metrics.worst_case_equity.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Fan Chart */}
          <div className="glass-panel p-6 rounded-3xl">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Leque de Distribuição de Probabilidades (Fan Chart)</h4>
            <FanChart data={monteCarloResult.fan_chart} />
          </div>
        </div>
      )}
    </div>
  );
};
