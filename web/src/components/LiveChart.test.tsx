import React from "react";
import { render } from "@testing-library/react";
import { LiveChart } from "./LiveChart";

const sampleData = [
  { time: "2025-01-01T12:00:00Z", open: 100, high: 105, low: 99, close: 103 },
  { time: "2025-01-02T12:00:00Z", open: 103, high: 108, low: 102, close: 107 },
];

describe("LiveChart", () => {
  it("renders chart container div", () => {
    const { container } = render(<LiveChart data={sampleData} />);
    // lightweight-charts creates a chart inside a container div without ARIA roles
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const chartDiv = container.querySelector("div[class*='h-80']");
    expect(chartDiv).toBeInTheDocument();
  });

  it("renders container without crash when data empty", () => {
    const { container } = render(<LiveChart data={[]} />);
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector(".w-full")).toBeInTheDocument();
  });

  it("renders with livePrice null without crash", () => {
    const { container } = render(
      <LiveChart data={sampleData} livePrice={null} />
    );
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector(".w-full")).toBeInTheDocument();
  });

  it("renders with livePrice without crash", () => {
    const { container } = render(
      <LiveChart
        data={sampleData}
        livePrice={{ time: "2025-01-03T12:00:00Z", price: 108 }}
      />
    );
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelector(".w-full")).toBeInTheDocument();
  });
});