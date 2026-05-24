# ai_service/v12_direction_lab.py
# ============================================================
# Pusula AI v12 Direction Lab - EPSILON TWO STAGE + OHLCV FEATURES
# ------------------------------------------------------------
# Amaç:
#   Tek 3-class model yerine iki aşamalı yön motorunu test etmek.
#
#   Stage 1: Hareket var mı?
#       no_move / move
#
#   Stage 2: Hareket varsa yön ne?
#       down / up
#
#   Final class:
#       Stage1 no_move  -> flat
#       Stage1 move + Stage2 down -> down
#       Stage1 move + Stage2 up   -> up
#
# Not:
#   Model / threshold seçimi yalnızca validation set üzerinden yapılır.
#   Test seti sadece final raporlama için kullanılır.
# ============================================================

import argparse
import json
import math
import os
import warnings
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


CLASS_DOWN = 0
CLASS_FLAT = 1
CLASS_UP = 2

CLASS_LABELS = {
    CLASS_DOWN: "down",
    CLASS_FLAT: "flat",
    CLASS_UP: "up"
}


# ------------------------------------------------------------
# DB CONNECTION
# ------------------------------------------------------------

def get_db_connection():
    """
    Öncelik sırası:
    1) main.py içindeki get_connection()
    2) main.py içindeki _behavior_get_connection()
    3) Ortam değişkeni: DB_CONN_STR
    """

    try:
        from main import get_connection
        return get_connection()
    except Exception:
        pass

    try:
        from main import _behavior_get_connection
        return _behavior_get_connection()
    except Exception:
        pass

    conn_str = os.getenv("DB_CONN_STR")

    if conn_str:
        import pyodbc
        return pyodbc.connect(conn_str)

    raise RuntimeError(
        "DB bağlantısı bulunamadı. main.py içinde get_connection() veya "
        "_behavior_get_connection() olmalı ya da DB_CONN_STR tanımlanmalı."
    )


def read_sql_data(stock_id=None):
    conn = get_db_connection()

    try:
        stock_sql = """
            SELECT StockID, Symbol, CompanyName, Sector
            FROM Stocks
            ORDER BY StockID
        """

        hist_sql = """
            SELECT
                StockID,
                Date,
                OpenPrice,
                HighPrice,
                LowPrice,
                ClosePrice,
                Volume
            FROM HistoricalData
        """

        params = []

        if stock_id is not None:
            hist_sql += " WHERE StockID = ?"
            params.append(int(stock_id))

        hist_sql += " ORDER BY StockID, Date"

        external_sql = """
            SELECT
                Date,
                USDTRY,
                BIST100,
                Gold,
                BrentOil
            FROM ExternalData
            ORDER BY Date
        """

        stocks = pd.read_sql(stock_sql, conn)
        hist = pd.read_sql(hist_sql, conn, params=params if params else None)
        external = pd.read_sql(external_sql, conn)

        return stocks, hist, external

    finally:
        try:
            conn.close()
        except Exception:
            pass


# ------------------------------------------------------------
# FEATURE ENGINEERING
# ------------------------------------------------------------

def compute_rsi(series, period=14):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    return rsi.fillna(50)


def compute_behavior_features(df):
    close = df["ClosePrice"].astype(float)
    volume = df["Volume"].fillna(0).astype(float)
    returns = df["Return"].astype(float)

    df["Mom3"] = close.pct_change(3)
    df["Mom5"] = close.pct_change(5)
    df["Mom10"] = close.pct_change(10)
    df["Mom20"] = close.pct_change(20)
    df["Mom60"] = close.pct_change(60)

    df["High20"] = close.rolling(20).max()
    df["Low20"] = close.rolling(20).min()
    df["High60"] = close.rolling(60).max()
    df["Low60"] = close.rolling(60).min()

    range20 = (df["High20"] - df["Low20"]).replace(0, np.nan)
    range60 = (df["High60"] - df["Low60"]).replace(0, np.nan)

    df["RangePosition20"] = ((close - df["Low20"]) / range20).clip(0, 1)
    df["RangePosition60"] = ((close - df["Low60"]) / range60).clip(0, 1)

    df["BreakoutPressure20"] = (df["RangePosition20"] - 0.5) * 200
    df["BreakoutPressure60"] = (df["RangePosition60"] - 0.5) * 200
    df["BreakoutScore"] = df["BreakoutPressure60"].abs()

    df["VolumeMean10"] = volume.rolling(10).mean()
    df["VolumeMean20"] = volume.rolling(20).mean()
    df["VolumeRatio10"] = volume / df["VolumeMean10"].replace(0, np.nan)
    df["VolumeRatio20"] = volume / df["VolumeMean20"].replace(0, np.nan)

    df["Vol10"] = returns.rolling(10).std()
    df["Vol20"] = returns.rolling(20).std()
    df["Vol60"] = returns.rolling(60).std()
    df["VolRatio10_60"] = df["Vol10"] / df["Vol60"].replace(0, np.nan)
    df["VolRatio20_60"] = df["Vol20"] / df["Vol60"].replace(0, np.nan)

    ma10 = close.rolling(10).mean()
    ma20 = close.rolling(20).mean()
    ma50 = close.rolling(50).mean()

    ma_spread_10_20 = (ma10 / ma20.replace(0, np.nan)) - 1
    ma_spread_20_50 = (ma20 / ma50.replace(0, np.nan)) - 1

    safe_vol20 = df["Vol20"].fillna(0.0).clip(lower=0.0005)

    z_mom5 = (df["Mom5"] / (safe_vol20 * math.sqrt(5))).clip(-3, 3)
    z_mom20 = (df["Mom20"] / (safe_vol20 * math.sqrt(20))).clip(-3, 3)
    z_ma = (ma_spread_20_50 / (safe_vol20 * 2.0).clip(lower=0.0005)).clip(-3, 3)

    momentum_raw = (0.30 * z_mom5) + (0.45 * z_mom20) + (0.25 * z_ma)
    df["BehaviorMomentumScore"] = np.tanh(momentum_raw / 1.20) * 100

    direction_composite = (
        0.58 * df["BehaviorMomentumScore"].fillna(0) +
        0.25 * df["BreakoutPressure60"].fillna(0) +
        0.17 * df["BreakoutPressure20"].fillna(0)
    ).clip(-100, 100)

    flat_risk = 100 - direction_composite.abs()
    flat_risk += np.where(df["VolRatio20_60"] <= 0.75, 10, 0)
    flat_risk += np.where(df["VolRatio20_60"] >= 1.35, -4, 0)
    flat_risk += np.where(df["BreakoutScore"] >= 65, -8, 0)

    df["BehaviorFlatRisk"] = np.clip(flat_risk, 0, 100)
    df["BehaviorDirectionComposite"] = direction_composite

    # Reversal / stretched state features.
    df["DistanceMA20"] = (close / ma20.replace(0, np.nan)) - 1
    df["DistanceMA50"] = (close / ma50.replace(0, np.nan)) - 1
    df["MASpread10_20"] = ma_spread_10_20
    df["MASpread20_50"] = ma_spread_20_50

    return df


def prepare_external(external):
    external = external.copy()
    external["Date"] = pd.to_datetime(external["Date"]).dt.date

    for col in ["USDTRY", "BIST100", "Gold", "BrentOil"]:
        external[col] = pd.to_numeric(external[col], errors="coerce")
        external[f"{col}_Return"] = external[col].pct_change()
        external[f"{col}_Mom5"] = external[col].pct_change(5)
        external[f"{col}_Mom20"] = external[col].pct_change(20)

    return external[[
        "Date",
        "USDTRY_Return",
        "BIST100_Return",
        "Gold_Return",
        "BrentOil_Return",
        "USDTRY_Mom5",
        "BIST100_Mom5",
        "Gold_Mom5",
        "BrentOil_Mom5",
        "USDTRY_Mom20",
        "BIST100_Mom20",
        "Gold_Mom20",
        "BrentOil_Mom20",
    ]]


def build_stock_dataset(stock_df, external_df, horizon=10, vol_mult=0.60, min_threshold=0.01):
    df = stock_df.copy()

    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values("Date").reset_index(drop=True)

    df["OpenPrice"] = pd.to_numeric(df["OpenPrice"], errors="coerce")
    df["ClosePrice"] = pd.to_numeric(df["ClosePrice"], errors="coerce")

    if "HighPrice" in df.columns:
        df["HighPrice"] = pd.to_numeric(df["HighPrice"], errors="coerce")
    else:
        df["HighPrice"] = np.nan

    if "LowPrice" in df.columns:
        df["LowPrice"] = pd.to_numeric(df["LowPrice"], errors="coerce")
    else:
        df["LowPrice"] = np.nan

    df["Volume"] = pd.to_numeric(df["Volume"], errors="coerce")

    df = df.dropna(subset=["Date", "OpenPrice", "ClosePrice"])
    df = df[df["ClosePrice"] > 0].copy()

    if len(df) < 220:
        return pd.DataFrame(), []

    # Eski kayıtlar High/Low backfill edilmemişse güvenli fallback.
    df["HighPrice"] = df["HighPrice"].fillna(df[["OpenPrice", "ClosePrice"]].max(axis=1))
    df["LowPrice"] = df["LowPrice"].fillna(df[["OpenPrice", "ClosePrice"]].min(axis=1))
    df["HighPrice"] = df[["HighPrice", "OpenPrice", "ClosePrice"]].max(axis=1)
    df["LowPrice"] = df[["LowPrice", "OpenPrice", "ClosePrice"]].min(axis=1)

    prev_close = df["ClosePrice"].shift(1)

    true_range = pd.concat(
        [
            (df["HighPrice"] - df["LowPrice"]).abs(),
            (df["HighPrice"] - prev_close).abs(),
            (df["LowPrice"] - prev_close).abs()
        ],
        axis=1
    ).max(axis=1)

    intraday_range = (df["HighPrice"] - df["LowPrice"]).replace(0, np.nan)
    candle_body = (df["ClosePrice"] - df["OpenPrice"]).abs()

    df["TrueRange"] = true_range
    df["TrueRangePct"] = true_range / df["ClosePrice"].replace(0, np.nan)
    df["ATR14"] = true_range.rolling(14).mean()
    df["ATR14Pct"] = df["ATR14"] / df["ClosePrice"].replace(0, np.nan)
    df["IntradayRangePct"] = intraday_range / df["ClosePrice"].replace(0, np.nan)
    df["UpperWickPct"] = (df["HighPrice"] - df[["OpenPrice", "ClosePrice"]].max(axis=1)).clip(lower=0) / df["ClosePrice"].replace(0, np.nan)
    df["LowerWickPct"] = (df[["OpenPrice", "ClosePrice"]].min(axis=1) - df["LowPrice"]).clip(lower=0) / df["ClosePrice"].replace(0, np.nan)
    df["BodyPct"] = candle_body / df["ClosePrice"].replace(0, np.nan)
    df["CloseLocationValue"] = ((df["ClosePrice"] - df["LowPrice"]) / intraday_range).clip(0, 1).fillna(0.5)
    df["GapReturn"] = (df["OpenPrice"] / prev_close.replace(0, np.nan)) - 1.0

    df["DateKey"] = df["Date"].dt.date

    df["Return"] = df["ClosePrice"].pct_change()
    df["ReturnLag1"] = df["Return"].shift(1)
    df["ReturnLag2"] = df["Return"].shift(2)
    df["ReturnLag3"] = df["Return"].shift(3)

    df["OpenReturn"] = (df["ClosePrice"] / df["OpenPrice"].replace(0, np.nan)) - 1
    df["VolumeChange"] = np.log1p(df["Volume"]).diff()

    df["MA10"] = df["ClosePrice"].rolling(10).mean()
    df["MA20"] = df["ClosePrice"].rolling(20).mean()
    df["MA50"] = df["ClosePrice"].rolling(50).mean()

    df["MA10_norm"] = (df["ClosePrice"] / df["MA10"].replace(0, np.nan)) - 1
    df["MA20_norm"] = (df["ClosePrice"] / df["MA20"].replace(0, np.nan)) - 1
    df["MA50_norm"] = (df["ClosePrice"] / df["MA50"].replace(0, np.nan)) - 1

    df["RSI14"] = compute_rsi(df["ClosePrice"], 14)
    df["Volatility10"] = df["Return"].rolling(10).std()
    df["Volatility20"] = df["Return"].rolling(20).std()
    df["Volatility60"] = df["Return"].rolling(60).std()

    df = compute_behavior_features(df)

    df = df.merge(
        external_df,
        left_on="DateKey",
        right_on="Date",
        how="left",
        suffixes=("", "_ext")
    )

    df["FutureClose"] = df["ClosePrice"].shift(-horizon)
    df["FutureReturn"] = (df["FutureClose"] / df["ClosePrice"]) - 1

    df["DynamicThreshold"] = np.maximum(
        min_threshold,
        df["Volatility20"].fillna(0) * math.sqrt(horizon) * vol_mult
    )

    df["TargetClass"] = np.select(
        [
            df["FutureReturn"] < -df["DynamicThreshold"],
            df["FutureReturn"] > df["DynamicThreshold"]
        ],
        [CLASS_DOWN, CLASS_UP],
        default=CLASS_FLAT
    )

    df["MoveTarget"] = (df["TargetClass"] != CLASS_FLAT).astype(int)
    df["DirectionTarget"] = np.where(df["TargetClass"] == CLASS_UP, 1, 0)

    feature_cols = [
        "Return",
        "ReturnLag1",
        "ReturnLag2",
        "ReturnLag3",
        "OpenReturn",
        "VolumeChange",
        "MA10_norm",
        "MA20_norm",
        "MA50_norm",
        "RSI14",
        "Volatility10",
        "Volatility20",
        "Volatility60",
        "TrueRangePct",
        "ATR14Pct",
        "IntradayRangePct",
        "UpperWickPct",
        "LowerWickPct",
        "BodyPct",
        "CloseLocationValue",
        "GapReturn",
        "USDTRY_Return",
        "BIST100_Return",
        "Gold_Return",
        "BrentOil_Return",
        "USDTRY_Mom5",
        "BIST100_Mom5",
        "Gold_Mom5",
        "BrentOil_Mom5",
        "USDTRY_Mom20",
        "BIST100_Mom20",
        "Gold_Mom20",
        "BrentOil_Mom20",
        "Mom3",
        "Mom5",
        "Mom10",
        "Mom20",
        "Mom60",
        "RangePosition20",
        "RangePosition60",
        "BreakoutPressure20",
        "BreakoutPressure60",
        "BreakoutScore",
        "VolumeRatio10",
        "VolumeRatio20",
        "VolRatio10_60",
        "VolRatio20_60",
        "BehaviorMomentumScore",
        "BehaviorFlatRisk",
        "BehaviorDirectionComposite",
        "DistanceMA20",
        "DistanceMA50",
        "MASpread10_20",
        "MASpread20_50",
    ]

    keep_cols = [
        "StockID",
        "Date",
        "ClosePrice",
        "FutureReturn",
        "DynamicThreshold",
        "TargetClass",
        "MoveTarget",
        "DirectionTarget"
    ] + feature_cols

    out = df[keep_cols].replace([np.inf, -np.inf], np.nan).dropna().copy()

    return out, feature_cols


# ------------------------------------------------------------
# METRICS
# ------------------------------------------------------------

def confusion_matrix_3(y_true, y_pred):
    matrix = np.zeros((3, 3), dtype=int)

    for t, p in zip(y_true, y_pred):
        if int(t) in [0, 1, 2] and int(p) in [0, 1, 2]:
            matrix[int(t), int(p)] += 1

    return matrix


def evaluate_predictions(y_true, y_pred):
    y_true = np.asarray(y_true).astype(int)
    y_pred = np.asarray(y_pred).astype(int)

    n = len(y_true)

    if n == 0:
        return {}

    accuracy = float(np.mean(y_true == y_pred))

    pred_action = y_pred != CLASS_FLAT
    real_action = y_true != CLASS_FLAT

    action_count = int(pred_action.sum())
    real_action_count = int(real_action.sum())

    action_rate = float(action_count / n)
    real_action_rate = float(real_action_count / n)
    flat_rate = float(np.mean(y_pred == CLASS_FLAT))

    if action_count > 0:
        action_precision = float(np.mean(y_true[pred_action] == y_pred[pred_action]))
    else:
        action_precision = 0.0

    if real_action_count > 0:
        action_recall = float(np.sum((y_true == y_pred) & real_action) / real_action_count)
    else:
        action_recall = 0.0

    if real_action_count > 0:
        direction_accuracy_on_real_moves = float(np.mean(y_true[real_action] == y_pred[real_action]))
    else:
        direction_accuracy_on_real_moves = 0.0

    matrix = confusion_matrix_3(y_true, y_pred)

    return {
        "samples": int(n),
        "accuracy": round(accuracy * 100, 2),
        "actionPrecision": round(action_precision * 100, 2),
        "actionRecall": round(action_recall * 100, 2),
        "actionRate": round(action_rate * 100, 2),
        "realActionRate": round(real_action_rate * 100, 2),
        "flatRate": round(flat_rate * 100, 2),
        "directionAccuracyOnRealMoves": round(direction_accuracy_on_real_moves * 100, 2),
        "confusionMatrix": {
            "labels": ["down", "flat", "up"],
            "matrix": matrix.tolist()
        }
    }


def evaluate_binary(y_true, y_pred):
    y_true = np.asarray(y_true).astype(int)
    y_pred = np.asarray(y_pred).astype(int)

    if len(y_true) == 0:
        return {}

    tp = int(np.sum((y_true == 1) & (y_pred == 1)))
    fp = int(np.sum((y_true == 0) & (y_pred == 1)))
    tn = int(np.sum((y_true == 0) & (y_pred == 0)))
    fn = int(np.sum((y_true == 1) & (y_pred == 0)))

    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    accuracy = (tp + tn) / len(y_true)

    return {
        "accuracy": round(accuracy * 100, 2),
        "precision": round(precision * 100, 2),
        "recall": round(recall * 100, 2),
        "positiveRate": round(float(np.mean(y_pred == 1)) * 100, 2),
        "confusion": {
            "tn": tn,
            "fp": fp,
            "fn": fn,
            "tp": tp
        }
    }


def class_distribution(y):
    y = np.asarray(y).astype(int)
    n = len(y)

    if n == 0:
        return {}

    return {
        "downPct": round(float(np.mean(y == CLASS_DOWN)) * 100, 2),
        "flatPct": round(float(np.mean(y == CLASS_FLAT)) * 100, 2),
        "upPct": round(float(np.mean(y == CLASS_UP)) * 100, 2),
        "downCount": int(np.sum(y == CLASS_DOWN)),
        "flatCount": int(np.sum(y == CLASS_FLAT)),
        "upCount": int(np.sum(y == CLASS_UP)),
        "samples": int(n)
    }


# ------------------------------------------------------------
# MODELS
# ------------------------------------------------------------

def build_models():
    try:
        from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
    except Exception as e:
        raise RuntimeError(
            "scikit-learn bulunamadı. Kurulum: pip install scikit-learn"
        ) from e

    return {
        "logistic_balanced": make_pipeline(
            StandardScaler(),
            LogisticRegression(
                max_iter=1200,
                class_weight="balanced",
                solver="lbfgs"
            )
        ),
        "random_forest_balanced": RandomForestClassifier(
            n_estimators=260,
            max_depth=6,
            min_samples_leaf=8,
            class_weight="balanced_subsample",
            random_state=42,
            n_jobs=-1
        ),
        "gradient_boosting": GradientBoostingClassifier(
            n_estimators=170,
            learning_rate=0.045,
            max_depth=3,
            random_state=42
        )
    }


def fit_model(model, x_train, y_train):
    classes = np.unique(y_train)

    if len(classes) < 2:
        return None, int(classes[0]) if len(classes) else 0

    model.fit(x_train, y_train)
    return model, None


def predict_proba_positive(model, x, constant_class=None):
    if constant_class is not None:
        return np.full(len(x), float(constant_class))

    if hasattr(model, "predict_proba"):
        proba = model.predict_proba(x)
        classes = list(model.classes_) if hasattr(model, "classes_") else None

        # Pipeline stores classes_ on final estimator, not pipeline itself in some sklearn versions.
        if classes is None and hasattr(model, "steps"):
            last = model.steps[-1][1]
            classes = list(getattr(last, "classes_", [0, 1]))

        if 1 in classes:
            idx = classes.index(1)
            return proba[:, idx]

        return proba[:, -1]

    pred = model.predict(x)
    return pred.astype(float)


def two_stage_predict(move_prob, up_prob, move_threshold, direction_threshold):
    move = move_prob >= move_threshold

    pred = np.full(len(move_prob), CLASS_FLAT, dtype=int)

    # Direction classifier: probability up >= threshold => up.
    # probability up <= 1-threshold => down.
    # arada kalırsa flat.
    up_mask = move & (up_prob >= direction_threshold)
    down_mask = move & (up_prob <= (1.0 - direction_threshold))

    pred[up_mask] = CLASS_UP
    pred[down_mask] = CLASS_DOWN

    return pred


def score_metrics(metrics, min_action_rate=5, max_action_rate=65):
    ap = metrics.get("actionPrecision", 0)
    ar = metrics.get("actionRecall", 0)
    acc = metrics.get("accuracy", 0)
    action_rate = metrics.get("actionRate", 0)

    if action_rate < min_action_rate:
        action_penalty = (min_action_rate - action_rate) * 5.0
    elif action_rate > max_action_rate:
        action_penalty = (action_rate - max_action_rate) * 2.5
    else:
        action_penalty = 0.0

    # Precision ana hedef, recall ikinci hedef.
    return (ap * 14.0) + (ar * 4.5) + (acc * 1.5) - action_penalty


def choose_two_stage_thresholds(
    y_val_class,
    move_val,
    move_prob_val,
    up_prob_val,
    min_action_rate=5,
    max_action_rate=65
):
    best = None

    move_thresholds = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75]
    direction_thresholds = [0.50, 0.55, 0.60, 0.65, 0.70, 0.75]

    for mt in move_thresholds:
        for dt in direction_thresholds:
            pred = two_stage_predict(move_prob_val, up_prob_val, mt, dt)
            metrics = evaluate_predictions(y_val_class, pred)
            move_binary = (move_prob_val >= mt).astype(int)
            move_metrics = evaluate_binary(move_val, move_binary)

            score = score_metrics(
                metrics,
                min_action_rate=min_action_rate,
                max_action_rate=max_action_rate
            )

            item = {
                "moveThreshold": mt,
                "directionThreshold": dt,
                "score": round(float(score), 4),
                "metrics": metrics,
                "moveMetrics": move_metrics
            }

            if best is None or item["score"] > best["score"]:
                best = item

    return best


# ------------------------------------------------------------
# LAB RUNNER
# ------------------------------------------------------------

def split_train_validation_test(data, test_ratio=0.25, validation_ratio=0.15):
    data = data.sort_values("Date").reset_index(drop=True)

    n = len(data)
    test_size = int(n * test_ratio)
    val_size = int(n * validation_ratio)
    train_size = n - test_size - val_size

    if train_size < 120 or val_size < 40 or test_size < 40:
        return None, None, None

    train = data.iloc[:train_size].copy()
    val = data.iloc[train_size:train_size + val_size].copy()
    test = data.iloc[train_size + val_size:].copy()

    return train, val, test


def evaluate_stock_two_stage(symbol, stock_id, data, feature_cols, test_ratio=0.25, validation_ratio=0.15):
    train, val, test = split_train_validation_test(data, test_ratio, validation_ratio)

    if train is None:
        return {
            "stockID": int(stock_id),
            "symbol": symbol,
            "status": "skipped",
            "reason": "Yetersiz train/validation/test örneği",
            "samples": int(len(data))
        }

    x_train = train[feature_cols].values
    x_val = val[feature_cols].values
    x_test = test[feature_cols].values

    y_train_class = train["TargetClass"].values.astype(int)
    y_val_class = val["TargetClass"].values.astype(int)
    y_test_class = test["TargetClass"].values.astype(int)

    y_train_move = train["MoveTarget"].values.astype(int)
    y_val_move = val["MoveTarget"].values.astype(int)
    y_test_move = test["MoveTarget"].values.astype(int)

    move_train = train[train["MoveTarget"] == 1].copy()

    if len(move_train) < 40 or len(np.unique(move_train["DirectionTarget"].values.astype(int))) < 2:
        return {
            "stockID": int(stock_id),
            "symbol": symbol,
            "status": "skipped",
            "reason": "Direction stage için yeterli up/down move örneği yok",
            "samples": int(len(data)),
            "moveTrainSamples": int(len(move_train))
        }

    x_train_dir = move_train[feature_cols].values
    y_train_dir = move_train["DirectionTarget"].values.astype(int)

    result = {
        "stockID": int(stock_id),
        "symbol": symbol,
        "status": "ok",
        "samples": int(len(data)),
        "trainSamples": int(len(train)),
        "validationSamples": int(len(val)),
        "testSamples": int(len(test)),
        "validationStart": str(val["Date"].iloc[0].date()),
        "validationEnd": str(val["Date"].iloc[-1].date()),
        "testStart": str(test["Date"].iloc[0].date()),
        "testEnd": str(test["Date"].iloc[-1].date()),
        "trainClassDistribution": class_distribution(y_train_class),
        "validationClassDistribution": class_distribution(y_val_class),
        "testClassDistribution": class_distribution(y_test_class),
        "baselines": {},
        "twoStageCandidates": [],
        "bestCandidate": None,
        "bestMetrics": None
    }

    pred_flat = np.full(len(y_test_class), CLASS_FLAT)
    result["baselines"]["always_flat"] = evaluate_predictions(y_test_class, pred_flat)

    rng = np.random.default_rng(42)
    train_vals, train_counts = np.unique(y_train_class, return_counts=True)
    train_probs = train_counts / train_counts.sum()
    pred_random = rng.choice(train_vals, size=len(y_test_class), p=train_probs)
    result["baselines"]["train_distribution_random"] = evaluate_predictions(y_test_class, pred_random)

    model_factories = build_models()

    best = None

    for move_name, move_model_template in model_factories.items():
        move_model, move_constant = fit_model(move_model_template, x_train, y_train_move)

        move_prob_val = predict_proba_positive(move_model, x_val, move_constant)
        move_prob_test = predict_proba_positive(move_model, x_test, move_constant)

        for dir_name, dir_model_template in build_models().items():
            dir_model, dir_constant = fit_model(dir_model_template, x_train_dir, y_train_dir)

            up_prob_val = predict_proba_positive(dir_model, x_val, dir_constant)
            up_prob_test = predict_proba_positive(dir_model, x_test, dir_constant)

            threshold_result = choose_two_stage_thresholds(
                y_val_class=y_val_class,
                move_val=y_val_move,
                move_prob_val=move_prob_val,
                up_prob_val=up_prob_val
            )

            pred_test = two_stage_predict(
                move_prob_test,
                up_prob_test,
                threshold_result["moveThreshold"],
                threshold_result["directionThreshold"]
            )

            test_metrics = evaluate_predictions(y_test_class, pred_test)
            move_binary_test = (move_prob_test >= threshold_result["moveThreshold"]).astype(int)
            move_metrics_test = evaluate_binary(y_test_move, move_binary_test)

            selection_score = threshold_result["score"]

            candidate = {
                "moveModel": move_name,
                "directionModel": dir_name,
                "moveThreshold": threshold_result["moveThreshold"],
                "directionThreshold": threshold_result["directionThreshold"],
                "selectionScore": selection_score,
                "validationMetrics": threshold_result["metrics"],
                "validationMoveMetrics": threshold_result["moveMetrics"],
                "testMetrics": test_metrics,
                "testMoveMetrics": move_metrics_test,
                "selectionActionPrecisionGap": round(
                    test_metrics.get("actionPrecision", 0) - threshold_result["metrics"].get("actionPrecision", 0),
                    2
                )
            }

            result["twoStageCandidates"].append(candidate)

            if best is None or candidate["selectionScore"] > best["selectionScore"]:
                best = candidate

    result["bestCandidate"] = {
        "moveModel": best["moveModel"],
        "directionModel": best["directionModel"],
        "moveThreshold": best["moveThreshold"],
        "directionThreshold": best["directionThreshold"],
        "selectionScore": best["selectionScore"],
        "validationMetrics": best["validationMetrics"],
        "validationMoveMetrics": best["validationMoveMetrics"],
        "selectionActionPrecisionGap": best["selectionActionPrecisionGap"]
    }

    result["bestMetrics"] = best["testMetrics"]
    result["bestMoveMetrics"] = best["testMoveMetrics"]

    return result


def aggregate_results(results):
    ok = [r for r in results if r.get("status") == "ok" and r.get("bestMetrics")]

    if not ok:
        return {
            "okStocks": 0,
            "message": "Geçerli sonuç yok."
        }

    def avg(key):
        vals = [
            r["bestMetrics"].get(key)
            for r in ok
            if r["bestMetrics"].get(key) is not None
        ]

        return round(float(np.mean(vals)), 2) if vals else 0.0

    def stable_gap(r, limit=12):
        return abs((r.get("bestCandidate") or {}).get("selectionActionPrecisionGap", 999)) <= limit

    strong = [
        r for r in ok
        if r["bestMetrics"].get("actionPrecision", 0) >= 55
        and 10 <= r["bestMetrics"].get("actionRate", 0) <= 60
        and r.get("testSamples", 0) >= 150
        and stable_gap(r)
    ]

    near = [
        r for r in ok
        if r["bestMetrics"].get("actionPrecision", 0) >= 50
        and 7 <= r["bestMetrics"].get("actionRate", 0) <= 65
        and stable_gap(r)
    ]

    small_sample = [
        r for r in ok
        if r["bestMetrics"].get("actionPrecision", 0) >= 50
        and r.get("testSamples", 0) < 150
    ]

    unstable = [
        r for r in ok
        if abs((r.get("bestCandidate") or {}).get("selectionActionPrecisionGap", 0)) > 15
    ]

    flat_collapsed = [
        r for r in ok
        if r["bestMetrics"].get("flatRate", 0) >= 90
    ]

    best_sorted = sorted(
        [
            {
                "stockID": r["stockID"],
                "symbol": r["symbol"],
                "testSamples": r.get("testSamples"),
                "moveModel": (r.get("bestCandidate") or {}).get("moveModel"),
                "directionModel": (r.get("bestCandidate") or {}).get("directionModel"),
                "actionPrecision": r["bestMetrics"].get("actionPrecision", 0),
                "actionRate": r["bestMetrics"].get("actionRate", 0),
                "actionRecall": r["bestMetrics"].get("actionRecall", 0),
                "accuracy": r["bestMetrics"].get("accuracy", 0),
                "validationActionPrecision": (r.get("bestCandidate") or {}).get("validationMetrics", {}).get("actionPrecision", 0),
                "selectionGap": (r.get("bestCandidate") or {}).get("selectionActionPrecisionGap", 0)
            }
            for r in ok
        ],
        key=lambda x: x["actionPrecision"],
        reverse=True
    )

    return {
        "okStocks": len(ok),
        "avgAccuracy": avg("accuracy"),
        "avgActionPrecision": avg("actionPrecision"),
        "avgActionRecall": avg("actionRecall"),
        "avgActionRate": avg("actionRate"),
        "avgFlatRate": avg("flatRate"),
        "strongCandidateCount": len(strong),
        "nearCandidateCount": len(near),
        "smallSampleCandidateCount": len(small_sample),
        "validationUnstableCount": len(unstable),
        "flatCollapsedCount": len(flat_collapsed),
        "strongCandidates": [
            {
                "stockID": r["stockID"],
                "symbol": r["symbol"],
                "testSamples": r.get("testSamples"),
                "bestCandidate": r.get("bestCandidate"),
                "metrics": r["bestMetrics"],
                "moveMetrics": r.get("bestMoveMetrics")
            }
            for r in strong
        ],
        "nearCandidates": [
            {
                "stockID": r["stockID"],
                "symbol": r["symbol"],
                "testSamples": r.get("testSamples"),
                "bestCandidate": r.get("bestCandidate"),
                "metrics": r["bestMetrics"],
                "moveMetrics": r.get("bestMoveMetrics")
            }
            for r in near
        ],
        "smallSampleCandidates": [
            {
                "stockID": r["stockID"],
                "symbol": r["symbol"],
                "testSamples": r.get("testSamples"),
                "bestCandidate": r.get("bestCandidate"),
                "metrics": r["bestMetrics"],
                "moveMetrics": r.get("bestMoveMetrics")
            }
            for r in small_sample
        ],
        "validationUnstable": [
            {
                "stockID": r["stockID"],
                "symbol": r["symbol"],
                "moveModel": (r.get("bestCandidate") or {}).get("moveModel"),
                "directionModel": (r.get("bestCandidate") or {}).get("directionModel"),
                "selectionActionPrecisionGap": (r.get("bestCandidate") or {}).get("selectionActionPrecisionGap"),
                "testActionPrecision": r["bestMetrics"].get("actionPrecision", 0),
                "validationActionPrecision": (r.get("bestCandidate") or {}).get("validationMetrics", {}).get("actionPrecision", 0)
            }
            for r in unstable[:20]
        ],
        "bestByActionPrecision": best_sorted[:12],
        "worstByActionPrecision": sorted(best_sorted, key=lambda x: x["actionPrecision"])[:12]
    }


def run_lab(args):
    print("🧪 v12 Direction Lab EPSILON TWO-STAGE başlıyor...")
    print(f"   horizon={args.horizon}, stock={args.stock}, test_ratio={args.test_ratio}, validation_ratio={args.validation_ratio}")

    stock_id_filter = None if args.stock == "all" else int(args.stock)

    stocks, hist, external = read_sql_data(stock_id_filter)
    external_features = prepare_external(external)

    hist["Date"] = pd.to_datetime(hist["Date"])
    hist["StockID"] = pd.to_numeric(hist["StockID"], errors="coerce").astype("Int64")

    if stock_id_filter is not None:
        stocks = stocks[stocks["StockID"] == stock_id_filter].copy()

    results = []

    for _, stock in stocks.iterrows():
        stock_id = int(stock["StockID"])
        symbol = str(stock["Symbol"])

        stock_hist = hist[hist["StockID"] == stock_id].copy()

        print(f"\n▶ {stock_id} - {symbol} | kayıt={len(stock_hist)}")

        try:
            dataset, feature_cols = build_stock_dataset(
                stock_hist,
                external_features,
                horizon=args.horizon,
                vol_mult=args.vol_mult,
                min_threshold=args.min_threshold
            )

            if len(dataset) < args.min_samples:
                item = {
                    "stockID": stock_id,
                    "symbol": symbol,
                    "status": "skipped",
                    "reason": f"Yetersiz örnek: {len(dataset)}",
                    "samples": int(len(dataset))
                }
                results.append(item)
                print(f"   ⚠️ skipped: {item['reason']}")
                continue

            result = evaluate_stock_two_stage(
                symbol=symbol,
                stock_id=stock_id,
                data=dataset,
                feature_cols=feature_cols,
                test_ratio=args.test_ratio,
                validation_ratio=args.validation_ratio
            )

            results.append(result)

            if result.get("status") == "ok":
                bm = result.get("bestMetrics") or {}
                bc = result.get("bestCandidate") or {}
                print(
                    f"   ✅ move={bc.get('moveModel')} dir={bc.get('directionModel')} | "
                    f"acc={bm.get('accuracy')} | "
                    f"actionPrec={bm.get('actionPrecision')} | "
                    f"actionRecall={bm.get('actionRecall')} | "
                    f"actionRate={bm.get('actionRate')} | "
                    f"flat={bm.get('flatRate')} | "
                    f"gap={bc.get('selectionActionPrecisionGap')}"
                )
            else:
                print(f"   ⚠️ {result.get('reason')}")

        except Exception as e:
            results.append({
                "stockID": stock_id,
                "symbol": symbol,
                "status": "error",
                "error": str(e)
            })
            print(f"   ❌ error: {e}")

    summary = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "version": "v12_direction_lab_epsilon_two_stage_ohlcv",
        "horizon": args.horizon,
        "stock": args.stock,
        "testRatio": args.test_ratio,
        "validationRatio": args.validation_ratio,
        "volMult": args.vol_mult,
        "minThreshold": args.min_threshold,
        "architecture": "two_stage_move_then_direction",
        "resultSummary": aggregate_results(results),
        "results": results
    }

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / f"v12_direction_lab_two_stage_h{args.horizon}_{args.stock}.json"
    csv_path = out_dir / f"v12_direction_lab_two_stage_h{args.horizon}_{args.stock}_summary.csv"

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    rows = []

    for r in results:
        bm = r.get("bestMetrics") or {}
        bc = r.get("bestCandidate") or {}
        mm = r.get("bestMoveMetrics") or {}

        rows.append({
            "stockID": r.get("stockID"),
            "symbol": r.get("symbol"),
            "status": r.get("status"),
            "samples": r.get("samples"),
            "testSamples": r.get("testSamples"),
            "moveModel": bc.get("moveModel"),
            "directionModel": bc.get("directionModel"),
            "moveThreshold": bc.get("moveThreshold"),
            "directionThreshold": bc.get("directionThreshold"),
            "accuracy": bm.get("accuracy"),
            "actionPrecision": bm.get("actionPrecision"),
            "actionRecall": bm.get("actionRecall"),
            "actionRate": bm.get("actionRate"),
            "flatRate": bm.get("flatRate"),
            "directionAccuracyOnRealMoves": bm.get("directionAccuracyOnRealMoves"),
            "movePrecision": mm.get("precision"),
            "moveRecall": mm.get("recall"),
            "movePositiveRate": mm.get("positiveRate"),
            "validationActionPrecision": bc.get("validationMetrics", {}).get("actionPrecision"),
            "selectionGap": bc.get("selectionActionPrecisionGap")
        })

    pd.DataFrame(rows).to_csv(csv_path, index=False, encoding="utf-8-sig")

    print("\n============================================================")
    print("📌 GENEL ÖZET")
    print(json.dumps(summary["resultSummary"], ensure_ascii=False, indent=2))
    print("============================================================")
    print(f"JSON çıktı: {json_path}")
    print(f"CSV çıktı : {csv_path}")

    return summary


def parse_args():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--horizon",
        type=int,
        default=10,
        choices=[5, 10, 20],
        help="Future return horizon."
    )

    parser.add_argument(
        "--stock",
        type=str,
        default="all",
        help="all veya tek StockID."
    )

    parser.add_argument(
        "--test-ratio",
        type=float,
        default=0.25,
        help="Son yüzde kaç veri test seti olsun."
    )

    parser.add_argument(
        "--validation-ratio",
        type=float,
        default=0.15,
        help="Train ile test arasındaki validation oranı."
    )

    parser.add_argument(
        "--vol-mult",
        type=float,
        default=0.60,
        help="Dinamik threshold için volatility çarpanı."
    )

    parser.add_argument(
        "--min-threshold",
        type=float,
        default=0.01,
        help="Minimum sınıf eşiği."
    )

    parser.add_argument(
        "--min-samples",
        type=int,
        default=220,
        help="Minimum feature/target örnek sayısı."
    )

    parser.add_argument(
        "--output-dir",
        type=str,
        default="artifacts/v12_direction_lab",
        help="Çıktı klasörü."
    )

    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_lab(args)
