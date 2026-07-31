"""
Faz 1 - Ana motor baseline (bkz. plan: curried-juggling-summit.md).

main.py'nin LSTM/quantile motoru bir kenara birakildi (koda dokunulmadi, referans
icin duruyor). Bunun yerine shared_features + shared_labeling (triple-barrier) +
shared_eval (purge+embargo split, ortak metrikler) kullanan basit, az sayida
konfigurasyon deneyen bir siniflandirici taban kuruluyor. Amac: LSTM'in
karmasikligina ancak bu taban naive'i ISTATISTIKSEL OLARAK ANLAMLI sekilde
gectiginde, gerekceyle geri donmek.

2026-07-31 guncelleme: ilk versiyon sadece hissenin MUTLAK teknik feature'larini
kullaniyordu ve 6 hissede de zorlu naive'e (majority class) karsi sistemik olarak
kaybetti (bkz. [[project-engine-rebuild]] memory). Literatur + Zeta'nin kendi
mimarisi goreli/kesitsel (relative-to-index, cross-sectional rank) feature'larin
mutlak teknik paternlerden daha saglam bir sinyal oldugunu soyluyor - bu yuzden
artik tum evren (panel) once bir arada kurulup shared_features.add_relative_features
+ add_cross_sectional_ranks uygulaniyor, sonra hisse hisse dilimleniyor.

Calistirma:
    python engine_baseline.py --stock 2 --horizon 10
    python engine_baseline.py --stock all --horizon 10
"""

import argparse
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from v12_zeta_scenario_screener import read_sql_data
from shared_features import (
    add_price_features,
    prepare_external_features,
    build_index_reference,
    add_relative_features,
    add_cross_sectional_ranks,
    STANDARD_FEATURE_COLS,
)
from shared_labeling import apply_triple_barrier, class_distribution
from shared_models import build_classifier_candidates
from shared_eval import (
    purged_embargo_split,
    evaluate_classification,
    toughest_naive_metrics,
    calculate_skill_vs_naive,
    minimum_backtest_length_warning,
)
from experiment_log import log_run

FEATURE_COLS = STANDARD_FEATURE_COLS

INDEX_SYMBOL = "XU100.IS"


def build_full_panel(
    stocks: pd.DataFrame,
    historical: pd.DataFrame,
    external_features: pd.DataFrame,
    horizon: int,
    vol_mult: float,
    min_threshold: float,
) -> pd.DataFrame:
    """
    Tum hisse evrenini (endeksin kendisi haric) tek bir panelde birlestirir:
    mutlak teknik feature'lar + endekse-goreli feature'lar + kesitsel (ayni
    tarihteki diger hisselere gore) yuzdelik siralamalar + triple-barrier etiketi.
    """
    index_ref = build_index_reference(historical, stocks, index_symbol=INDEX_SYMBOL)
    ext = external_features.rename(columns={"Date": "DateKey"})

    frames = []
    for _, stock in stocks.iterrows():
        symbol = str(stock["Symbol"])
        if symbol.upper() == INDEX_SYMBOL:
            continue

        stock_id = int(stock["StockID"])
        df = historical[historical["StockID"] == stock_id].copy()
        if df.empty:
            continue

        df["Date"] = pd.to_datetime(df["Date"])
        df = df.sort_values("Date").reset_index(drop=True)

        for col in ["OpenPrice", "HighPrice", "LowPrice", "ClosePrice", "Volume"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        df = df.dropna(subset=["Date", "OpenPrice", "ClosePrice"])
        df = df[df["ClosePrice"] > 0].copy()

        if len(df) < 300:
            continue

        df = add_price_features(df)
        df["DateKey"] = df["Date"].dt.date
        df = add_relative_features(df, index_ref)
        df = df.merge(ext, on="DateKey", how="left")
        df = apply_triple_barrier(df, horizon=horizon, vol_mult=vol_mult, min_threshold=min_threshold)

        df["StockID"] = stock_id
        df["Symbol"] = symbol
        frames.append(df)

    if not frames:
        return pd.DataFrame()

    panel = pd.concat(frames, ignore_index=True)
    panel = add_cross_sectional_ranks(panel, date_col="DateKey")
    panel = panel.replace([np.inf, -np.inf], np.nan)

    return panel


def evaluate_one_stock(
    symbol: str,
    stock_id: int,
    df: pd.DataFrame,
    feature_cols: List[str],
    horizon: int,
    validation_start: str,
    test_start: str,
    embargo_days: int,
) -> Dict[str, Any]:
    df_clean = df.dropna(subset=feature_cols + ["TargetClass"]).reset_index(drop=True)

    if len(df_clean) < 400:
        return {"symbol": symbol, "stockID": stock_id, "status": "skipped", "reason": "yetersiz temiz satir"}

    train, validation, test = purged_embargo_split(
        df_clean, validation_start=validation_start, test_start=test_start,
        horizon=horizon, embargo_days=embargo_days,
    )

    if len(train) < 150 or len(validation) < 40 or len(test) < 40:
        return {
            "symbol": symbol, "stockID": stock_id, "status": "skipped",
            "reason": "purge+embargo sonrasi train/val/test yetersiz",
            "trainSamples": len(train), "validationSamples": len(validation), "testSamples": len(test),
        }

    x_train = train[feature_cols].values
    y_train = train["TargetClass"].astype(int).values
    x_val = validation[feature_cols].values
    y_val = validation["TargetClass"].astype(int).values
    x_test = test[feature_cols].values
    y_test = test["TargetClass"].astype(int).values

    candidates = build_classifier_candidates()
    best_name, best_model, best_score, best_val_metrics = None, None, -1.0, None

    for name, model in candidates.items():
        model.fit(x_train, y_train)
        val_pred = model.predict(x_val)
        val_metrics = evaluate_classification(y_val, val_pred)
        score = val_metrics["actionPrecision"]

        if score > best_score:
            best_score, best_name, best_model, best_val_metrics = score, name, model, val_metrics

    test_pred = best_model.predict(x_test)
    test_metrics = evaluate_classification(y_test, test_pred)

    naive_metrics = toughest_naive_metrics(y_train, y_test, metric_key="actionPrecision")

    skill = calculate_skill_vs_naive(test_metrics, naive_metrics)

    return {
        "symbol": symbol,
        "stockID": stock_id,
        "status": "ok",
        "selectedModel": best_name,
        "trainSamples": len(train),
        "validationSamples": len(validation),
        "testSamples": len(test),
        "trainClassDistribution": class_distribution(y_train),
        "testClassDistribution": class_distribution(y_test),
        "validationMetrics": best_val_metrics,
        "testMetrics": test_metrics,
        "naiveMetrics": naive_metrics,
        "skillVsNaive": skill,
    }


def run(args: argparse.Namespace) -> Dict[str, Any]:
    stocks, historical, external = read_sql_data()
    external_features = prepare_external_features(external)

    panel = build_full_panel(
        stocks=stocks, historical=historical, external_features=external_features,
        horizon=args.horizon, vol_mult=args.vol_mult, min_threshold=args.min_threshold,
    )

    if panel.empty:
        raise RuntimeError("Panel bos - yeterli veri yok.")

    if args.stock == "all":
        target_rows = stocks[stocks["Symbol"].str.upper() != INDEX_SYMBOL][["StockID", "Symbol"]].values.tolist()
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

        result = evaluate_one_stock(
            symbol=symbol,
            stock_id=int(stock_id),
            df=df,
            feature_cols=feature_cols,
            horizon=args.horizon,
            validation_start=args.validation_start,
            test_start=args.test_start,
            embargo_days=args.embargo_days,
        )
        results.append(result)
        print(f"{symbol} (id={stock_id}): {result.get('status')}")
        if result.get("status") == "ok":
            print(
                f"  model={result['selectedModel']} | "
                f"test actionPrecision={result['testMetrics']['actionPrecision']} vs "
                f"naive={result['naiveMetrics']['actionPrecision']} ({result['naiveMetrics']['toughestNaiveVariant']}) | "
                f"beatsNaive={result['skillVsNaive']['beatsNaiveByActionPrecision']}"
            )

    ok_results = [r for r in results if r.get("status") == "ok"]
    n_trials = 3 * len(target_rows)  # 3 model adayi x hisse sayisi
    total_days = int(historical.groupby("StockID").size().max()) if len(historical) else 0
    mbl_warning = minimum_backtest_length_warning(n_trials=n_trials, n_days_available=total_days)

    summary = {
        "horizon": args.horizon,
        "validationStart": args.validation_start,
        "testStart": args.test_start,
        "embargoDays": args.embargo_days,
        "okCount": len(ok_results),
        "totalCount": len(results),
        "results": results,
        "minimumBacktestLengthWarning": mbl_warning,
    }

    if ok_results:
        avg_beats_naive = float(np.mean([r["skillVsNaive"]["beatsNaiveByActionPrecision"] for r in ok_results]))
        summary["pctStocksBeatingNaive"] = round(avg_beats_naive * 100, 2)

    log_run(
        name="engine_baseline_faz1",
        config={
            "stock": args.stock,
            "horizon": args.horizon,
            "vol_mult": args.vol_mult,
            "min_threshold": args.min_threshold,
            "validation_start": args.validation_start,
            "test_start": args.test_start,
            "embargo_days": args.embargo_days,
            "n_trials": n_trials,
            "featureSet": "technical+relative+crossSectionalRank",
        },
        metrics={
            "okCount": summary["okCount"],
            "totalCount": summary["totalCount"],
            "pctStocksBeatingNaive": summary.get("pctStocksBeatingNaive", 0.0),
            "likelyOverfit": mbl_warning["likelyOverfit"],
        },
        tags=["faz1", "baseline", "relative_features"],
    )

    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Faz 1 - Ana motor baseline (triple-barrier + purge/embargo)")
    parser.add_argument("--stock", type=str, default="2", help="StockID veya 'all'")
    parser.add_argument("--horizon", type=int, default=10)
    parser.add_argument("--vol-mult", type=float, default=0.60, dest="vol_mult")
    parser.add_argument("--min-threshold", type=float, default=0.01, dest="min_threshold")
    parser.add_argument("--validation-start", type=str, default="2024-01-01")
    parser.add_argument("--test-start", type=str, default="2025-01-01")
    parser.add_argument("--embargo-days", type=int, default=5)
    return parser.parse_args()


if __name__ == "__main__":
    import json
    args = parse_args()
    summary = run(args)
    print("\n" + "=" * 60)
    print(json.dumps(summary, indent=2, ensure_ascii=False, default=str))
