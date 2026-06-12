import React, { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

interface LiveChartProps {
  data: {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
  }[];
  livePrice?: {
    time: string;
    price: number;
  } | null;
}

export const LiveChart: React.FC<LiveChartProps> = ({ data, livePrice }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: "solid" as any, color: "rgba(15, 23, 42, 0.0)" },
        textColor: "#94a3b8",
        fontSize: 11,
        fontFamily: "Inter, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.02)" },
        horzLines: { color: "rgba(255, 255, 255, 0.02)" },
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.05)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.05)",
        autoScale: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 320,
    });

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    // Format and sort historical data
    const formattedData = [...data]
      .map((item) => {
        // Convert ISO string to unix timestamp seconds
        const date = new Date(item.time);
        const timeSecs = Math.floor(date.getTime() / 1000) as UTCTimestamp;
        return {
          time: timeSecs,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        };
      })
      .sort((a, b) => (a.time as number) - (b.time as number));

    // Remove duplicates by timestamp to prevent lightweight-charts error
    const uniqueData = formattedData.filter(
      (item, index, self) => self.findIndex((t) => t.time === item.time) === index
    );

    if (uniqueData.length > 0) {
      candlestickSeries.setData(uniqueData);
    }

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data]);

  // Update with live ticks
  useEffect(() => {
    if (!seriesRef.current || !livePrice) return;

    const date = new Date(livePrice.time);
    const timeSecs = Math.floor(date.getTime() / 1000) as UTCTimestamp;
    
    // We update the last candle or create a new one based on timeframe
    try {
      seriesRef.current.update({
        time: timeSecs,
        open: livePrice.price,
        high: livePrice.price,
        low: livePrice.price,
        close: livePrice.price,
      });
    } catch (e) {
      console.warn("Could not update live tick:", e);
    }
  }, [livePrice]);

  return (
    <div className="w-full relative">
      <div ref={chartContainerRef} className="w-full h-80" />
    </div>
  );
};
