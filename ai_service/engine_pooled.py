"""
Havuzlanmis (pooled) kesitsel model - Faz 1/2 hipotez-2.

Faz 1/2'nin ilk hali her hisse icin AYRI bir model egitiyordu (~800-2000 satir/
hisse), ve zorlu naive'e karsi 6 hissede de sistemik olarak kaybetti. Goreli/
kesitsel feature eklemek (hipotez-1) sonucu degistirmedi. Bu script hipotez-2'yi
test eder: v12_zeta_scenario_screener.py'nin ORIJINAL mimarisiyle ayni prensip -
TUM evreni (43 hisse, ~90 bin satir) TEK modelde birlestirip egitmek. Az veriyle
(hisse-basina) egitilen modellerin naive'i gecememesi, veri yetersizliginden
kaynaklaniyor olabilir - havuzlama bunu dogrudan test eder.

CPCV burada PANEL uzerinde calisir (tum hisseler bir arada) - train/test
gruplari tarih bazli, purge+embargo tum evrene ayni anda uygulanir.

Calistirma:
    python engine_pooled.py --horizon 10
"""

import argparse
import json
from typing import Any, Dict

import numpy as np

from v12_zeta_scenario_screener import read_sql_data
from shared_features import prepare_external_features
from engine_baseline import FEATURE_COLS, build_full_panel
from shared_models import build_classifier_candidates
from shared_eval import (
    cpcv_splits,
    evaluate_classification,
    toughest_naive_metrics,
    calculate_skill_vs_naive,
    minimum_backtest_length_warning,
)
from experiment_log import log_run

CONSISTENT_THRESHOLD_PCT = 70.0
NEAR_THRESHOLD_PCT = 50.0


def run(args: argparse.Namespace) -> Dict[str, Any]:
    stocks, historical, external = read_sql_data()
    external_features = prepare_external_features(external)

    print("panel kuruluyor (tum evren)...")
    panel = build_full_panel(
        stocks=stocks, historical=historical, external_features=external_features,
        horizon=args.horizon, vol_mult=args.vol_mult, min_threshold=args.min_threshold,
    )

    if panel.empty:
        raise RuntimeError("Panel bos - yeterli veri yok.")

    feature_cols = [c for c in FEATURE_COLS if c in panel.columns]
    panel_clean = panel.dropna(subset=feature_cols + ["TargetClass"]).reset_index(drop=True)
    print(f"panel_clean: {len(panel_clean)} satir, {panel_clean['StockID'].nunique()} hisse, {len(feature_cols)} feature")

    paths = cpcv_splits(
        panel_clean, horizon=args.horizon, n_groups=args.n_groups, n_test_groups=args.n_test_groups,
        embargo_days=args.embargo_days, min_train=2000, min_test=300,
    )
    print(f"{len(paths)} CPCV path uretildi (havuzlanmis, tum evren)")

    path_results = []

    for path in paths:
        train_df = path["trainDf"].sort_values("Date").reset_index(drop=True)
        test_df = path["testDf"]

        x_train = train_df[feature_cols].values
        y_train = train_df["TargetClass"].astype(int).values
        x_test = test_df[feature_cols].values
        y_test = test_df["TargetClass"].astype(int).values

        if len(np.unique(y_train)) < 2:
            continue

        # mini-validation: havuzlanmis train'in tarihe gore SON %15'i (tum
        # hisseler dahil) - stok-basina degil, tum panelin kronolojik kuyrugu.
        n_val = max(200, int(len(train_df) * 0.15))
        x_fit, x_val = x_train[:-n_val], x_train[-n_val:]
        y_fit, y_val = y_train[:-n_val], y_train[-n_val:]

        if len(np.unique(y_fit)) < 2:
            continue

        candidates = build_classifier_candidates()
        best_name, best_score = None, -1.0

        for name, model in candidates.items():
            model.fit(x_fit, y_fit)
            val_pred = model.predict(x_val)
            score = evaluate_classification(y_val, val_pred)["actionPrecision"]
            if score > best_score:
                best_score, best_name = score, name

        if best_name is None:
            continue

        final_model = build_classifier_candidates()[best_name]
        final_model.fit(x_train, y_train)
        test_pred = final_model.predict(x_test)

        test_metrics = evaluate_classification(y_test, test_pred)
        naive_metrics = toughest_naive_metrics(y_train, y_test, metric_key="actionPrecision")
        skill = calculate_skill_vs_naive(test_metrics, naive_metrics)

        path_results.append({
            "pathId": path["pathId"],
            "testGroups": path["testGroups"],
            "selectedModel": best_name,
            "trainSamples": len(train_df),
            "testSamples": len(test_df),
            "actionPrecision": test_metrics["actionPrecision"],
            "naiveActionPrecision": naive_metrics["actionPrecision"],
            "toughestNaiveVariant": naive_metrics["toughestNaiveVariant"],
            "beatsNaive": skill["beatsNaiveByActionPrecision"],
        })

        print(
            f"path {path['pathId']} (testGroups={path['testGroups']}): model={best_name} | "
            f"test AP={test_metrics['actionPrecision']} vs naive={naive_metrics['actionPrecision']} "
            f"({naive_metrics['toughestNaiveVariant']}) | beatsNaive={skill['beatsNaiveByActionPrecision']}"
        )

    if not path_results:
        raise RuntimeError("Hicbir CPCV path egitilebilir olmadi.")

    beats_naive_count = sum(1 for r in path_results if r["beatsNaive"])
    action_precisions = [r["actionPrecision"] for r in path_results]
    beats_naive_pct = round(beats_naive_count / len(path_results) * 100, 2)

    consistency = (
        "consistent" if beats_naive_pct >= CONSISTENT_THRESHOLD_PCT
        else "near" if beats_naive_pct >= NEAR_THRESHOLD_PCT
        else "no_signal"
    )

    summary = {
        "horizon": args.horizon,
        "nGroups": args.n_groups,
        "nTestGroups": args.n_test_groups,
        "pathCount": len(path_results),
        "pathsBeatingNaive": beats_naive_count,
        "pathsBeatingNaivePct": beats_naive_pct,
        "meanActionPrecision": round(float(np.mean(action_precisions)), 2),
        "stdActionPrecision": round(float(np.std(action_precisions)), 2),
        "consistency": consistency,
        "pathResults": path_results,
    }

    n_trials = 3 * len(paths)
    total_days = int(historical.groupby("StockID").size().max()) if len(historical) else 0
    summary["minimumBacktestLengthWarning"] = minimum_backtest_length_warning(n_trials, total_days)

    log_run(
        name="engine_pooled_hipotez2",
        config={
            "horizon": args.horizon, "vol_mult": args.vol_mult, "min_threshold": args.min_threshold,
            "n_groups": args.n_groups, "n_test_groups": args.n_test_groups, "embargo_days": args.embargo_days,
            "n_trials": n_trials, "panelRows": len(panel_clean), "nStocks": int(panel_clean["StockID"].nunique()),
        },
        metrics={
            "pathsBeatingNaivePct": beats_naive_pct,
            "meanActionPrecision": summary["meanActionPrecision"],
            "consistency": consistency,
        },
        tags=["faz1", "faz2", "pooled", "hipotez2"],
    )

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Havuzlanmis kesitsel model (hipotez-2)")
    parser.add_argument("--horizon", type=int, default=10)
    parser.add_argument("--vol-mult", type=float, default=0.60, dest="vol_mult")
    parser.add_argument("--min-threshold", type=float, default=0.01, dest="min_threshold")
    parser.add_argument("--n-groups", type=int, default=6, dest="n_groups")
    parser.add_argument("--n-test-groups", type=int, default=2, dest="n_test_groups")
    parser.add_argument("--embargo-days", type=int, default=5, dest="embargo_days")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    summary = run(args)
    print("\n" + "=" * 60)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
