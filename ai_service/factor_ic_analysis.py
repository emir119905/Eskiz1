"""
Faktor Information Coefficient (IC) analizi - "nasil sinyal yakalariz" sorusuna
sistematik cevap.

Faz 1/2/3 hep MUTLAK yon tahmini sorusunu sordu ("bu hisse cikar mi") ve zorlu
naive'e karsi tutarli sekilde kaybetti. Bu script FARKLI bir soru soruyor:
"bu hissenin bir ozelligi (momentum, volatilite, relatif guc...), AYNI GUN
diger hisselere gore siralandiginda, gelecekteki relatif getiri sirasini
tahmin ediyor mu?" - kantitatif ozkaynak arastirmasinin standart ilk teshis
adimi (Information Coefficient / rank correlation).

Her faktor icin:
- Her gun, o faktore gore hisseleri sirala, ayni gun FutureReturn'e (triple-
  barrier'in dikey-bariyer getirisi) gore sirala, Spearman korelasyonu al.
- Bu gunluk IC serisinin ortalamasi, std'si, IC-Sharpe'i (ortalama/std) ve
  t-istatistigi (IC'nin sifirdan anlamli farkli olup olmadigi) hesaplanir.

Bu bir strateji degil, bir TESHIS - hangi faktorde (varsa) gercek, tutarli bir
iliski oldugunu bulmak icin. Sinyal bulunursa, uzerine bir siralama/portfoy
stratejisi insa edilir; bulunmazsa bu da acik, durust bir sonuc olur.

Calistirma:
    python factor_ic_analysis.py --horizon 10
"""

import argparse
import json
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from v12_zeta_scenario_screener import read_sql_data
from shared_features import prepare_external_features, STANDARD_FEATURE_COLS
from engine_baseline import build_full_panel
from experiment_log import log_run

# ham (rank olmayan) faktorler de test edilir - bazen ham deger, kesitsel
# rank'tan daha bilgilendirici olabilir (ozellikle olcek-bagimli olmayanlar icin).
CANDIDATE_RAW_FACTORS = [
    "Mom3", "Mom5", "Mom10", "Mom20", "Mom60",
    "RSI14", "Volatility10", "Volatility20", "Volatility60",
    "VolRatio10_60", "VolRatio20_60", "MA20_norm", "MA50_norm",
    "MASpread10_20", "MASpread20_50", "RangePosition20", "RangePosition60",
    "BreakoutPressure20", "BreakoutPressure60",
    "BehaviorMomentumScore", "BehaviorDirectionComposite", "BehaviorFlatRisk",
    "RelativeReturnToIndex", "RelativeMom5ToIndex", "RelativeMom20ToIndex",
    "RelativeVol20ToIndex", "RangePositionVsIndex",
    "VolumeRatio10", "VolumeRatio20", "CloseLocationValue",
]

CANDIDATE_RANK_FACTORS = [c for c in STANDARD_FEATURE_COLS if c.endswith("_Rank")]


def compute_ic_series(panel: pd.DataFrame, factor_col: str, target_col: str, date_col: str) -> pd.Series:
    """Her gun icin factor_col ile target_col arasindaki kesitsel Spearman IC'sini hesaplar."""
    ics = {}

    for date_value, group in panel.groupby(date_col):
        sub = group[[factor_col, target_col]].dropna()
        if len(sub) < 10:
            continue

        if sub[factor_col].nunique() < 3 or sub[target_col].nunique() < 3:
            continue

        corr, _ = spearmanr(sub[factor_col].values, sub[target_col].values)
        if np.isfinite(corr):
            ics[date_value] = corr

    return pd.Series(ics)


def summarize_ic(ic_series: pd.Series) -> Dict[str, Any]:
    if len(ic_series) < 30:
        return {"days": int(len(ic_series)), "status": "yetersiz_gun"}

    mean_ic = float(ic_series.mean())
    std_ic = float(ic_series.std())
    ic_sharpe = mean_ic / std_ic if std_ic > 1e-9 else 0.0
    t_stat = mean_ic / (std_ic / np.sqrt(len(ic_series))) if std_ic > 1e-9 else 0.0
    pct_same_sign = float(np.mean(np.sign(ic_series) == np.sign(mean_ic))) if mean_ic != 0 else 0.0

    return {
        "days": int(len(ic_series)),
        "meanIC": round(mean_ic, 4),
        "stdIC": round(std_ic, 4),
        "icSharpe": round(ic_sharpe, 4),
        "tStat": round(t_stat, 2),
        "pctSameSignAsMean": round(pct_same_sign * 100, 1),
        "status": "ok",
    }


def run(args: argparse.Namespace) -> Dict[str, Any]:
    stocks, historical, external = read_sql_data()
    external_features = prepare_external_features(external)

    print("panel kuruluyor...")
    panel = build_full_panel(
        stocks=stocks, historical=historical, external_features=external_features,
        horizon=args.horizon, vol_mult=args.vol_mult, min_threshold=args.min_threshold,
    )

    if panel.empty:
        raise RuntimeError("panel bos.")

    target_col = "FutureReturn"
    panel_ic = panel.dropna(subset=[target_col]).copy()
    print(f"panel: {len(panel_ic)} satir (FutureReturn dolu), {panel_ic['StockID'].nunique()} hisse")

    candidates = CANDIDATE_RAW_FACTORS + CANDIDATE_RANK_FACTORS
    candidates = [c for c in candidates if c in panel_ic.columns]
    print(f"{len(candidates)} faktor test edilecek")

    results = []
    for factor in candidates:
        ic_series = compute_ic_series(panel_ic, factor, target_col, date_col="DateKey")
        summary = summarize_ic(ic_series)
        summary["factor"] = factor
        results.append(summary)
        if summary["status"] == "ok":
            print(f"  {factor}: meanIC={summary['meanIC']:+.4f} icSharpe={summary['icSharpe']:+.3f} tStat={summary['tStat']:+.2f} days={summary['days']}")

    ok_results = [r for r in results if r["status"] == "ok"]
    ok_results_sorted = sorted(ok_results, key=lambda r: abs(r["tStat"]), reverse=True)

    # kaba anlamlilik kurali: |t| >= 2 genellikle "sifirdan anlamli farkli" kabul
    # edilir (yaklasik %95 guven), ama COK SAYIDA faktor test ettigimiz icin
    # (multiple testing) bu ham esik iyimser olabilir - bircok faktorun deneme
    # sayisina gore duzeltilmis (orn. Bonferroni) bir esikle karsilastirilmasi
    # daha dogru olur. Burada sadece HAM siralama/teshis amacli kullaniliyor.
    significant = [r for r in ok_results if abs(r["tStat"]) >= 2.0]

    summary = {
        "horizon": args.horizon,
        "totalFactorsTested": len(candidates),
        "significantCount": len(significant),
        "topByAbsTStat": ok_results_sorted[:15],
        "significantFactors": sorted(significant, key=lambda r: abs(r["tStat"]), reverse=True),
        "allResults": results,
        "multipleTestingNote": (
            f"{len(candidates)} faktor test edildi - |t|>=2 esigi tek faktor icin ~%95 guven demek, "
            f"ama bu kadar cok deneme yapinca bazi faktorler SANSLA esigi gecebilir (multiple testing). "
            f"Bonferroni-duzeltilmis esik burada |t| >= {round(2.0 * np.sqrt(np.log(max(2, len(candidates)))), 2)} civarinda olurdu (kaba yaklasim)."
        ),
    }

    log_run(
        name="factor_ic_analysis",
        config={"horizon": args.horizon, "vol_mult": args.vol_mult, "min_threshold": args.min_threshold, "totalFactors": len(candidates)},
        metrics={"significantCount": len(significant), "topTStat": ok_results_sorted[0]["tStat"] if ok_results_sorted else 0.0},
        tags=["faktor_ic", "signal_hunting"],
    )

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Faktor Information Coefficient analizi")
    parser.add_argument("--horizon", type=int, default=10)
    parser.add_argument("--vol-mult", type=float, default=0.60, dest="vol_mult")
    parser.add_argument("--min-threshold", type=float, default=0.01, dest="min_threshold")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    summary = run(args)
    print("\n" + "=" * 60)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
