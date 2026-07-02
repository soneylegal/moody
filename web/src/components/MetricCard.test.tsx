import React from "react";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "./MetricCard";
import { TrendingUp, TrendingDown } from "lucide-react";

describe("MetricCard", () => {
  it("renders title, value, and icon", () => {
    render(
      <MetricCard
        title="Retorno Total"
        value="12.5%"
        icon={<TrendingUp size={18} />}
      />
    );
    expect(screen.getByText("Retorno Total")).toBeInTheDocument();
    expect(screen.getByText("12.5%")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(
      <MetricCard
        title="Sharpe"
        value="1.45"
        subtitle="vs benchmark"
        icon={<TrendingUp size={18} />}
      />
    );
    expect(screen.getByText("vs benchmark")).toBeInTheDocument();
  });

  it("does not render subtitle when not provided", () => {
    render(
      <MetricCard
        title="Win Rate"
        value="68%"
        icon={<TrendingUp size={18} />}
      />
    );
    expect(screen.queryByText("vs benchmark")).not.toBeInTheDocument();
  });

  it("renders positive trend badge with emerald styling", () => {
    render(
      <MetricCard
        title="P&L"
        value="$1,234"
        icon={<TrendingUp size={18} />}
        trend={{ value: "+5.2%", isPositive: true }}
      />
    );
    const trendBadge = screen.getByText("+5.2%");
    expect(trendBadge).toBeInTheDocument();
    expect(trendBadge.className).toContain("emerald");
  });

  it("renders negative trend badge with rose styling", () => {
    render(
      <MetricCard
        title="Drawdown"
        value="-$450"
        icon={<TrendingDown size={18} />}
        trend={{ value: "-3.1%", isPositive: false }}
      />
    );
    const trendBadge = screen.getByText("-3.1%");
    expect(trendBadge).toBeInTheDocument();
    expect(trendBadge.className).toContain("rose");
  });

  it("appends custom classname to wrapper", () => {
    const { container } = render(
      <MetricCard
        title="Extra"
        value="99"
        icon={<TrendingUp size={18} />}
        className="col-span-2"
      />
    );
    const glassCard = container.querySelector(".glass-card");
    expect(glassCard?.className).toContain("col-span-2");
  });
});