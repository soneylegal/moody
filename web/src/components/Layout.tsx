import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  TrendingUp,
  LayoutDashboard,
  Sliders,
  LineChart,
  LogOut,
  Wifi,
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const username = localStorage.getItem("username") || "Trader";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("username");
    navigate("/login");
  };

  const navItems = [
    {
      label: "Painel Geral",
      path: "/dashboard",
      icon: <LayoutDashboard size={20} />,
    },
    {
      label: "Estratégia",
      path: "/strategy",
      icon: <Sliders size={20} />,
    },
    {
      label: "Backtesting & Risco",
      path: "/backtest",
      icon: <LineChart size={20} />,
    },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-900 bg-slate-950 flex flex-col justify-between p-6">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10 pl-2">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl">
              <TrendingUp size={22} />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-100">Moody</span>
              <span className="text-xs text-indigo-400 block font-semibold -mt-1 uppercase tracking-wider">Trading Bot</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3.5 px-4.5 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${
                    isActive
                      ? "bg-indigo-600/15 border border-indigo-500/30 text-indigo-400 shadow-md shadow-indigo-600/5"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200 border border-transparent"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/40 border border-slate-900 text-xs font-medium text-slate-400">
            <span className="flex items-center gap-2">
              <Wifi size={14} className="text-emerald-400" />
              Preços em Tempo Real
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>

          {/* User Profile Info */}
          <div className="flex items-center justify-between border-t border-slate-900 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center font-bold text-sm text-indigo-400">
                {username.substring(0, 2).toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-slate-300 truncate max-w-[100px]">
                {username}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
              title="Sair"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-900 flex items-center justify-between px-8 bg-slate-950/20 backdrop-blur-md sticky top-0 z-50">
          <h1 className="text-lg font-bold text-slate-200">
            {navItems.find((i) => i.path === location.pathname)?.label || "Plataforma"}
          </h1>
          <div className="flex items-center gap-4 text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Última Sincronização:</span>
            <span className="text-slate-300">
              {new Date().toLocaleTimeString()}
            </span>
          </div>
        </header>

        {/* Page Container */}
        <main className="flex-1 p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
