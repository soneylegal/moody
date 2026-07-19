from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone

from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.config import MARKET_STREAM_INTERVAL_SECONDS
from app.db import SessionLocal
from app.models import AppSettings, BotStatus, MarketTick
from app.services_exchange import ExchangeService


class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = {}
        self.close_requests: set[str] = set()
        self.ip_connections: dict[str, set[WebSocket]] = {}
        self.MAX_PER_ASSET = 100
        self.MAX_PER_IP_PER_ASSET = 5
        self.MAX_PER_IP_TOTAL = 20

    @staticmethod
    def _client_ip(websocket: WebSocket) -> str:
        xff = websocket.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
        if websocket.client:
            return websocket.client[0]
        return "unknown"

    async def connect(self, asset: str, websocket: WebSocket) -> bool:
        """Try to accept a WebSocket connection. Returns True on success, False if capped."""
        client_ip = self._client_ip(websocket)

        if len(self.connections.get(asset, set())) >= self.MAX_PER_ASSET:
            await websocket.close(code=1013, reason="Limite de conexões por ativo atingido")
            return False

        ip_asset_count = sum(
            1 for ws in self.connections.get(asset, set())
            if self._client_ip(ws) == client_ip
        )
        if ip_asset_count >= self.MAX_PER_IP_PER_ASSET:
            await websocket.close(code=1013, reason="Limite de conexões por IP/ativo atingido")
            return False

        if len(self.ip_connections.get(client_ip, set())) >= self.MAX_PER_IP_TOTAL:
            await websocket.close(code=1013, reason="Limite total de conexões por IP atingido")
            return False

        await websocket.accept()
        self.connections.setdefault(asset, set()).add(websocket)
        self.ip_connections.setdefault(client_ip, set()).add(websocket)
        return True

    def disconnect(self, asset: str, websocket: WebSocket):
        if asset in self.connections and websocket in self.connections[asset]:
            self.connections[asset].remove(websocket)
        client_ip = self._client_ip(websocket)
        if client_ip in self.ip_connections and websocket in self.ip_connections[client_ip]:
            self.ip_connections[client_ip].remove(websocket)

    async def broadcast(self, asset: str, payload: dict):
        peers = list(self.connections.get(asset, set()))
        for ws in peers:
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(asset, ws)

    def request_close_asset(self, asset: str):
        self.close_requests.add(asset.upper())

    async def process_close_requests(self):
        if not self.close_requests:
            return
        pending = list(self.close_requests)
        self.close_requests.clear()
        for asset in pending:
            peers = list(self.connections.get(asset, set()))
            for ws in peers:
                try:
                    await ws.close(code=1012, reason="Asset atualizado")
                except Exception:
                    pass
                finally:
                    self.disconnect(asset, ws)


manager = ConnectionManager()


def _current_asset(db: Session) -> str:
    status = db.query(BotStatus).first()
    return (status.current_asset if status else None) or "PETR4"


def _insert_tick(db: Session, asset: str, price: float) -> MarketTick:
    tick = MarketTick(asset=asset, price=price, volume=random.uniform(500, 5000), tick_at=datetime.now(timezone.utc))
    db.add(tick)
    db.commit()
    db.refresh(tick)
    return tick


def _next_price(db: Session, asset: str) -> float:
    settings = db.query(AppSettings).first()
    live_price = None
    if settings:
        service = ExchangeService(settings)
        # usa fonte apropriada por ativo para evitar mistura BRL/USD
        live_price = service.fetch_spot_price(asset, cache_ttl_seconds=10)

    if live_price and live_price > 0:
        return live_price

    last = db.query(MarketTick).filter(MarketTick.asset == asset).order_by(MarketTick.tick_at.desc()).first()
    base = float(last.price) if last else 25.0
    return max(0.1, base + random.uniform(-0.35, 0.45))


def _market_stream_iteration_sync() -> tuple[str, dict] | None:
    db = SessionLocal()
    try:
        asset = _current_asset(db)
        price = _next_price(db, asset)
        tick = _insert_tick(db, asset, price)
        return (
            asset,
            {
                "asset": asset,
                "price": float(tick.price),
                "volume": float(tick.volume),
                "tick_at": tick.tick_at.isoformat(),
            },
        )
    except Exception:
        return None
    finally:
        db.close()


async def market_stream_loop(stop_event: asyncio.Event):
    while not stop_event.is_set():
        try:
            await manager.process_close_requests()
            result = await asyncio.to_thread(_market_stream_iteration_sync)
            if result is not None:
                asset, payload = result
                await manager.broadcast(asset, payload)
        except Exception:
            # protege loop de stream contra queda total do processo
            pass

        await asyncio.sleep(MARKET_STREAM_INTERVAL_SECONDS)
