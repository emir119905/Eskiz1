"""
12-1 ay momentum (Mom252Skip21) sinyali icin saglamlastirma testi.

ranking_strategy_backtest.py --horizon 20 --factors Mom252Skip21 tek bir
train/OOS kesiminde (2024-01-01 oncesi/sonrasi) bu faktorun gercek olabilecegini
gosterdi: tam donem spread t=2.47, OOS t=2.83 (ERIDI DEGIL, GUCLENDI) - ayni
kompozisyonla test edilen RangePositionVsIndex+MASpread20_50'nin (OOS t=0.02'ye
eridigi) tam tersi. Ama TEK bir kesim tesaduf olabilir - bu script kullanicinin
"elimizden geldigince kusursuzlastiralim" talebiyle 5 ayri acidan sinar:

1. COKLU OOS PENCERESI - tek 2024 kesimi yerine tum tarihi N ortusmeyen
   parcaya bolup her parcada ayri spread/t-stat.
2. REJIM AYRIMI - BIST/TL'nin bilinen farkli rejimlerinde (2018 kur krizi
   oncesi/sonrasi, 2021-23 hiperenflasyon, 2024+ yakin donem) ayri test -
   etki tek bir rejime mi ozgu yoksa rejimler arasi tutarli mi.
3. UFUK DUYARLILIGI - horizon=10/15/20/25/30 arasinda etkinin yonu/gucu
   ne kadar tutarli (tek bir sansli ufuk secimi degil mi).
4. KABA ISLEM MALIYETI DUZELTMESI - iyimser (10bps) ve gercekci (30bps)
   tek-yon maliyet varsayimiyla net spread.
5. YOGUNLASMA KONTROLU - etki birkac hisseye mi yogunlasmis yoksa genele mi
   yayili (birkac hissenin tesaduf kazanci degil mi).

Calistirma:
    python momentum_robustness.py
"""

import argparse
import json
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from scipy.stats import ttest_1samp

from v12_zeta_scenario_screener import read_sql_data
from shared_features import prepare_external_features
from engine_baseline import build_full_panel
from ranking_strategy_backtest import backtest_period, build_rebalance_dates
from experiment_log import log_run

FACTOR = "Mom252Skip21"
PRIMARY_HORIZON = 20

# evrende BIST disi (ABD) hisseler de var - NVDA/INTC. Cross-sectional siralama
# "BIST'te hangi hisse mantikli yatirim" sorusuna cevap arıyorsa bunlarin (ozellikle
# NVDA'nin, veri araliginda olaganustu bir yukselis yasadi) siralamaya karismasi
# olcumu carpitiyor olabilir - bu yuzden ayri bir "BIST-only" kosusu da destekleniyor.
NON_BIST_SYMBOLS = {"NVDA", "INTC"}

REGIME_WINDOWS = [
    ("kur_krizi_oncesi", None, "2018-08-01"),
    ("kur_krizi_sonrasi_2020", "2018-08-01", "2021-01-01"),
    ("hiperenflasyon_2021_2023", "2021-01-01", "2023-06-01"),
    ("gecis_2023_2024", "2023-06-01", "2024-01-01"),
    ("yakin_donem_2024_sonrasi", "2024-01-01", None),
]


def slice_panel(panel: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    dates = pd.to_datetime(panel["Date"])
    mask = pd.Series(True, index=panel.index)
    if start is not None:
        mask &= dates >= pd.to_datetime(start)
    if end is not None:
        mask &= dates < pd.to_datetime(end)
    return panel[mask]


def rolling_windows(panel: pd.DataFrame, n_windows: int) -> List[Dict[str, Any]]:
    dates = sorted(pd.to_datetime(panel["DateKey"]).unique())
    if len(dates) < n_windows:
        return []

    edges = np.linspace(0, len(dates), n_windows + 1, dtype=int)
    results = []
    for i in range(n_windows):
        start_date = dates[edges[i]]
        end_date = dates[edges[i + 1] - 1]
        sub = panel[(pd.to_datetime(panel["DateKey"]) >= start_date) & (pd.to_datetime(panel["DateKey"]) <= end_date)]
        result = backtest_period(sub, PRIMARY_HORIZON, f"pencere_{i+1}", [FACTOR])
        result["startDate"] = str(start_date.date())
        result["endDate"] = str(end_date.date())
        results.append(result)
    return results


def regime_split(panel: pd.DataFrame) -> List[Dict[str, Any]]:
    results = []
    for label, start, end in REGIME_WINDOWS:
        sub = slice_panel(panel, start, end)
        if sub.empty:
            results.append({"label": label, "periods": 0, "status": "veri_yok"})
            continue
        result = backtest_period(sub, PRIMARY_HORIZON, label, [FACTOR])
        result["startBound"] = start or "basi"
        result["endBound"] = end or "sonu"
        results.append(result)
    return results


def horizon_sensitivity(
    stocks: pd.DataFrame, historical: pd.DataFrame, external_features: pd.DataFrame,
    horizons: List[int],
) -> List[Dict[str, Any]]:
    results = []
    for h in horizons:
        panel_h = build_full_panel(
            stocks=stocks, historical=historical, external_features=external_features,
            horizon=h, vol_mult=0.60, min_threshold=0.01,
        )
        panel_h = panel_h.dropna(subset=[FACTOR, "FutureReturn"]).copy()

        full = backtest_period(panel_h, h, f"h{h}_tum_donem", [FACTOR])
        oos = backtest_period(
            panel_h[pd.to_datetime(panel_h["Date"]) >= pd.to_datetime("2024-01-01")],
            h, f"h{h}_oos_2024", [FACTOR],
        )
        results.append({
            "horizon": h,
            "fullSpreadTStat": full.get("spreadTStat"),
            "fullAvgSpreadPct": full.get("avgSpreadPct"),
            "oosSpreadTStat": oos.get("spreadTStat"),
            "oosAvgSpreadPct": oos.get("avgSpreadPct"),
            "oosPeriods": oos.get("periods"),
        })
        print(f"  horizon={h}: full spread t={full.get('spreadTStat')} | oos spread t={oos.get('spreadTStat')}")
    return results


def cost_adjustment(avg_spread_pct: float) -> Dict[str, Any]:
    """
    avg_spread_pct: rebalance basina ortalama (uzun-kisa) spread, yuzde olarak.
    Uzun ve kisa bacagin her biri rebalance basina 1 giris + 1 cikis (round-trip)
    yapar; toplam 4 islem bacagi (long-in, long-out, short-in, short-out) - basit
    tek-yon maliyet varsayimlariyla kaba bir net spread tahmini.
    """
    scenarios = {"iyimser_10bps": 0.10, "gercekci_30bps": 0.30}
    results = {}
    for name, one_way_bps in scenarios.items():
        total_cost_pct = (one_way_bps / 100.0) * 4  # 4 bacak
        results[name] = round(avg_spread_pct - total_cost_pct, 4)
    return results


def concentration_check(panel: pd.DataFrame, horizon: int) -> Dict[str, Any]:
    """Top-tercile secimlerinin kac farkli hisseye yayildigini ve getirinin
    birkac hisseye ne kadar yogunlastigini kontrol eder."""
    dates = sorted(panel["DateKey"].unique())
    rebalance_dates = build_rebalance_dates(dates, horizon)

    contributions = {}
    total_periods = 0

    for date_value in rebalance_dates:
        day = panel[panel["DateKey"] == date_value].copy()
        day = day.dropna(subset=[FACTOR, "FutureReturn"])
        if len(day) < 9:
            continue

        day["Rank"] = day[FACTOR].rank(pct=True)
        day["Group"] = pd.qcut(day["Rank"], 3, labels=False, duplicates="drop")
        if day["Group"].nunique() < 3:
            continue

        top = day[day["Group"] == day["Group"].max()]
        total_periods += 1
        for _, row in top.iterrows():
            symbol = row["Symbol"]
            contributions.setdefault(symbol, {"appearances": 0, "returnSum": 0.0})
            contributions[symbol]["appearances"] += 1
            contributions[symbol]["returnSum"] += float(row["FutureReturn"])

    if not contributions:
        return {"status": "veri_yok"}

    df = pd.DataFrame([
        {"symbol": k, "appearances": v["appearances"], "returnSum": v["returnSum"]}
        for k, v in contributions.items()
    ]).sort_values("returnSum", ascending=False)

    total_return_sum = df["returnSum"].sum()
    top5_share = float(df.head(5)["returnSum"].sum() / total_return_sum) if total_return_sum else None

    return {
        "totalRebalancePeriods": total_periods,
        "distinctStocksEverInTopGroup": int(len(df)),
        "top5StocksShareOfTotalReturn": round(top5_share, 3) if top5_share is not None else None,
        "top5Stocks": df.head(5).to_dict("records"),
        "note": "top5ShareOfTotalReturn evrenin (~14 hisse/grup) makul bir payi olmali; asiri yuksekse (>%50) etki birkac hisseye ozgu, genellenebilir degil demektir.",
    }


def run(exclude_non_bist: bool = False) -> Dict[str, Any]:
    stocks, historical, external = read_sql_data()
    if exclude_non_bist:
        stocks = stocks[~stocks["Symbol"].isin(NON_BIST_SYMBOLS)].copy()
        print(f"BIST-only mod: {sorted(NON_BIST_SYMBOLS)} evrenden cikarildi ({len(stocks)} hisse kaldi)")
    external_features = prepare_external_features(external)

    print("ana panel kuruluyor (horizon=20)...")
    panel = build_full_panel(
        stocks=stocks, historical=historical, external_features=external_features,
        horizon=PRIMARY_HORIZON, vol_mult=0.60, min_threshold=0.01,
    )
    panel = panel.dropna(subset=[FACTOR, "FutureReturn"]).copy()
    print(f"panel: {len(panel)} satir, {panel['StockID'].nunique()} hisse")

    print("\n1) coklu OOS penceresi (5 esit parca)...")
    rolling = rolling_windows(panel, n_windows=5)
    for r in rolling:
        print(f"  {r.get('label')} ({r.get('startDate')} - {r.get('endDate')}): "
              f"periods={r.get('periods')} spreadTStat={r.get('spreadTStat')} avgSpreadPct={r.get('avgSpreadPct')}")

    print("\n2) rejim ayrimi...")
    regimes = regime_split(panel)
    for r in regimes:
        print(f"  {r.get('label')}: periods={r.get('periods')} spreadTStat={r.get('spreadTStat')} avgSpreadPct={r.get('avgSpreadPct')}")

    print("\n3) ufuk duyarliligi (10/15/20/25/30)...")
    horizon_sens = horizon_sensitivity(stocks, historical, external_features, [10, 15, 20, 25, 30])

    print("\n4) kaba islem maliyeti duzeltmesi...")
    full_period_ref = backtest_period(panel, PRIMARY_HORIZON, "tum_donem_referans", [FACTOR])
    oos_ref = backtest_period(
        panel[pd.to_datetime(panel["Date"]) >= pd.to_datetime("2024-01-01")],
        PRIMARY_HORIZON, "oos_referans", [FACTOR],
    )
    cost_full = cost_adjustment(full_period_ref["avgSpreadPct"])
    cost_oos = cost_adjustment(oos_ref["avgSpreadPct"])
    print(f"  tum donem brut spread={full_period_ref['avgSpreadPct']}% -> maliyet sonrasi: {cost_full}")
    print(f"  OOS brut spread={oos_ref['avgSpreadPct']}% -> maliyet sonrasi: {cost_oos}")

    print("\n5) yogunlasma kontrolu...")
    concentration = concentration_check(panel, PRIMARY_HORIZON)
    print(f"  top-grupta gorulen farkli hisse sayisi: {concentration.get('distinctStocksEverInTopGroup')}")
    print(f"  en iyi 5 hissenin toplam getiriye payi: {concentration.get('top5StocksShareOfTotalReturn')}")

    summary = {
        "factor": FACTOR,
        "primaryHorizon": PRIMARY_HORIZON,
        "rollingWindows": rolling,
        "regimeSplit": regimes,
        "horizonSensitivity": horizon_sens,
        "costAdjustment": {
            "fullPeriodGrossSpreadPct": full_period_ref["avgSpreadPct"],
            "fullPeriodNetOfCost": cost_full,
            "oosGrossSpreadPct": oos_ref["avgSpreadPct"],
            "oosNetOfCost": cost_oos,
        },
        "concentration": concentration,
    }

    log_run(
        name="momentum_robustness",
        config={"factor": FACTOR, "primaryHorizon": PRIMARY_HORIZON},
        metrics={
            "rollingWindowsPositive": sum(1 for r in rolling if (r.get("spreadTStat") or 0) > 0),
            "regimesPositive": sum(1 for r in regimes if (r.get("spreadTStat") or 0) > 0),
        },
        tags=["momentum_robustness", "faz4_followup"],
    )

    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="12-1 ay momentum saglamlastirma testi")
    parser.add_argument("--exclude-non-bist", action="store_true", help="NVDA/INTC'yi evrenden cikar (saf BIST kosusu)")
    args = parser.parse_args()

    summary = run(exclude_non_bist=args.exclude_non_bist)
    print("\n" + "=" * 60)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
