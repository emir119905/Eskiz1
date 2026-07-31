"""
Tek canonical feature-engineering katmani.

main.py::add_indicators, v12_direction_lab.py::compute_behavior_features ve
v12_zeta_scenario_screener.py::add_price_features ayni feature'lari (RSI14, ATR14,
momentum, behavior score'lari vb.) uc ayri dosyada, uc farkli formulle hesapliyordu.
Bu modul o uc versiyonun en tam olanini (zeta'nin add_price_features'i) tek kaynak
olarak alip diger iki dosyanin da kullanacagi ortak implementasyonu saglar.

Tum fonksiyonlar causal'dir (yalnizca gecmis/mevcut satiri kullanir) - hicbiri
ileri tarihli veri sizdirmaz.
"""

from typing import List, Optional

import numpy as np
import pandas as pd


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.rolling(period).mean()
    avg_loss = loss.rolling(period).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))

    return rsi.fillna(50)


def add_price_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Tek hisseye ait OHLCV dataframe'ine (Date, OpenPrice, HighPrice, LowPrice,
    ClosePrice, Volume) fiyat/hacim tabanli tum feature'lari ekler. df kopyalanmaz -
    cagiran taraf gerekirse .copy() gecmeli.
    """
    close = df["ClosePrice"].astype(float)
    open_price = df["OpenPrice"].astype(float)
    high = df["HighPrice"].astype(float) if "HighPrice" in df.columns else pd.Series(np.nan, index=df.index)
    low = df["LowPrice"].astype(float) if "LowPrice" in df.columns else pd.Series(np.nan, index=df.index)
    volume = df["Volume"].fillna(0).astype(float) if "Volume" in df.columns else pd.Series(0.0, index=df.index)

    high = high.fillna(np.maximum(open_price, close))
    low = low.fillna(np.minimum(open_price, close))
    high = np.maximum(high, np.maximum(open_price, close))
    low = np.minimum(low, np.minimum(open_price, close))

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
    df["ATR14Pct"] = df["ATRPercent"]
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

    z_mom5 = (df["Mom5"] / (safe_vol20 * np.sqrt(5))).clip(-3, 3)
    z_mom20 = (df["Mom20"] / (safe_vol20 * np.sqrt(20))).clip(-3, 3)
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

    df.replace([np.inf, -np.inf], np.nan, inplace=True)

    return df


EXTERNAL_RETURN_MOM_COLS = ["USDTRY", "BIST100", "Gold", "BrentOil"]
EXTERNAL_RETURN_ONLY_COLS = ["InterestRate", "Inflation"]


def prepare_external_features(external: pd.DataFrame) -> pd.DataFrame:
    """
    ExternalData tablosundan (Date + makro kolonlar) Return/Mom5/Mom20 feature'lari
    uretir. USDTRY/BIST100/Gold/BrentOil icin Return+Mom5+Mom20; InterestRate/
    Inflation icin (varsa) yalnizca Return - bu ikisi gunluk seviye degeri oldugu
    icin momentum anlamli degil.
    """
    external = external.copy()
    external["Date"] = pd.to_datetime(external["Date"]).dt.date

    keep_cols = ["Date"]

    for col in EXTERNAL_RETURN_MOM_COLS:
        if col not in external.columns:
            continue
        series = pd.to_numeric(external[col], errors="coerce")
        external[f"{col}_Return"] = series.pct_change()
        external[f"{col}_Mom5"] = series.pct_change(5)
        external[f"{col}_Mom20"] = series.pct_change(20)
        keep_cols += [f"{col}_Return", f"{col}_Mom5", f"{col}_Mom20"]

    for col in EXTERNAL_RETURN_ONLY_COLS:
        if col not in external.columns:
            continue
        series = pd.to_numeric(external[col], errors="coerce")
        external[f"{col}_Return"] = series.pct_change()
        keep_cols.append(f"{col}_Return")

    external = external[keep_cols]
    external = external.replace([np.inf, -np.inf], np.nan)
    return external


def build_index_reference(
    historical: pd.DataFrame,
    stocks: pd.DataFrame,
    index_symbol: str = "XU100.IS",
) -> pd.DataFrame:
    """
    Piyasa-goreli feature'lar icin referans endeks (varsayilan XU100) serisini
    kurar. Endeks bulunamazsa bos (ama dogru kolonlu) bir dataframe doner ki
    add_relative_features merge'de sessizce NaN uretsin, hata firlatmasin.
    """
    empty_cols = ["DateKey", "IndexReturn", "IndexMom5", "IndexMom20", "IndexVol20", "IndexRangePosition60"]

    stocks = stocks.copy()
    stocks["SymbolNorm"] = stocks["Symbol"].astype(str).str.upper().str.strip()
    index_row = stocks[stocks["SymbolNorm"] == index_symbol.upper()]

    if index_row.empty:
        return pd.DataFrame(columns=empty_cols)

    index_id = int(index_row.iloc[0]["StockID"])
    idx = historical[historical["StockID"] == index_id].copy()

    if idx.empty:
        return pd.DataFrame(columns=empty_cols)

    idx["Date"] = pd.to_datetime(idx["Date"])
    idx = idx.sort_values("Date").reset_index(drop=True)

    for col in ["OpenPrice", "HighPrice", "LowPrice", "ClosePrice", "Volume"]:
        if col in idx.columns:
            idx[col] = pd.to_numeric(idx[col], errors="coerce")

    idx = idx.dropna(subset=["Date", "ClosePrice"])
    idx = idx[idx["ClosePrice"] > 0].copy()

    close = idx["ClosePrice"].astype(float)
    returns = close.pct_change()

    idx["DateKey"] = idx["Date"].dt.date
    idx["IndexReturn"] = returns
    idx["IndexMom5"] = close.pct_change(5)
    idx["IndexMom20"] = close.pct_change(20)
    idx["IndexVol20"] = returns.rolling(20).std()

    high60 = close.rolling(60).max()
    low60 = close.rolling(60).min()
    idx["IndexRangePosition60"] = ((close - low60) / (high60 - low60).replace(0, np.nan)).clip(0, 1)

    return idx[empty_cols]


def add_relative_features(df: pd.DataFrame, index_ref: pd.DataFrame) -> pd.DataFrame:
    """
    df'e (add_price_features zaten calismis olmali - Return/Mom5/Mom20/Volatility20/
    RangePosition60 kolonlarini bekler) DateKey uzerinden index_ref merge edilip
    piyasa-goreli feature'lar eklenir. index_ref bossa Relative* kolonlari NaN kalir.
    """
    if "DateKey" not in df.columns:
        df["DateKey"] = pd.to_datetime(df["Date"]).dt.date

    df = df.merge(index_ref, on="DateKey", how="left")

    df["RelativeReturnToIndex"] = df["Return"] - df["IndexReturn"]
    df["RelativeMom5ToIndex"] = df["Mom5"] - df["IndexMom5"]
    df["RelativeMom20ToIndex"] = df["Mom20"] - df["IndexMom20"]
    df["RelativeVol20ToIndex"] = df["Volatility20"] / df["IndexVol20"].replace(0, np.nan)
    df["RangePositionVsIndex"] = df["RangePosition60"] - df["IndexRangePosition60"]

    return df


DEFAULT_CROSS_SECTIONAL_RANK_COLS = [
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
    "RelativeReturnToIndex",
    "RelativeMom5ToIndex",
    "RelativeMom20ToIndex",
    "RelativeVol20ToIndex",
    "CloseLocationValue",
    "UpperWickPct",
    "LowerWickPct",
]


TECHNICAL_FEATURE_COLS = [
    "Return", "ReturnLag1", "ReturnLag2", "ReturnLag3", "OpenReturn", "GapReturn",
    "VolumeChange", "Mom3", "Mom5", "Mom10", "Mom20", "Mom60",
    "MA10_norm", "MA20_norm", "MA50_norm", "MASpread10_20", "MASpread20_50",
    "RSI14", "Volatility10", "Volatility20", "Volatility60", "VolRatio10_60", "VolRatio20_60",
    "TrueRangePct", "ATRPercent", "IntradayRangePct", "IntradayRangeATR",
    "UpperWickPct", "LowerWickPct", "BodyPct", "CloseLocationValue",
    "VolumeRatio10", "VolumeRatio20", "RangePosition20", "RangePosition60",
    "BreakoutPressure20", "BreakoutPressure60", "BreakoutScore",
    "BehaviorMomentumScore", "BehaviorDirectionComposite", "BehaviorFlatRisk",
    "USDTRY_Return", "BIST100_Return", "Gold_Return", "BrentOil_Return",
    "USDTRY_Mom5", "BIST100_Mom5", "Gold_Mom5", "BrentOil_Mom5",
    "USDTRY_Mom20", "BIST100_Mom20", "Gold_Mom20", "BrentOil_Mom20",
]

RELATIVE_FEATURE_COLS = [
    "RelativeReturnToIndex", "RelativeMom5ToIndex", "RelativeMom20ToIndex",
    "RelativeVol20ToIndex", "RangePositionVsIndex",
]


def add_cross_sectional_ranks(
    panel: pd.DataFrame,
    rank_cols: Optional[List[str]] = None,
    date_col: str = "DateKey",
) -> pd.DataFrame:
    """
    Panel (coklu hisse, tarih ekseninde uzun format) veride her tarih icin
    kesitsel (cross-sectional) yuzdelik siralama ekler. Yalnizca ayni tarihteki
    diger hisselerle karsilastirir - ileri tarihli veri sizdirmaz.
    """
    panel = panel.copy()
    cols = rank_cols if rank_cols is not None else DEFAULT_CROSS_SECTIONAL_RANK_COLS

    for col in cols:
        if col not in panel.columns:
            continue
        panel[f"{col}_Rank"] = panel.groupby(date_col)[col].rank(method="average", pct=True)

    return panel


RANK_FEATURE_COLS = [f"{c}_Rank" for c in DEFAULT_CROSS_SECTIONAL_RANK_COLS]

# tek kaynak feature listesi - main.py'nin baseline'i (engine_baseline.py) ve
# v12_zeta_scenario_screener.py ikisi de buradan okur, ayri ayri tanimlamaz.
STANDARD_FEATURE_COLS = TECHNICAL_FEATURE_COLS + RELATIVE_FEATURE_COLS + RANK_FEATURE_COLS
