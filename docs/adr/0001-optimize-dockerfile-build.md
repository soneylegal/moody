# ADR-0001: Otimização do Dockerfile para builds mais leves e cache efetivo

- **Status:** Accepted
- **Date:** 2025-07-09
- **Deciders:** engenharia
- **Tags:** docker, build, performance, devex

## Contexto

O `backend/Dockerfile` atual (multi-stage, 22 linhas) produzia imagens
funcionais para `backend`, `celery_worker` e `celery_beat` (via
`docker-compose.yml`), porém o build era desnecessariamente pesado e lento em
rebuilds incrementais. Este ADR documenta as correções aplicadas.

### Problemas identificados

1. **Imagem base do frontend superdimensionada**
   `FROM node:18` carrega ~900MB de toolchain C++, PostgreSQL embutido, OpenSSL
   e bibliotecas de sistema que não são necessárias para um
   `react-scripts build`. Existe alternativa Alpine oficialmente mantida.

2. **Cache de layer de dependências Python inválido a cada mudança em `app/`** (culprit principal)
   A linha 15 executava `pip install .`, acionando o build-backend
   `setuptools.build_meta` configurado em `pyproject.toml`
   (`[tool.setuptools.packages.find]` com `include = ["app*"]`).
   Como o `setuptools` precisa do código-fonte presente, `app/` era copiado
   **antes** da instalação — invalidando o cache de toda a camada de deps
   (pandas, numpy, ccxt, OpenTelemetry, etc., ~150-200MB) sempre que qualquer
   arquivo em `app/` mudava. Era o maior culprit do rebuild lento.

3. **Ausência de cache mounts do BuildKit**
   Tanto `npm ci` quanto o `pip install` não usavam `--mount=type=cache`,
   perdendo a oportunidade de reutilizar downloads entre builds quando o
   cache de layer é invalidado.

4. **Dependências pesadas confirmadas em runtime do backend**
   Investigação via `grep` em `backend/app/`: `services_bot.py` importa
   `pandas`, `services_exchange.py` importa `ccxt` (e `yfinance` via
   `importlib.import_module`), `services_montecarlo.py` importa `numpy` —
   todos transitivamente importados por `app/main.py`
   (`from app.services_bot import bot_automation_loop`,
   `from app.services_exchange import ExchangeService`) ou pela rota
   `backtest.py` (`from app.services_montecarlo import run_monte_carlo_simulation`).
   Logo, **não é possível segregar essas libs para uma imagem de worker** —
   elas devem permanecer na imagem do serviço uvicorn.

5. **Imagem base Python**
   `python:3.12-slim` é ~150MB e é a escolha correta. Migrar para Alpine **não**
   é viável porque pandas/numpy/ccxt/psycopg não publicam wheels `musllinux`;
   forçaria compilação a partir do fonte (libc musl incompatível), tornando o
   build ainda mais lento.

6. **Observações neutras**
   - `backend/build/lib/` (artefato de build do setuptools) já é excluído pelo
     `.dockerignore` da raiz (linha 16). ✅
   - `backend/.dockerignore` era inerte porque o contexto de build
     (`docker-compose.yml`: `context: .`) é a raiz do repo. Conservado para
     não quebrar fluxos isolados do backend.
   - `.dockerignore` da raiz já estava completo.

### Estatísticas medidas (antes)
- `web/node_modules`: 420MB (rebaixado a cada rebuild de frontend sem cache)
- `backend/app`: 456KB (pequeno, mas invalidava cache gigante)
- Imagem final estimada: ~450MB (dominada por pandas/numpy/ccxt)

## Drivers de Decisão

- **Tempo de rebuild incremental** (alterações em `app/` devem ser rápidas)
- **Tempo de primeiro build** (menos crítico, mas qualidade de vida no CI)
- **Tamanho da imagem final** (idealmente menor, mas não a custo de quebrar)
- **Determinismo e reprodutibilidade** do build
- **Manutenibilidade** do Dockerfile

## Opções Consideradas

### Opção A — Manter pip, adicionar cache mounts + reorganização
Reorganizar para instalar deps **antes** de copiar `app/`, usando
`pip install --no-deps .` ao final.

- ✅ Sem dependência extra (`uv`)
- ✅ Cache de layer funcionando
- ❌ `pip` é 10-100x mais lento que `uv` no primeiro build
- ❌ Cache de wheel entre builds limitado ao layer cache

### Opção B — Gerar `requirements.txt` versionado (pip-compile)
Importar versões pinadas e instalar com `pip install -r`.

- ✅ Determinismo máximo
- ✅ Cache de layer ótimo
- ❌ Mantém um arquivo derivado sincronizado com `pyproject.toml`
- ❌ Ainda usa `pip` (lento)

### Opção C — Adotar `uv` (Astral) + cache mounts + separação deps/pacote-local ⭐ ESCOLHIDA
Instalar `uv` na imagem, usar `uv export` para resolver deps a partir do
`pyproject.toml`, instalar deps com `uv pip install --system -r`, e por fim
instalar o pacote local com `uv pip install --system --no-deps .`.

- ✅ Instalação 10-100x mais rápida (Rust, caches em disco eficientes)
- ✅ Cache de layer inválido **só** quando `pyproject.toml` muda
- ✅ `pyproject.toml` permanece a fonte única da verdade (não gera lockfile versionado)
- ✅ Cache mount `--mount=type=cache,target=/root/.cache/uv` para reuso entre builds
- ⚠️ Adiciona ~15MB à imagem final (binário `uv` estático)
- ⚠️ `uv` é relativamente novo (mantido pela Astral, adotado amplamente em 2024-2025)

## Decisão

Adotar a **Opção C**: refatorar `backend/Dockerfile` com:

1. **Diretiva de syntax** `# syntax=docker/dockerfile:1.7` no topo para
   habilitar cache mounts e parser moderno.

2. **Stage `frontend-build`** com `FROM node:18-alpine`, `NODE_ENV=production`
   e cache mount `--mount=type=cache,target=/root/.npm` no `npm ci`.

3. **Stage `backend`** mantendo `python:3.12-slim`, porém:
   - Instalar `uv` via `pip install --no-cache-dir uv`
   - Copiar **somente** `backend/pyproject.toml`
   - Resolver e instalar deps via
     `uv export --no-dev --no-hashes -o requirements.txt && uv pip install --system -r requirements.txt`
     com `--mount=type=cache,target=/root/.cache/uv`
   - Copiar `backend/app`
   - Instalar só o pacote local: `uv pip install --system --no-deps .`
   - Copiar artefato do frontend (`COPY --from=frontend-build`)

4. **Manutenção** do `HEALTHCHECK` e do `CMD` atuais.

### Estrutura resultante do `backend/Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1.7

# Stage 1: Frontend build (React SPA via Create React App)
FROM node:18-alpine AS frontend-build
WORKDIR /app
ENV NODE_ENV=production

COPY web/package*.json ./web/
RUN --mount=type=cache,target=/root/.npm \
    cd web && npm ci --cache /root/.npm

COPY web/ ./web/
RUN cd web && npm run build

# Stage 2: Backend (FastAPI + Celery + static frontend served by StaticFiles)
FROM python:3.12-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy
WORKDIR /app

RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv export --no-dev --no-hashes -o requirements.txt && \
    uv pip install --system -r requirements.txt

COPY backend/app ./app
RUN uv pip install --system --no-deps .

COPY --from=frontend-build /app/web/build ./app_web

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

5. **Sem alterações** em `docker-compose.yml`, `.dockerignore`, `pyproject.toml`
   ou `package.json`. O `backend/.dockerignore` inerte foi conservado
   (conservadorismo — não quebra fluxos locais isolados do backend).

## Consequências

### Positivas

- **Rebuild incremental dramático**: alterações em `app/*.py` não rebaixam
  pandas/numpy/ccxt (~150-200MB, ~2-4min economizados por rebuild).
- **Stage de frontend ~85% menor**: `node:18-alpine` (~150MB) vs `node:18`
  (~1GB), reduzindo pull de imagem no CI em builders sem cache de base.
- **Cache de `npm`** persiste entre builds via mount, cortando ~30-60s
  da reinstalação dos 420MB de `node_modules` quando o cache de layer cai.
- **Cache de `uv`** persiste entre builds via mount, cortando download de
  wheels quando cache de layer cai.
- **Fonte única da verdade**: `pyproject.toml` continua definindo todas as
  deps; não há deriva com `requirements.txt` versionado
  (ele é gerado efêmero no build).

### Negativas / Trade-offs

- **+~15MB na imagem final** pelo binário estático do `uv` (aceitável vs
  o ganho de velocidade). Pode ser removido com uma stage `uv` separada
  que copia apenas o necessário — deixado como otimização futura.
- **Dependência tecnológica em `uv`/Astral**: ferramenta jovem (2024),
  porém amplamente adotada (pip, poetry, pip-tools em grande parte
  compatíveis). Risco mitigado por `uv export` + fallback trivialmente
  voltável a pip.
- **Exige BuildKit** (`DOCKER_BUILDKIT=1`) — já padrão no Docker 20.10+
  e único motor no Docker Desktop/CE moderno. Risco de regressão nulo
  para o fluxo atual (`.github/workflows/deploy-vps.yml` já usa
  `docker compose up --build`).

### Neutras

- Tamanho da imagem final permanece ~450MB (dominado por
  pandas/numpy/ccxt — únicos e necessários em runtime, ver investigação
  no Contexto).
- A arquitetura de três serviços (`backend`, `celery_worker`,
  `celery_beat`) compartilha a mesma imagem via `target: backend`, o que
  permanece válido.

### Métricas de sucesso

| Métrica | Antes | Alvo |
|---|---|---|
| Rebuild incremental (mudança em `app/*.py`) | ~3-5 min | <30s |
| Rebuild do frontend (mudança em `web/src/`) | ~1-2 min | 20-40s |
| Pull de imagem base no CI (cold cache) | ~1GB (node) + 150MB (python) | ~300MB |
| Imagem final | ~450MB | ~465MB (aceitável) |

## Alternativas Futuras (fora de escopo)

- **Migrar frontend de Create React App para Vite**: reduziria
  `node_modules` de 420MB para ~120MB e build de ~40s para ~5s. Refatoração
  grande, candidata a ADR próprio.
- **Versionar `uv.lock`**: traria determinismo total da árvore de deps.
  Requer fluxo de `uv lock` em PRs. Avaliar em ADR separado.
- **Slim image final com multi-stage de `uv`**: copiar só wheels instalados
  para a imagem final, removendo o binário `uv`. Reduziria ~15-20MB.
- **Imagem de worker Celery separada**: descartado porque deps pesadas são
  importadas por `app/main.py` (path do serviço uvicorn), não há
  segregação possível sem refatoração de código.

## Referências

- `backend/Dockerfile` (_estado anterior_, 22 linhas)
- `backend/pyproject.toml` (deps com pandas, numpy, ccxt, otel)
- `docker-compose.yml` (targets `backend` para os 3 serviços)
- `.dockerignore` (raiz, já completo)
- Documentação `uv`: https://docs.astral.sh/uv/
- BuildKit cache mounts: https://docs.docker.com/build/cache/optimize/
- ADR template (Michael Nygard): https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
