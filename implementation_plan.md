# Implementation Plan — Moody

> Plataforma de Swing Trade com Análise Quantitativa e Simulações de Monte Carlo

## 1. Cleanup Azure Remnants
**Priority:** High | **Effort:** 1h

- [ ] Excluir 23 GitHub deployments do ambiente `production` legado via API
- [ ] Remover 4 secrets Azure do repositório (`AZURE_CLIENT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_TENANT_ID`, `AZURE_ENV_NAME`)
- [ ] Deletar environment `production` legado
- [ ] Remover diretório `mobile/` residual e `.expo/`

## 2. Merge feature/removeExpo → main
**Priority:** High | **Effort:** 30min

- [ ] `git checkout main && git merge feature/removeExpo`
- [ ] Resolver conflitos (se aplicável)
- [ ] Push para `origin/main`

## 3. Oracle VPS Deploy Infrastructure
**Priority:** High | **Effort:** 4h

- [ ] Criar `scripts/setup-vps.sh` (provisionamento: Docker, UFW, swap)
- [ ] Criar `Caddyfile` (reverse proxy com SSL automático)
- [ ] Criar `docker-compose.prod.yml` (Caddy na stack de produção)
- [ ] Criar `.env.prod.example` (template de variáveis de produção)
- [ ] Criar `.github/workflows/deploy-vps.yml` (deploy automático via SSH)

## 4. Fix Dockerfile for Frontend Build
**Priority:** High | **Effort:** 2h

- [ ] Multi-stage build no `backend/Dockerfile`:
  - Stage 1: `node:18` → instalar dependências e buildar React
  - Stage 2: `python:3.12-slim` → copiar static files para `app_web/`
- [ ] Testar local com `docker compose up --build`

## 5. Frontend Tests & CI Expansion
**Priority:** Medium | **Effort:** 3h

- [ ] Adicionar testes unitários para `LiveChart`, `FanChart`, `MetricCard`, `Layout`
- [ ] Adicionar teste de integração dos componentes
- [ ] Expandir CI para incluir `npm test` no diretório `web/`
- [ ] Adicionar linting (ESLint) ao CI

## 6. Post-Deploy Validation
**Priority:** Medium | **Effort:** 1h

- [ ] Verificar health check na VPS
- [ ] Testar fluxo completo: login → dashboard → paper trade → backtest → monte carlo
- [ ] Verificar WebSocket funcionando via Caddy

---

## Dependências

```
1 → 2 → 3 → 6
  ↘ 4 ↗
5 → (paralelo a 3 e 4)
```
