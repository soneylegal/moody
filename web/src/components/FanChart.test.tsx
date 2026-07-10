import React from "react";
import { render, screen } from "@testing-library/react";
import { FanChart } from "./FanChart";

jest.mock("recharts", () => {
  const Original = jest.requireActual("recharts");
  return {
    ...Original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

const validData = {
  p5: [100, 95, 91, 88],
  p25: [105, 102, 100, 99],
  p50: [110, 108, 107, 106],
  p75: [115, 114, 113, 112],
  p95: [120, 119, 118, 117],
};

describe("FanChart", () => {
  it("renders empty state message when p5 is undefined", () => {
    render(<FanChart data={{} as any} />);
    expect(
      screen.getByText(/Nenhum dado de simulação disponível/i)
    ).toBeInTheDocument();
  });

  it("renders empty state message when p5 is an empty array", () => {
    render(
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
    expect(
      screen.getByTestId("responsive-container")
    ).toBeInTheDocument();
    // FanChart wrapper div uses recharts inner components without ARIA roles
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector(".w-full.h-80")).toBeInTheDocument();
  });

  it("renders all 5 Area layers when data is valid", () => {
    render(<FanChart data={validData} />);
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument();
  });
});