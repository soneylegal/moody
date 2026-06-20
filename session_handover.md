# Session Handover — Stochastic Simulation Methods

## O que foi feito

### 1. Documentação das Fórmulas

Criado [`docs/stochastic_simulation.md`](docs/stochastic_simulation.md) com:
- Todas as fórmulas do bootstrap atual (retornos, geração de caminhos, ruína, VaR, CVaR, percentis, Sharpe, Max DD)
- Dedução da variância do estimador IS: $\mathrm{Var}_g(\hat{p}_{IS}) = \frac{1}{N}(\mathbb{E}_g[\mathbf{1}_A(X)w(X)^2] - p^2)$
- Comparação com GBM, Block Bootstrap
- Tabela comparativa dos 4 métodos
- Referências (Glasserman, Efron, Hull)

### 2. Código Implementado

**Motor de Simulação** — `backend/app/services_montecarlo.py`
- Refatorado de função única para: `run_monte_carlo_simulation()` (dispatcher) + geradores especializados + `_compute_metrics()` compartilhado
- `_generate_paths_bootstrap()` — mesmo algoritmo anterior (extraído)
- `_generate_paths_gbm()` — Euler–Maruyama: drift/vol anualizados, `np.random.default_rng()`
- `_generate_paths_block_bootstrap()` — blocos contíguos, default L = T^(1/3)
- `_generate_paths_is()` — exponential tilting, retorna `(paths, path_weights)`, likelihood ratio acumulado por caminho
- `_compute_metrics()` — suporta `path_weights` opcional; quando presente calcula ruína ponderada + `is_ruin_variance` + `is_effective_sample_size`

**Schemas** — `backend/app/schemas.py`
- `SimulationMethod` enum (`bootstrap`, `gbm`, `block_bootstrap`, `importance_sampling`)
- `MonteCarloRunIn`: novos campos `method`, `block_size`, `is_tilt`
- `MonteCarloMetrics`: novos campos opcionais `is_ruin_variance`, `is_effective_sample_size`

**Router** — `backend/app/routers/backtest.py`
- Rota `/backtest/montecarlo` agora passa `method`, `block_size`, `is_tilt` para o motor

**Frontend** — `web/src/pages/Backtest.tsx`
- Seletor de método (dropdown com 4 opções)
- Descrição textual de cada método
- Parâmetros `method`, `block_size`, `is_tilt` enviados no body da requisição

**Testes** — `backend/tests/test_montecarlo.py` (10 testes, +7 novos)
- `test_gbm_paths_distribution`, `test_gbm_with_negative_returns`
- `test_block_bootstrap_runs`, `test_block_bootstrap_custom_block_size`
- `test_importance_sampling_runs`, `test_importance_sampling_is_diagnostics`
- `test_all_methods_return_same_structure` (consistência entre métodos)

### 3. Branch

Branch: `feat/stochastic-methods` (enviada ao GitHub)

Commits (5 no total):
| # | Hash | Descrição |
|---|------|-----------|
| 1 | `16b270f` | Refactor MC engine + GBM + Block Bootstrap + IS |
| 2 | `c2b7cd8` | Testes para os 3 novos métodos |
| 3 | `527edb1` | Seletor de método no frontend |
| 4 | `2e3cdbc` | Documentação das fórmulas |
| 5 | `0607bb2` | README atualizado |

### 4. Limitações Conhecidas

- **IS weight degeneracy**: Para D > ~50 passos, o produto dos likelihood ratios ao longo do caminho pode gerar pesos com alta variância. O `is_effective_sample_size` no response indica quando isso ocorre (ESS baixo = degenerado).
- **GBM assume normalidade**: Caudas mais leves que a distribuição empírica em ativos financeiros reais.
- **Block Bootstrap**: Tamanho do bloco fixo (default ou manual); não usa seleção automática por critério tipo LSCV.

### 5. Próximos Passos Sugeridos

- Abrir PR de `feat/stochastic-methods` para `main`
- Adicionar controles específicos no frontend para `block_size` e `is_tilt`
- Mostrar `is_ruin_variance` e `is_effective_sample_size` no card de métricas do IS
- Considerar seed fixa para reprodutibilidade (`np.random.default_rng(seed)`)
