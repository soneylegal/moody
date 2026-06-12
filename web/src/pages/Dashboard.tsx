import React, { useState, useEffect, useRef } from "react";
import { api } from "../services/api";
import { MetricCard } from "../components/MetricCard";
import { LiveChart } from "../components/LiveChart";
import {
  Wallet,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  RefreshCw,
  Search,
  ShoppingCart,
  Percent,
} from "lucide-react";

interface Order {
  id: number;
  side: string;
  asset: string;
  price: number;
  quantity: number;
  status: string;
  created_at: string;
}

interface PaperState {
  balance: number;
  focus_asset: string;
  current_price: number;
  floating_pnl: number;
  floating_pnl_percent: number;
  invested_capital: number;
  open_position_asset: string | null;
  open_position_qty: number;
  avg_entry_price: number;
  insight_title: string | null;
  insight_message: string | null;
  insight_tone: string;
  recent_orders: Order[];
}

export const Dashboard: React.FC = () => {
  const [asset, setAsset] = useState("BTC");
  const [searchAsset, setSearchAsset] = useState("BTC");
  const [state, setState] = useState<PaperState | null>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [livePrice, setLivePrice] = useState<{ time: string; price: number } | null>(null);
  const [priceColorClass, setPriceColorClass] = useState("text-slate-100");
  const [quantity, setQuantity] = useState("1");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [loading, setLoading] = useState(true);
  const prevPriceRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const fetchDashboardData = async (activeAsset: string) => {
    try {
      // Fetch paper trading state
      const paperData = await api.request<PaperState>(`/paper/state?asset=${activeAsset}`);
      setState(paperData);

      // Fetch historical data for the chart from /backtest/run or similar endpoint, 
      // or default mock data if not available.
      // Let's call /backtest/run to get some charts
      const chartResult = await api.request<any>("/backtest/run", {
        method: "POST",
        body: JSON.stringify({
          asset: activeAsset,
          period_label: "6 Months",
        }),
      }).catch(() => null);

      if (chartResult && chartResult.price_chart) {
        setHistoricalData(chartResult.price_chart);
      } else {
        // Fallback mockup historical candles
        const fakeData = Array.from({ length: 50 }).map((_, i) => {
          const date = new Date();
          date.setHours(date.getHours() - (50 - i));
          const basePrice = activeAsset === "BTC" ? 65000 : 35;
          const randomFactor = 1 + (Math.random() - 0.5) * 0.05;
          const open = basePrice * randomFactor;
          const close = open * (1 + (Math.random() - 0.5) * 0.02);
          return {
            time: date.toISOString(),
            open,
            high: Math.max(open, close) * 1.01,
            low: Math.min(open, close) * 0.99,
            close,
          };
        });
        setHistoricalData(fakeData);
      }
    } catch (err: any) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(asset);

    // Setup WebSocket connection
    const wsUrl = api.getWebSocketUrl(`/ws/market/${asset}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.price) {
          const newPrice = Number(msg.price);
          setLivePrice({
            time: msg.tick_at || new Date().toISOString(),
            price: newPrice,
          });

          // Flash green/red on price update
          if (prevPriceRef.current !== null) {
            if (newPrice > prevPriceRef.current) {
              setPriceColorClass("text-emerald-400 text-glow-green");
            } else if (newPrice < prevPriceRef.current) {
              setPriceColorClass("text-rose-400 text-glow-red");
            }
          }
          prevPriceRef.current = newPrice;

          // Reset text color after a second
          setTimeout(() => {
            setPriceColorClass("text-slate-100");
          }, 800);
        }
      } catch (err) {
        console.error("Error parsing WS message:", err);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [asset]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchAsset.trim()) {
      setAsset(searchAsset.trim().toUpperCase());
    }
  };

  const executeOrder = async (side: "buy" | "sell") => {
    setOrderError(null);
    setOrderSuccess(null);
    setSubmittingOrder(true);

    try {
      const payload = {
        asset,
        price: livePrice?.price || state?.current_price || 0,
        quantity: parseFloat(quantity),
      };

      if (payload.price <= 0) {
        throw new Error("Preço de mercado indisponível. Aguarde uma cotação.");
      }

      await api.request(`/paper/${side}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setOrderSuccess(`Ordem de ${side === "buy" ? "COMPRA" : "VENDA"} executada com sucesso!`);
      fetchDashboardData(asset);
    } catch (err: any) {
      setOrderError(err.message || "Erro ao executar ordem. Verifique o saldo.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  const closePosition = async () => {
    setOrderError(null);
    setOrderSuccess(null);
    setSubmittingOrder(true);

    try {
      await api.request("/paper/close", {
        method: "POST",
      });
      setOrderSuccess("Posição encerrada a mercado com sucesso!");
      fetchDashboardData(asset);
    } catch (err: any) {
      setOrderError(err.message || "Erro ao encerrar posição.");
    } finally {
      setSubmittingOrder(false);
    }
  };

  const resetWallet = async () => {
    if (window.confirm("Deseja realmente resetar o saldo da sua carteira para R$ 100.000,00?")) {
      try {
        await api.request("/paper/reset", { method: "POST" });
        fetchDashboardData(asset);
        setOrderSuccess("Carteira resetada com sucesso!");
      } catch (err: any) {
        setOrderError("Erro ao resetar carteira.");
      }
    }
  };

  const currentPrice = livePrice?.price || state?.current_price || 0.0;
  const positionPnL = state?.open_position_qty
    ? (currentPrice - state.avg_entry_price) * state.open_position_qty
    : 0;
  const positionPnLPercent = state?.avg_entry_price
    ? ((currentPrice - state.avg_entry_price) / state.avg_entry_price) * 100
    : 0;

  if (loading && !state) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="text-indigo-500 animate-spin" size={36} />
          <span className="text-slate-400 font-semibold">Carregando painel financeiro...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Search Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <form onSubmit={handleSearch} className="flex gap-2 max-w-sm w-full">
          <div className="relative flex-1">
            <Search className="absolute inset-y-0 left-3 flex items-center text-slate-500 my-auto h-5 w-5" />
            <input
              type="text"
              value={searchAsset}
              onChange={(e) => setSearchAsset(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800/80 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50"
              placeholder="Buscar ativo (ex: PETR4, BTC)"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 bg-slate-900 border border-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold rounded-xl text-sm transition-colors"
          >
            Buscar
          </button>
        </form>

        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm font-medium">Ativo Atual:</span>
          <span className="text-sm font-extrabold px-3 py-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-lg">
            {asset}
          </span>
          <button
            onClick={resetWallet}
            className="p-2.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-900 rounded-xl transition-all"
            title="Resetar Carteira"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Saldo Disponível"
          value={`R$ ${(state?.balance || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<Wallet size={20} />}
        />
        <MetricCard
          title="Preço Atual"
          value={`R$ ${currentPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
          icon={<TrendingUp size={20} />}
          className={priceColorClass}
        />
        <MetricCard
          title="Capital Investido"
          value={`R$ ${(state?.invested_capital || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={<ShoppingCart size={20} />}
        />
        <MetricCard
          title="PnL Aberto"
          value={`R$ ${positionPnL.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={positionPnL >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          trend={{
            value: `${positionPnL >= 0 ? "+" : ""}${positionPnLPercent.toFixed(2)}%`,
            isPositive: positionPnL >= 0,
          }}
        />
      </div>

      {/* Chart and Trading Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chart Card */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-3xl relative overflow-hidden">
          <h2 className="text-lg font-bold text-slate-200 mb-6 flex items-center gap-2">
            Gráfico Histórico & Tempo Real
          </h2>
          <LiveChart data={historicalData} livePrice={livePrice} />
        </div>

        {/* Action Panel Card */}
        <div className="glass-panel p-6 rounded-3xl flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-200 mb-6">Executar Operação</h2>
            
            {orderError && (
              <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl">
                {orderError}
              </div>
            )}
            {orderSuccess && (
              <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl">
                {orderSuccess}
              </div>
            )}

            {/* Position Display */}
            {state?.open_position_qty ? (
              <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 mb-6 space-y-2 text-xs">
                <span className="text-slate-400 font-semibold block uppercase">Posição Ativa</span>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ativo / Quantidade:</span>
                  <span className="text-slate-200 font-bold">{state.open_position_asset} ({state.open_position_qty} Qtd)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Preço Médio de Entrada:</span>
                  <span className="text-slate-200 font-semibold">R$ {state.avg_entry_price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-900 mb-6 text-center text-xs text-slate-500 font-semibold">
                Nenhuma posição aberta no momento
              </div>
            )}

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Quantidade
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-3 px-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-all text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => executeOrder("buy")}
                disabled={submittingOrder}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800/30 text-white font-bold rounded-xl flex items-center justify-center gap-2 border border-emerald-500/20 shadow-lg shadow-emerald-600/10 hover:shadow-emerald-500/20 transition-all"
              >
                Comprar
              </button>
              <button
                onClick={() => executeOrder("sell")}
                disabled={submittingOrder}
                className="py-3 px-4 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800/30 text-white font-bold rounded-xl flex items-center justify-center gap-2 border border-rose-500/20 shadow-lg shadow-rose-600/10 hover:shadow-rose-500/20 transition-all"
              >
                Vender
              </button>
            </div>
            {state?.open_position_qty && (
              <button
                onClick={closePosition}
                disabled={submittingOrder}
                className="w-full py-3 px-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-bold rounded-xl transition-all"
              >
                Encerrar Posição a Mercado
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="glass-panel p-6 rounded-3xl">
        <h2 className="text-lg font-bold text-slate-200 mb-6">Histórico de Ordens</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-900">
              <tr>
                <th className="pb-4">ID</th>
                <th className="pb-4">Ativo</th>
                <th className="pb-4">Operação</th>
                <th className="pb-4">Quantidade</th>
                <th className="pb-4">Preço Executado</th>
                <th className="pb-4">Status</th>
                <th className="pb-4">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {state?.recent_orders && state.recent_orders.length > 0 ? (
                state.recent_orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="py-4 font-mono">#{order.id}</td>
                    <td className="py-4 font-bold text-slate-200">{order.asset}</td>
                    <td className="py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          order.side.toLowerCase() === "buy"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-rose-500/10 text-rose-400"
                        }`}
                      >
                        {order.side.toUpperCase() === "BUY" ? "COMPRA" : "VENDA"}
                      </span>
                    </td>
                    <td className="py-4 font-medium text-slate-300">{order.quantity}</td>
                    <td className="py-4 font-medium text-slate-300">
                      R$ {order.price.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4">
                      <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {order.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 text-xs text-slate-500">
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-600 font-medium">
                    Nenhuma ordem encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
