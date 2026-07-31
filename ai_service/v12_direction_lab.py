"""
Faz 2 - Direction Lab: CPCV tabanli motor karsilastirma harness'i.

Not (2026-07-31 kod denetiminde bulundu): bu script'in canli urune hicbir baglantisi
yok. Frontend'deki "Model Lab" sayfasi (ModelLab.jsx) aslinda main.py'nin
/predict endpoint'ini stok stok cagirip sonuclari client-side etiketliyor - bu
dosyayi hic import etmiyor / calistirmiyor. Yani v12_direction_lab.py bagimsiz
calistirilan bir arastirma/karsilastirma araci; degistirilmesi Model Lab UI'ini
etkilemez.

Eski hali: 3 move-model x 3 direction-model x 9 move-threshold x 6
direction-threshold = 486 kombinasyonu TEK bir validation dilimine karsi
grid-search edip en iyisini seciyordu - ciddi bir "winner's curse"/backtest
overfitting riski (bkz. Bailey & Lopez de Prado, "The Deflated Sharpe Ratio" /
"Minimum Backtest Length").

Yeni hali: shared_features (tek feature katmani) + shared_labeling
(triple-barrier) + shared_models (3 ilkeli aday, esik grid-search'u yok) +
shared_eval.cpcv_splits (Combinatorial Purged Cross-Validation: TEK yol yerine
birden fazla purge+embargo'lu yol) kullanir. Sonuc artik "tek sayı" degil,
"kac path'te naive'i geciyor, o path'ler arasinda ne kadar tutarli" seklinde
raporlanir - tek bir sansli/sanssiz split'e guvenilmez.

Calistirma:
    python v12_direction_lab.py --stock 2 --horizon 10
    python v12_direction_lab.py --stock all --horizon 10
"""

import argparse
import json
from typing import Any, Dict, List

import numpy as np

from engine_baseline import FEATURE_COLS, build_full_panel
from v12_zeta_scenario_screener import read_sql_data
from shared_features import prepare_external_features
from shared_models import build_classifier_candidates
from shared_eval import (
    cpcv_splits,
    evaluate_classification,
    toughest_naive_metrics,
    calculate_skill_vs_naive,
    minimum_backtest_length_warning,
)
from experiment_log import log_run

# bir stogun "tutarli/gucevenilir" sayilmasi icin path'lerin en az bu yuzdesi
# naive'i gecmeli - eski kodun "strong candidate" esiklerinin CPCV karsiligi.
CONSISTENT_THRESHOLD_PCT = 70.0
NEAR_THRESHOLD_PCT = 50.0


def evaluate_stock_cpcv(
    symbol: str,
    stock_id: int,
    df,
    feature_cols: List[str],
    horizon: int,
    n_groups: int,
    n_test_groups: int,
    embargo_days: int,
) -> Dict[str, Any]:
    df_clean = df.dropna(subset=feature_cols + ["TargetClass"]).reset_index(drop=True)

    if len(df_clean) < 400:
        return {"symbol": symbol, "stockID": stock_id, "status": "skipped", "reason": "yetersiz temiz satir"}

    paths = cpcv_splits(
        df_clean, horizon=horizon, n_groups=n_groups, n_test_groups=n_test_groups,
        embargo_days=embargo_days, min_train=150, min_test=30,
    )

    if not paths:
        return {"symbol": symbol, "stockID": stock_id, "status": "skipped", "reason": "cpcv path uretilemedi"}

    candidates_factory = build_classifier_candidates
    path_results = []

    for path in paths:
        train_df, test_df = path["trainDf"], path["testDf"]

        x_train = train_df[feature_cols].values
        y_train = train_df["TargetClass"].astype(int).values
        x_test = test_df[feature_cols].values
        y_test = test_df["TargetClass"].astype(int).values

        if len(np.unique(y_train)) < 2:
            continue

        # az sayida aday: train'in kendi icinde (son %15) bir mini-validation ile
        # secim yapilir - test'e HIC bakilmadan. Test sadece secilen adayin
        # nihai degerlendirmesi icin kullanilir.
        n_val = max(20, int(len(train_df) * 0.15))
        x_fit, x_val = x_train[:-n_val], x_train[-n_val:]
        y_fit, y_val = y_train[:-n_val], y_train[-n_val:]

        if len(np.unique(y_fit)) < 2:
            continue

        candidates = candidates_factory()
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
            "testSamples": len(test_df),
            "actionPrecision": test_metrics["actionPrecision"],
            "naiveActionPrecision": naive_metrics["actionPrecision"],
            "toughestNaiveVariant": naive_metrics["toughestNaiveVariant"],
            "beatsNaive": skill["beatsNaiveByActionPrecision"],
        })

    if not path_results:
        return {"symbol": symbol, "stockID": stock_id, "status": "skipped", "reason": "hicbir path egitilebilir olmadi"}

    beats_naive_count = sum(1 for r in path_results if r["beatsNaive"])
    action_precisions = [r["actionPrecision"] for r in path_results]
    beats_naive_pct = round(beats_naive_count / len(path_results) * 100, 2)

    return {
        "symbol": symbol,
        "stockID": stock_id,
        "status": "ok",
        "pathCount": len(path_results),
        "pathsBeatingNaive": beats_naive_count,
        "pathsBeatingNaivePct": beats_naive_pct,
        "meanActionPrecision": round(float(np.mean(action_precisions)), 2),
        "stdActionPrecision": round(float(np.std(action_precisions)), 2),
        "consistency": (
            "consistent" if beats_naive_pct >= CONSISTENT_THRESHOLD_PCT
            else "near" if beats_naive_pct >= NEAR_THRESHOLD_PCT
            else "no_signal"
        ),
        "pathResults": path_results,
    }


def aggregate_results(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    ok = [r for r in results if r.get("status") == "ok"]

    if not ok:
        return {"okStocks": 0, "message": "Gecerli sonuc yok."}

    consistent = [r for r in ok if r["consistency"] == "consistent"]
    near = [r for r in ok if r["consistency"] == "near"]
    no_signal = [r for r in ok if r["consistency"] == "no_signal"]

    return {
        "okStocks": len(ok),
        "avgPathsBeatingNaivePct": round(float(np.mean([r["pathsBeatingNaivePct"] for r in ok])), 2),
        "consistentCount": len(consistent),
        "nearCount": len(near),
        "noSignalCount": len(no_signal),
        "consistentStocks": sorted(
            [{"symbol": r["symbol"], "stockID": r["stockID"], "pathsBeatingNaivePct": r["pathsBeatingNaivePct"],
              "meanActionPrecision": r["meanActionPrecision"]} for r in consistent],
            key=lambda x: x["pathsBeatingNaivePct"], reverse=True,
        ),
        "noSignalStocks": [{"symbol": r["symbol"], "stockID": r["stockID"]} for r in no_signal],
    }


def run_lab(args: argparse.Namespace) -> Dict[str, Any]:
    print("Direction Lab (Faz 2 - CPCV harness) basliyor...")
    print(f"   horizon={args.horizon}, stock={args.stock}, n_groups={args.n_groups}, n_test_groups={args.n_test_groups}")

    stocks, historical, external = read_sql_data()
    external_features = prepare_external_features(external)

    panel = build_full_panel(
        stocks=stocks, historical=historical, external_features=external_features,
        horizon=args.horizon, vol_mult=args.vol_mult, min_threshold=args.min_threshold,
    )

    if panel.empty:
        raise RuntimeError("Panel bos - yeterli veri yok.")

    if args.stock == "all":
        target_rows = stocks[stocks["Symbol"].str.upper() != "XU100.IS"][["StockID", "Symbol"]].values.tolist()
    else:
        row = stocks[stocks["StockID"] == int(args.stock)]
        if row.empty:
            raise ValueError(f"StockID={args.stock} bulunamadi.")
        target_rows = [[int(args.stock), row.iloc[0]["Symbol"]]]

    results = []
    for stock_id, symbol in target_rows:
        df = panel[panel["StockID"] == int(stock_id)]

        if df.empty:
            results.append({"symbol": symbol, "stockID": int(stock_id), "status": "skipped", "reason": "yetersiz ham veri"})
            continue

        feature_cols = [c for c in FEATURE_COLS if c in df.columns]

        result = evaluate_stock_cpcv(
            symbol=symbol, stock_id=int(stock_id), df=df, feature_cols=feature_cols,
            horizon=args.horizon, n_groups=args.n_groups, n_test_groups=args.n_test_groups,
            embargo_days=args.embargo_days,
        )
        results.append(result)

        if result.get("status") == "ok":
            print(
                f"{symbol} (id={stock_id}): {result['pathsBeatingNaive']}/{result['pathCount']} path naive'i gecti "
                f"({result['pathsBeatingNaivePct']}%) -> {result['consistency']}"
            )
        else:
            print(f"{symbol} (id={stock_id}): {result.get('status')} - {result.get('reason')}")

    summary = aggregate_results(results)
    summary["horizon"] = args.horizon
    summary["nGroups"] = args.n_groups
    summary["nTestGroups"] = args.n_test_groups
    summary["results"] = results

    from math import comb
    n_trials = 3 * comb(args.n_groups, args.n_test_groups) * len(target_rows)
    total_days = int(historical.groupby("StockID").size().max()) if len(historical) else 0
    summary["minimumBacktestLengthWarning"] = minimum_backtest_length_warning(n_trials, total_days)

    log_run(
        name="direction_lab_cpcv_faz2",
        config={
            "stock": args.stock, "horizon": args.horizon, "n_groups": args.n_groups,
            "n_test_groups": args.n_test_groups, "embargo_days": args.embargo_days,
        },
        metrics={
            "okStocks": summary.get("okStocks", 0),
            "consistentCount": summary.get("consistentCount", 0),
            "avgPathsBeatingNaivePct": summary.get("avgPathsBeatingNaivePct", 0.0),
        },
        tags=["faz2", "cpcv"],
    )

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Faz 2 - Direction Lab CPCV harness")
    parser.add_argument("--stock", type=str, default="all", help="StockID veya 'all'")
    parser.add_argument("--horizon", type=int, default=10)
    parser.add_argument("--vol-mult", type=float, default=0.60, dest="vol_mult")
    parser.add_argument("--min-threshold", type=float, default=0.01, dest="min_threshold")
    parser.add_argument("--n-groups", type=int, default=6, dest="n_groups")
    parser.add_argument("--n-test-groups", type=int, default=2, dest="n_test_groups")
    parser.add_argument("--embargo-days", type=int, default=5, dest="embargo_days")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    summary = run_lab(args)
    print("\n" + "=" * 60)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
