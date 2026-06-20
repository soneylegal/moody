"""Monte Carlo Simulation Engine for Swing Trade Bot backtest analysis.

Provides probabilistic risk analysis and confidence intervals (fan charts)
based on historical returns of the backtest.
"""

from __future__ import annotations

import math
import random

import numpy as np


def run_monte_carlo_simulation(
    equity_curve: list[float],
    n_simulations: int = 1000,
    n_days: int = 252,
    confidence_levels: list[float] | None = None,
    ruin_threshold_pct: float = 0.5,
    method: str = "bootstrap",
    block_size: int | None = None,
    is_tilt: float | None = None,
) -> dict:
    """Run Monte Carlo simulation using the specified method.

    Parameters
    ----------
    equity_curve : list[float]
        Historical equity curve from backtest.
    n_simulations : int
        Number of simulated paths (N).
    n_days : int
        Number of future trading days (D).
    confidence_levels : list[float] | None
        Percentile levels for the fan chart (default: [5%, 25%, 50%, 75%, 95%]).
    ruin_threshold_pct : float
        Fraction of initial capital below which ruin is declared (theta).
    method : str
        Simulation method: "bootstrap", "gbm", "block_bootstrap",
        "importance_sampling".
    block_size : int | None
        Block size for block bootstrap (default: len(returns)^(1/3)).
    is_tilt : float | None
        Tilting parameter for importance sampling
        (negative = more ruin events).
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
    returns = _compute_returns(equity_curve)

    if method == "gbm":
        paths = _generate_paths_gbm(returns, initial_capital, n_simulations, n_days)
        path_weights = None
    elif method == "block_bootstrap":
        paths = _generate_paths_block_bootstrap(
            returns, initial_capital, n_simulations, n_days, block_size
        )
        path_weights = None
    elif method == "importance_sampling":
        paths, path_weights = _generate_paths_is(
            returns, initial_capital, n_simulations, n_days, is_tilt
        )
    else:
        paths = _generate_paths_bootstrap(returns, initial_capital, n_simulations, n_days)
        path_weights = None

    return _compute_metrics(
        paths,
        initial_capital,
        ruin_threshold_pct,
        confidence_levels,
        n_simulations,
        path_weights=path_weights,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _compute_returns(equity_curve: list[float]) -> list[float]:
    """Compute daily returns from an equity curve: r_t = P_t / P_{t-1} - 1."""
    returns: list[float] = []
    for i in range(1, len(equity_curve)):
        prev = equity_curve[i - 1]
        if prev > 0:
            returns.append((equity_curve[i] / prev) - 1.0)
    if not returns:
        returns = [0.0]
    return returns


# ---------------------------------------------------------------------------
# Path generators
# ---------------------------------------------------------------------------


def _generate_paths_bootstrap(
    returns: list[float],
    initial_capital: float,
    n_simulations: int,
    n_days: int,
) -> np.ndarray:
    """Bootstrap resampling: sample returns i.i.d. with replacement."""
    paths = np.zeros((n_simulations, n_days))
    paths[:, 0] = initial_capital

    for sim in range(n_simulations):
        current_equity = initial_capital
        for step in range(1, n_days):
            ret = random.choice(returns)
            current_equity = current_equity * (1.0 + ret)
            if current_equity < 0:
                current_equity = 0.0
            paths[sim, step] = current_equity

    return paths


def _generate_paths_gbm(
    returns: list[float],
    initial_capital: float,
    n_simulations: int,
    n_days: int,
) -> np.ndarray:
    """Geometric Brownian Motion: dP = mu P dt + sigma P dW.

    Discretised with Euler--Maruyama:
        P_t = P_{t-1} * exp((mu - sigma^2/2) * dt + sigma * sqrt(dt) * Z)
    """
    mu = float(np.mean(returns)) * 252.0
    sigma = float(np.std(returns, ddof=1)) * math.sqrt(252.0)
    dt = 1.0 / 252.0
    drift = (mu - 0.5 * sigma * sigma) * dt
    vol = sigma * math.sqrt(dt)

    rng = np.random.default_rng()
    paths = np.zeros((n_simulations, n_days))
    paths[:, 0] = initial_capital

    for step in range(1, n_days):
        Z = rng.standard_normal(n_simulations)
        paths[:, step] = paths[:, step - 1] * np.exp(drift + vol * Z)
        np.clip(paths[:, step], 0.0, None, out=paths[:, step])

    return paths


def _generate_paths_block_bootstrap(
    returns: list[float],
    initial_capital: float,
    n_simulations: int,
    n_days: int,
    block_size: int | None = None,
) -> np.ndarray:
    """Block bootstrap: sample contiguous blocks of returns.

    Preserves serial correlation within each block of length L.
    Default L = len(returns)^(1/3).
    """
    T = len(returns)
    if block_size is None:
        block_size = max(2, int(round(T ** (1.0 / 3.0))))
    block_size = min(block_size, T)

    n_blocks = T - block_size + 1
    blocks = [returns[i : i + block_size] for i in range(n_blocks)]

    paths = np.zeros((n_simulations, n_days))
    paths[:, 0] = initial_capital

    for sim in range(n_simulations):
        current_equity = initial_capital
        step = 1
        while step < n_days:
            block = random.choice(blocks)
            for ret in block:
                if step >= n_days:
                    break
                current_equity = current_equity * (1.0 + ret)
                if current_equity < 0:
                    current_equity = 0.0
                paths[sim, step] = current_equity
                step += 1

    return paths


def _generate_paths_is(
    returns: list[float],
    initial_capital: float,
    n_simulations: int,
    n_days: int,
    tilt: float | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Importance Sampling with exponential tilting.

    Tilts the empirical return distribution toward negative returns using
    g(r_i) proportional to exp(theta * r_i) where theta < 0 shifts mass left.

    Returns
    -------
    paths : np.ndarray, shape (N, D)
        Simulated equity paths.
    path_weights : np.ndarray, shape (N,)
        Likelihood ratio W^{(s)} = prod_{t=1}^{D} f(r_t) / g(r_t).
    """
    T = len(returns)

    if tilt is None:
        tilt = -float(np.std(returns, ddof=1))

    arr = np.array(returns, dtype=np.float64)
    log_weights = tilt * arr - np.max(tilt * arr)
    probs = np.exp(log_weights) / np.sum(np.exp(log_weights))

    lr = (1.0 / T) / probs

    rng = np.random.default_rng()

    paths = np.zeros((n_simulations, n_days))
    paths[:, 0] = initial_capital

    path_weights = np.ones(n_simulations)

    for step in range(1, n_days):
        indices = rng.choice(T, size=n_simulations, p=probs)
        path_weights *= lr[indices]
        for sim in range(n_simulations):
            current_equity = paths[sim, step - 1] * (1.0 + returns[indices[sim]])
            if current_equity < 0:
                current_equity = 0.0
            paths[sim, step] = current_equity

    return paths, path_weights


# ---------------------------------------------------------------------------
# Metrics computation
# ---------------------------------------------------------------------------


def _compute_metrics(
    paths: np.ndarray,
    initial_capital: float,
    ruin_threshold_pct: float,
    confidence_levels: list[float],
    n_simulations: int,
    path_weights: np.ndarray | None = None,
) -> dict:
    """Compute VaR, CVaR, ruin probability, fan chart, and IS diagnostics."""
    n_days = paths.shape[1]
    ruin_threshold = initial_capital * ruin_threshold_pct

    all_final_equities = paths[:, -1].tolist()
    final_returns = np.array([eq / initial_capital - 1.0 for eq in all_final_equities])

    ruin_mask = np.any(paths < ruin_threshold, axis=1)
    ruin_count = int(np.sum(ruin_mask))

    if path_weights is not None:
        p_ruin = float(np.sum(path_weights[ruin_mask]) / n_simulations)
        w_ruin = path_weights[ruin_mask]
        if len(w_ruin) > 0:
            is_var = float(np.mean(w_ruin**2) - p_ruin**2) / n_simulations
        else:
            is_var = 0.0
        sum_w = np.sum(path_weights)
        ess = float(sum_w**2 / np.sum(path_weights**2)) if np.any(path_weights > 0) else 0.0
        probability_of_ruin = max(0.0, p_ruin * 100.0)
    else:
        probability_of_ruin = float(ruin_count / n_simulations * 100.0)
        is_var = None
        ess = None

    sorted_returns = np.sort(final_returns)
    idx_5pct = max(1, int(len(sorted_returns) * 0.05))
    var_95 = -float(sorted_returns[idx_5pct - 1])

    lower_returns = sorted_returns[:idx_5pct]
    cvar_95 = -float(np.mean(lower_returns))

    fan_chart = {}
    for cl in confidence_levels:
        percentile_values = [
            float(np.percentile(paths[:, step], cl * 100)) for step in range(n_days)
        ]
        fan_chart[f"p{int(cl*100)}"] = percentile_values

    median_final_equity = float(np.median(all_final_equities))
    best_case_equity = float(np.percentile(all_final_equities, 95))
    worst_case_equity = float(np.percentile(all_final_equities, 5))

    metrics: dict = {
        "var_95": max(0.0, var_95 * 100.0),
        "cvar_95": max(0.0, cvar_95 * 100.0),
        "probability_of_ruin": probability_of_ruin,
        "median_final_equity": median_final_equity,
        "best_case_equity": best_case_equity,
        "worst_case_equity": worst_case_equity,
    }
    if is_var is not None:
        metrics["is_ruin_variance"] = is_var
    if ess is not None:
        metrics["is_effective_sample_size"] = ess

    return {
        "metrics": metrics,
        "fan_chart": fan_chart,
        "simulations_run": n_simulations,
    }
