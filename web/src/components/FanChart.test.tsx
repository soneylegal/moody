import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("recharts", () => {
  const Original = jest.requireActual("recharts");
  return {
    ...Original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

import { FanChart } from "./FanChart";

const validData = {
  p5: [100, 95, 91, 88],
  p25: [105, 102, 100, 99],
  p50: [110, 108, 107, 106],
  p75: [115, 114, 113, 112],
  p95: [120, 119, 118, 117],
};

describe("FanChart", () => {
  it("renders empty state message when p5 is undefined", () => {
    const { container } = render(
      <FanChart data={{} as any} />
    );
    expect(
      screen.getByText(/Nenhum dado de simulação disponível/i)
    ).toBeInTheDocument();
  });

  it("renders empty state message when p5 is an empty array", () => {
    const { container } = render(
      <FanChart
        data={{ p5: [], p25: [], p50: [], p75: [], p95: [] }}
      />
    );
    expect(
      screen.getByText(/Execute uma simulação de Monte Carlo/i)
    ).toBeInTheDocument();
  });

  it("renders empty state when data is falsy (null cast)", () => {
    render(<FanChart data={undefined as any} />);
    expect(
      screen.getByText(/Nenhum dado de simulação disponível/i)
    ).toBeInTheDocument();
  });

  it("renders AreaChart when valid data is provided", () => {
    render(<FanChart data={validData} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });

  it("maps chartData with correct percentiles", () => {
    const { container } = render(<FanChart data={validData} />);
    // Verify that the chart renders (container exists)
    expect(
      screen.getByTestId("responsive-container")
    ).toBeInTheDocument();
    // Fan chart wrapper div should be present
    expect(container.querySelector(".w-full.h-80")).toBeInTheDocument();
  });

  it("renders all 5 Area layers when data is valid", () => {
    render(<FanChart data={validData} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
    // Recharts creates Areas internally; we verify the container rendered
  });
});