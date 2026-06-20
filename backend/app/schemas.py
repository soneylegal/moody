from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TradeModeEnum(str, Enum):
    paper = "paper"
    live = "live"


class AuthRegisterIn(BaseModel):
    email: str
    password: str = Field(..., min_length=6)


class AuthLoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshTokenIn(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    email: str


class TickPoint(BaseModel):
    t: str
    p: float


class CandlePoint(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float


class IndicatorPoint(BaseModel):
    time: str
    value: float


class DashboardResponse(BaseModel):
    status: str
    daily_pnl: float
    daily_change_percent: float = 0
    daily_change_value: float = 0
    asset: str | None = None
    price_status: str = "live"
    position_qty: float = 0
    avg_entry_price: float = 0
    timeframe: str | None = None
    ma_short_period: int | None = None
    ma_long_period: int | None = None
    chart: list[CandlePoint]
    ma_short_series: list[IndicatorPoint] = []
    ma_long_series: list[IndicatorPoint] = []


class StrategyConfigIn(BaseModel):
    asset: str = Field(..., examples=["PETR4"])
    timeframe: str = Field(..., examples=["5M", "15M", "1H", "1D"])
    ma_short_period: int = Field(9, ge=1)
    ma_long_period: int = Field(21, ge=2)


class StrategyConfigOut(StrategyConfigIn):
    id: str
    updated_at: datetime


class BacktestMetrics(BaseModel):
    total_return: float
    win_rate: float
    max_drawdown: float
    sharpe_ratio: float
    insight_summary: str | None = None
    insight_tone: str = "neutral"


class SimulationMethod(str, Enum):
    bootstrap = "bootstrap"
    gbm = "gbm"
    block_bootstrap = "block_bootstrap"
    importance_sampling = "importance_sampling"


class MonteCarloMetrics(BaseModel):
    var_95: float          # Value at Risk 95%
    cvar_95: float         # Conditional VaR (Expected Shortfall)
    probability_of_ruin: float  # Probabilidade de falência/ruína
    median_final_equity: float
    best_case_equity: float   # P95
    worst_case_equity: float  # P5
    is_ruin_variance: float | None = None
    is_effective_sample_size: float | None = None


class MonteCarloResponse(BaseModel):
    metrics: MonteCarloMetrics
    fan_chart: dict[str, list[float]]  # {"p5": [...], "p25": [...], ...}
    simulations_run: int


class BacktestResponse(BaseModel):
    period_label: str
    metrics: BacktestMetrics
    equity_curve: list[float]
    equity_dates: list[str] = []
    price_chart: list[CandlePoint] = []
    ma_short_series: list[IndicatorPoint] = []
    ma_long_series: list[IndicatorPoint] = []
    monte_carlo: MonteCarloResponse | None = None


class BacktestRunIn(BaseModel):
    period_label: str = "6 Months"
    asset: str | None = None


class MonteCarloRunIn(BaseModel):
    n_simulations: int = Field(1000, ge=10, le=10000)
    n_days: int = Field(252, ge=10, le=1000)
    method: SimulationMethod = SimulationMethod.bootstrap
    block_size: int | None = Field(default=None, ge=2, le=100)
    is_tilt: float | None = Field(default=None)
    asset: str | None = None
    period_label: str = "6 Months"



class AssetUniverseOut(BaseModel):
    b3: list[str]
    crypto: list[str]
    all: list[str]


class LogIn(BaseModel):
    level: str
    message: str
    details: dict[str, Any] | None = None


class LogOut(BaseModel):
    id: int
    user_id: str | None = None
    level: str
    message: str
    details: dict[str, Any] | None = None
    created_at: datetime


class SettingsIn(BaseModel):
    api_key: str | None = None
    api_secret: str | None = None
    exchange_name: str = "binance"
    trade_mode: TradeModeEnum = TradeModeEnum.paper
    paper_trading: bool
    dark_mode: bool
    simulated_balance: float | None = Field(default=None, gt=0)


class SettingsOut(BaseModel):
    api_key_masked: str | None = None
    api_secret_masked: str | None = None
    exchange_name: str = "binance"
    trade_mode: TradeModeEnum = TradeModeEnum.paper
    paper_trading: bool
    dark_mode: bool
    simulated_balance: float
    updated_at: datetime


class PaperOrderIn(BaseModel):
    asset: str
    price: float
    quantity: float = Field(..., gt=0)


class PaperOrderOut(BaseModel):
    id: int
    side: str
    asset: str
    price: float
    quantity: float
    status: str
    created_at: datetime


class PaperStateResponse(BaseModel):
    balance: float
    focus_asset: str
    current_price: float
    price_status: str = "live"
    floating_pnl: float
    floating_pnl_percent: float = 0
    invested_capital: float = 0
    open_position_asset: str | None
    open_position_qty: float
    avg_entry_price: float
    insight_title: str | None = None
    insight_message: str | None = None
    insight_tone: str = "neutral"
    recent_orders: list[PaperOrderOut]

