"""Tests for the backtest engine (unit tests with synthetic data)."""

import pandas as pd
import pytest

from app.services_backtest import run_ma_backtest


def _make_trending_prices(n: int = 100, start: float = 100.0, trend: float = 0.5) -> list[float]:
    """Generate a simple upward-trending price series."""
    return [start + i * trend for i in range(n)]


def _make_timestamps(n: int = 100) -> list[pd.Timestamp]:
    return pd.date_range("2025-01-01", periods=n, freq="h").tolist()


def test_backtest_returns_expected_keys():
    prices = _make_trending_prices(100)
    timestamps = _make_timestamps(100)

    result = run_ma_backtest(prices, timestamps, ma_short=5, ma_long=20, initial_capital=10000.0)

    assert "equity_curve" in result
    assert "total_return" in result
    assert "win_rate" in result
    assert "max_drawdown" in result
    assert "sharpe_ratio" in result
    assert len(result["equity_curve"]) > 0


def test_backtest_with_trending_data_has_positive_return():
    prices = _make_trending_prices(200, start=50.0, trend=0.3)
    timestamps = _make_timestamps(200)

    result = run_ma_backtest(prices, timestamps, ma_short=5, ma_long=20)

    assert result["total_return"] > 0, "Trending data should produce positive return"


def test_backtest_equity_curve_starts_near_initial_capital():
    prices = _make_trending_prices(100)
    timestamps = _make_timestamps(100)

    result = run_ma_backtest(prices, timestamps, ma_short=5, ma_long=20, initial_capital=5000.0)

    assert abs(result["equity_curve"][0] - 5000.0) < 500  # first bar, approximate


def test_backtest_insufficient_data_raises():
    prices = [100.0, 101.0, 102.0]
    timestamps = _make_timestamps(3)

    with pytest.raises(ValueError):
        run_ma_backtest(prices, timestamps, ma_short=5, ma_long=20)
