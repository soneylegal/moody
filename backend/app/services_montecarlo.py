"""Monte Carlo Simulation Engine for Swing Trade Bot backtest analysis.

Provides probabilistic risk analysis and confidence intervals (fan charts)
based on historical returns of the backtest.
"""

from __future__ import annotations

import random
import numpy as np


def run_monte_carlo_simulation(
    equity_curve: list[float],
    n_simulations: int = 1000,
    n_days: int = 252,
    confidence_levels: list[float] | None = None,
    ruin_threshold_pct: float = 0.5,
) -> dict:
    """Run Monte Carlo simulation using bootstrapping.

    Resamples returns of the provided equity curve to generate simulated paths,
    calculating metrics like VaR, CVaR, probability of ruin, and fan chart percentiles.
    """
    if confidence_levels is None:
        confidence_levels = [0.05, 0.25, 0.50, 0.75, 0.95]

    if len(equity_curve) < 2:
        initial_capital = equity_curve[0] if equity_curve else 10000.0
        static_path = [initial_capital] * n_days
        return {
            "metrics": {
                "var_95": 0.0,
                "cvar_95": 0.0,
                "probability_of_ruin": 0.0,
                "median_final_equity": initial_capital,
                "best_case_equity": initial_capital,
                "worst_case_equity": initial_capital,
            },
            "fan_chart": {f"p{int(cl*100)}": static_path for cl in confidence_levels},
            "simulations_run": n_simulations,
        }

    initial_capital = equity_curve[0]

    # Calculate returns of the equity curve
    returns: list[float] = []
    for i in range(1, len(equity_curve)):
        prev = equity_curve[i - 1]
        if prev > 0:
            returns.append((equity_curve[i] / prev) - 1.0)

    if not returns:
        returns = [0.0]

    # Pre-allocate simulated paths for vectorised percentile calculations
    # shape: (n_simulations, n_days)
    paths = np.zeros((n_simulations, n_days))
    paths[:, 0] = initial_capital

    ruin_count = 0
    all_final_equities = []

    for sim in range(n_simulations):
        current_equity = initial_capital
        ruined = False
        for step in range(1, n_days):
            # Bootstrap resample a return
            ret = random.choice(returns)
            current_equity = current_equity * (1.0 + ret)
            if current_equity < 0:
                current_equity = 0.0
            paths[sim, step] = current_equity

            # Check if equity drops below ruin threshold
            if current_equity < (initial_capital * ruin_threshold_pct):
                ruined = True

        all_final_equities.append(current_equity)
        if ruined:
            ruin_count += 1

    # Calculate fan chart percentiles at each step
    fan_chart = {}
    for cl in confidence_levels:
        percentile_values = []
        for step in range(n_days):
            val = np.percentile(paths[:, step], cl * 100)
            percentile_values.append(float(val))
        fan_chart[f"p{int(cl*100)}"] = percentile_values

    # Calculate Value at Risk (VaR 95%) and Conditional VaR (CVaR 95%) of final equities
    final_returns = [eq / initial_capital - 1.0 for eq in all_final_equities]
    final_returns.sort()

    idx_5pct = max(1, int(len(final_returns) * 0.05))
    var_95 = -final_returns[idx_5pct - 1]

    lower_returns = final_returns[:idx_5pct]
    cvar_95 = -sum(lower_returns) / len(lower_returns)

    median_final_equity = float(np.median(all_final_equities))
    best_case_equity = float(np.percentile(all_final_equities, 95))
    worst_case_equity = float(np.percentile(all_final_equities, 5))

    return {
        "metrics": {
            "var_95": max(0.0, float(var_95 * 100.0)),
            "cvar_95": max(0.0, float(cvar_95 * 100.0)),
            "probability_of_ruin": float(ruin_count / n_simulations * 100.0),
            "median_final_equity": median_final_equity,
            "best_case_equity": best_case_equity,
            "worst_case_equity": worst_case_equity,
        },
        "fan_chart": fan_chart,
        "simulations_run": n_simulations,
    }
