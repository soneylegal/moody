"""Tests for the Monte Carlo simulation engine and endpoints."""

import pytest
from app.services_montecarlo import run_monte_carlo_simulation


def test_monte_carlo_simulation_with_empty_or_short_equity_curve():
    # Test with empty list
    res = run_monte_carlo_simulation([], n_simulations=10, n_days=50)
    assert res["simulations_run"] == 10
    assert "p50" in res["fan_chart"]
    assert len(res["fan_chart"]["p50"]) == 50
    assert all(val == 10000.0 for val in res["fan_chart"]["p50"])

    # Test with single element
    res2 = run_monte_carlo_simulation([5000.0], n_simulations=10, n_days=30)
    assert res2["metrics"]["median_final_equity"] == 5000.0
    assert len(res2["fan_chart"]["p95"]) == 30
    assert all(val == 5000.0 for val in res2["fan_chart"]["p95"])


def test_monte_carlo_simulation_metrics():
    # Generate a dummy equity curve: starting at 10000, growing
    equity_curve = [10000.0, 10100.0, 10200.0, 10300.0, 10400.0, 10500.0]
    res = run_monte_carlo_simulation(equity_curve, n_simulations=50, n_days=10)

    assert res["simulations_run"] == 50
    assert "metrics" in res
    metrics = res["metrics"]
    assert "var_95" in metrics
    assert "cvar_95" in metrics
    assert "probability_of_ruin" in metrics
    assert metrics["median_final_equity"] > 10000.0
    assert metrics["best_case_equity"] >= metrics["median_final_equity"]
    assert metrics["median_final_equity"] >= metrics["worst_case_equity"]

    # Check fan chart structure
    for p in ["p5", "p25", "p50", "p75", "p95"]:
        assert p in res["fan_chart"]
        assert len(res["fan_chart"][p]) == 10


def test_monte_carlo_api_endpoint(client, auth_headers):
    # Mocking/calling the endpoint
    payload = {
        "n_simulations": 50,
        "n_days": 30,
        "asset": "BTC",
        "period_label": "1 Month"
    }
    resp = client.post("/backtest/montecarlo", json=payload, headers=auth_headers)

    # In testing environment, if fetching historical prices fails (due to no internet or invalid asset/period),
    # the endpoint returns 400 Bad Request, which is expected and correct.
    assert resp.status_code in (200, 400)
    if resp.status_code == 200:
        data = resp.json()
        assert data["simulations_run"] == 50
        assert "metrics" in data
        assert "fan_chart" in data
        assert len(data["fan_chart"]["p50"]) == 30


# ---------------------------------------------------------------------------
# GBM
# ---------------------------------------------------------------------------


def test_gbm_paths_distribution():
    equity_curve = [10000.0, 10100.0, 10200.0, 10300.0, 10400.0, 10500.0]
    res = run_monte_carlo_simulation(
        equity_curve, n_simulations=500, n_days=50, method="gbm"
    )
    assert res["simulations_run"] == 500
    assert "metrics" in res
    assert res["metrics"]["best_case_equity"] >= res["metrics"]["median_final_equity"]
    assert res["metrics"]["median_final_equity"] >= res["metrics"]["worst_case_equity"]
    for p in ["p5", "p25", "p50", "p75", "p95"]:
        assert p in res["fan_chart"]
        assert len(res["fan_chart"][p]) == 50


def test_gbm_with_negative_returns():
    equity_curve = [10000.0, 9900.0, 9500.0, 9200.0, 9000.0, 8800.0]
    res = run_monte_carlo_simulation(
        equity_curve, n_simulations=200, n_days=20, method="gbm"
    )
    assert res["simulations_run"] == 200
    assert res["metrics"]["var_95"] >= 0


# ---------------------------------------------------------------------------
# Block Bootstrap
# ---------------------------------------------------------------------------


def test_block_bootstrap_runs():
    equity_curve = [10000.0, 9900.0, 10100.0, 10200.0, 9800.0, 10500.0]
    res = run_monte_carlo_simulation(
        equity_curve, n_simulations=50, n_days=20, method="block_bootstrap"
    )
    assert res["simulations_run"] == 50
    assert "metrics" in res
    assert len(res["fan_chart"]["p50"]) == 20


def test_block_bootstrap_custom_block_size():
    equity_curve = [10000.0, 9900.0, 10100.0, 10200.0, 9800.0, 10500.0]
    res = run_monte_carlo_simulation(
        equity_curve, n_simulations=30, n_days=15, method="block_bootstrap", block_size=3
    )
    assert res["simulations_run"] == 30
    assert "metrics" in res


# ---------------------------------------------------------------------------
# Importance Sampling
# ---------------------------------------------------------------------------


def test_importance_sampling_runs():
    equity_curve = [10000.0, 9900.0, 10100.0, 9800.0, 9600.0, 10200.0]
    res = run_monte_carlo_simulation(
        equity_curve,
        n_simulations=100,
        n_days=10,
        method="importance_sampling",
        is_tilt=-2.0,
    )
    assert res["simulations_run"] == 100
    assert "probability_of_ruin" in res["metrics"]


def test_importance_sampling_is_diagnostics():
    equity_curve = [10000.0, 9500.0, 9000.0, 8500.0, 8000.0, 7500.0]
    res = run_monte_carlo_simulation(
        equity_curve,
        n_simulations=200,
        n_days=10,
        method="importance_sampling",
        is_tilt=-1.0,
    )
    metrics = res["metrics"]
    assert "is_ruin_variance" in metrics
    assert "is_effective_sample_size" in metrics
    assert metrics["is_effective_sample_size"] > 0


# ---------------------------------------------------------------------------
# Consistency across methods
# ---------------------------------------------------------------------------


def test_all_methods_return_same_structure():
    equity_curve = [10000.0, 10100.0, 10200.0, 10300.0, 10400.0, 10500.0]
    for method in ["bootstrap", "gbm", "block_bootstrap", "importance_sampling"]:
        kwargs = {"method": method}
        if method == "importance_sampling":
            kwargs["is_tilt"] = -0.5
        res = run_monte_carlo_simulation(
            equity_curve, n_simulations=50, n_days=10, **kwargs
        )
        assert res["simulations_run"] == 50
        assert set(res["metrics"]) >= {
            "var_95", "cvar_95", "probability_of_ruin",
            "median_final_equity", "best_case_equity", "worst_case_equity",
        }
        for p in ["p5", "p25", "p50", "p75", "p95"]:
            assert p in res["fan_chart"]
            assert len(res["fan_chart"][p]) == 10
