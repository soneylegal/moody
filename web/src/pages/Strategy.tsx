import React, { useState, useEffect } from "react";
import { api } from "../services/api";
import { Sliders, Save, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

interface StrategyConfig {
  id: string;
  asset: string;
  timeframe: string;
  ma_short_period: number;
  ma_long_period: number;
  updated_at: string;
}

interface AssetUniverse {
  b3: string[];
  crypto: string[];
  all: string[];
}

export const Strategy: React.FC = () => {
  const [config, setConfig] = useState<StrategyConfig | null>(null);
  const [assets, setAssets] = useState<AssetUniverse | null>(null);
  
  const [selectedAsset, setSelectedAsset] = useState("");
  const [timeframe, setTimeframe] = useState("15M");
  const [maShort, setMaShort] = useState(9);
  const [maLong, setMaLong] = useState(21);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [assetsData, configData] = await Promise.all([
        api.request<AssetUniverse>("/strategy/assets"),
        api.request<StrategyConfig>("/strategy/config"),
      ]);

      setAssets(assetsData);
      setConfig(configData);
      
      setSelectedAsset(configData.asset);
      setTimeframe(configData.timeframe);
      setMaShort(configData.ma_short_period);
      setMaLong(configData.ma_long_period);
    } catch (err: any) {
      setError("Erro ao carregar dados da estratégia.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (maLong <= maShort) {
      setError("A média móvel longa deve ser estritamente maior que a média móvel curta.");
      return;
    }

    setSaving(true);
    try {
      const updated = await api.request<StrategyConfig>("/strategy/config", {
        method: "PUT",
        body: JSON.stringify({
          asset: selectedAsset,
          timeframe,
          ma_short_period: maShort,
          ma_long_period: maLong,
        }),
      });
      setConfig(updated);
      setSuccess("Estratégia atualizada com sucesso!");
    } catch (err: any) {
      setError(err.message || "Erro ao atualizar a estratégia.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="text-indigo-500 animate-spin" size={36} />
          <span className="text-slate-400 font-semibold">Carregando configurações...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Intro Header */}
      <div className="glass-panel p-6 rounded-3xl flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-200">Estratégia de Médias Móveis (MA Crossover)</h2>
          <p className="text-slate-400 text-sm">
            Configure as regras do robô. Ele compra ao cruzar a média curta para cima e vende ao cruzar para baixo.
          </p>
        </div>
        <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl hidden md:block">
          <Sliders size={24} />
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="glass-panel p-8 rounded-3xl">
        <form onSubmit={handleSave} className="space-y-8">
          
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-2xl flex items-start gap-3">
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="shrink-0 mt-0.5" size={18} />
              <span>{success}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Asset selection */}
            <div className="space-y-2">
              <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider">
                Ativo Operado
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

            {/* Timeframe selection */}
            <div className="space-y-2">
              <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider">
                Periodicidade (Timeframe)
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 px-4 text-slate-200 focus:outline-none focus:border-indigo-500/50 text-sm"
              >
                <option value="5M">5 Minutos</option>
                <option value="15M">15 Minutos</option>
                <option value="1H">1 Hora</option>
                <option value="1D">1 Dia</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-900/60 pt-8 space-y-6">
            {/* Short MA Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  Média Móvel Curta (Rápida)
                </label>
                <span className="text-sm font-bold px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 rounded">
                  {maShort} períodos
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="50"
                value={maShort}
                onChange={(e) => setMaShort(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-600 font-semibold uppercase">
                <span>2 períodos</span>
                <span>50 períodos</span>
              </div>
            </div>

            {/* Long MA Slider */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="block text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  Média Móvel Longa (Lenta)
                </label>
                <span className="text-sm font-bold px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/15 rounded">
                  {maLong} períodos
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="200"
                value={maLong}
                onChange={(e) => setMaLong(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <div className="flex justify-between text-[10px] text-slate-600 font-semibold uppercase">
                <span>5 períodos</span>
                <span>200 períodos</span>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center border-t border-slate-900/60 pt-8">
            <span className="text-xs text-slate-500 font-semibold">
              Última modificação: {config?.updated_at ? new Date(config.updated_at).toLocaleString() : "Desconhecida"}
            </span>
            
            <button
              type="submit"
              disabled={saving}
              className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/50 text-white font-bold rounded-xl flex items-center justify-center gap-2 border border-indigo-500/30 shadow-lg shadow-indigo-600/20 hover:shadow-indigo-500/30 transition-all active:scale-[0.98]"
            >
              {saving ? "Salvando..." : "Salvar Configuração"}
              {!saving && <Save size={18} />}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
