# ADR-0002: Stack Tecnológica Atual do Moody

- **Status:** Accepted
- **Date:** 2025-07-09
- **Deciders:** engenharia
- **Tags:** architecture, stack, decisions, retrospective

## Contexto

O Moody evoluiu por vários estágios — iniciou como app Expo mobile + backend
Azure + Render, passou por cleanup (`feature/removeExpo`, "cleanup Azure
artifacts", "remove Render artifacts") e hoje roda como monorepo full-stack
deployado em Oracle Cloud Free Tier. Esta é uma **ADR retrospectiva**:
documenta as decisões que já estão materializadas no código (não escolhas a
fazer), para servir de referência futura e baseline de comparação para ADRs
subsequentes (ex.: ADR-0001 de otimização do Dockerfile).

A motivação para formalizar a stack como ADR:

- Consolidar commits de evolução arquitetural (`e3310c1` → `2fc5627`) num
  único registro de decisões
- Expor pressupostos implícitos e divergências entre docs e código (corrigidas
  no mesmo commit deste ADR)
- Servir de input para revisões futuras (migrações, refactors, deprecations)

### Estado atual (auditoria no commit `2fc5627`)

**Branches vivas:**
- `main` (produção, deployada para Oracle VPS via `deploy-vps.yml`)
- `fix/ci-and-deprecations` (em curso)
- `remotes/origin/feat/stochastic-methods`, `feature/migrationInfra`,
  `feature/removeExpo` (históricos)

**Histórico recente** mostra migrações sucessivas:

```
2fc5627 fix(docker): .dockerignore + healthcheck
9ed7ae8 test(frontend): testes integração App.tsx + CI
a5b3b7d test(frontend): testes unitários componentes React
90beb3d fix(backend): warnings deprec
b716b75 cleanup Render, swap badge Oracle
e099375 add Oracle VPS deploy infra
8668cde move Redis para services
ece54c3 cleanup Azure, Render, Dockerfile, CI
ca32ff5 Merge #4 removeExpo
f307df3 docs: rewrite README enterprise
1b5d6d0 build: docker-compose com Redis e Celery
4314e01 feat: implement Celery app tasks
e3310c1 feat: read spot price from Redis
be0910b feat: REDIS_URL
19dada1 build: add redis e celery deps
2b4fc28 feat: App router e protected routes
a6e3c4d feat: Backtesting + Monte Carlo
bc056f4 feat: MA Crossover Strategy page
23c959a feat: Paper Trading Dashboard
058f93a feat: Login e Register
```

### Mapeamento de dependências (auditado via `grep`/`read`, não auto-relatado)

**Backend — importações confirmadas** (todas em `pyproject.toml` e vistas em
código):

- `fastapi` ≥0.116.1, `uvicorn[standard]==0.35.0` (main.py, routers) ✅
- `pydantic` v2 (schemas.py — `from pydantic import BaseModel, Field`) ✅
- `SQLAlchemy` 2.0.41 (models.py usa `Mapped`, `mapped_column` — estilo 2.0) ✅
- `psycopg[binary]==3.3.3` (driver da connection `postgresql+psycopg://`) ✅
- `python-dotenv` (config.py — `load_dotenv`) ✅
- `PyJWT==2.10.1` (security.py — `import jwt`) ✅
- `pandas` + `numpy` (services_* — confirmado em ADR-0001) ✅
- `ccxt==4.4.95` (services_exchange.py) ✅
- `yfinance==0.2.54` — **USADO via `importlib.import_module("yfinance")`**
  em `services_exchange.py:21` (import lazy, não aparece em `import yfinance`
  direto no topo) ✅
- `redis≥5.0.1` (implícito via Celery + URL em config)
- `celery≥5.4.0` (tasks.py — `from celery import Celery`) ✅
- `cryptography≥44.0.0` (models.py — `from cryptography.fernet import Fernet`,
  `EncryptedString` TypeDecorator) ✅
- OpenTelemetry (5 packages — telemetry.py — `instrumentation-fastapi`,
  `instrumentation-sqlalchemy`, `exporter-otlp-proto-http`) ✅

**Frontend — importações confirmadas** (todas em `package.json` e vistas em
código):

- `react@^19.2.7` + `react-dom@^19.2.7` (todos os `.tsx`) ✅
- `react-router-dom@^6.30.4` (App.tsx, Layout.tsx, Login.tsx, Register.tsx —
  `BrowserRouter`, `Routes`, `Link`, `useNavigate`, `useLocation`) ✅
- `lightweight-charts@^5.2.0` (LiveChart.tsx) ✅
- `recharts@^3.8.1` (FanChart.tsx — Monte Carlo fan) ✅
- `lucide-react@^1.17.0` (ícones, presumido em Layout/pages)
- `typescript@^4.9.5` (typecheck via `tsc --noEmit`) ✅
- `react-scripts@5.0.1` (Create React App — bundler) ✅
- `tailwindcss@^3.4.17` + `postcss@^8.5.15` + `autoprefixer` ✅

**Testes — framework no frontend:**
- Jest (via `react-scripts`)
- Testing Library (`@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `@testing-library/dom`)
- Mocks manuais para `lightweight-charts` e `fancy-canvas`
  (`jest.moduleNameMapper`)

**Testes — framework no backend:**
- `pytest` ≥8.0 (`[project.optional-dependencies].dev`)
- `httpx==0.28.1` (cliente HTTP para testes de integração FastAPI)
- `pytest-cov` (coverage)

### Inconsistências docs vs código (drift) — corrigidas neste commit

| Item | README antes | Código (source) | Ação |
|---|---|---|---|
| **Hashing de senha** | `bcrypt` (tabela Segurança + Mermaid) | `hashlib.pbkdf2_hmac("sha256", salt, 120_000)` em `security.py:12` | ✅ Corrigido para PBKDF2-SHA256 |
| **Versão React** | `React 18` (badge + tabela) | `react@^19.2.7` em `package.json` | ✅ Corrigido para React 19 |
| **Versão FastAPI** | `FastAPI 0.115` (badge) | `fastapi>=0.116.1` em `pyproject.toml` | ✅ Corrigido para 0.116 |
| **Versão TypeScript** | `TypeScript 5` (badge) | `typescript@^4.9.5` | ✅ Corrigido para 4.9 |
| **CORS default** | docs não mencionam | `config.py:52` referenciava `localhost:19006` (Expo legacy) | ✅ Corrigido para `localhost:8000,localhost:3000` |

### Observação metodológica

A investigação inicial de `yfinance` (via `grep` de `^import yfinance|^from
yfinance` no topo dos arquivos) retornou zero hits, sugerindo dependência
morta — um alerta falso. Re-auditoria com `grep "yfinance"` (sem ancora de
início de linha) confirma uso via `importlib.import_module("yfinance")` em
`services_exchange.py:21` (import lazy, com circuit breaker dedicado
`yfinance_breaker`). **yfinance é dependência viva**, usada como fallback de
market data.

## Drivers de Stack (passados, inferidos das decisões)

- **Baixa latência de mercado** (price cache sub-ms em Redis) → motivação
  para Redis mesmo com PostgreSQL já presente
- **Processamento assíncrono desacoplado** (request/response ≠ análise de
  estratégia) → motivação para Celery + Redis como broker
- **Análise quantitativa** (backtesting, Monte Carlo) → justifica pandas +
  numpy mesmo com custo de imagem Docker (ver ADR-0001)
- **Integração multi-exchange** abstrata → ccxt (vs hardcoded por exchange)
- **Compile-time type safety em ambas as pontas** → TypeScript no front;
  Pydantic v2 + SQLAlchemy 2 typed no back
- **Free Tier Oracle Cloud como hard constraint** (Ampere A1 4 vCPU / 24GB)
  → escolha minimalista de serviços mantidos oficialmente
- **Resiliência não-negociável** (sistema de trading) → circuit breaker +
  chaos toolkit + fault injection middleware
- **Fail-fast em produção** (não dar boot inseguro) → `sys.exit(1)` em
  missing secrets
- **Observabilidade custo-benefício** → OpenTelemetry opt-in
  (`OTEL_ENABLED=false` default), exporter OTLP/HTTP

## Stack Atual (no commit `2fc5627`)

Visão consolidada por camada:

### Frontend (web/)

| Camada | Tecnologia | Versão (lockfile) | Confirmado em |
|---|---|---|---|
| UI Runtime | React | `^19.2.7` | App.tsx, páginas, componentes |
| Tipagem | TypeScript | `^4.9.5` | tsconfig.json, typecheck na CI |
| Build/Bundler | Create React App (`react-scripts`) | `5.0.1` | package.json (`react-scripts eject` disponível) |
| Roteamento | react-router-dom | `^6.30.4` | App.tsx (`BrowserRouter`), Layout/Login/Register |
| Estilos | TailwindCSS + PostCSS + Autoprefixer | `^3.4.17` | tailwind.config.js, postcss.config.js |
| Gráficos Candlestick | Lightweight Charts | `^5.2.0` | LiveChart.tsx, mocks Jest |
| Gráficos Estatísticos | Recharts | `^3.8.1` | FanChart.tsx (Monte Carlo fan) |
| Ícones | lucide-react | `^1.17.0` | presumido em Layout/pages |
| PWA metrics | web-vitals | `^2.1.4` | CRA default |
| Testes unitários | Jest (CRA) | builtin | `npm test` |
| Testes componente | Testing Library | `^16.3.2` (react) | *.test.tsx |
| Testes E2E | Faltando | — | (não há Cypress/Playwright) ❌ |

### Backend (backend/)

| Camada | Tecnologia | Versão | Confirmado em |
|---|---|---|---|
| Runtime | Python | `>=3.12` (requirement), `3.12-slim` (Docker) | pyproject.toml, Dockerfile |
| Web Framework | FastAPI | `>=0.116.1,<1.0.0` | main.py, routers/ |
| ASGI Server | uvicorn[standard] | `==0.35.0` | CMD Dockerfile, docker-compose.yml |
| Validação | Pydantic | `>=2.12.0,<3.0.0` | schemas.py |
| ORM | SQLAlchemy 2.0 (typed) | `==2.0.41` | models.py (`Mapped`, `mapped_column`) |
| DB Driver | psycopg[binary] v3 | `==3.3.3` | connection string `postgresql+psycopg://` |
| Config env | python-dotenv | `==1.1.1` | config.py |
| Auth/JWT | PyJWT (HS256) | `==2.10.1` | security.py (`import jwt`) |
| Password Hashing | **PBKDF2-SHA256** (hashlib stdlib) | n/a | security.py:12, 120k rounds |
| Field Encryption | cryptography (Fernet) | `>=44.0.0` | models.py (EncryptedString TypeDecorator) |
| Dataframes | pandas | `==2.2.3` | services_bot, services_backtest |
| Numérico | numpy | `==2.2.6` | services_montecarlo |
| Exchange Client | ccxt | `==4.4.95` | services_exchange |
| Market data (alt) | yfinance | `0.2.54` | services_exchange.py:21 (import lazy via `importlib`) |
| Broker/Queue | Celery | `>=5.4.0` | tasks.py (`from celery import Celery`) |
| Cache/Redis client | redis | `>=5.0.1` | implícito (URL em config, usado pelo Celery) |
| Observabilidade | OpenTelemetry SDK | `>=1.25` + 4 instrumentações | telemetry.py |
| Testes | pytest + httpx + pytest-cov | `>=8.0`, `==0.28.1` | tests/, CI |
| Build System | setuptools ≥61 | wheel | pyproject.toml `[build-system]` |

### Infraestrutura

| Camada | Tecnologia | Versão / Detalhe |
|---|---|---|
| Container Orchestration | Docker Compose | 5 serviços (dev), 6 em prod (+Caddy) |
| Database | PostgreSQL | `postgres:16` (compose) |
| Cache/Queue | Redis | `redis:7-alpine` (compose) |
| Reverse Proxy / TLS | Caddy 2 (Alpine) | auto-SSL via ACME, `Caddyfile` |
| CI | GitHub Actions (2 workflows) | `ci.yml` (lint+test+coverage), `deploy-vps.yml` (SSH-based) |
| Deploy strategy | SSH + `appleboy/ssh-action` | git pull + `docker compose up --build` na VPS |
| Target infra | Oracle Cloud Free Tier | Ampere A1 (4 vCPU / 24GB) Ubuntu 24.04 |
| Chaos Engineering | Chaos Toolkit (3 experimentos YAML) | `chaos/*.yaml` — API down, DB timeout, Exchange unavailable |
| Resilience Pattern | Circuit Breaker (custom) | `circuit_breaker.py` |
| Fault Middleware | FastAPI middleware opt-in (`FAULT_INJECTION_ENABLED`) | `middleware_fault.py` |

### Serviços nas composições

**`docker-compose.yml` (dev):**
- `postgres` (porta :5432, healthcheck pg_isready)
- `redis` (porta :6379)
- `backend` (uvicorn :8000, depende de postgres healthy + redis started)
- `celery_worker` (`celery -A app.tasks worker`, mesma imagem via `target: backend`)
- `celery_beat` (`celery -A app.tasks beat`, mesma imagem)

**`docker-compose.prod.yml` (overlay):**
- `caddy` (porta 80/443, `Caddyfile` montado, volumes `caddy_data`/`caddy_config`)

**Schema DB (`db/schema.sql`):** bootstrap via
`docker-entrypoint-initdb.d/schema.sql` para `postgres` container. Schema
runtime também pelo `apply_runtime_migrations()` (`db.py`) em paralelo.

### OpenTelemetry (detalhe)

- `opentelemetry-api`, `opentelemetry-sdk` ≥1.25
- Instrumentações específicas: `instrumentation-fastapi`,
  `instrumentation-sqlalchemy` ≥0.46b0
- Exporter: `exporter-otlp-proto-http` ≥1.25 (HTTP/protobuf, não gRPC)
- Gated por `OTEL_ENABLED=false` default → observabilidade opt-in;
  pressuposto: economizar overhead em ambientes pequenos

## Decisões Implícitas Documentadas (D-001 a D-017)

### D-001 — React SPA com CRA em TypeScript
**Status:** Active
**Decisão:** Frontend é SPA servida estática pelo próprio FastAPI
(`StaticFiles` mount em `main.py:155`) em produção; CRA 5.0.1 em dev com
hot reload.
**Rationale:** Simplicidade (1 imagem Docker total); CRA era bundler padrão
em 2021-2023; TypeScript habilitado desde início.
**Trade-offs:**
- `node_modules`: 420MB em build (lado mais caro do pipeline Docker — ver ADR-0001)
- CRA está em maintenance mode (sem major updates); community migrando para Vite
- Sem SSR (SEO irrelevante para app autenticado de trading)
**Cost:** Build Docker frontend stage historicamente ~1GB na imagem base
`node:18` — corrigido no ADR-0001 para `node:18-alpine` (~150MB).

### D-002 — FastAPI + Uvicorn (async)
**Status:** Active
**Decisão:** API em FastAPI, single uvicorn worker (sem Gunicorn no frente).
**Rationale:** WebSocket nativo; tipagem Pydantic v2; docs OpenAPI automáticas;
escolha mainstream Python async pós-2020.
**Trade-offs:**
- Uvicorn single worker pode ser gargalo em CPU-bound (Monte Carlo, backtest)
  — mitigado por Celery offload
- Warm-up de pool e padrões de reconexão precisam de cuidado
**Cost:** Adequado para atual escala.

### D-003 — SQLAlchemy 2.0 typed + psycopg v3
**Status:** Active
**Decisão:** ORM estilo 2.0 (`Mapped`, `mapped_column`); driver
psycopg[binary] v3 (não psycopg2).
**Rationale:** Tipagem PEP 484 no ORM; psycopg v3 é mais novo e nativamente
compatível com SQLAlchemy 2; binary wheel evita build de dependências.
**Trade-offs:**
- Custom `EncryptedString(TypeDecorator)` (Fernet) acoplado ao SQLAlchemy —
  menos portátil
- `apply_runtime_migrations()` DIY no boot (sem Alembic) — dívida técnica
  para migração de schema
**Cost:** Nenhuma para mantenedores familiarizados com SQLAlchemy 2.

### D-004 — PBKDF2-SHA256 (hashlib) para hashing de senhas
**Status:** Active
**Decisão:** Implementação própria com
`hashlib.pbkdf2_hmac("sha256", salt-hex, 120_000 rounds)` em `security.py:12`;
formato armazenado `pbkdf2_sha256$<salt_hex>$<digest_hex>`.
**Rationale:** Zero deps de segurança externa; PBKDF2 é OWASP-approved com
120k rounds.
**Trade-offs:**
- Divergia do README (dizia "bcrypt") — **corrigido neste commit**.
- Argon2id é OWASP-preferred agora (mais resistente a GPU); bcrypt também
  superior
- Sem upgrade path para Argon2 hoje (verificador suporta só formato
  `pbkdf2_sha256$`)
**Cost:** Migração futura para Argon2id exigirá hash rehash-on-login strategy.

### D-005 — PyJWT HS256 em vez de EdDSA/RS256
**Status:** Active
**Decisão:** JWT assinado com HMAC-SHA256 usando segredo único compartilhado
(`JWT_SECRET_KEY`).
**Rationale:** Simples; single service; sem keypair management.
**Trade-offs:**
- Sem verificação de key pair pública em distribution; rotação de secret
  exige invalidar todos tokens
- Nível de segurança adequado para single-domain; HS256 é suficiente para
  atual scale
- Defaults seguros configurados (`JWT_EXPIRE_MINUTES=120`/access 2h,
  refresh 7d)
**Cost:** Migração para RS256 exigiria JWKS endpoint se multi-domain futura.

### D-006 — Fernet (symmetric) para encryption at rest
**Status:** Active
**Decisão:** API keys de exchange encriptadas em DB via
`EncryptedString(TypeDecorator)` sobre Fernet (`cryptography>=44.0.0`).
**Rationale:** Symmetric, segredo único, mesmo processo; Fernet válido como
AES-CBC + HMAC authenticated.
**Trade-offs:**
- Sem envelope encryption (KMS-managed) — inadequado para escala
  multi-tenant enterprise
- Rotação de `FIELD_ENCRYPTION_KEY` exige re-encrypt em lote — sem tooling
  atual
**Cost:** Aceitável para VPS single-tenant.

### D-007 — Redis dual-role (cache + Celery broker)
**Status:** Active
**Decisão:** Instância Redis única serve como (a) price cache sub-ms
(`spot:price:BTCUSDT`) e (b) Celery broker. Sem Redis Cluster, Sentinel ou
split cache/broker.
**Rationale:** Operacional simples; Free Tier tem memory limitada; um
container Redis `7-alpine`.
**Trade-offs:**
- Sem separação de falha entre cache flash e queue; um Redis down paralisa
  ambas
- Price cache atual não tem TTL/eviction configurada — pressupõe baixa
  cardinalidade de assets
**Cost:** Aceitável para single-VPS.

### D-008 — Celery com worker + beat separados
**Status:** Active
**Decisão:** 2 containers: `celery_worker` (`-A app.tasks worker`) e
`celery_beat` (`-A app.tasks beat`); mesma imagem Docker (target `backend`).
**Rationale:** Beat deve rodar único; Worker escala horizontalmente;
separação de concerns entre agendamento e execução.
**Trade-offs:**
- Beat sem HA (single point failure scheduler) — ok para atual scale
- Worker e Backend compartilham imagem → `app/` mudanças impactam worker
  (celery não usa `app/main.py`, mas configuração de postgres reconnect
  pode divergir)
**Cost:** Manutenção 1 imagem para 3 serviços.

### D-009 — Multi-stage Docker build com CRA → static copiada para FastAPI
**Status:** Active (otimizado em ADR-0001)
**Decisão:** Stage `frontend-build` (Node) compila React → `web/build` copiado
como `app_web` para final Python image; FastAPI serve via `StaticFiles` na
raiz `/`.
**Rationale:** Elimina necessidade de nginx ou serviço Node runtime em prod;
uma imagem serve API + UI.
**Trade-offs:**
- Imagem de backend ~450MB por causa pandas/numpy/ccxt (deps pesadas
  necessárias em runtime, ver ADR-0001)
- Cache de build frágil historicamente — **resolvido em ADR-0001**
- `StaticFiles` mount não detecta index.html replacement sem rebuild
  (CDN future would help)
**Cost:** Build Docker otimizado no ADR-0001.

### D-010 — Oracle Cloud VPS + Docker Compose (sem K8s)
**Status:** Active
**Decisão:** Deploy direto via SSH + compose; sem Kubernetes, sem PaaS.
**Rationale:** Free Tier Ampere A1 4 vCPU/24GB cobre toda stack com folga;
custo zero; simplicidade operacional.
**Trade-offs:**
- Sem rolling deploy (downtime breve em `docker compose up --build`)
- Sem auto-scaling/health self-heal além de `restart: unless-stopped`
- CI via SSH-only (GitHub `appleboy/ssh-action`) — logging de deploy no
  GitHub UI é limitado
**Cost:** Adequado para single-tenant; pré-prod exigiria deploys dedicados.

### D-011 — CI com PostgreSQL service container + pytest + httpx
**Status:** Active
**Decisão:** Workflow `ci.yml` provisiona Postgres 16 como service
(test:test); backend roda `pytest --cov=app`; frontend roda
`npm test/lint/typecheck` em paralelo.
**Rationale:** Testes de integração exigem DB real (SQLAlchemy + migrations
no boot); httpx coaduna com FastAPI TestClient; matrix paralela acelera.
**Trade-offs:**
- Sem testes E2E em browser (sem Cypress/Playwright) — frontend só tem unit
  + App.test.tsx de integração
- Sem screenshots de UI, sem Lighthouse
- Sem testes de carga (k6, Locust) apesar de ser trading
- Sem secrets management além de GitHub Actions secrets
  (`JWT_SECRET_KEY` como GH secret — ainda preciso em CI)
**Cost:** Pipeline estável mas coverage aquém da real cobertura desejável
para trading.

### D-012 — OpenTelemetry opt-in (default off)
**Status:** Active
**Decisão:** Instrumentação OTel no código (`telemetry.py` + 2
instrumentações) **disabled** via `OTEL_ENABLED=false` default; exporter
OTLP/HTTP.
**Rationale:** Free Tier sem coletador OTel provisionado; overhead
não-justificado em dev; opt-in permite ligar em prod real sem redeploys.
**Trade-offs:**
- "Observabilidade" no README é mais aspiracional que operativo
  (default off)
- Sem métricas custom explicitadas; sem Prometheus endpoint (apenas
  traces OTLP)
**Cost:** Ligar OTel em prod real exige deploy de `otel-collector` ou
Tempo/Jaeger (não provisionado na VPS ainda).

### D-013 — Circuit Breaker custom + Chaos Toolkit custom YAMLs
**Status:** Active
**Decisão:** Implementação própria em `circuit_breaker.py`
(open/closed/half-open com thresholds); 3 experimentos Chaos Toolkit em
`chaos/*.yaml`.
**Rationale:** Isolar dependência externa (ccxt + DB + yfinance) com
degradação graceful; validar resiliência em produção com experimentos
reprodutíveis.
**Trade-offs:**
- CB custom vs `tenacity`/`pybreaker` — reimplementation; menos auditado
- Chaos Toolkit experimentos não correm automaticamente em CI/CD (apenas
  docs)
**Cost:** Manutenção custom supervisionada.

### D-014 — `fail-fast` startup em missing secrets
**Status:** Active
**Decisão:** `config.py` chama `sys.exit(1)` em runtime se
`JWT_SECRET_KEY` ausente OU igual a `"change-me-in-production"`; igualmente
rígido para `FIELD_ENCRYPTION_KEY`.
**Rationale:** Impedir deploys inseguros por configuration drift.
**Trade-offs:**
- App pode "crash loop" na VPS sem mensagem útil se deploy env vars missing
- `.env` na VPS gerado manualmente (fragilidade humana; uploaded via SCP)
**Cost:** Risco de deployment downtime por erro de config.

### D-015 — `apply_runtime_migrations()` DIY em vez de Alembic
**Status:** Active (dívida técnica)
**Decisão:** No boot (`main.py:25`) chama `apply_runtime_migrations()` em
`db.py`, execução via `text("CREATE TABLE IF NOT EXISTS ...")`.
**Rationale:** Sem overhead de Alembic; evolve ad hoc com pequenas migrations.
**Trade-offs:**
- ⚠️ Dívida técnica; sem histórico de schema realmente versionado (aplicação
  idempotente com `IF NOT EXISTS`)
- Sem rollback; sem downgrade
- `db/schema.sql` (bootstrap init) diverge de migrations de runtime — dois
  schemas para lembrar
**Cost:** Reescrever tudo para Alembic é médio (1-2 dias engineer).

### D-016 — Caddy 2 com auto-SSL em prod
**Status:** Active
**Decisão:** `docker-compose.prod.yml` adiciona Caddy; `Caddyfile` default
placeholder `moody.example.com` (usuário substitui).
**Rationale:** ACME/Let's Encrypt automático; config minimal; binary único
estaticamente ligado.
**Trade-offs:**
- Sem TLS secrets/múltiplos certificados tooling adicional (apenas 1 domínio
  p/ caso)
- Rate limit por ACME pode bloquear em restarts frequentes
  (`docker compose down/up`)
- Caddy data/config persistente em volumes dedicados ✅
**Cost:** Adequado.

### D-017 — Branches vivas e fluxo de PR
**Status:** Active
**Decisão:** Branching leve estilo GitHub flow: `main` → PRs de
`feature/*`; `fix/*`; merges squash/merge.
**Trade-offs:**
- Branches `feat/stochastic-methods`, `feature/migrationInfra`,
  `feature/removeExpo` ainda vivas no `origin` (legacy cleanup pendente)
**Cost:** Limpeza de branches é tarefa operacional pendente.

---

## Trade-offs Consolidados da Stack Atual

### Pontos Fortes

1. **Single deployable image** para API + UI (1 container serve estáticos +
   API + WebSocket; Celery Worker e Beat compartilham imagem via
   `target: backend`) — simplicidade operacional drinkável para VPS
2. **Type safety ponta-a-ponta** (TS front + Pydantic v2 + SQLAlchemy 2.0
   typed)
3. **Resiliência como cidadão de primeira classe** (Circuit Breaker, Fault
   Middleware, Chaos Toolkit, fail-fast startup)
4. **Async onde importa** (uvicorn ASGI para WebSocket, Celery offload para
   análise de estratégia)
5. **Security defaults seguros** (fail-fast mandatory secrets, Fernet for
   API keys, JWT reasonable expiry, CORS whitelist)
6. **Free Tier Oracle compatível** (sem K8s overhead, sem deployment
   platforms adicionais)
7. **OpenTelemetry disponível** (instrumentado, opt-in, pathway pronto
   para ligar)

### Pontos Fracos / Dívidas

1. **CRA legacy** → 420MB node_modules + build lento (+ maintenance mode);
   Vite seria ~10x menor (candidato a ADR futuro)
2. **PBKDF2 sem Argon2id** → ainda OWAP-valid mas inferior a Argon2id
3. **DIY migrations em `apply_runtime_migrations`** → sem Alembic, sem
   versionamento real; risco quando schema evolui
4. **OpenTelemetry opt-in e desligado** → "observabilidade" no README é
   mais aspiracional que garantida
5. **Sem testes E2E** → frontend coverage apenas até component level
6. **Drift docs vs código** (5 itens) — **corrigidos neste commit**:
   React 18→19, FastAPI 0.115→0.116, TS 5→4.9, bcrypt→PBKDF2,
   CORS default `localhost:19006`→`localhost:8000,3000`
7. **CI sem secrets fallback** → CI quebra se `JWT_SECRET_KEY` GH secret
   faltar (testes que precisam de app boot)
8. **Chaos Toolkit experimentos não automatizados** → só correm manualmente
9. **DB naming inconsistência**: `swingbot` (dev compose) vs `moody`
   (`.env.prod.example`)
10. **Single uvicorn worker** → CPU-bound em in-process (pandas MC no
    request) aparece em produção (`/montecarlo/simulate`); mitigado por
    Celery offload parcial mas não completo

## Consequências

### Positivas

- Stack madura, estável, com documentação vasta externa (FastAPI +
  SQLAlchemy 2 + React 19 + PostgreSQL)
- Complexidade ciclomática baixa por usar frameworks bem denominados
- Dockerfile único para todos serviços → baixo overhead operacional
- Pathway claro para escalar horizontalmente (multiple uvicorn workers via
  Gunicorn) se carga crescer
- Multi-exchange abstrato via ccxt — extensível para novo venue sem refactor

### Negativas

- Dívidas documentadas acima (CRA, migrations DIY, OTel default off)
- CI sem testes em browser (fragilidade para regressão visual)
- `apply_runtime_migrations` DIY é ponto único de maiores dívidas técnicas

### Neutras

- A diagonal "simplicidade vs escalabilidade" resolve-se sempre a favor de
  simplicidade (adequado para single-VPS Free Tier); qualquer migração
  para multi-tenant exigirá revisit (K8s, Alembic, OTel default-on,
  Argon2)

## ADRs Futuros Sugeridos (não-blockers)

- **ADR-0001** (aceito neste commit): otimizar Dockerfile
- **ADR-0003**: migrar `apply_runtime_migrations()` → Alembic
- **ADR-0004**: migrar CRA → Vite (frontend build 10x mais veloz)
- **ADR-0005**: adicionar Argon2id em vez de PBKDF2 (hash rehash on login)
- **ADR-0006**: OpenTelemetry default-on + provisionar collector na VPS
- **ADR-0007**: testes E2E com Playwright
- **ADR-0008**: multi-worker uvicorn (Gunicorn) para escalar requests
  CPU-bound
- **ADR-0009**: branch cleanup (`feat/stochastic-methods`,
  `feature/migrationInfra`, `feature/removeExpo` legacy)

## Referências

- Commit base: `2fc5627` (HEAD do `main`)
- `README.md` (após correções de drift deste commit)
- `backend/pyproject.toml` — lockfile de deps
- `web/package.json` + `package-lock.json`
- `docker-compose.yml` + `docker-compose.prod.yml`
- `.github/workflows/ci.yml` + `deploy-vps.yml`
- `backend/app/config.py`, `backend/app/security.py`, `backend/app/models.py`
  (decisões D-004/D-005/D-006)
- ADR-0001 (aceito) — ponto de referência para otimização de Dockerfile
- ADR template (Michael Nygard):
  https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
