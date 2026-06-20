# Simulação Estocástica — Moody Trading Bot

## 1. Visão Geral

O motor de simulação Monte Carlo do Moody está em
[`backend/app/services_montecarlo.py`](../backend/app/services_montecarlo.py).
Ele projeta **N caminhos futuros** de uma curva de equity (proveniente de um
backtest) para estimar:

- **Value at Risk (VaR 95%)** — perda máxima esperada com 95% de confiança.
- **Conditional Value at Risk (CVaR 95%)** — perda média nos piores 5% dos
  cenários.
- **Probabilidade de ruína** — chance de o capital cair abaixo de um limiar.
- **Fan chart** — percentis (P5, P25, P50, P75, P95) em cada passo futuro,
  usados para visualização de incerteza.

A metodologia atual é **bootstrap resampling** (não-paramétrica): sorteia com
reposição dos retornos históricos observados, sem assumir distribuição teórica.

---

## 2. Metodologia Atual: Bootstrap Resampling

### 2.1 Cálculo dos Retornos

Dada uma curva de equity observada $P_0, P_1, \dots, P_T$, os retornos
diários são:

$$
r_t = \frac{P_t}{P_{t-1}} - 1, \quad t = 1, \dots, T
$$

Se $P_{t-1} \leq 0$, o retorno é omitido. Se não houver retornos válidos,
usa-se $r_t = 0$.

**Implementação:** `services_montecarlo.py:47-51`

```python
returns = []
for i in range(1, len(equity_curve)):
    prev = equity_curve[i - 1]
    if prev > 0:
        returns.append((equity_curve[i] / prev) - 1.0)
```

---

### 2.2 Geração de Caminhos Sintéticos

Para cada simulação $s = 1, \dots, N$ e cada passo futuro $t = 1, \dots, D$:

$$
\tilde{P}^{(s)}_0 = P_0
$$

$$
\tilde{P}^{(s)}_{t} = \tilde{P}^{(s)}_{t-1} \cdot \bigl(1 + \tilde{r}^{(s)}_t\bigr)
$$

onde

$$
\tilde{r}^{(s)}_t \sim \text{Uniform}(\{r_1, r_2, \dots, r_T\})
$$

ou seja, cada retorno simulado é amostrado **com reposição** do conjunto de
retornos históricos. Este é um bootstrap i.i.d. — não preserva correlação
serial.

Se o equity ficar negativo, é truncado em zero:

$$
\tilde{P}^{(s)}_t = \max\bigl(0,\; \tilde{P}^{(s)}_t\bigr)
$$

**Implementação:** `services_montecarlo.py:64-73`

```python
for sim in range(n_simulations):
    current_equity = initial_capital
    for step in range(1, n_days):
        ret = random.choice(returns)
        current_equity = current_equity * (1.0 + ret)
        if current_equity < 0:
            current_equity = 0.0
        paths[sim, step] = current_equity
```

---

### 2.3 Detecção de Ruína

Considera-se que a simulação $s$ "ruinou" se em algum passo $t \leq D$ o
equity cai abaixo de uma fração $\theta$ do capital inicial:

$$
\text{Ruined}^{(s)} = \mathbb{1}\Bigl(\exists\, t \leq D : \tilde{P}^{(s)}_t < P_0 \cdot \theta\Bigr)
$$

O limiar padrão é $\theta = 0.5$ (50% do capital inicial).

**Implementação:** `services_montecarlo.py:75-77`

```python
if current_equity < (initial_capital * ruin_threshold_pct):
    ruined = True
```

---

### 2.4 Probabilidade de Ruína

A probabilidade de ruína é a fração de caminhos que atingiram ruína:

$$
P_{\text{ruin}} = \frac{1}{N} \sum_{s=1}^{N} \mathbb{1}\{\text{Ruined}^{(s)}\}
$$

Retornada como percentual (0–100%).

**Implementação:** `services_montecarlo.py:110`

```python
"probability_of_ruin": float(ruin_count / n_simulations * 100.0)
```

---

### 2.5 Value at Risk (VaR 95%)

Seja o retorno final de cada simulação:

$$
R^{(s)} = \frac{\tilde{P}^{(s)}_D}{P_0} - 1, \quad s = 1, \dots, N
$$

O VaR 95% é o negativo do percentil de ordem 5% dos retornos finais:

$$
\text{VaR}_{95\%} = -\text{Percentil}\bigl(\{R^{(s)}\}_{s=1}^N,\; 5\%\bigr)
$$

O valor é retornado como percentual positivo (ex.: $2.5$ significa 2.5% de
perda máxima esperada).

**Implementação:** `services_montecarlo.py:93-97`

```python
final_returns = [eq / initial_capital - 1.0 for eq in all_final_equities]
final_returns.sort()
idx_5pct = max(1, int(len(final_returns) * 0.05))
var_95 = -final_returns[idx_5pct - 1]
```

---

### 2.6 Conditional Value at Risk (CVaR 95%)

O CVaR 95% é a média dos retornos nos piores 5% (a cauda além do VaR):

$$
\text{CVaR}_{95\%} = -\frac{1}{\lfloor 0.05 N \rfloor} \sum_{s \in \mathcal{L}} R^{(s)}
$$

onde $\mathcal{L}$ é o conjunto dos $\lfloor 0.05 N \rfloor$ piores retornos.

**Implementação:** `services_montecarlo.py:99-100`

```python
lower_returns = final_returns[:idx_5pct]
cvar_95 = -sum(lower_returns) / len(lower_returns)
```

---

### 2.7 Fan Chart (Percentis)

Para cada passo $t = 1, \dots, D$ e cada nível de confiança
$k \in \{0.05, 0.25, 0.50, 0.75, 0.95\}$:

$$
p_k(t) = \text{Percentil}\bigl(\{\tilde{P}^{(1)}_t, \tilde{P}^{(2)}_t, \dots, \tilde{P}^{(N)}_t\},\; k \times 100\bigr)
$$

Isso produz 5 curvas (P5, P25, P50, P75, P95) que formam o leque de incerteza
visualizado no frontend (`FanChart.tsx`).

**Implementação:** `services_montecarlo.py:84-90`

```python
fan_chart = {}
for cl in confidence_levels:
    percentile_values = []
    for step in range(n_days):
        val = np.percentile(paths[:, step], cl * 100)
        percentile_values.append(float(val))
    fan_chart[f"p{int(cl*100)}"] = percentile_values
```

---

### 2.8 Sharpe Ratio (Backtest)

Calculado em [`services_backtest.py`](../backend/app/services_backtest.py) a
partir dos retornos diários da curva de equity do backtest:

$$
\text{Sharpe} = \frac{\bar{r}}{\sigma_r} \times \sqrt{252}
$$

onde $\bar{r}$ é a média dos retornos diários, $\sigma_r$ é o desvio padrão
amostral, e $\sqrt{252}$ anualiza o índice (dias úteis por ano).

**Implementação:** `services_backtest.py:88`

```python
sharpe = 0.0 if std == 0 or pd.isna(std) else float((returns.mean() / std) * (252 ** 0.5))
```

---

### 2.9 Maximum Drawdown (Backtest)

Maior queda da curva de equity em relação ao pico anterior:

$$
\text{Max DD} = \min_{t} \left(\frac{P_t}{\max_{s \leq t} P_s} - 1\right) \times 100\%
$$

**Implementação:** `services_backtest.py:82`

```python
drawdown = (equity / peak) - 1.0
max_drawdown = float(drawdown.min() * 100.0)
```

---

## 3. Metodologias Alternativas

### 3.1 Importance Sampling (IS)

**Quando usar:** eventos raros (ex.: ruína com $\theta$ baixo). O bootstrap
padrão exige muitas simulações para estimar $P_{\text{ruin}}$ com precisão
quando a ruína é improvável. O IS **muda a distribuição de amostragem** para
gerar mais eventos de ruína, depois corrige o viés com pesos.

#### Formulação

Seja $f$ a densidade original dos retornos e $g$ uma densidade alternativa
(que favorece retornos negativos). Queremos estimar:

$$
p = \mathbb{E}_f[\mathbf{1}_{A}(X)] = \int \mathbf{1}_{A}(x) f(x) \, dx
$$

onde $A = \{\text{ruína ocorre}\}$. Reescrevendo sob $g$:

$$
p = \int \mathbf{1}_{A}(x) \frac{f(x)}{g(x)} g(x) \, dx = \mathbb{E}_g[\mathbf{1}_{A}(X) w(X)]
$$

onde $w(x) = f(x)/g(x)$ é o **peso de verossimilhança** (likelihood ratio).

O estimador IS é:

$$
\hat{p}_{IS} = \frac{1}{N} \sum_{s=1}^{N} \mathbf{1}_{A}(X^{(s)}) w(X^{(s)}), \quad X^{(s)} \sim g
$$

#### Variância do Estimador IS

$$
\mathrm{Var}_g(\hat{p}_{IS}) = \frac{1}{N}\Bigl(\mathbb{E}_g[\mathbf{1}_{A}(X) w(X)^2] - p^2\Bigr)
$$

Expandindo:

$$
\mathrm{Var}_g(\hat{p}_{IS}) = \frac{1}{N}\left(\int \mathbf{1}_{A}(x) \frac{f(x)^2}{g(x)} \, dx - p^2\right)
$$

A variância será menor que a do MC ingênuo se $g$ for escolhida de modo que
$g(x)$ seja grande onde $\mathbf{1}_{A}(x) f(x)$ é grande — ou seja,
concentrar amostras na região de ruína.

#### Escolha de $g$ no contexto de ruína

Uma abordagem prática é **deslocar a média** dos retornos para negativa:

$$
g(r) = \mathcal{N}(\mu - \delta, \sigma^2), \quad \delta > 0
$$

ou usar **exponential tilting**:

$$
g(r) \propto e^{\theta r} f(r)
$$

O parâmetro $\theta$ controla a magnitude da mudança. Quanto maior $|\theta|$,
mais amostras na cauda, mas maior a variância dos pesos $w$.

#### Trade-offs

| Aspecto | Bootstrap Padrão | Importance Sampling |
|---------|-----------------|-------------------|
| Precisão para eventos raros | Requer $N$ muito grande | Eficiente com $N$ moderado |
| Complexidade | Simples | Requer escolha de $g$ |
| Risco | — | Se $g$ for mal escolhida, variância explode (pesos instáveis) |
| Generalidade | Qualquer distribuição empírica | Requer densidades conhecidas |

---

### 3.2 Geometric Brownian Motion (GBM)

**Quando usar:** quando se quer uma hipótese paramétrica explícita sobre a
dinâmica dos preços, útil para cenários hipotéticos ou stress testing.

#### Formulação

Assume-se que o preço (ou equity) segue:

$$
dP_t = \mu P_t \, dt + \sigma P_t \, dW_t
$$

cuja solução discreta (Euler–Maruyama) para simulação é:

$$
\tilde{P}_{t} = \tilde{P}_{t-1} \cdot \exp\left(\left(\mu - \frac{\sigma^2}{2}\right)\Delta t + \sigma \sqrt{\Delta t} \, Z_t\right)
$$

onde $Z_t \sim \mathcal{N}(0,1)$, $\mu$ é o drift estimado, $\sigma$ é a
volatilidade, e $\Delta t = 1/252$ para dados diários.

#### Estimação dos parâmetros

- $\mu = \bar{r} \times 252$ (média anualizada dos retornos diários)
- $\sigma = \sigma_r \times \sqrt{252}$ (volatilidade anualizada)

#### Diferenças para o bootstrap

| Aspecto | Bootstrap | GBM |
|---------|-----------|-----|
| Distribuição | Empírica (não-paramétrica) | Lognormal |
| Correlação serial | Ignorada (i.i.d.) | Ignorada (i.i.d.) |
| Caudas | Limitadas aos dados observados | Gaussianas (sub-estimam caudas pesadas) |
| Cenários extremos | Só se ocorreram nos dados | Podem ser gerados syntheticamente |
| Estimação de parâmetros | Nenhuma | Sensível a $\mu$ e $\sigma$ |

---

### 3.3 Block Bootstrap

**Quando usar:** quando há correlação serial nos retornos (o que é comum em
séries financeiras). O bootstrap i.i.d. destrói a dependência temporal.

#### Formulação

Em vez de amostrar retornos individuais, amostra-se **blocos** consecutivos de
retornos com reposição. Dado um bloco de tamanho $L$:

1. Define-se $B$ blocos sobrepostos de tamanho $L$ da série original.
2. Amostra-se $\lceil D / L \rceil$ blocos com reposição.
3. Concatena-se os blocos e trunca-se em $D$ passos.

#### Diferenças para o bootstrap i.i.d.

| Aspecto | Bootstrap i.i.d. | Block Bootstrap |
|---------|-----------------|-----------------|
| Correlação serial | Ignorada | Preservada dentro dos blocos |
| Tamanho do bloco $L$ | N/A | $L$ deve ser estimado (ex.: $L \approx T^{1/3}$) |
| Viés | Não-viesado | Levemente viesado (fronteiras dos blocos) |

---

### 3.4 Tabela Comparativa Geral

| Método | Assume distribuição? | Preserva autocorrelação? | Caudas pesadas? | Complexidade |
|--------|---------------------|--------------------------|-----------------|-------------|
| Bootstrap i.i.d. (atual) | Não (empírica) | Não | Sim (se nos dados) | Muito baixa |
| Block Bootstrap | Não (empírica) | Sim (dentro do bloco) | Sim (se nos dados) | Baixa |
| GBM | Lognormal | Não | Não | Média |
| Importance Sampling | Depende de $g$ | Não | Controlável via $g$ | Alta |
| GARCH | Condicionalmente normal | Sim | Sim (com inovações t-Student) | Alta |

---

## 4. Parâmetros da Simulação

| Parâmetro | Tipo | Default | Intervalo | Descrição |
|-----------|------|---------|-----------|-----------|
| `n_simulations` | `int` | 1000 | [10, 10000] | Número de caminhos simulados ($N$) |
| `n_days` | `int` | 252 | [10, 1000] | Passos futuros projetados ($D$) |
| `confidence_levels` | `list[float]` | [0.05, 0.25, 0.50, 0.75, 0.95] | (0, 1) | Percentis do fan chart |
| `ruin_threshold_pct` | `float` | 0.5 | (0, 1) | Fração do capital inicial para ruína ($\theta$) |

**Fonte da curva de equity:** gerada pelo backtest MA crossover em
[`services_backtest.py`](../backend/app/services_backtest.py) e passada para
`run_monte_carlo_simulation()` em
[`core_unified.py`](../backend/app/core_unified.py).

---

## 5. Validação e Testes

Os testes estão em [`backend/tests/test_montecarlo.py`](../backend/tests/test_montecarlo.py):

- **`test_monte_carlo_simulation_with_empty_or_short_equity_curve`** —
  verifica comportamento com lista vazia ou 1 elemento (caminho estático).
- **`test_monte_carlo_simulation_metrics`** — com curva de equity crescente,
  confirma que a mediana > capital inicial, best case $\geq$ mediana $\geq$
  worst case, e que o fan chart tem 5 curvas com $D$ pontos cada.
- **`test_monte_carlo_api_endpoint`** — teste de integração via endpoint REST.

Limitações dos testes atuais:
- Não verificam se VaR e CVaR são numericamente razoáveis.
- Não testam com séries que têm retornos negativos.
- Não testam a probabilidade de ruína com cenários conhecidos.

---

## 6. Referências

1. Efron, B. & Tibshirani, R. (1993). *An Introduction to the Bootstrap*.
   Chapman & Hall.
2. Glasserman, P. (2003). *Monte Carlo Methods in Financial Engineering*.
   Springer. — Cap. 4 (Variance Reduction), Cap. 6 (Importance Sampling).
3. Hull, J. (2018). *Options, Futures, and Other Derivatives*. Pearson.
4. Künsch, H. R. (1989). "The Jackknife and the Bootstrap for General
   Stationary Observations". *The Annals of Statistics*.
5. Rubinstein, R. Y. & Kroese, D. P. (2016). *Simulation and the Monte Carlo
   Method*. Wiley.

---

*Documentação gerada para auditoria das fórmulas matemáticas do motor de
simulação estocástica do Moody Trading Bot.*
