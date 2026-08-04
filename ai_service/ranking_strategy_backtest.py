"""
Siralama/portfoy stratejisi backtest'i - factor_ic_analysis.py'de bulunan
sinyalin GERCEKTEN kullanilabilir bir edge'e donusup donusmedigini test eder.

IC anlamli cikmasi otomatik olarak "kârli strateji" demek degil - IC faktorun
GENEL yonunu/gucunu olcer, ama gercek bir strateji gunluk degil, DONEMSEL
(rebalance) bazda calisir ve gruplar arasi (long-short) spread'e bakar. Bu
script bunu yapiyor.

Secilen kompozit faktor: RangePositionVsIndex + MASpread20_50 (her ikisi de gun
icinde yeniden yuzdelik siraya cevrilir - shared_features'in _Rank listesinde
bu ikisi yoktu, burada kendi ranklari hesaplanir).
(factor_ic_analysis.py'nin en guclu, en az birbirine bagimli iki bulgusu -
BreakoutPressure60/RangePosition60 matematiksel olarak ayni sey oldugu icin
disarida birakildi, cift saymamak icin).

Yontem:
- Her `horizon` gunde bir (ORTUSMEYEN donemler - gunluk ortusen pencerelerin
  otokorelasyon sorununu onlemek icin) hisseler kompozit faktore gore 3 gruba
  (tercile) ayrilir.
- Ust tercile (en yuksek skor) vs alt tercile (en dusuk skor) getiri farki
  (spread), spread'in t-istatistigi, ust tercile'in universe ortalamasina
  karsi fazlasi (excess) hesaplanir.
- HEM tum donem HEM DE factor_ic_analysis'in faktorleri "sectigi" donemden
  BAGIMSIZ, gercekten disarida tutulan yakin bir alt-donem (out-of-sample
  kontrol) ayri ayri raporlanir - faktor secimi kendisi coklu-deneme icerdigi
  icin (53 faktorden en iyisini secmek), bu ekstra bir guvenlik katmanidir.

Calistirma:
    python ranking_strategy_backtest.py --horizon 10
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
from experiment_log import log_run

DEFAULT_COMPOSITE_RAW_FACTORS = ["RangePositionVsIndex", "MASpread20_50"]
N_GROUPS = 3  # tercile - N~40 hisseyle grup basina ~13 hisse, quintile icin cok az olurdu


def build_rebalance_dates(dates: List, horizon: int) -> List:
    """Ortusmeyen donemler icin her `horizon` gunde bir tarih secer."""
    return sorted(dates)[::horizon]


def backtest_period(panel: pd.DataFrame, horizon: int, label: str, composite_factors: List[str]) -> Dict[str, Any]:
    dates = sorted(panel["DateKey"].unique())
    rebalance_dates = build_rebalance_dates(dates, horizon)

    period_rows = []

    for date_value in rebalance_dates:
        day = panel[panel["DateKey"] == date_value].copy()
        day = day.dropna(subset=composite_factors + ["FutureReturn"])

        if len(day) < N_GROUPS * 3:
            continue

        # kompozit skor: gunun kendi kesitinde (o gunku diger hisselere gore)
        # her iki ham faktoru yuzdelik siraya cevirip ortalamasini al - shared_features'in
        # sabit _Rank listesine bagimli olmadan, ayni mantigi burada tekrar uygular.
        rank_cols = []
        for factor in composite_factors:
            rank_col = f"{factor}_DayRank"
            day[rank_col] = day[factor].rank(method="average", pct=True)
            rank_cols.append(rank_col)

        day["CompositeScore"] = day[rank_cols].mean(axis=1)
        day["Group"] = pd.qcut(day["CompositeScore"], N_GROUPS, labels=False, duplicates="drop")

        if day["Group"].nunique() < N_GROUPS:
            continue

        top_group = day["Group"].max()
        bottom_group = day["Group"].min()

        top_return = float(day.loc[day["Group"] == top_group, "FutureReturn"].mean())
        bottom_return = float(day.loc[day["Group"] == bottom_group, "FutureReturn"].mean())
        universe_return = float(day["FutureReturn"].mean())

        period_rows.append({
            "date": str(date_value),
            "universeSize": int(len(day)),
            "topReturn": top_return,
            "bottomReturn": bottom_return,
            "universeReturn": universe_return,
            "spread": top_return - bottom_return,
            "topExcessVsUniverse": top_return - universe_return,
        })

    if not period_rows:
        return {"label": label, "periods": 0, "status": "yetersiz_veri"}

    df = pd.DataFrame(period_rows)
    spread = df["spread"].values
    excess = df["topExcessVsUniverse"].values

    spread_tstat = float(ttest_1samp(spread, 0.0).statistic) if len(spread) > 1 else 0.0
    excess_tstat = float(ttest_1samp(excess, 0.0).statistic) if len(excess) > 1 else 0.0

    # bilesik (compounded) getiri - "1000 TL ile basladiysak simdi ne olurdu" sezgisi icin
    top_compounded = float(np.prod(1.0 + df["topReturn"].values) - 1.0)
    universe_compounded = float(np.prod(1.0 + df["universeReturn"].values) - 1.0)
    bottom_compounded = float(np.prod(1.0 + df["bottomReturn"].values) - 1.0)

    return {
        "label": label,
        "periods": int(len(df)),
        "avgTopReturnPct": round(float(df["topReturn"].mean()) * 100, 3),
        "avgBottomReturnPct": round(float(df["bottomReturn"].mean()) * 100, 3),
        "avgUniverseReturnPct": round(float(df["universeReturn"].mean()) * 100, 3),
        "avgSpreadPct": round(float(spread.mean()) * 100, 3),
        "spreadTStat": round(spread_tstat, 2),
        "avgTopExcessVsUniversePct": round(float(excess.mean()) * 100, 3),
        "excessTStat": round(excess_tstat, 2),
        "pctPeriodsTopBeatsBottom": round(float(np.mean(spread > 0)) * 100, 1),
        "pctPeriodsTopBeatsUniverse": round(float(np.mean(excess > 0)) * 100, 1),
        "compoundedTopReturnPct": round(top_compounded * 100, 2),
        "compoundedUniverseReturnPct": round(universe_compounded * 100, 2),
        "compoundedBottomReturnPct": round(bottom_compounded * 100, 2),
    }


def run(args: argparse.Namespace) -> Dict[str, Any]:
    composite_factors = [f.strip() for f in args.factors.split(",") if f.strip()]

    stocks, historical, external = read_sql_data()
    external_features = prepare_external_features(external)

    print("panel kuruluyor...")
    panel = build_full_panel(
        stocks=stocks, historical=historical, external_features=external_features,
        horizon=args.horizon, vol_mult=args.vol_mult, min_threshold=args.min_threshold,
    )

    if panel.empty:
        raise RuntimeError("panel bos.")

    panel = panel.dropna(subset=composite_factors + ["FutureReturn"]).copy()
    print(f"panel: {len(panel)} satir, {panel['StockID'].nunique()} hisse")

    full_period = backtest_period(panel, args.horizon, "tum_donem", composite_factors)
    print("\ntum donem sonucu:")
    print(json.dumps(full_period, indent=2, ensure_ascii=False))

    oos_panel = panel[pd.to_datetime(panel["Date"]) >= pd.to_datetime(args.oos_start)]
    oos_period = backtest_period(oos_panel, args.horizon, f"oos_{args.oos_start}_sonrasi", composite_factors)
    print(f"\nout-of-sample ({args.oos_start} sonrasi) sonucu:")
    print(json.dumps(oos_period, indent=2, ensure_ascii=False))

    summary = {
        "horizon": args.horizon,
        "compositeFactors": composite_factors,
        "nGroups": N_GROUPS,
        "fullPeriod": full_period,
        "outOfSample": oos_period,
    }

    log_run(
        name="ranking_strategy_backtest",
        config={"horizon": args.horizon, "compositeFactors": composite_factors, "oos_start": args.oos_start},
        metrics={
            "fullSpreadTStat": full_period.get("spreadTStat", 0.0),
            "oosSpreadTStat": oos_period.get("spreadTStat", 0.0),
            "oosExcessTStat": oos_period.get("excessTStat", 0.0),
        },
        tags=["ranking_strategy", "faktor_backtest"],
    )

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Siralama/portfoy stratejisi backtest'i")
    parser.add_argument("--horizon", type=int, default=10)
    parser.add_argument("--vol-mult", type=float, default=0.60, dest="vol_mult")
    parser.add_argument("--min-threshold", type=float, default=0.01, dest="min_threshold")
    parser.add_argument("--oos-start", type=str, default="2024-01-01", dest="oos_start")
    parser.add_argument(
        "--factors", type=str, default=",".join(DEFAULT_COMPOSITE_RAW_FACTORS),
        help="virgulle ayrilmis ham faktor listesi (gunluk yuzdelik siraya cevrilip ortalanir)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    summary = run(args)
    print("\n" + "=" * 60)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
