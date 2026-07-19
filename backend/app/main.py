import asyncio
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from app.config import API_TITLE, API_VERSION, CORS_ORIGINS
from app.security import decode_access_token
from app.core_unified import ensure_seed_admin
from app.db import Base, SessionLocal, apply_runtime_migrations, engine
from app.limiter import limiter
from app.routers import auth, backtest, dashboard, logs, paper, settings, strategy
from app.services_bot import bot_automation_loop
from app.services_stream import manager, market_stream_loop

app = FastAPI(title=API_TITLE, version=API_VERSION)

# Initialize OpenTelemetry instrumentation (no-op when OTEL_ENABLED=false)
from app.telemetry import init_telemetry
init_telemetry(app)

_bg_stop_event: asyncio.Event | None = None
_bg_tasks: list[asyncio.Task] = []
_startup_ready = False
_startup_error: str | None = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter

from app.config import FAULT_INJECTION_ENABLED
if FAULT_INJECTION_ENABLED:
    from app.middleware_fault import FaultInjectionMiddleware
    app.add_middleware(FaultInjectionMiddleware)



@app.on_event("startup")
async def on_startup():
    global _bg_stop_event, _bg_tasks, _startup_ready, _startup_error

    def _initialize_sync() -> None:
        Base.metadata.create_all(bind=engine)
        apply_runtime_migrations()
        db = SessionLocal()
        try:
            ensure_seed_admin(db)
        finally:
            db.close()

    try:
        # Avoid blocking container startup forever if database/network is slow.
        await asyncio.wait_for(asyncio.to_thread(_initialize_sync), timeout=90)
        _startup_ready = True
        _startup_error = None
    except Exception as exc:
        _startup_ready = False
        _startup_error = f"startup initialization failed: {exc}"
        print(_startup_error)

    _bg_stop_event = asyncio.Event()
    _bg_tasks = [
        asyncio.create_task(market_stream_loop(_bg_stop_event), name="market-stream-loop"),
        asyncio.create_task(bot_automation_loop(_bg_stop_event), name="bot-automation-loop"),
    ]


@app.on_event("shutdown")
async def on_shutdown():
    global _bg_stop_event, _bg_tasks, _startup_ready, _startup_error
    if _bg_stop_event:
        _bg_stop_event.set()
    for task in _bg_tasks:
        task.cancel()
    if _bg_tasks:
        await asyncio.gather(*_bg_tasks, return_exceptions=True)
    _bg_tasks = []
    _bg_stop_event = None
    _startup_ready = False
    _startup_error = None

@app.get("/health")
def health():
    return {
        "ok": True,
        "startup_ready": _startup_ready,
        "startup_error": _startup_error,
    }


def _get_token_from_ws(websocket: WebSocket) -> str | None:
    return websocket.query_params.get("token")


@app.websocket("/ws/market/{asset}")
async def market_ws(websocket: WebSocket, asset: str):
    token = _get_token_from_ws(websocket)
    if not token:
        await websocket.close(code=4401, reason="Token de autenticação não fornecido")
        return

    try:
        payload = decode_access_token(token)
        if payload.get("type", "access") != "access":
            raise ValueError("invalid token type")
    except Exception:
        await websocket.close(code=4401, reason="Token inválido ou expirado")
        return

    origin = (websocket.headers.get("origin") or "").lower()
    if origin and origin not in {o.lower() for o in CORS_ORIGINS}:
        await websocket.close(code=1008, reason="Origin não permitido")
        return

    asset = asset.upper()

    connected = await manager.connect(asset, websocket)
    if not connected:
        return

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            op = data.get("op") if isinstance(data, dict) else None
            if op == "ping":
                await websocket.send_json({"op": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(asset, websocket)
    except Exception:
        manager.disconnect(asset, websocket)


app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(strategy.router)
app.include_router(backtest.router)
app.include_router(logs.router)
app.include_router(settings.router)
app.include_router(paper.router)

_web_dir = Path(__file__).resolve().parent.parent / "app_web"
if (_web_dir / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(_web_dir), html=True), name="web-ui")
