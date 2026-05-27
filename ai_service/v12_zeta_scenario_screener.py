# ai_service/v12_zeta_scenario_screener.py
# ============================================================
# Pusula AI v12 - Zeta Scenario Screener
# ------------------------------------------------------------
# amaç:
#   bist hisselerini tek tek ayrı modellemek yerine global panel veri seti
#   üzerinde eğitmek ve hisseleri işlem senaryolarına göre sınıflandırmak.
#
# senaryolar:
#   - momentum_long
#   - dip_rebound_watch
#   - downside_risk
#   - neutral
#
# çıktı:
#   artifacts/v12_zeta/zeta_scenario_report.json
#   artifacts/v12_zeta/zeta_latest_radar.json
#   artifacts/v12_zeta/zeta_backtest_summary.json
#   artifacts/v12_zeta/zeta_latest_radar.csv
# ============================================================

import argparse
import json
import math
import os
import warnings
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")


CLASS_DOWN = 0
CLASS_FLAT = 1
CLASS_UP = 2

SCENARIO_MOMENTUM_LONG = "MOMENTUM_LONG"
SCENARIO_DIP_REBOUND = "DIP_REBOUND_WATCH"
SCENARIO_DOWNSIDE_RISK = "DOWNSIDE_RISK"
SCENARIO_NEUTRAL = "NEUTRAL"

BIST_SYMBOL_EXCEPTIONS = {
    "KOZAY",
    "KOZAL",
    "KOZAA",
}


# ============================================================
# yardımcı fonksiyonlar
# ============================================================

def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    if not np.isfinite(value):
        return 0.0

    return float(max(low, min(high, value)))


def norm01(value: float, low: float, high: float, invert: bool = False) -> float:
    if not np.isfinite(value) or high == low:
        out = 0.0
    else:
        out = (value - low) / (high - low)

    out = max(0.0, min(1.0, out))

    if invert:
        return 1.0 - out

    return out


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        out = float(value)
        return out if np.isfinite(out) else default
    except Exception:
        return default


def detect_market(symbol: str) -> str:
    symbol = str(symbol or "").upper().strip()

    if symbol == "XU100.IS":
        return "BIST_INDEX"

    if symbol.endswith(".IS") or symbol in BIST_SYMBOL_EXCEPTIONS:
        return "BIST"

    return "US"


def to_serializable(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {str(k): to_serializable(v) for k, v in obj.items()}

    if isinstance(obj, list):
        return [to_serializable(x) for x in obj]

    if isinstance(obj, tuple):
        return [to_serializable(x) for x in obj]

    if isinstance(obj, np.integer):
        return int(obj)

    if isinstance(obj, np.floating):
        return float(obj)

    if isinstance(obj, (pd.Timestamp, datetime)):
        return obj.isoformat()

    try:
        if pd.isna(obj):
            return None
    except Exception:
        pass

    return obj


# ============================================================
# veritabanı bağlantısı
# ============================================================

def get_db_connection():
    """
    bağlantı önceliği:
    1) main.py içindeki get_connection()
    2) main.py içindeki _behavior_get_connection()
    3) ortam değişkeni: DB_CONN_STR
    4) yerel sql server varsayılan bağlantısı
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

    if not conn_str:
        conn_str = (
            r"DRIVER={ODBC Driver 17 for SQL Server};"
            r"SERVER=localhost\SQLEXPRESS;"
            r"DATABASE=Eskiz1DB;"
            r"Trusted_Connection=yes;"
            r"TrustServerCertificate=yes;"
        )

    import pyodbc
    return pyodbc.connect(conn_str)


def read_sql_data() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    conn = get_db_connection()

    try:
        stocks = pd.read_sql(
            """
            SELECT StockID, Symbol, CompanyName, Sector
            FROM Stocks
            ORDER BY StockID
            """,
            conn,
        )

        historical = pd.read_sql(
            """
            SELECT
                StockID,
                Date,
                OpenPrice,
                HighPrice,
                LowPrice,
                ClosePrice,
                Volume
            FROM HistoricalData
            ORDER BY StockID, Date
            """,
            conn,
        )

        external = pd.read_sql(
            """
            SELECT
                Date,
                USDTRY,
                BIST100,
                Gold,
                BrentOil
            FROM ExternalData
            ORDER BY Date
            """,
            conn,
        )

        return stocks, historical, external

    finally:
        try:
            conn.close()
        except Exception:
            pass


# ============================================================
# temel feature yardımcıları
# ============================================================

def clean_numeric(df: pd.DataFrame, cols: List[str]) -> pd.DataFrame:
    for col in cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    return rsi.fillna(50)


def prepare_external(external: pd.DataFrame) -> pd.DataFrame:
    external = external.copy()

    if external.empty:
        return pd.DataFrame(columns=[
            "DateKey",
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
        ])

    external["Date"] = pd.to_datetime(external["Date"])
    external = external.sort_values("Date").reset_index(drop=True)
    external["DateKey"] = external["Date"].dt.date

    for col in ["USDTRY", "BIST100", "Gold", "BrentOil"]:
        external[col] = pd.to_numeric(external[col], errors="coerce")
        external[f"{col}_Return"] = external[col].pct_change()
        external[f"{col}_Mom5"] = external[col].pct_change(5)
        external[f"{col}_Mom20"] = external[col].pct_change(20)

    return external[[
        "DateKey",
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


def build_index_reference(hist: pd.DataFrame, stocks: pd.DataFrame) -> pd.DataFrame:
    stocks = stocks.copy()
    stocks["SymbolNorm"] = stocks["Symbol"].astype(str).str.upper().str.strip()

    index_row = stocks[stocks["SymbolNorm"] == "XU100.IS"]

    if index_row.empty:
        return pd.DataFrame(columns=[
            "DateKey",
            "XU100_Return",
            "XU100_Mom5",
            "XU100_Mom20",
            "XU100_Vol20",
            "XU100_RangePosition60",
        ])

    index_id = int(index_row.iloc[0]["StockID"])
    idx = hist[hist["StockID"] == index_id].copy()

    if idx.empty:
        return pd.DataFrame(columns=[
            "DateKey",
            "XU100_Return",
            "XU100_Mom5",
            "XU100_Mom20",
            "XU100_Vol20",
            "XU100_RangePosition60",
        ])

    idx["Date"] = pd.to_datetime(idx["Date"])
    idx = idx.sort_values("Date").reset_index(drop=True)
    idx = clean_numeric(idx, ["OpenPrice", "HighPrice", "LowPrice", "ClosePrice", "Volume"])
    idx = idx.dropna(subset=["Date", "ClosePrice"])
    idx = idx[idx["ClosePrice"] > 0].copy()

    close = idx["ClosePrice"].astype(float)
    returns = close.pct_change()

    idx["DateKey"] = idx["Date"].dt.date
    idx["XU100_Return"] = returns
    idx["XU100_Mom5"] = close.pct_change(5)
    idx["XU100_Mom20"] = close.pct_change(20)
    idx["XU100_Vol20"] = returns.rolling(20).std()

    high60 = close.rolling(60).max()
    low60 = close.rolling(60).min()

    idx["XU100_RangePosition60"] = (
        (close - low60) / (high60 - low60).replace(0, np.nan)
    ).clip(0, 1)

    return idx[[
        "DateKey",
        "XU100_Return",
        "XU100_Mom5",
        "XU100_Mom20",
        "XU100_Vol20",
        "XU100_RangePosition60",
    ]]

def add_price_features(df: pd.DataFrame) -> pd.DataFrame:
    close = df["ClosePrice"].astype(float)
    open_price = df["OpenPrice"].astype(float)
    high = df["HighPrice"].astype(float)
    low = df["LowPrice"].astype(float)
    volume = df["Volume"].fillna(0).astype(float)

    previous_close = close.shift(1)

    df["Return"] = close.pct_change()
    df["ReturnLag1"] = df["Return"].shift(1)
    df["ReturnLag2"] = df["Return"].shift(2)
    df["ReturnLag3"] = df["Return"].shift(3)
    df["OpenReturn"] = (close / open_price.replace(0, np.nan)) - 1
    df["GapReturn"] = (open_price / previous_close.replace(0, np.nan)) - 1
    df["VolumeChange"] = np.log1p(volume).diff()

    df["Mom3"] = close.pct_change(3)
    df["Mom5"] = close.pct_change(5)
    df["Mom10"] = close.pct_change(10)
    df["Mom20"] = close.pct_change(20)
    df["Mom60"] = close.pct_change(60)

    ma10 = close.rolling(10).mean()
    ma20 = close.rolling(20).mean()
    ma50 = close.rolling(50).mean()

    df["MA10_norm"] = (close / ma10.replace(0, np.nan)) - 1
    df["MA20_norm"] = (close / ma20.replace(0, np.nan)) - 1
    df["MA50_norm"] = (close / ma50.replace(0, np.nan)) - 1
    df["MASpread10_20"] = (ma10 / ma20.replace(0, np.nan)) - 1
    df["MASpread20_50"] = (ma20 / ma50.replace(0, np.nan)) - 1
    df["DistanceMA20"] = df["MA20_norm"]
    df["DistanceMA50"] = df["MA50_norm"]

    df["RSI14"] = compute_rsi(close, 14)

    df["Volatility10"] = df["Return"].rolling(10).std()
    df["Volatility20"] = df["Return"].rolling(20).std()
    df["Volatility60"] = df["Return"].rolling(60).std()
    df["VolRatio10_60"] = df["Volatility10"] / df["Volatility60"].replace(0, np.nan)
    df["VolRatio20_60"] = df["Volatility20"] / df["Volatility60"].replace(0, np.nan)

    true_range = pd.concat(
        [
            high - low,
            (high - previous_close).abs(),
            (low - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)

    intraday_range = (high - low).replace(0, np.nan)
    candle_body = (close - open_price).abs()

    df["TrueRange"] = true_range
    df["TrueRangePct"] = true_range / close.replace(0, np.nan)
    df["ATR14"] = true_range.rolling(14).mean()
    df["ATRPercent"] = df["ATR14"] / close.replace(0, np.nan)
    df["IntradayRangePct"] = (high - low) / close.replace(0, np.nan)
    df["IntradayRangeATR"] = (high - low) / df["ATR14"].replace(0, np.nan)

    df["UpperWickPct"] = (
        high - pd.concat([open_price, close], axis=1).max(axis=1)
    ).clip(lower=0) / intraday_range

    df["LowerWickPct"] = (
        pd.concat([open_price, close], axis=1).min(axis=1) - low
    ).clip(lower=0) / intraday_range

    df["BodyPct"] = candle_body / intraday_range
    df["CloseLocationValue"] = ((close - low) / intraday_range).clip(0, 1).fillna(0.5)

    df["VolumeMean10"] = volume.rolling(10).mean()
    df["VolumeMean20"] = volume.rolling(20).mean()
    df["VolumeRatio10"] = volume / df["VolumeMean10"].replace(0, np.nan)
    df["VolumeRatio20"] = volume / df["VolumeMean20"].replace(0, np.nan)

    high20 = close.rolling(20).max()
    low20 = close.rolling(20).min()
    high60 = close.rolling(60).max()
    low60 = close.rolling(60).min()

    df["RangePosition20"] = ((close - low20) / (high20 - low20).replace(0, np.nan)).clip(0, 1)
    df["RangePosition60"] = ((close - low60) / (high60 - low60).replace(0, np.nan)).clip(0, 1)

    df["BreakoutPressure20"] = (df["RangePosition20"] - 0.5) * 200
    df["BreakoutPressure60"] = (df["RangePosition60"] - 0.5) * 200
    df["BreakoutScore"] = df["BreakoutPressure60"].abs()

    safe_vol20 = df["Volatility20"].fillna(0.0).clip(lower=0.0005)

    z_mom5 = (df["Mom5"] / (safe_vol20 * math.sqrt(5))).clip(-3, 3)
    z_mom20 = (df["Mom20"] / (safe_vol20 * math.sqrt(20))).clip(-3, 3)
    z_ma = (df["MASpread20_50"] / (safe_vol20 * 2.0).clip(lower=0.0005)).clip(-3, 3)

    momentum_raw = (0.30 * z_mom5) + (0.45 * z_mom20) + (0.25 * z_ma)
    df["BehaviorMomentumScore"] = np.tanh(momentum_raw / 1.20) * 100

    direction_composite = (
        0.50 * df["BehaviorMomentumScore"].fillna(0)
        + 0.22 * df["BreakoutPressure60"].fillna(0)
        + 0.14 * df["BreakoutPressure20"].fillna(0)
        + 0.14 * ((df["CloseLocationValue"].fillna(0.5) - 0.5) * 200)
    ).clip(-100, 100)

    flat_risk = 100 - direction_composite.abs()
    flat_risk += np.where(df["VolRatio20_60"] <= 0.75, 10, 0)
    flat_risk += np.where(df["VolRatio20_60"] >= 1.35, -4, 0)
    flat_risk += np.where(df["BreakoutScore"] >= 65, -8, 0)
    flat_risk += np.where(df["IntradayRangeATR"] >= 1.5, -4, 0)

    df["BehaviorDirectionComposite"] = direction_composite
    df["BehaviorFlatRisk"] = np.clip(flat_risk, 0, 100)

    return df


def add_future_outcomes(
    df: pd.DataFrame,
    horizon: int,
    vol_mult: float,
    min_threshold: float,
) -> pd.DataFrame:
    close = df["ClosePrice"].astype(float)
    high = df["HighPrice"].astype(float)
    low = df["LowPrice"].astype(float)

    df["FutureClose"] = close.shift(-horizon)
    df["FutureDate"] = df["Date"].shift(-horizon)
    df["FutureReturn"] = (df["FutureClose"] / close) - 1

    df["DynamicThreshold"] = np.maximum(
        min_threshold,
        df["Volatility20"].fillna(0.0) * math.sqrt(horizon) * vol_mult,
    )

    df["TargetClass"] = np.select(
        [
            df["FutureReturn"] < -df["DynamicThreshold"],
            df["FutureReturn"] > df["DynamicThreshold"],
        ],
        [CLASS_DOWN, CLASS_UP],
        default=CLASS_FLAT,
    )

    for future_horizon in [5, 10, 20]:
        future_close = close.shift(-future_horizon)

        future_max_high = high.shift(-1).rolling(
            future_horizon,
            min_periods=future_horizon,
        ).max().shift(-(future_horizon - 1))

        future_min_low = low.shift(-1).rolling(
            future_horizon,
            min_periods=future_horizon,
        ).min().shift(-(future_horizon - 1))

        df[f"FutureReturn{future_horizon}"] = (future_close / close) - 1
        df[f"FutureMaxReturn{future_horizon}"] = (future_max_high / close) - 1
        df[f"FutureMaxDrawdown{future_horizon}"] = (future_min_low / close) - 1

        upper_barrier = np.maximum(
            min_threshold,
            df["Volatility20"].fillna(0.0) * math.sqrt(future_horizon) * vol_mult,
        )
        lower_barrier = -upper_barrier

        hit_upper_first = []
        hit_lower_first = []

        high_values = high.values
        low_values = low.values
        close_values = close.values
        upper_values = upper_barrier.values
        lower_values = lower_barrier.values

        for i in range(len(df)):
            upper_day = None
            lower_day = None

            if i + future_horizon >= len(df):
                hit_upper_first.append(np.nan)
                hit_lower_first.append(np.nan)
                continue

            base_price = close_values[i]

            if not np.isfinite(base_price) or base_price <= 0:
                hit_upper_first.append(np.nan)
                hit_lower_first.append(np.nan)
                continue

            for step in range(1, future_horizon + 1):
                j = i + step

                high_return = (high_values[j] / base_price) - 1
                low_return = (low_values[j] / base_price) - 1

                if upper_day is None and high_return >= upper_values[i]:
                    upper_day = step

                if lower_day is None and low_return <= lower_values[i]:
                    lower_day = step

            hit_upper_first.append(
                1.0 if upper_day is not None and (lower_day is None or upper_day <= lower_day) else 0.0
            )
            hit_lower_first.append(
                1.0 if lower_day is not None and (upper_day is None or lower_day < upper_day) else 0.0
            )

        df[f"HitUpperBeforeLower{future_horizon}"] = hit_upper_first
        df[f"HitLowerBeforeUpper{future_horizon}"] = hit_lower_first

    return df


def build_stock_frame(
    stock_row: pd.Series,
    historical: pd.DataFrame,
    external_features: pd.DataFrame,
    index_ref: pd.DataFrame,
    args: argparse.Namespace,
) -> pd.DataFrame:
    stock_id = int(stock_row["StockID"])
    symbol = str(stock_row["Symbol"])

    df = historical[historical["StockID"] == stock_id].copy()

    if df.empty:
        return pd.DataFrame()

    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values("Date").reset_index(drop=True)

    df = clean_numeric(df, ["OpenPrice", "HighPrice", "LowPrice", "ClosePrice", "Volume"])

    df = df.dropna(subset=["Date", "OpenPrice", "HighPrice", "LowPrice", "ClosePrice"])
    df = df[
        (df["OpenPrice"] > 0)
        & (df["HighPrice"] > 0)
        & (df["LowPrice"] > 0)
        & (df["ClosePrice"] > 0)
        & (df["HighPrice"] >= df["LowPrice"])
    ].copy()

    if len(df) < args.min_history:
        return pd.DataFrame()

    df["StockID"] = stock_id
    df["Symbol"] = symbol
    df["Market"] = detect_market(symbol)
    df["DateKey"] = df["Date"].dt.date

    df = add_price_features(df)

    df = df.merge(external_features, on="DateKey", how="left")
    df = df.merge(index_ref, on="DateKey", how="left")

    external_cols = [c for c in df.columns if c.startswith(("USDTRY_", "BIST100_", "Gold_", "BrentOil_"))]
    index_cols = [c for c in df.columns if c.startswith("XU100_")]

    df[external_cols + index_cols] = df[external_cols + index_cols].ffill().fillna(0)

    df["RelativeReturnToXU100"] = df["Return"] - df["XU100_Return"]
    df["RelativeMom5ToXU100"] = df["Mom5"] - df["XU100_Mom5"]
    df["RelativeMom20ToXU100"] = df["Mom20"] - df["XU100_Mom20"]
    df["RelativeVol20ToXU100"] = df["Volatility20"] / df["XU100_Vol20"].replace(0, np.nan)
    df["RangePositionVsXU100"] = df["RangePosition60"] - df["XU100_RangePosition60"]

    df = add_future_outcomes(
        df=df,
        horizon=args.horizon,
        vol_mult=args.vol_mult,
        min_threshold=args.min_threshold,
    )

    return df


def add_cross_sectional_features(panel: pd.DataFrame) -> pd.DataFrame:
    panel = panel.copy()

    rank_cols = [
        "Return",
        "Mom5",
        "Mom10",
        "Mom20",
        "Mom60",
        "VolumeRatio10",
        "VolumeRatio20",
        "Volatility20",
        "ATRPercent",
        "IntradayRangeATR",
        "RangePosition20",
        "RangePosition60",
        "BreakoutPressure60",
        "BehaviorMomentumScore",
        "BehaviorDirectionComposite",
        "BehaviorFlatRisk",
        "RelativeReturnToXU100",
        "RelativeMom5ToXU100",
        "RelativeMom20ToXU100",
        "RelativeVol20ToXU100",
        "CloseLocationValue",
        "UpperWickPct",
        "LowerWickPct",
    ]

    for col in rank_cols:
        if col not in panel.columns:
            continue

        panel[f"{col}_Rank"] = panel.groupby("DateKey")[col].rank(method="average", pct=True)

    return panel


def build_panel_dataset(
    stocks: pd.DataFrame,
    historical: pd.DataFrame,
    external: pd.DataFrame,
    args: argparse.Namespace,
) -> Tuple[pd.DataFrame, List[str]]:
    stocks = stocks.copy()
    stocks["Market"] = stocks["Symbol"].apply(detect_market)

    historical = historical.copy()
    historical["StockID"] = pd.to_numeric(historical["StockID"], errors="coerce").astype("Int64")

    external_features = prepare_external(external)
    index_ref = build_index_reference(historical, stocks)

    target_stocks = stocks[stocks["Market"] == "BIST"].copy()

    if args.exclude_symbols:
        exclude = {x.strip().upper() for x in args.exclude_symbols.split(",") if x.strip()}
        target_stocks = target_stocks[
            ~target_stocks["Symbol"].astype(str).str.upper().str.strip().isin(exclude)
        ].copy()

    frames = []

    for _, stock in target_stocks.iterrows():
        symbol = str(stock["Symbol"])
        item = build_stock_frame(stock, historical, external_features, index_ref, args)

        if item.empty:
            print(f"   atlandı: {symbol} | yeterli ohlcv verisi yok")
            continue

        frames.append(item)
        print(f"   dataset: {symbol} | satır={len(item)}")

    if not frames:
        return pd.DataFrame(), []

    panel = pd.concat(frames, ignore_index=True)
    panel = add_cross_sectional_features(panel)

    base_features = [
        "Return",
        "ReturnLag1",
        "ReturnLag2",
        "ReturnLag3",
        "OpenReturn",
        "GapReturn",
        "VolumeChange",
        "Mom3",
        "Mom5",
        "Mom10",
        "Mom20",
        "Mom60",
        "MA10_norm",
        "MA20_norm",
        "MA50_norm",
        "MASpread10_20",
        "MASpread20_50",
        "DistanceMA20",
        "DistanceMA50",
        "RSI14",
        "Volatility10",
        "Volatility20",
        "Volatility60",
        "VolRatio10_60",
        "VolRatio20_60",
        "TrueRange",
        "TrueRangePct",
        "ATR14",
        "ATRPercent",
        "IntradayRangePct",
        "IntradayRangeATR",
        "UpperWickPct",
        "LowerWickPct",
        "BodyPct",
        "CloseLocationValue",
        "VolumeRatio10",
        "VolumeRatio20",
        "RangePosition20",
        "RangePosition60",
        "BreakoutPressure20",
        "BreakoutPressure60",
        "BreakoutScore",
        "BehaviorMomentumScore",
        "BehaviorDirectionComposite",
        "BehaviorFlatRisk",
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
        "XU100_Return",
        "XU100_Mom5",
        "XU100_Mom20",
        "XU100_Vol20",
        "XU100_RangePosition60",
        "RelativeReturnToXU100",
        "RelativeMom5ToXU100",
        "RelativeMom20ToXU100",
        "RelativeVol20ToXU100",
        "RangePositionVsXU100",
    ]

    rank_features = [c for c in panel.columns if c.endswith("_Rank")]
    feature_cols = [c for c in base_features + rank_features if c in panel.columns]

    keep_cols = [
        "StockID",
        "Symbol",
        "Market",
        "Date",
        "DateKey",
        "FutureDate",
        "ClosePrice",
        "FutureReturn",
        "DynamicThreshold",
        "TargetClass",
        "FutureReturn5",
        "FutureReturn10",
        "FutureReturn20",
        "FutureMaxReturn5",
        "FutureMaxReturn10",
        "FutureMaxReturn20",
        "FutureMaxDrawdown5",
        "FutureMaxDrawdown10",
        "FutureMaxDrawdown20",
        "HitUpperBeforeLower5",
        "HitUpperBeforeLower10",
        "HitUpperBeforeLower20",
        "HitLowerBeforeUpper5",
        "HitLowerBeforeUpper10",
        "HitLowerBeforeUpper20",
    ] + feature_cols

    panel = panel[keep_cols].replace([np.inf, -np.inf], np.nan)

    before = len(panel)
    panel = panel.dropna(subset=feature_cols + ["FutureReturn", "TargetClass", "FutureDate"])
    after = len(panel)

    print(f"\npanel temiz satır: {after}/{before}")

    return panel, feature_cols


def split_panel(panel: pd.DataFrame, validation_start: str, test_start: str):
    validation_start_dt = pd.to_datetime(validation_start)
    test_start_dt = pd.to_datetime(test_start)

    panel = panel.copy()
    panel["Date"] = pd.to_datetime(panel["Date"])
    panel["FutureDate"] = pd.to_datetime(panel["FutureDate"])

    train = panel[panel["FutureDate"] < validation_start_dt].copy()
    validation = panel[
        (panel["Date"] >= validation_start_dt)
        & (panel["FutureDate"] < test_start_dt)
    ].copy()
    test = panel[panel["Date"] >= test_start_dt].copy()

    return train, validation, test


# ============================================================
# model ve değerlendirme fonksiyonları
# ============================================================

def build_models() -> Dict[str, Any]:
    try:
        from sklearn.ensemble import (
            GradientBoostingClassifier,
            HistGradientBoostingClassifier,
            RandomForestClassifier,
        )
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler
    except Exception as exc:
        raise RuntimeError("scikit-learn bulunamadı. kurulum: pip install scikit-learn") from exc

    models = {
        "logistic_balanced": make_pipeline(
            StandardScaler(),
            LogisticRegression(max_iter=1400, class_weight="balanced"),
        ),
        "random_forest_balanced": RandomForestClassifier(
            n_estimators=360,
            max_depth=9,
            min_samples_leaf=16,
            class_weight="balanced_subsample",
            random_state=42,
            n_jobs=-1,
        ),
        "gradient_boosting": GradientBoostingClassifier(
            n_estimators=220,
            learning_rate=0.035,
            max_depth=3,
            random_state=42,
        ),
        "hist_gradient_boosting": HistGradientBoostingClassifier(
            max_iter=260,
            learning_rate=0.035,
            max_leaf_nodes=31,
            l2_regularization=0.15,
            random_state=42,
        ),
    }

    try:
        from xgboost import XGBClassifier

        models["xgboost"] = XGBClassifier(
            n_estimators=360,
            max_depth=4,
            learning_rate=0.035,
            subsample=0.85,
            colsample_bytree=0.85,
            objective="multi:softprob",
            eval_metric="mlogloss",
            random_state=42,
            n_jobs=-1,
        )
    except Exception:
        pass

    return models


def predict_proba_3(model: Any, x: np.ndarray) -> np.ndarray:
    raw = model.predict_proba(x)
    out = np.zeros((len(x), 3), dtype=float)

    classes = getattr(model, "classes_", None)

    if classes is None and hasattr(model, "steps"):
        classes = getattr(model.steps[-1][1], "classes_", np.array([0, 1, 2]))

    if classes is None:
        classes = np.array([0, 1, 2])

    for idx, cls in enumerate(classes):
        cls = int(cls)

        if cls in [0, 1, 2]:
            out[:, cls] = raw[:, idx]

    return out


def proba_to_class(proba: np.ndarray) -> np.ndarray:
    return np.argmax(proba, axis=1).astype(int)


def evaluate_classification(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    y_true = np.asarray(y_true).astype(int)
    y_pred = np.asarray(y_pred).astype(int)

    if len(y_true) == 0:
        return {}

    accuracy = float(np.mean(y_true == y_pred))

    pred_action = y_pred != CLASS_FLAT
    real_action = y_true != CLASS_FLAT

    action_count = int(pred_action.sum())
    real_action_count = int(real_action.sum())

    if action_count > 0:
        action_precision = float(np.mean(y_true[pred_action] == y_pred[pred_action]))
    else:
        action_precision = 0.0

    if real_action_count > 0:
        action_recall = float(np.sum((y_true == y_pred) & real_action) / real_action_count)
    else:
        action_recall = 0.0

    matrix = np.zeros((3, 3), dtype=int)

    for true_value, pred_value in zip(y_true, y_pred):
        if int(true_value) in [0, 1, 2] and int(pred_value) in [0, 1, 2]:
            matrix[int(true_value), int(pred_value)] += 1

    return {
        "samples": int(len(y_true)),
        "accuracy": round(accuracy * 100, 2),
        "actionPrecision": round(action_precision * 100, 2),
        "actionRecall": round(action_recall * 100, 2),
        "actionRate": round(float(np.mean(pred_action)) * 100, 2),
        "realActionRate": round(float(np.mean(real_action)) * 100, 2),
        "flatRate": round(float(np.mean(y_pred == CLASS_FLAT)) * 100, 2),
        "confusionMatrix": {
            "labels": ["down", "flat", "up"],
            "matrix": matrix.tolist(),
        },
    }


def class_distribution(y: np.ndarray) -> Dict[str, Any]:
    y = np.asarray(y).astype(int)

    if len(y) == 0:
        return {}

    return {
        "downPct": round(float(np.mean(y == CLASS_DOWN)) * 100, 2),
        "flatPct": round(float(np.mean(y == CLASS_FLAT)) * 100, 2),
        "upPct": round(float(np.mean(y == CLASS_UP)) * 100, 2),
        "downCount": int(np.sum(y == CLASS_DOWN)),
        "flatCount": int(np.sum(y == CLASS_FLAT)),
        "upCount": int(np.sum(y == CLASS_UP)),
        "samples": int(len(y)),
    }


def make_scored_frame(df: pd.DataFrame, proba: np.ndarray) -> pd.DataFrame:
    scored = df.copy()

    scored["ProbDown"] = proba[:, CLASS_DOWN]
    scored["ProbFlat"] = proba[:, CLASS_FLAT]
    scored["ProbUp"] = proba[:, CLASS_UP]

    scored["ModelPredClass"] = proba_to_class(proba)
    scored["UpEdgeVsFlat"] = scored["ProbUp"] - scored["ProbFlat"]
    scored["DownEdgeVsFlat"] = scored["ProbDown"] - scored["ProbFlat"]
    scored["UpEdgeVsDown"] = scored["ProbUp"] - scored["ProbDown"]

    return scored


def evaluate_model_selection(scored: pd.DataFrame) -> Dict[str, Any]:
    metrics = evaluate_classification(
        scored["TargetClass"].values,
        scored["ModelPredClass"].values,
    )

    max_probability = scored[["ProbDown", "ProbFlat", "ProbUp"]].max(axis=1)
    probability_edge = float(np.mean(np.abs(max_probability - scored["ProbFlat"])))

    action_precision = safe_float(metrics.get("actionPrecision"))
    action_recall = safe_float(metrics.get("actionRecall"))
    accuracy = safe_float(metrics.get("accuracy"))
    action_rate = safe_float(metrics.get("actionRate"))
    flat_rate = safe_float(metrics.get("flatRate"))

    # screener için çok fazla aksiyon üretmek istenmez; seçici ama tamamen pasif olmayan model tercih edilir.
    target_action_rate = 28.0
    rate_score = max(0.0, 100.0 - abs(action_rate - target_action_rate) * 2.6)

    over_action_penalty = max(0.0, action_rate - 40.0) * 4.5
    excessive_flat_penalty = max(0.0, flat_rate - 78.0) * 2.0
    weak_precision_penalty = max(0.0, 30.0 - action_precision) * 5.0

    score = (
        action_precision * 12.0
        + min(action_recall, 35.0) * 2.0
        + accuracy * 1.5
        + rate_score * 1.5
        + probability_edge * 160.0
        - over_action_penalty
        - excessive_flat_penalty
        - weak_precision_penalty
    )

    return {
        "score": round(float(score), 4),
        "classification": metrics,
        "meanProbabilityEdge": round(probability_edge, 4),
        "selectionDiagnostics": {
            "targetActionRate": target_action_rate,
            "rateScore": round(rate_score, 4),
            "overActionPenalty": round(over_action_penalty, 4),
            "excessiveFlatPenalty": round(excessive_flat_penalty, 4),
            "weakPrecisionPenalty": round(weak_precision_penalty, 4),
        },
    }

# ============================================================
# senaryo skorlayıcı
# ============================================================

def score_row(row: pd.Series) -> Dict[str, Any]:
    prob_up = safe_float(row.get("ProbUp"))
    prob_down = safe_float(row.get("ProbDown"))
    prob_flat = safe_float(row.get("ProbFlat"))
    
    momentum = safe_float(row.get("BehaviorMomentumScore"))
    flat_risk_raw = safe_float(row.get("BehaviorFlatRisk"), 50)

    range60 = safe_float(row.get("RangePosition60"), 0.5)
    breakout60 = safe_float(row.get("BreakoutPressure60"))

    rel_mom20 = safe_float(row.get("RelativeMom20ToXU100"))
    rel_mom5 = safe_float(row.get("RelativeMom5ToXU100"))
    rel_return = safe_float(row.get("RelativeReturnToXU100"))

    vol_ratio = safe_float(row.get("VolRatio20_60"), 1.0)
    volume_ratio = safe_float(row.get("VolumeRatio20"), 1.0)

    lower_wick = safe_float(row.get("LowerWickPct"))
    close_location = safe_float(row.get("CloseLocationValue"), 0.5)
    intraday_atr = safe_float(row.get("IntradayRangeATR"), 1.0)

    mom20 = safe_float(row.get("Mom20"))
    mom60 = safe_float(row.get("Mom60"))
    rsi = safe_float(row.get("RSI14"), 50)

    prob_up_score = prob_up * 100
    prob_down_score = prob_down * 100
    prob_flat_score = prob_flat * 100
    up_minus_down = prob_up - prob_down
    down_minus_up = prob_down - prob_up

    momentum_score = norm01(momentum, -80, 80) * 100
    negative_momentum_score = norm01(momentum, -80, 80, invert=True) * 100

    relative_strength = (
        0.45 * norm01(rel_mom20, -0.12, 0.12)
        + 0.35 * norm01(rel_mom5, -0.06, 0.06)
        + 0.20 * norm01(rel_return, -0.04, 0.04)
    ) * 100

    relative_weakness = 100 - relative_strength

    breakout_score = norm01(breakout60, -80, 80) * 100
    breakdown_score = 100 - breakout_score

    controlled_volatility = 100 - norm01(vol_ratio, 0.8, 2.0) * 100
    volume_support = norm01(volume_ratio, 0.7, 2.2) * 100

    weak_close = (1.0 - close_location) * 100
    recovery_close = close_location * 100

    lower_wick_support = norm01(lower_wick, 0.05, 0.55) * 100

    low_range_position = (1.0 - range60) * 100

    if range60 <= 0.50:
        mid_low_range = (1.0 - abs(range60 - 0.25) / 0.25) * 100
    else:
        mid_low_range = 0

    if 0.44 <= range60 <= 1.0:
        trend_range_zone = (1.0 - abs(range60 - 0.72) / 0.28) * 100
    else:
        trend_range_zone = 0

    selloff_depth = (
        0.55 * norm01(-mom20, -0.02, 0.25)
        + 0.45 * norm01(-mom60, -0.02, 0.35)
    ) * 100

    falling_knife_risk = (
        0.24 * prob_down_score
        + 0.22 * negative_momentum_score
        + 0.18 * relative_weakness
        + 0.14 * weak_close
        + 0.12 * norm01(volume_ratio, 1.2, 4.0) * 100
        + 0.10 * norm01(intraday_atr, 1.0, 3.0) * 100
        - 0.14 * lower_wick_support
        - 0.10 * recovery_close
    )
    falling_knife_risk = clamp(falling_knife_risk)

    downside_risk = (
        0.26 * prob_down_score
        + 0.22 * negative_momentum_score
        + 0.18 * relative_weakness
        + 0.14 * breakdown_score
        + 0.10 * weak_close
        + 0.10 * norm01(volume_ratio, 1.0, 3.5) * 100
        - 0.12 * lower_wick_support
        - 0.10 * prob_up_score
    )

    # model aşağı ihtimalini yukarı ihtimalinden belirgin yüksek görüyorsa risk skoru güçlendirilir.
    if down_minus_up > 0.08:
        downside_risk += min(16.0, down_minus_up * 100.0 * 0.90)
    elif down_minus_up > 0.04:
        downside_risk += min(8.0, down_minus_up * 100.0 * 0.55)

    downside_risk = clamp(downside_risk)

    momentum_long = (
        0.26 * prob_up_score
        + 0.22 * momentum_score
        + 0.20 * relative_strength
        + 0.14 * breakout_score
        + 0.10 * volume_support
        + 0.08 * trend_range_zone
        - 0.16 * flat_risk_raw
        - 0.14 * downside_risk
    )
    momentum_long = clamp(momentum_long)

    if range60 > 0.93 and rsi > 72:
        momentum_long = clamp(momentum_long - 10)
    if down_minus_up > 0.08 and prob_up < 0.38:
        momentum_long = min(momentum_long, 51.0)
    elif down_minus_up > 0.05:
        momentum_long = clamp(momentum_long - 12.0)

    dip_rebound = (
        0.19 * prob_up_score
        + 0.18 * low_range_position
        + 0.16 * lower_wick_support
        + 0.14 * recovery_close
        + 0.12 * controlled_volatility
        + 0.11 * mid_low_range
        + 0.10 * selloff_depth
        - 0.24 * falling_knife_risk
        - 0.12 * prob_down_score
    )
    dip_rebound = clamp(dip_rebound)
    if prob_down > 0.55 and falling_knife_risk > 35:
        dip_rebound = clamp(dip_rebound - 12.0)
    elif prob_down > 0.48 and falling_knife_risk > 50:
        dip_rebound = clamp(dip_rebound - 8.0)

    flat_risk = clamp(
        0.55 * flat_risk_raw
        + 0.30 * prob_flat_score
        + 0.15 * (100 - max(momentum_long, dip_rebound, downside_risk))
    )

    scores = {
        "momentumLong": round(momentum_long, 2),
        "dipRebound": round(dip_rebound, 2),
        "downsideRisk": round(downside_risk, 2),
        "flatRisk": round(flat_risk, 2),
        "fallingKnifeRisk": round(falling_knife_risk, 2),
    }

    scenario_candidates = {
        SCENARIO_MOMENTUM_LONG: momentum_long,
        SCENARIO_DIP_REBOUND: dip_rebound,
        SCENARIO_DOWNSIDE_RISK: downside_risk,
    }

    scenario = max(scenario_candidates, key=scenario_candidates.get)
    best_score = scenario_candidates[scenario]

    scenario_thresholds = {
        SCENARIO_MOMENTUM_LONG: 58.0,
        SCENARIO_DIP_REBOUND: 56.0,
        SCENARIO_DOWNSIDE_RISK: 55.0,
    }

    if best_score < scenario_thresholds.get(scenario, 52.0) or flat_risk > 72:
        scenario = SCENARIO_NEUTRAL

    if scenario == SCENARIO_DIP_REBOUND and falling_knife_risk >= 68:
        if downside_risk >= 55:
            scenario = SCENARIO_DOWNSIDE_RISK
        else:
            scenario = SCENARIO_NEUTRAL

    scenario_conflict_penalty = 0.0

    if scenario == SCENARIO_MOMENTUM_LONG and prob_down > prob_up:
        scenario_conflict_penalty = norm01(prob_down - prob_up, 0.03, 0.20) * 28.0

    elif scenario == SCENARIO_DIP_REBOUND and prob_down > 0.48:
        scenario_conflict_penalty = norm01(prob_down, 0.48, 0.70) * 14.0

    elif scenario == SCENARIO_DOWNSIDE_RISK and prob_up > prob_down:
        scenario_conflict_penalty = norm01(prob_up - prob_down, 0.03, 0.20) * 18.0

    confidence = clamp(
        max(momentum_long, dip_rebound, downside_risk)
        - 0.35 * flat_risk
        + abs(prob_up - prob_down) * 35
        - scenario_conflict_penalty
    )

    reason_tags = []
    warning_tags = []

    if momentum_long >= 55:
        if prob_up >= 0.40:
            reason_tags.append("UP_PROBABILITY_SUPPORT")
        if relative_strength >= 60:
            reason_tags.append("RELATIVE_STRENGTH")
        if momentum_score >= 60:
            reason_tags.append("POSITIVE_MOMENTUM")
        if breakout_score >= 60:
            reason_tags.append("BREAKOUT_PRESSURE")

    if dip_rebound >= 55:
        if low_range_position >= 60:
            reason_tags.append("LOW_RANGE_POSITION")
        if lower_wick_support >= 55:
            reason_tags.append("LOWER_WICK_SUPPORT")
        if recovery_close >= 60:
            reason_tags.append("RECOVERY_CLOSE")
        if controlled_volatility >= 55:
            reason_tags.append("CONTROLLED_VOLATILITY")

    if downside_risk >= 55:
        if prob_down >= 0.40:
            reason_tags.append("DOWN_PROBABILITY_PRESSURE")
        if negative_momentum_score >= 60:
            reason_tags.append("NEGATIVE_MOMENTUM")
        if relative_weakness >= 60:
            reason_tags.append("RELATIVE_WEAKNESS")
        if weak_close >= 60:
            reason_tags.append("WEAK_CLOSE")

    if flat_risk >= 70:
        warning_tags.append("HIGH_FLAT_RISK")

    if falling_knife_risk >= 60:
        warning_tags.append("FALLING_KNIFE_RISK")
    elif falling_knife_risk >= 45:
        warning_tags.append("MEDIUM_FALLING_KNIFE_RISK")

    if volume_ratio >= 3 and weak_close >= 60:
        warning_tags.append("HIGH_VOLUME_WEAK_CLOSE")

    if vol_ratio >= 1.6:
        warning_tags.append("ELEVATED_VOLATILITY")

    if scenario == SCENARIO_NEUTRAL and not warning_tags:
        warning_tags.append("NO_CLEAR_EDGE")

    return {
        "scenario": scenario,
        "scores": scores,
        "confidence": round(confidence, 2),
        "reasonTags": sorted(set(reason_tags)),
        "warningTags": sorted(set(warning_tags)),
    }


def apply_scenario_scores(scored: pd.DataFrame) -> pd.DataFrame:
    rows = []

    for _, row in scored.iterrows():
        rows.append(score_row(row))

    enriched = scored.copy()

    enriched["Scenario"] = [item["scenario"] for item in rows]
    enriched["MomentumLongScore"] = [item["scores"]["momentumLong"] for item in rows]
    enriched["DipReboundScore"] = [item["scores"]["dipRebound"] for item in rows]
    enriched["DownsideRiskScore"] = [item["scores"]["downsideRisk"] for item in rows]
    enriched["FlatRiskScore"] = [item["scores"]["flatRisk"] for item in rows]
    enriched["FallingKnifeRisk"] = [item["scores"]["fallingKnifeRisk"] for item in rows]
    enriched["ScenarioConfidence"] = [item["confidence"] for item in rows]
    enriched["ReasonTags"] = [item["reasonTags"] for item in rows]
    enriched["WarningTags"] = [item["warningTags"] for item in rows]

    return enriched


# ============================================================
# radar üretimi
# ============================================================

def latest_radar(enriched: pd.DataFrame, top_k: int = 5) -> Dict[str, Any]:
    if enriched.empty:
        return {}

    latest_date = enriched["Date"].max()
    latest = enriched[enriched["Date"] == latest_date].copy()
    all_stock_items = []

    for _, row in latest.sort_values("Symbol").iterrows():
        scenario = str(row["Scenario"])

        if scenario == SCENARIO_MOMENTUM_LONG:
            main_score = safe_float(row["MomentumLongScore"])
        elif scenario == SCENARIO_DIP_REBOUND:
            main_score = safe_float(row["DipReboundScore"])
        elif scenario == SCENARIO_DOWNSIDE_RISK:
            main_score = safe_float(row["DownsideRiskScore"])
        else:
            main_score = safe_float(row["FlatRiskScore"])

        all_stock_items.append({
            "stockID": int(row["StockID"]),
            "symbol": str(row["Symbol"]),
            "scenario": scenario,
            "score": round(main_score, 2),
            "confidence": round(safe_float(row["ScenarioConfidence"]), 2),
            "closePrice": round(safe_float(row["ClosePrice"]), 4),
            "modelProbabilities": {
                "down": round(safe_float(row["ProbDown"]), 4),
                "flat": round(safe_float(row["ProbFlat"]), 4),
                "up": round(safe_float(row["ProbUp"]), 4),
            },
            "scores": {
                "momentumLong": round(safe_float(row["MomentumLongScore"]), 2),
                "dipRebound": round(safe_float(row["DipReboundScore"]), 2),
                "downsideRisk": round(safe_float(row["DownsideRiskScore"]), 2),
                "flatRisk": round(safe_float(row["FlatRiskScore"]), 2),
                "fallingKnifeRisk": round(safe_float(row["FallingKnifeRisk"]), 2),
            },
            "reasonTags": row["ReasonTags"],
            "warningTags": row["WarningTags"],
        })

    def make_items(scenario: str, score_col: str) -> List[Dict[str, Any]]:
        subset = latest[latest["Scenario"] == scenario].copy()
        subset = subset.sort_values([score_col, "ScenarioConfidence"], ascending=False).head(top_k)

        items = []

        for _, row in subset.iterrows():
            items.append({
                "stockID": int(row["StockID"]),
                "symbol": str(row["Symbol"]),
                "scenario": scenario,
                "score": round(safe_float(row[score_col]), 2),
                "confidence": round(safe_float(row["ScenarioConfidence"]), 2),
                "closePrice": round(safe_float(row["ClosePrice"]), 4),
                "modelProbabilities": {
                    "down": round(safe_float(row["ProbDown"]), 4),
                    "flat": round(safe_float(row["ProbFlat"]), 4),
                    "up": round(safe_float(row["ProbUp"]), 4),
                },
                "scores": {
                    "momentumLong": round(safe_float(row["MomentumLongScore"]), 2),
                    "dipRebound": round(safe_float(row["DipReboundScore"]), 2),
                    "downsideRisk": round(safe_float(row["DownsideRiskScore"]), 2),
                    "flatRisk": round(safe_float(row["FlatRiskScore"]), 2),
                    "fallingKnifeRisk": round(safe_float(row["FallingKnifeRisk"]), 2),
                },
                "reasonTags": row["ReasonTags"],
                "warningTags": row["WarningTags"],
            })

        return items

    risk_watch = latest.copy()

    risk_watch["RiskWatchScore"] = (
        0.42 * risk_watch["DownsideRiskScore"].fillna(0)
        + 0.22 * risk_watch["FallingKnifeRisk"].fillna(0)
        + 0.22 * risk_watch["ProbDown"].fillna(0) * 100
        + 0.14 * risk_watch["FlatRiskScore"].fillna(0)
        - 0.20 * risk_watch["ProbUp"].fillna(0) * 100
    ).clip(lower=0, upper=100)

    risk_watch_pool = risk_watch[
        (
            (risk_watch["Scenario"] == SCENARIO_DOWNSIDE_RISK)
            | (risk_watch["FallingKnifeRisk"] >= 45)
            | (risk_watch["FlatRiskScore"] >= 70)
            | (
                (risk_watch["DownsideRiskScore"] >= 42)
                & (risk_watch["ProbUp"] < 0.48)
            )
        )
        & ~(risk_watch["Scenario"].isin([SCENARIO_MOMENTUM_LONG, SCENARIO_DIP_REBOUND]))
    ].copy()

    risk_watch_pool = risk_watch_pool[
        risk_watch_pool["RiskWatchScore"] >= 28
    ].copy()

    risk_watch = risk_watch_pool.sort_values(
        ["RiskWatchScore", "DownsideRiskScore", "FallingKnifeRisk"],
        ascending=False,
    ).head(top_k)

    risk_watch_items = []

    for _, row in risk_watch.iterrows():
        risk_watch_items.append({
            "stockID": int(row["StockID"]),
            "symbol": str(row["Symbol"]),
            "scenario": "RISK_WATCH",
            "originalScenario": str(row["Scenario"]),
            "score": round(safe_float(row["RiskWatchScore"]), 2),
            "riskWatchScore": round(safe_float(row["RiskWatchScore"]), 2),
            "confidence": round(safe_float(row["ScenarioConfidence"]), 2),
            "closePrice": round(safe_float(row["ClosePrice"]), 4),
            "modelProbabilities": {
                "down": round(safe_float(row["ProbDown"]), 4),
                "flat": round(safe_float(row["ProbFlat"]), 4),
                "up": round(safe_float(row["ProbUp"]), 4),
            },
            "scores": {
                "momentumLong": round(safe_float(row["MomentumLongScore"]), 2),
                "dipRebound": round(safe_float(row["DipReboundScore"]), 2),
                "downsideRisk": round(safe_float(row["DownsideRiskScore"]), 2),
                "flatRisk": round(safe_float(row["FlatRiskScore"]), 2),
                "fallingKnifeRisk": round(safe_float(row["FallingKnifeRisk"]), 2),
            },
            "reasonTags": row["ReasonTags"],
            "warningTags": row["WarningTags"],
        })

    neutral = latest[latest["Scenario"] == SCENARIO_NEUTRAL].copy()
    neutral = neutral.sort_values(["FlatRiskScore", "ScenarioConfidence"], ascending=False).head(top_k)

    neutral_items = []

    for _, row in neutral.iterrows():
        neutral_items.append({
            "stockID": int(row["StockID"]),
            "symbol": str(row["Symbol"]),
            "scenario": SCENARIO_NEUTRAL,
            "score": round(safe_float(row["FlatRiskScore"]), 2),
            "confidence": round(safe_float(row["ScenarioConfidence"]), 2),
            "closePrice": round(safe_float(row["ClosePrice"]), 4),
            "reasonTags": row["ReasonTags"],
            "warningTags": row["WarningTags"],
        })

    scenario_counts = latest["Scenario"].value_counts().to_dict()

    return {
        "date": pd.to_datetime(latest_date).strftime("%Y-%m-%d"),
        "universe": "BIST",
        "totalStocks": int(len(latest)),
        "allStocks": all_stock_items,
        "radars": {
            "momentumLong": make_items(SCENARIO_MOMENTUM_LONG, "MomentumLongScore"),
            "dipRebound": make_items(SCENARIO_DIP_REBOUND, "DipReboundScore"),
            "downsideRisk": make_items(SCENARIO_DOWNSIDE_RISK, "DownsideRiskScore"),
            "riskWatch": risk_watch_items,
            "neutral": neutral_items,
        },
        "summary": {
            "momentumLongCount": int(scenario_counts.get(SCENARIO_MOMENTUM_LONG, 0)),
            "dipReboundCount": int(scenario_counts.get(SCENARIO_DIP_REBOUND, 0)),
            "downsideRiskCount": int(scenario_counts.get(SCENARIO_DOWNSIDE_RISK, 0)),
            "riskWatchCount": int(len(risk_watch_items)),
            "neutralCount": int(scenario_counts.get(SCENARIO_NEUTRAL, 0)),
        },
    }


# ============================================================
# senaryo backtest metrikleri
# ============================================================

def evaluate_scenario_backtest(enriched: pd.DataFrame, top_k: int = 5) -> Dict[str, Any]:
    if enriched.empty:
        return {}

    enriched = enriched.copy()
    enriched["DateOnly"] = pd.to_datetime(enriched["Date"]).dt.date

    daily_rows = []

    scenario_specs = [
        (SCENARIO_MOMENTUM_LONG, "MomentumLongScore"),
        (SCENARIO_DIP_REBOUND, "DipReboundScore"),
        (SCENARIO_DOWNSIDE_RISK, "DownsideRiskScore"),
    ]

    for date_value, group in enriched.groupby("DateOnly"):
        universe_return10 = safe_float(group["FutureReturn10"].mean())
        universe_return20 = safe_float(group["FutureReturn20"].mean())

        row = {
            "date": str(date_value),
            "universeSize": int(len(group)),
            "universeReturn10": universe_return10,
            "universeReturn20": universe_return20,
        }

        for scenario, score_col in scenario_specs:
            subset = group[group["Scenario"] == scenario].sort_values(score_col, ascending=False).head(top_k)
            prefix = scenario.lower()

            if subset.empty:
                row[f"{prefix}_count"] = 0
                continue

            row[f"{prefix}_count"] = int(len(subset))
            row[f"{prefix}_return10"] = safe_float(subset["FutureReturn10"].mean())
            row[f"{prefix}_return20"] = safe_float(subset["FutureReturn20"].mean())
            row[f"{prefix}_excessReturn10"] = row[f"{prefix}_return10"] - universe_return10
            row[f"{prefix}_maxReturn10"] = safe_float(subset["FutureMaxReturn10"].mean())
            row[f"{prefix}_maxDrawdown10"] = safe_float(subset["FutureMaxDrawdown10"].mean())
            row[f"{prefix}_upperHit10"] = safe_float(subset["HitUpperBeforeLower10"].mean())
            row[f"{prefix}_lowerHit10"] = safe_float(subset["HitLowerBeforeUpper10"].mean())

        daily_rows.append(row)

    daily = pd.DataFrame(daily_rows)

    def aggregate(prefix: str) -> Dict[str, Any]:
        count_col = f"{prefix}_count"

        if count_col not in daily.columns:
            return {"days": 0}

        valid = daily[daily[count_col].fillna(0) > 0].copy()

        if valid.empty:
            return {"days": 0}
        avg_max_return10 = safe_float(valid.get(f"{prefix}_maxReturn10", pd.Series(dtype=float)).mean())
        avg_max_drawdown10 = safe_float(valid.get(f"{prefix}_maxDrawdown10", pd.Series(dtype=float)).mean())
        upper_hit10 = safe_float(valid.get(f"{prefix}_upperHit10", pd.Series(dtype=float)).mean())
        lower_hit10 = safe_float(valid.get(f"{prefix}_lowerHit10", pd.Series(dtype=float)).mean())

        if abs(avg_max_drawdown10) > 1e-9:
            reward_risk10 = avg_max_return10 / abs(avg_max_drawdown10)
        else:
            reward_risk10 = None
        return {
            "days": int(len(valid)),
            "avgCount": round(safe_float(valid[count_col].mean()), 2),
            "avgReturn10Pct": round(safe_float(valid.get(f"{prefix}_return10", pd.Series(dtype=float)).mean()) * 100, 4),
            "avgReturn20Pct": round(safe_float(valid.get(f"{prefix}_return20", pd.Series(dtype=float)).mean()) * 100, 4),
            "avgExcessReturn10Pct": round(safe_float(valid.get(f"{prefix}_excessReturn10", pd.Series(dtype=float)).mean()) * 100, 4),
            "avgMaxReturn10Pct": round(avg_max_return10 * 100, 4),
            "avgMaxDrawdown10Pct": round(avg_max_drawdown10 * 100, 4),
            "rewardRisk10": round(reward_risk10, 4) if reward_risk10 is not None else None,
            "upperHitRate10Pct": round(upper_hit10 * 100, 2),
            "lowerHitRate10Pct": round(lower_hit10 * 100, 2),
            "hitSpread10Pct": round((upper_hit10 - lower_hit10) * 100, 2),
        }

    summary = {
        "momentumLong": aggregate(SCENARIO_MOMENTUM_LONG.lower()),
        "dipRebound": aggregate(SCENARIO_DIP_REBOUND.lower()),
        "downsideRisk": aggregate(SCENARIO_DOWNSIDE_RISK.lower()),
        "universe": {
            "days": int(len(daily)),
            "avgReturn10Pct": round(safe_float(daily["universeReturn10"].mean()) * 100, 4),
            "avgReturn20Pct": round(safe_float(daily["universeReturn20"].mean()) * 100, 4),
        },
    }

    return {
        "summary": summary,
        "daily": daily.to_dict(orient="records"),
    }


# ============================================================
# ana çalışma akışı
# ============================================================

def run(args: argparse.Namespace) -> Dict[str, Any]:
    print("zeta scenario screener başlıyor...")
    print(
        f"horizon={args.horizon}, "
        f"validation_start={args.validation_start}, "
        f"test_start={args.test_start}"
    )

    stocks, historical, external = read_sql_data()

    panel, feature_cols = build_panel_dataset(
        stocks=stocks,
        historical=historical,
        external=external,
        args=args,
    )

    if panel.empty:
        raise RuntimeError("panel veri seti boş oluştu. ohlcv verilerini ve bist filtrelerini kontrol edin.")

    train, validation, test = split_panel(
        panel=panel,
        validation_start=args.validation_start,
        test_start=args.test_start,
    )

    print("\nsplit özeti")
    print(f"train:      {len(train)}")
    print(f"validation: {len(validation)}")
    print(f"test:       {len(test)}")
    print(f"feature:    {len(feature_cols)}")

    if len(train) < 1000 or len(validation) < 200 or len(test) < 200:
        raise RuntimeError("train/validation/test bölümleri beklenenden küçük. tarih aralıklarını kontrol edin.")

    x_train = train[feature_cols].values
    y_train = train["TargetClass"].values.astype(int)

    x_val = validation[feature_cols].values
    y_val = validation["TargetClass"].values.astype(int)

    x_test = test[feature_cols].values
    y_test = test["TargetClass"].values.astype(int)

    models = build_models()

    model_reports = {}
    best_name = None
    best_score = -1e18
    best_model = None

    for name, model in models.items():
        print(f"\nmodel deneniyor: {name}")

        try:
            model.fit(x_train, y_train)

            val_proba = predict_proba_3(model, x_val)
            val_scored = make_scored_frame(validation, val_proba)
            val_eval = evaluate_model_selection(val_scored)

            test_proba = predict_proba_3(model, x_test)
            test_scored = make_scored_frame(test, test_proba)
            test_eval = evaluate_classification(y_test, test_scored["ModelPredClass"].values)

            model_reports[name] = {
                "validation": val_eval,
                "test": test_eval,
            }

            print(
                f"  score={val_eval['score']} | "
                f"val actionPrecision={val_eval['classification'].get('actionPrecision')} | "
                f"test actionPrecision={test_eval.get('actionPrecision')}"
            )

            if val_eval["score"] > best_score:
                best_score = val_eval["score"]
                best_name = name
                best_model = model

        except Exception as exc:
            model_reports[name] = {"error": str(exc)}
            print(f"  hata: {exc}")

    if best_model is None:
        raise RuntimeError("hiçbir model başarıyla eğitilemedi.")

    test_proba = predict_proba_3(best_model, x_test)
    test_scored = make_scored_frame(test, test_proba)
    test_enriched = apply_scenario_scores(test_scored)

    latest_date = panel["Date"].max()
    latest_rows = panel[panel["Date"] == latest_date].copy()

    latest_proba = predict_proba_3(best_model, latest_rows[feature_cols].values)
    latest_scored = make_scored_frame(latest_rows, latest_proba)
    latest_enriched = apply_scenario_scores(latest_scored)

    radar = latest_radar(latest_enriched, top_k=args.top_k)
    scenario_backtest = evaluate_scenario_backtest(test_enriched, top_k=args.top_k)

    report = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "version": "v12_zeta_scenario_screener_v1",
        "architecture": "bist_global_panel_model_plus_rule_scenario_scorer",
        "selectedModel": best_name,
        "universe": "BIST",
        "horizon": args.horizon,
        "validationStart": args.validation_start,
        "testStart": args.test_start,
        "featureCount": len(feature_cols),
        "features": feature_cols,
        "dataset": {
            "panelRows": int(len(panel)),
            "symbols": int(panel["Symbol"].nunique()),
            "trainRows": int(len(train)),
            "validationRows": int(len(validation)),
            "testRows": int(len(test)),
            "trainClassDistribution": class_distribution(y_train),
            "validationClassDistribution": class_distribution(y_val),
            "testClassDistribution": class_distribution(y_test),
        },
        "models": model_reports,
        "latestRadar": radar,
        "scenarioBacktest": scenario_backtest.get("summary", {}),
    }

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    report_path = out_dir / "zeta_scenario_report.json"
    radar_path = out_dir / "zeta_latest_radar.json"
    backtest_path = out_dir / "zeta_backtest_summary.json"
    radar_csv_path = out_dir / "zeta_latest_radar.csv"

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(to_serializable(report), f, ensure_ascii=False, indent=2)

    with open(radar_path, "w", encoding="utf-8") as f:
        json.dump(to_serializable(radar), f, ensure_ascii=False, indent=2)

    with open(backtest_path, "w", encoding="utf-8") as f:
        json.dump(to_serializable(scenario_backtest), f, ensure_ascii=False, indent=2)

    csv_cols = [
        "StockID",
        "Symbol",
        "Date",
        "ClosePrice",
        "Scenario",
        "ScenarioConfidence",
        "MomentumLongScore",
        "DipReboundScore",
        "DownsideRiskScore",
        "FlatRiskScore",
        "FallingKnifeRisk",
        "ProbDown",
        "ProbFlat",
        "ProbUp",
        "ReasonTags",
        "WarningTags",
    ]

    latest_enriched[csv_cols].to_csv(radar_csv_path, index=False, encoding="utf-8-sig")

    print("\n============================================================")
    print("zeta scenario screener özeti")
    print(json.dumps(to_serializable({
        "selectedModel": best_name,
        "dataset": report["dataset"],
        "latestRadarSummary": radar.get("summary", {}),
        "scenarioBacktest": report["scenarioBacktest"],
        "outputs": {
            "report": str(report_path),
            "latestRadar": str(radar_path),
            "backtestSummary": str(backtest_path),
            "latestRadarCsv": str(radar_csv_path),
        },
    }), ensure_ascii=False, indent=2))
    print("============================================================")

    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()

    parser.add_argument("--horizon", type=int, default=10)
    parser.add_argument("--validation-start", type=str, default="2023-01-01")
    parser.add_argument("--test-start", type=str, default="2024-01-01")
    parser.add_argument("--vol-mult", type=float, default=0.60)
    parser.add_argument("--min-threshold", type=float, default=0.01)
    parser.add_argument("--min-history", type=int, default=260)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--exclude-symbols", type=str, default="")
    parser.add_argument("--output-dir", type=str, default="artifacts/v12_zeta")

    return parser.parse_args()


if __name__ == "__main__":
    run(parse_args())