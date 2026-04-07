#!/usr/bin/env python3
"""
pool_yield_calc.py — Calculadora de Rendimento de Pools de Liquidez (V3)
=========================================================================
Espelha a lógica do PoolYieldCalculator.tsx com saída rica no terminal.

Uso rápido:
  python3 scripts/pool_yield_calc.py --initial 1000 --yield 45.50 --period 30

Uso interativo (sem argumentos):
  python3 scripts/pool_yield_calc.py

Uso batch (arquivo JSON):
  python3 scripts/pool_yield_calc.py --batch scripts/exemplos.json

Flags:
  --initial FLOAT    Valor inicial investido (USD)
  --yield FLOAT      Rendimento acumulado (USD)
  --period INT       Duração do período
  --unit {days,weeks}  Unidade do período (padrão: days)
  --gas FLOAT        Taxas de rede pagas (USD, padrão: 0)
  --il FLOAT         Impermanent Loss estimado (%, padrão: 0)
  --pool-name STR    Nome da pool (para log)
  --system-apr FLOAT APR anual do sistema para comparação (%)
  --batch FILE       Arquivo JSON com lista de cenários
  --json             Saída em JSON (para integração com outros scripts)
  --save FILE        Salva resultado em JSON neste arquivo
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

# ─── Benchmarks de mercado (% ao mês) ────────────────────────────────────────
CDI_MONTHLY = 0.90    # CDI Brasil ~0.9%/mês (2025)
SP500_MONTHLY = 0.80  # S&P500 ~0.8%/mês (média histórica)

# ─── Tipos ───────────────────────────────────────────────────────────────────

@dataclass
class YieldInput:
    initial: float         # Valor inicial (USD)
    yield_amount: float    # Rendimento acumulado (USD)
    period: int            # Duração
    unit: str              # 'days' | 'weeks'
    gas_fees: float = 0.0  # Taxas de rede (USD)
    il_pct: float = 0.0    # Impermanent Loss (%)
    pool_name: str = "Pool"
    system_apr: Optional[float] = None  # APR anual do sistema (%)

@dataclass
class YieldResult:
    # ── Identificação ──────────────────────────────────────────
    pool_name: str
    date: str

    # ── Inputs ─────────────────────────────────────────────────
    initial: float
    yield_amount: float
    period_days: int
    gas_cost: float
    il_cost: float
    il_pct: float

    # ── Cálculos ────────────────────────────────────────────────
    total_profit_pct: float    # Lucro bruto total (%)
    monthly_apr: float         # APR mensal bruto (%)
    annual_apy: float          # APY anual composto (%)
    simple_apy: float          # APY simples anual (%)

    # ── Líquido ─────────────────────────────────────────────────
    net_yield: float           # Rendimento líquido (USD)
    net_monthly_apr: float     # APR mensal líquido (%)
    net_total_pct: float       # Retorno líquido total (%)

    # ── Análise ─────────────────────────────────────────────────
    verdict: str               # 'EXCELLENT' | 'STABLE' | 'ALERT'
    verdict_label: str
    ai_verdict: str

    # ── Comparação ──────────────────────────────────────────────
    vs_cdi: float              # diferença vs CDI (p.p./mês)
    vs_sp500: float            # diferença vs S&P500 (p.p./mês)
    vs_system: Optional[float] # diferença vs sistema (p.p./mês)
    system_apr_monthly: Optional[float]


# ─── Funções de cálculo ───────────────────────────────────────────────────────

def calc_yield(inp: YieldInput) -> YieldResult:
    """Calcula todos os métricas de rendimento para uma posição de LP."""
    if inp.initial <= 0:
        raise ValueError("initial deve ser > 0")
    if inp.period <= 0:
        raise ValueError("period deve ser > 0")

    period_days = inp.period * 7 if inp.unit == "weeks" else inp.period

    # ── Bruto ──────────────────────────────────────────────────
    total_profit_pct = (inp.yield_amount / inp.initial) * 100
    monthly_apr = (total_profit_pct / period_days) * 30
    annual_apy = (math.pow(1 + monthly_apr / 100, 12) - 1) * 100
    simple_apy = (total_profit_pct / period_days) * 365

    # ── Líquido (descontando IL e gas) ────────────────────────
    il_cost = (inp.initial * inp.il_pct) / 100
    gas_cost = inp.gas_fees
    net_yield = inp.yield_amount - gas_cost - il_cost
    net_total_pct = (net_yield / inp.initial) * 100
    net_monthly_apr = (net_yield / inp.initial / period_days) * 30 * 100

    # ── Veredito ───────────────────────────────────────────────
    if monthly_apr > 2:
        verdict = "EXCELLENT"
        verdict_label = "Excelente Performance"
    elif monthly_apr >= 0.5:
        verdict = "STABLE"
        verdict_label = "Performance Estável"
    else:
        verdict = "ALERT"
        verdict_label = "Alerta: Baixa Eficiência"

    # ── Comparação ─────────────────────────────────────────────
    vs_cdi = monthly_apr - CDI_MONTHLY
    vs_sp500 = monthly_apr - SP500_MONTHLY
    system_apr_monthly = inp.system_apr / 12 if inp.system_apr is not None else None
    vs_system = (monthly_apr - system_apr_monthly) if system_apr_monthly is not None else None

    # ── Texto de veredito IA ──────────────────────────────────
    ai_verdict = _generate_ai_verdict(
        monthly_apr, net_monthly_apr, inp.il_pct, gas_cost, inp.initial, verdict
    )

    return YieldResult(
        pool_name=inp.pool_name,
        date=datetime.now().strftime("%d/%m/%Y %H:%M"),
        initial=inp.initial,
        yield_amount=inp.yield_amount,
        period_days=period_days,
        gas_cost=gas_cost,
        il_cost=il_cost,
        il_pct=inp.il_pct,
        total_profit_pct=total_profit_pct,
        monthly_apr=monthly_apr,
        annual_apy=annual_apy,
        simple_apy=simple_apy,
        net_yield=net_yield,
        net_monthly_apr=net_monthly_apr,
        net_total_pct=net_total_pct,
        verdict=verdict,
        verdict_label=verdict_label,
        ai_verdict=ai_verdict,
        vs_cdi=vs_cdi,
        vs_sp500=vs_sp500,
        vs_system=vs_system,
        system_apr_monthly=system_apr_monthly,
    )


def _generate_ai_verdict(
    monthly_apr: float,
    net_monthly_apr: float,
    il_pct: float,
    gas_usd: float,
    initial: float,
    verdict: str,
) -> str:
    """Gera texto analítico dinâmico com base nos resultados."""
    gas_pct = (gas_usd / initial) * 100 if initial > 0 else 0
    spread = monthly_apr - CDI_MONTHLY

    if verdict == "EXCELLENT":
        if il_pct > 5:
            return (
                f"Rendimento bruto excelente ({monthly_apr:.2f}%/mês), porém IL de "
                f"{il_pct:.1f}% é elevado. Considere estreitar o range para reduzir "
                f"perda impermanente — o retorno líquido ({net_monthly_apr:.2f}%/mês) "
                f"ainda supera o CDI."
            )
        if gas_pct > 5:
            return (
                f"Performance forte, mas taxas de rede (~{gas_pct:.1f}% do capital) "
                f"estão corroendo o retorno real. Aumente o capital ou use uma chain "
                f"com gas mais barato para otimizar."
            )
        return (
            f"Pool com rendimento superior ao mercado em {spread:.2f} p.p./mês vs CDI. "
            f"Vale manter a posição: IL e gas estão dentro de níveis aceitáveis "
            f"para o retorno gerado."
        )

    if verdict == "STABLE":
        if net_monthly_apr < CDI_MONTHLY:
            return (
                f"Rendimento bruto acima do CDI, mas após IL e gas o retorno líquido "
                f"({net_monthly_apr:.2f}%/mês) fica abaixo do CDI ({CDI_MONTHLY}%/mês). "
                f"Avalie se o risco DeFi justifica manter esta posição."
            )
        return (
            f"Rendimento estável, acima do CDI. Verifique se a pool permanece em range — "
            f"saídas frequentes reduzem a coleta de fees e pioram o resultado líquido."
        )

    # ALERT
    if net_monthly_apr < 0:
        return (
            f"Atenção: após descontar IL ({il_pct:.1f}%) e gas (${gas_usd:.2f}), "
            f"a posição está com retorno líquido negativo. "
            f"Considere fechar para evitar perdas adicionais."
        )
    return (
        f"Rendimento abaixo do CDI ({CDI_MONTHLY}%/mês). A pool pode estar com baixo "
        f"volume ou fora do range ideal. Reavalie a estratégia ou mova para uma pool "
        f"com APR mais alto."
    )


# ─── Exibição no terminal ─────────────────────────────────────────────────────

ANSI_RESET = "\033[0m"
ANSI_BOLD = "\033[1m"
ANSI_GREEN = "\033[92m"
ANSI_YELLOW = "\033[93m"
ANSI_RED = "\033[91m"
ANSI_CYAN = "\033[96m"
ANSI_DIM = "\033[2m"
ANSI_BLUE = "\033[94m"


def _color(text: str, color: str) -> str:
    return f"{color}{text}{ANSI_RESET}"


def _verdict_color(verdict: str) -> str:
    return {
        "EXCELLENT": ANSI_GREEN,
        "STABLE": ANSI_YELLOW,
        "ALERT": ANSI_RED,
    }.get(verdict, ANSI_RESET)


def _bar(value: float, max_val: float, width: int = 20) -> str:
    """Gera uma barra ASCII proporcional."""
    filled = int(min(value, max_val) / max_val * width) if max_val > 0 else 0
    return "█" * filled + "░" * (width - filled)


def print_result(r: YieldResult) -> None:
    """Exibe resultado formatado no terminal."""
    w = 62
    div = "─" * w

    print()
    print(_color(f"{'═' * w}", ANSI_CYAN))
    print(_color(f"  Pool Yield Calculator — {r.pool_name}", ANSI_BOLD))
    print(_color(f"  {r.date}  •  {r.period_days} dias analisados", ANSI_DIM))
    print(_color(f"{'═' * w}", ANSI_CYAN))

    # ── Veredito ──
    vc = _verdict_color(r.verdict)
    print(f"\n  {_color('▶ ' + r.verdict_label, vc + ANSI_BOLD)}\n")

    # ── Métricas brutas ──
    print(f"  {_color(div, ANSI_DIM)}")
    print(f"  {'RENDIMENTO BRUTO':30}  {'RENDIMENTO LÍQUIDO':28}")
    print(f"  {_color(div, ANSI_DIM)}")
    print(
        f"  Lucro Total:  {_color(f'{r.total_profit_pct:+.2f}%', ANSI_GREEN):20}"
        f"  Líquido:      {_color(f'{r.net_total_pct:+.2f}%', ANSI_GREEN if r.net_total_pct >= 0 else ANSI_RED)}"
    )
    print(
        f"  APR Mensal:   {_color(f'{r.monthly_apr:.2f}%/mês', vc):20}"
        f"  APR Liq/Mês:  {_color(f'{r.net_monthly_apr:.2f}%/mês', ANSI_GREEN if r.net_monthly_apr >= 0 else ANSI_RED)}"
    )
    print(
        f"  APY Anual:    {_color(f'{r.annual_apy:.1f}%', ANSI_CYAN):20}"
        f"  Valor Liq:    {_color(f'${r.net_yield:+.2f}', ANSI_GREEN if r.net_yield >= 0 else ANSI_RED)}"
    )
    print(f"  APY Simples:  {_color(f'{r.simple_apy:.1f}%', ANSI_DIM)}")

    # ── Saída real ──
    print(f"\n  {_color('RENDIMENTO NA SAÍDA (após IL + gas)', ANSI_BOLD)}")
    print(f"  {_color(div, ANSI_DIM)}")
    print(f"  Rendimento Bruto:      {_color(f'+${r.yield_amount:.2f}', ANSI_GREEN)}")
    print(f"  Taxas de Rede (gas):   {_color(f'-${r.gas_cost:.2f}', ANSI_RED)}")
    print(f"  Impermanent Loss:      {_color(f'-${r.il_cost:.2f}', ANSI_RED)} ({r.il_pct:.1f}%)")
    print(f"  {_color(div, ANSI_DIM)}")
    net_color = ANSI_GREEN if r.net_yield >= 0 else ANSI_RED
    print(f"  Rendimento Líquido:    {_color(f'${r.net_yield:+.2f}  ({r.net_total_pct:+.2f}%)', net_color + ANSI_BOLD)}")

    # ── Comparativo ──
    print(f"\n  {_color('COMPARATIVO DE MERCADO (%/mês)', ANSI_BOLD)}")
    print(f"  {_color(div, ANSI_DIM)}")
    benchmarks = [
        ("Sua Pool ", r.monthly_apr, vc),
        ("CDI Brasil", CDI_MONTHLY, ANSI_DIM),
        ("S&P 500   ", SP500_MONTHLY, ANSI_DIM),
    ]
    max_bench = max(b[1] for b in benchmarks) if benchmarks else 1
    for name, val, color in benchmarks:
        bar = _bar(val, max_bench)
        print(f"  {name}  {_color(bar, color)}  {_color(f'{val:.2f}%', color)}")

    if r.vs_cdi > 0:
        print(f"\n  {_color(f'  ▲ {r.vs_cdi:+.2f} p.p./mês vs CDI', ANSI_GREEN)}")
    else:
        print(f"\n  {_color(f'  ▼ {r.vs_cdi:.2f} p.p./mês vs CDI', ANSI_RED)}")

    if r.system_apr_monthly is not None:
        diff = r.vs_system or 0
        sym = "▲" if diff >= 0 else "▼"
        col = ANSI_GREEN if diff >= 0 else ANSI_YELLOW
        print(f"  {_color(f'  {sym} {diff:+.2f} p.p./mês vs sistema ({r.system_apr_monthly:.2f}%/mês estimado)', col)}")

    # ── Veredito IA ──
    print(f"\n  {_color('ANÁLISE', ANSI_BOLD)}")
    print(f"  {_color(div, ANSI_DIM)}")
    # wrap a ~60 chars
    words = r.ai_verdict.split()
    line = "  "
    for word in words:
        if len(line) + len(word) + 1 > w - 2:
            print(line)
            line = "  " + word + " "
        else:
            line += word + " "
    if line.strip():
        print(line)

    print(f"\n  {_color('═' * w, ANSI_CYAN)}\n")


# ─── Batch e JSON ─────────────────────────────────────────────────────────────

def run_batch(batch_file: str, as_json: bool, save_file: Optional[str]) -> None:
    """Processa vários cenários de um arquivo JSON."""
    data = json.loads(Path(batch_file).read_text())
    results = []
    for item in data:
        inp = YieldInput(
            initial=item["initial"],
            yield_amount=item["yield"],
            period=item["period"],
            unit=item.get("unit", "days"),
            gas_fees=item.get("gas", 0.0),
            il_pct=item.get("il", 0.0),
            pool_name=item.get("pool_name", "Pool"),
            system_apr=item.get("system_apr"),
        )
        r = calc_yield(inp)
        results.append(r)
        if not as_json:
            print_result(r)

    if as_json or save_file:
        out = [asdict(r) for r in results]
        if save_file:
            Path(save_file).write_text(json.dumps(out, indent=2, ensure_ascii=False))
            print(f"Resultados salvos em: {save_file}")
        if as_json:
            print(json.dumps(out, indent=2, ensure_ascii=False))


# ─── Modo interativo ──────────────────────────────────────────────────────────

def interactive_mode() -> YieldInput:
    """Coleta dados via stdin quando não há argumentos."""
    print("\n" + "═" * 60)
    print("  Pool Intelligence Pro — Calculadora de Rendimento")
    print("═" * 60 + "\n")

    def ask(prompt: str, type_fn=float, default=None):
        while True:
            raw = input(f"  {prompt}: ").strip()
            if not raw and default is not None:
                return default
            try:
                return type_fn(raw)
            except ValueError:
                print(f"  Valor inválido. Tente novamente.")

    initial = ask("Valor inicial investido (USD)", float)
    yield_amount = ask("Rendimento acumulado (USD)", float)
    period = ask("Duração do período (número)", int)
    unit_raw = input("  Unidade [days/weeks] (padrão: days): ").strip().lower()
    unit = "weeks" if unit_raw == "weeks" else "days"
    gas = ask("Taxas de rede / Gas pago (USD, 0 se não souber)", float, 0.0)
    il = ask("Impermanent Loss estimado (%, 0 se não souber)", float, 0.0)
    pool_name = input("  Nome da pool (ex: ETH/USDC): ").strip() or "Pool"
    sys_apr_raw = input("  APR anual do sistema (%, deixe em branco se não souber): ").strip()
    sys_apr = float(sys_apr_raw) if sys_apr_raw else None

    return YieldInput(
        initial=initial,
        yield_amount=yield_amount,
        period=period,
        unit=unit,
        gas_fees=gas,
        il_pct=il,
        pool_name=pool_name,
        system_apr=sys_apr,
    )


# ─── CLI ─────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Calculadora de Rendimento de Pools de Liquidez V3",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument("--initial", type=float, help="Valor inicial investido (USD)")
    p.add_argument("--yield", dest="yield_amount", type=float, help="Rendimento acumulado (USD)")
    p.add_argument("--period", type=int, help="Duração do período")
    p.add_argument("--unit", choices=["days", "weeks"], default="days", help="Unidade do período")
    p.add_argument("--gas", type=float, default=0.0, help="Gas fees pagos (USD)")
    p.add_argument("--il", type=float, default=0.0, help="Impermanent Loss estimado (%%)")
    p.add_argument("--pool-name", default="Pool", help="Nome da pool")
    p.add_argument("--system-apr", type=float, default=None, help="APR anual do sistema (%%)")
    p.add_argument("--batch", help="Arquivo JSON com lista de cenários")
    p.add_argument("--json", action="store_true", help="Saída em formato JSON")
    p.add_argument("--save", help="Salva resultado em JSON neste arquivo")
    return p


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    # Batch mode
    if args.batch:
        run_batch(args.batch, args.json, args.save)
        return

    # Args mode vs interactive
    if args.initial is None:
        # interactive
        inp = interactive_mode()
    else:
        if args.yield_amount is None or args.period is None:
            parser.error("--initial, --yield e --period são obrigatórios juntos")
        inp = YieldInput(
            initial=args.initial,
            yield_amount=args.yield_amount,
            period=args.period,
            unit=args.unit,
            gas_fees=args.gas,
            il_pct=args.il,
            pool_name=args.pool_name,
            system_apr=args.system_apr,
        )

    result = calc_yield(inp)

    if args.json:
        print(json.dumps(asdict(result), indent=2, ensure_ascii=False))
    else:
        print_result(result)

    if args.save:
        Path(args.save).write_text(json.dumps(asdict(result), indent=2, ensure_ascii=False))
        print(f"Resultado salvo em: {args.save}")


if __name__ == "__main__":
    main()
