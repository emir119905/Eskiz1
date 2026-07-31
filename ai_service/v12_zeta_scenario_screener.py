"""
Faz 3 - Zeta Radar: score_row heuristigi yerine meta-labeling + backtest gate.

CANLI URUNE BAGLI DOSYA: backend/Eskiz1.API/Controllers/ZetaController.cs bu
scripti calistirip zeta_latest_radar.json / zeta_backtest_summary.json /
zeta_scenario_report.json / zeta_latest_radar.csv dosyalarini okuyor,
frontend/src/pages/MarketScreener.jsx bunlari gosteriyor. Bu yuzden JSON
SEMASI (root: date/universe/totalStocks/allStocks/radars/summary; her hisse:
stockID/symbol/scenario/score/confidence/closePrice/modelProbabilities/scores/
reasonTags/warningTags) KORUNDU - sadece bu degerlerin NASIL hesaplandigi
degisti. read_sql_data()/get_db_connection() da aynen korundu, cunku
engine_baseline.py ve v12_direction_lab.py bunlari import ediyor.

Eski mimari: score_row, ~250 satirlik elle agirliklandirilmis (0.45, 0.22,
-0.14 gibi sabitlerle) bir kural motoruydu; kendi evaluate_scenario_backtest'i
kotu ciksa bile hicbir gate olmadan radar yayinlaniyordu.

Yeni mimari (bkz. plan curried-juggling-summit.md, Faz 3):
- Feature/label uretimi artik shared_features + shared_labeling (gercek
  triple-barrier) uzerinden - tek kaynak, main.py/v12_direction_lab.py ile ayni.
- BIRINCIL model: pooled/kesitsel (Faz1/2'de dogrulanan mimari) down/flat/up
  siniflandiricisi.
- META-LABELING modeli (Lopez de Prado): birincilin cagirdigi yon dogru mu,
  ikili siniflandirma - ProbUp/ProbDown/ProbFlat ARTIK score_row'a değil, bu
  meta modele giriyor. "confidence" artik hand-tuned degil, meta modelin
  gercek olasilik ciktisi.
- GATE: evaluate_scenario_backtest (orijinal, degismedi) her senaryonun
  gercek excess return'unu olcuyor; yetersiz/negatif ciksa "lowConfidence"
  olarak isaretleniyor, sessizce yayinlanmiyor.

ONEMLI DURUSTLUK NOTU (2026-07-31, bkz. [[project-engine-rebuild]] memory):
Ayni evrende (43 BIST hissesi) rigorous CPCV testi, basit teknik
siniflandiricilarin zorlu naive baseline'i (majority class) TUTARLI sekilde
GECEMEDIGINI gosterdi (0/15 path). Bu motorun da guclu bir edge gostermesi
garanti degil - gate mekanizmasi TAM DA bunun icin var.

Calistirma:
    python v12_zeta_scenario_screener.py --horizon 10
"""

import argparse
import json
import math
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from shared_features import (
    add_price_features,
    prepare_external_features,
    build_index_reference,
    add_relative_features,
    add_cross_sectional_ranks,
    STANDARD_FEATURE_COLS,
)
from shared_labeling import apply_triple_barrier, CLASS_DOWN, CLASS_FLAT, CLASS_UP, class_distribution
from shared_models import build_classifier_candidates
from shared_eval import purged_embargo_split, evaluate_classification
from experiment_log import log_run

SCENARIO_MOMENTUM_LONG = "MOMENTUM_LONG"
SCENARIO_DIP_REBOUND = "DIP_REBOUND_WATCH"
SCENARIO_DOWNSIDE_RISK = "DOWNSIDE_RISK"
SCENARIO_NEUTRAL = "NEUTRAL"

INDEX_SYMBOL = "XU100.IS"

# gate esikleri: bir senaryonun radarda "guvenilir" sayilmasi icin
GATE_MIN_DAYS = 20
GATE_MIN_EXCESS_RETURN10_PCT = 0.0  # universe'u en az bu kadar gecmeli


# ---------- kucuk, jenerik yardimcilar (feature-engineering degil, burada kaliyor) ----------

def detect_market(symbol: str) -> str:
    symbol = str(symbol or "").upper().strip()
    if symbol == INDEX_SYMBOL:
        return "BIST_INDEX"
    if symbol.endswith(".IS"):
        return "BIST"
    return "US"


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        v = float(value)
        return v if np.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def to_serializable(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: to_serializable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
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


# ---------- veritabani erisimi (main.py/v12_direction_lab.py/engine_baseline.py bunu kullanir) ----------

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
            "SELECT StockID, Symbol, CompanyName, Sector FROM Stocks ORDER BY StockID", conn,
        )
        historical = pd.read_sql(
            """
            SELECT StockID, Date, OpenPrice, HighPrice, LowPrice, ClosePrice, Volume
            FROM HistoricalData ORDER BY StockID, Date
            """,
            conn,
        )
        external = pd.read_sql(
            "SELECT Date, USDTRY, BIST100, Gold, BrentOil FROM ExternalData ORDER BY Date", conn,
        )
        return stocks, historical, external
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ---------- panel + coklu-ufuk tanisal ciktilar (evaluate_scenario_backtest icin) ----------

def add_future_outcome_diagnostics(
    df: pd.DataFrame, horizons: List[int], vol_mult: float, min_threshold: float,
) -> pd.DataFrame:
    """
    evaluate_scenario_backtest'in ihtiyac duydugu coklu-ufuk (5/10/20 gun)
    FutureReturn/FutureMaxReturn/FutureMaxDrawdown/HitUpperBeforeLower/
    HitLowerBeforeUpper kolonlarini uretir. SADECE tanisal/backtest amaclidir -
    modelin egitim etiketi (TargetClass) shared_labeling.apply_triple_barrier'dan
    gelir, burasi degil.
    """
    close = df["ClosePrice"].astype(float)
    high = df["HighPrice"].astype(float)
    low = df["LowPrice"].astype(float)
    vol20 = df["Volatility20"].fillna(0.0) if "Volatility20" in df.columns else pd.Series(0.0, index=df.index)

    for h in horizons:
        future_close = close.shift(-h)
        future_max_high = high.shift(-1).rolling(h, min_periods=h).max().shift(-(h - 1))
        future_min_low = low.shift(-1).rolling(h, min_periods=h).min().shift(-(h - 1))

        df[f"FutureReturn{h}"] = (future_close / close) - 1
        df[f"FutureMaxReturn{h}"] = (future_max_high / close) - 1
        df[f"FutureMaxDrawdown{h}"] = (future_min_low / close) - 1

        upper_barrier = np.maximum(min_threshold, vol20 * math.sqrt(h) * vol_mult)
        lower_barrier = -upper_barrier

        high_values, low_values, close_values = high.values, low.values, close.values
        upper_values, lower_values = upper_barrier.values, lower_barrier.values

        hit_upper_first, hit_lower_first = [], []

        for i in range(len(df)):
            if i + h >= len(df):
                hit_upper_first.append(np.nan)
                hit_lower_first.append(np.nan)
                continue

            base_price = close_values[i]
            if not np.isfinite(base_price) or base_price <= 0:
                hit_upper_first.append(np.nan)
                hit_lower_first.append(np.nan)
                continue

            upper_day, lower_day = None, None
            for step in range(1, h + 1):
                j = i + step
                high_return = (high_values[j] / base_price) - 1
                low_return = (low_values[j] / base_price) - 1
                if upper_day is None and high_return >= upper_values[i]:
                    upper_day = step
                if lower_day is None and low_return <= lower_values[i]:
                    lower_day = step

            hit_upper_first.append(1.0 if upper_day is not None and (lower_day is None or upper_day <= lower_day) else 0.0)
            hit_lower_first.append(1.0 if lower_day is not None and (upper_day is None or lower_day < upper_day) else 0.0)

        df[f"HitUpperBeforeLower{h}"] = hit_upper_first
        df[f"HitLowerBeforeUpper{h}"] = hit_lower_first

    return df


def build_zeta_panel(
    stocks: pd.DataFrame,
    historical: pd.DataFrame,
    external: pd.DataFrame,
    horizon: int,
    vol_mult: float,
    min_threshold: float,
    exclude_symbols: List[str],
) -> Tuple[pd.DataFrame, List[str]]:
    external_features = prepare_external_features(external)
    index_ref = build_index_reference(historical, stocks, index_symbol=INDEX_SYMBOL)
    ext = external_features.rename(columns={"Date": "DateKey"})

    stocks = stocks.copy()
    stocks["Market"] = stocks["Symbol"].apply(detect_market)
    target_stocks = stocks[stocks["Market"] == "BIST"]

    if exclude_symbols:
        exclude = {x.strip().upper() for x in exclude_symbols if x.strip()}
        target_stocks = target_stocks[~target_stocks["Symbol"].astype(str).str.upper().str.strip().isin(exclude)]

    frames = []
    for _, stock in target_stocks.iterrows():
        stock_id = int(stock["StockID"])
        symbol = str(stock["Symbol"])
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
            print(f"   atlandi: {symbol} | yeterli ohlcv verisi yok")
            continue

        df = add_price_features(df)
        df["DateKey"] = df["Date"].dt.date
        df = add_relative_features(df, index_ref)
        df = df.merge(ext, on="DateKey", how="left")

        df = apply_triple_barrier(df, horizon=horizon, vol_mult=vol_mult, min_threshold=min_threshold)
        df = add_future_outcome_diagnostics(df, horizons=[5, 10, 20], vol_mult=vol_mult, min_threshold=min_threshold)

        df["StockID"] = stock_id
        df["Symbol"] = symbol
        frames.append(df)
        print(f"   dataset: {symbol} | satir={len(df)}")

    if not frames:
        return pd.DataFrame(), []

    panel = pd.concat(frames, ignore_index=True)
    panel = add_cross_sectional_ranks(panel, date_col="DateKey")
    panel = panel.replace([np.inf, -np.inf], np.nan)

    feature_cols = [c for c in STANDARD_FEATURE_COLS if c in panel.columns]

    return panel, feature_cols


# ---------- birincil model + meta-labeling ----------

def select_best_classifier(train_df: pd.DataFrame, val_df: pd.DataFrame, feature_cols: List[str]):
    x_train = train_df[feature_cols].values
    y_train = train_df["TargetClass"].astype(int).values
    x_val = val_df[feature_cols].values
    y_val = val_df["TargetClass"].astype(int).values

    candidates = build_classifier_candidates()
    best_name, best_model, best_score = None, None, -1.0

    for name, model in candidates.items():
        model.fit(x_train, y_train)
        val_pred = model.predict(x_val)
        score = evaluate_classification(y_val, val_pred)["actionPrecision"]
        if score > best_score:
            best_score, best_name, best_model = score, name, model

    return best_name, best_model


def build_meta_training_set(
    primary_model, df: pd.DataFrame, feature_cols: List[str],
) -> Tuple[pd.DataFrame, np.ndarray, List[Any]]:
    """
    Primary modelin df uzerindeki (cagiran taraf primary'nin GORMEDIGI bir dilim
    vermeli - leakage'a karsi) tahminlerinden meta-egitim seti uretir: primary
    bir yon cagirdiysa (flat degilse), gercekte dogru muydu (1/0). Meta
    feature'lar = orijinal feature'lar + primary'nin olasilik ciktilari.
    """
    classes = list(primary_model.classes_)
    proba = primary_model.predict_proba(df[feature_cols].values)
    pred_class = np.array(classes)[np.argmax(proba, axis=1)]

    called_mask = pred_class != CLASS_FLAT
    if called_mask.sum() < 30:
        return pd.DataFrame(), np.array([]), classes

    meta_x = df.loc[called_mask, feature_cols].copy().reset_index(drop=True)
    for i, c in enumerate(classes):
        meta_x[f"PrimaryProb_{c}"] = proba[called_mask, i]

    actual = df.loc[called_mask, "TargetClass"].astype(int).values
    meta_y = (pred_class[called_mask] == actual).astype(int)

    return meta_x, meta_y, classes


def train_meta_model(meta_x: pd.DataFrame, meta_y: np.ndarray):
    if meta_x.empty or len(np.unique(meta_y)) < 2:
        return None

    n_val = max(20, int(len(meta_x) * 0.2))
    x_fit, x_val = meta_x.iloc[:-n_val].values, meta_x.iloc[-n_val:].values
    y_fit, y_val = meta_y[:-n_val], meta_y[-n_val:]

    if len(np.unique(y_fit)) < 2:
        return None

    candidates = build_classifier_candidates()
    best_model, best_score = None, -1.0

    for name, model in candidates.items():
        model.fit(x_fit, y_fit)
        val_pred = model.predict(x_val)
        score = float(np.mean(val_pred == y_val))
        if score > best_score:
            best_score, best_model = score, model

    if best_model is not None:
        best_model.fit(meta_x.values, meta_y)

    return best_model


def score_rows_with_model(
    df: pd.DataFrame,
    feature_cols: List[str],
    primary_model,
    meta_model,
) -> pd.DataFrame:
    """
    Eski ~250 satirlik score_row kural motorunun yerini alir. Agirliklar artik
    elle ayarlanmiyor - momentumLong/downsideRisk dogrudan primary modelin
    kalibre olasiligi x meta-modelin "bu cagriya guvenilir mi" tahminiyle
    olusuyor. dipRebound tek bir siniflandiricidan dogrudan cikmayan bir kavram
    oldugu icin seffaf, kucuk bir kural olarak kaliyor (eski 9 terimli agirlikli
    formul yerine 3 anlasilir sinyalin birlesimi).
    """
    df = df.copy()
    classes = list(primary_model.classes_)
    proba = primary_model.predict_proba(df[feature_cols].values)

    class_idx = {c: i for i, c in enumerate(classes)}
    prob_down = proba[:, class_idx.get(CLASS_DOWN, 0)] if CLASS_DOWN in class_idx else np.zeros(len(df))
    prob_flat = proba[:, class_idx.get(CLASS_FLAT, 0)] if CLASS_FLAT in class_idx else np.zeros(len(df))
    prob_up = proba[:, class_idx.get(CLASS_UP, 0)] if CLASS_UP in class_idx else np.zeros(len(df))

    if meta_model is not None:
        meta_x = df[feature_cols].copy()
        for i, c in enumerate(classes):
            meta_x[f"PrimaryProb_{c}"] = proba[:, i]
        meta_confidence = meta_model.predict_proba(meta_x.values)[:, list(meta_model.classes_).index(1)] \
            if 1 in list(meta_model.classes_) else np.full(len(df), 0.5)
    else:
        # meta model egitilemediyse (yetersiz veri) notr bir guven varsayilir -
        # bu durumda gate zaten NO_CLEAR_EDGE'e dusurecek.
        meta_confidence = np.full(len(df), 0.5)

    mom20 = df["Mom20"].fillna(0.0).values if "Mom20" in df.columns else np.zeros(len(df))

    scenarios, scores_list, confidences, reason_tags_list, warning_tags_list = [], [], [], [], []

    for i in range(len(df)):
        momentum_long = prob_up[i] * 100.0 * meta_confidence[i]
        downside_risk = prob_down[i] * 100.0 * meta_confidence[i]
        flat_risk = prob_flat[i] * 100.0

        recent_selloff = max(0.0, -float(mom20[i])) * 100.0
        dip_rebound = min(100.0, recent_selloff * 2.0) * (1.0 - prob_down[i]) * meta_confidence[i]

        falling_knife_risk = downside_risk * (1.0 - meta_confidence[i] * 0.3)

        scenario_candidates = {
            SCENARIO_MOMENTUM_LONG: momentum_long,
            SCENARIO_DIP_REBOUND: dip_rebound,
            SCENARIO_DOWNSIDE_RISK: downside_risk,
        }
        scenario = max(scenario_candidates, key=scenario_candidates.get)
        best_score = scenario_candidates[scenario]

        if best_score < 40.0 or meta_confidence[i] < 0.55 or flat_risk > 70:
            scenario = SCENARIO_NEUTRAL

        reason_tags, warning_tags = [], []
        if scenario == SCENARIO_MOMENTUM_LONG:
            reason_tags.append("UP_PROBABILITY_SUPPORT")
        if scenario == SCENARIO_DOWNSIDE_RISK:
            reason_tags.append("DOWN_PROBABILITY_PRESSURE")
        if scenario == SCENARIO_DIP_REBOUND:
            reason_tags.append("RECOVERY_CLOSE")
        if flat_risk >= 70:
            warning_tags.append("HIGH_FLAT_RISK")
        if meta_confidence[i] < 0.55:
            warning_tags.append("NO_CLEAR_EDGE")

        scenarios.append(scenario)
        scores_list.append({
            "momentumLong": round(float(momentum_long), 2),
            "dipRebound": round(float(dip_rebound), 2),
            "downsideRisk": round(float(downside_risk), 2),
            "flatRisk": round(float(flat_risk), 2),
            "fallingKnifeRisk": round(float(falling_knife_risk), 2),
        })
        confidences.append(round(float(meta_confidence[i]) * 100.0, 2))
        reason_tags_list.append(sorted(set(reason_tags)))
        warning_tags_list.append(sorted(set(warning_tags)))

    df["ProbDown"] = prob_down
    df["ProbFlat"] = prob_flat
    df["ProbUp"] = prob_up
    df["Scenario"] = scenarios
    df["MomentumLongScore"] = [s["momentumLong"] for s in scores_list]
    df["DipReboundScore"] = [s["dipRebound"] for s in scores_list]
    df["DownsideRiskScore"] = [s["downsideRisk"] for s in scores_list]
    df["FlatRiskScore"] = [s["flatRisk"] for s in scores_list]
    df["FallingKnifeRisk"] = [s["fallingKnifeRisk"] for s in scores_list]
    df["ScenarioConfidence"] = confidences
    df["ReasonTags"] = reason_tags_list
    df["WarningTags"] = warning_tags_list

    return df


# ---------- radar + backtest (JSON semasi korunuyor - ZetaController/MarketScreener bunu okuyor) ----------

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
            | ((risk_watch["DownsideRiskScore"] >= 42) & (risk_watch["ProbUp"] < 0.48))
        )
        & ~(risk_watch["Scenario"].isin([SCENARIO_MOMENTUM_LONG, SCENARIO_DIP_REBOUND]))
    ].copy()
    risk_watch_pool = risk_watch_pool[risk_watch_pool["RiskWatchScore"] >= 28].copy()
    risk_watch = risk_watch_pool.sort_values(
        ["RiskWatchScore", "DownsideRiskScore", "FallingKnifeRisk"], ascending=False,
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
            "date": str(date_value), "universeSize": int(len(group)),
            "universeReturn10": universe_return10, "universeReturn20": universe_return20,
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

        reward_risk10 = avg_max_return10 / abs(avg_max_drawdown10) if abs(avg_max_drawdown10) > 1e-9 else None

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

    return {"summary": summary, "daily": daily.to_dict(orient="records")}


def compute_gate(scenario_backtest_summary: Dict[str, Any]) -> Dict[str, Any]:
    """
    Faz 3'un asil yeni parcasi: eski kod bu backtest'i hesaplayip hicbir seye
    baglamiyordu. Artik her senaryo icin "gunluk ornek sayisi yeterli VE excess
    return pozitif mi" kontrol ediliyor - degilse o senaryo lowConfidence
    isaretleniyor, radar sessizce yayinlanmiyor.
    """
    gate = {}
    trustworthy_any = False

    for key in ["momentumLong", "dipRebound", "downsideRisk"]:
        stats = scenario_backtest_summary.get(key, {})
        days = stats.get("days", 0)
        excess = stats.get("avgExcessReturn10Pct", None)

        trustworthy = bool(
            days >= GATE_MIN_DAYS and excess is not None and excess > GATE_MIN_EXCESS_RETURN10_PCT
        )
        trustworthy_any = trustworthy_any or trustworthy

        gate[key] = {
            "trustworthy": trustworthy,
            "days": days,
            "avgExcessReturn10Pct": excess,
            "reason": (
                "yeterli gun + pozitif excess return" if trustworthy
                else "yetersiz veri" if days < GATE_MIN_DAYS
                else "excess return pozitif degil (universe'u gecmiyor)"
            ),
        }

    gate["overallTrustworthy"] = trustworthy_any
    return gate


# ---------- ana calisma akisi ----------

def run(args: argparse.Namespace) -> Dict[str, Any]:
    print("zeta scenario screener (Faz 3 - meta-labeling) basliyor...")
    print(f"horizon={args.horizon}, validation_start={args.validation_start}, test_start={args.test_start}")

    stocks, historical, external = read_sql_data()

    exclude_symbols = [s for s in (args.exclude_symbols or "").split(",") if s.strip()]
    panel, feature_cols = build_zeta_panel(
        stocks=stocks, historical=historical, external=external,
        horizon=args.horizon, vol_mult=args.vol_mult, min_threshold=args.min_threshold,
        exclude_symbols=exclude_symbols,
    )

    if panel.empty:
        raise RuntimeError("panel veri seti bos oluştu. ohlcv verilerini ve bist filtrelerini kontrol edin.")

    panel_clean = panel.dropna(subset=feature_cols + ["TargetClass"]).reset_index(drop=True)
    print(f"panel_clean: {len(panel_clean)} satir, {panel_clean['StockID'].nunique()} hisse, {len(feature_cols)} feature")

    train, validation, test = purged_embargo_split(
        panel_clean, validation_start=args.validation_start, test_start=args.test_start,
        horizon=args.horizon, embargo_days=5,
    )

    print(f"\nsplit ozeti\ntrain: {len(train)}\nvalidation: {len(validation)}\ntest: {len(test)}")

    if len(train) < 1000 or len(validation) < 200 or len(test) < 200:
        raise RuntimeError("train/validation/test bolumleri beklenenden kucuk. tarih araliklarini kontrol edin.")

    # birincil model: train'de egit, validation'da sec (test'e hic bakilmadan).
    best_name, primary_model = select_best_classifier(train, validation, feature_cols)
    print(f"secilen birincil model: {best_name}")

    # meta-labeling: birincilin validation'daki (kendisi icin out-of-sample)
    # tahminlerinden meta-egitim seti uretilir.
    meta_x, meta_y, classes = build_meta_training_set(primary_model, validation, feature_cols)
    meta_model = train_meta_model(meta_x, meta_y)
    print(f"meta model egitildi: {'evet' if meta_model is not None else 'hayir (yetersiz veri)'}")

    # test uzerinde puanla (gate/backtest icin) - dogru degerlendirme icin
    # sadece train+validation ile egitilmis modeller kullanilir.
    test_enriched = score_rows_with_model(test, feature_cols, primary_model, meta_model)
    scenario_backtest = evaluate_scenario_backtest(test_enriched, top_k=args.top_k)
    gate = compute_gate(scenario_backtest.get("summary", {}))

    print("\ngate sonucu:")
    for key, val in gate.items():
        if key == "overallTrustworthy":
            continue
        print(f"  {key}: trustworthy={val['trustworthy']} ({val['reason']}, days={val['days']}, excessReturn10={val['avgExcessReturn10Pct']})")

    # uretim: train+validation ile nihai modeli egit (test hala hic gorulmedi),
    # en guncel satirlari bu nihai modelle puanla.
    final_train = pd.concat([train, validation], ignore_index=True)
    final_primary = build_classifier_candidates()[best_name]
    final_primary.fit(final_train[feature_cols].values, final_train["TargetClass"].astype(int).values)

    # bazi hisselerin (ör. XU100 endeks referansi) diger hisselere gore veri
    # gecikmesi olabilir - o zaman panel'in en son tarihinde Relative* feature'lar
    # NaN kalip o gunu tamamen bosaltabilir. Once feature'lari tam olan satirlari
    # filtrele, "en guncel" tarihi ONDAN SONRA sec.
    panel_features_complete = panel.dropna(subset=feature_cols)
    if panel_features_complete.empty:
        raise RuntimeError("feature'lari tam olan hicbir guncel satir yok.")

    latest_date = panel_features_complete["Date"].max()
    latest_rows = panel_features_complete[panel_features_complete["Date"] == latest_date].copy().reset_index(drop=True)

    latest_enriched = score_rows_with_model(latest_rows, feature_cols, final_primary, meta_model)
    radar = latest_radar(latest_enriched, top_k=args.top_k)
    radar["gate"] = gate
    radar["lowConfidence"] = not gate["overallTrustworthy"]

    report = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "version": "v12_zeta_scenario_screener_v2_meta_labeling",
        "architecture": "pooled_panel_primary_model_plus_meta_labeling",
        "selectedModel": best_name,
        "metaModelTrained": meta_model is not None,
        "universe": "BIST",
        "horizon": args.horizon,
        "validationStart": args.validation_start,
        "testStart": args.test_start,
        "featureCount": len(feature_cols),
        "features": feature_cols,
        "dataset": {
            "panelRows": int(len(panel_clean)),
            "symbols": int(panel_clean["Symbol"].nunique()),
            "trainRows": int(len(train)),
            "validationRows": int(len(validation)),
            "testRows": int(len(test)),
            "trainClassDistribution": class_distribution(train["TargetClass"].values),
            "testClassDistribution": class_distribution(test["TargetClass"].values),
        },
        "gate": gate,
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
        "StockID", "Symbol", "Date", "ClosePrice", "Scenario", "ScenarioConfidence",
        "MomentumLongScore", "DipReboundScore", "DownsideRiskScore", "FlatRiskScore", "FallingKnifeRisk",
        "ProbDown", "ProbFlat", "ProbUp", "ReasonTags", "WarningTags",
    ]
    latest_enriched[csv_cols].to_csv(radar_csv_path, index=False, encoding="utf-8-sig")

    log_run(
        name="zeta_meta_labeling_faz3",
        config={
            "horizon": args.horizon, "vol_mult": args.vol_mult, "min_threshold": args.min_threshold,
            "validation_start": args.validation_start, "test_start": args.test_start,
            "selectedModel": best_name, "metaModelTrained": meta_model is not None,
        },
        metrics={
            "overallTrustworthy": gate["overallTrustworthy"],
            "momentumLongExcessReturn10": gate["momentumLong"]["avgExcessReturn10Pct"] or 0.0,
            "downsideRiskExcessReturn10": gate["downsideRisk"]["avgExcessReturn10Pct"] or 0.0,
        },
        tags=["faz3", "zeta", "meta_labeling"],
    )

    print("\n" + "=" * 60)
    print("zeta scenario screener ozeti")
    print(json.dumps(to_serializable({
        "selectedModel": best_name,
        "metaModelTrained": meta_model is not None,
        "dataset": report["dataset"],
        "gate": gate,
        "latestRadarSummary": radar.get("summary", {}),
        "outputs": {
            "report": str(report_path), "latestRadar": str(radar_path),
            "backtestSummary": str(backtest_path), "latestRadarCsv": str(radar_csv_path),
        },
    }), ensure_ascii=False, indent=2))
    print("=" * 60)

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
    args = parse_args()
    run(args)
