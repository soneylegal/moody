const createChart = jest.fn(() => ({
  addSeries: jest.fn(() => ({
    setData: jest.fn(),
    update: jest.fn(),
  })),
  applyOptions: jest.fn(),
  remove: jest.fn(),
  timeScale: jest.fn(() => ({ fitContent: jest.fn() })),
  subscribeVisibleTimeRangeChange: jest.fn(),
  unsubscribeVisibleTimeRangeChange: jest.fn(),
}));

const CandlestickSeries = {};
const LineSeries = {};

module.exports = {
  __esModule: true,
  default: { createChart, CandlestickSeries, LineSeries },
  createChart,
  CandlestickSeries,
  LineSeries,
};