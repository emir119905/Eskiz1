import os
import threading
import joblib
from datetime import datetime
from typing import Dict, List, Tuple, Any

from config import get_settings

import numpy as np
import pandas as pd
import pyodbc
import tensorflow as tf
import uvicorn
import math
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.layers import (
    LSTM,
    Dense,
    Dropout,
    Input,
    Concatenate,
    AdditiveAttention,
    Reshape,
    Layer,
)
from tensorflow.keras.models import Model, load_model
from tensorflow.keras.optimizers import Adam


# ============================================================
# uygulama
# ============================================================
settings = get_settings()

app = FastAPI(title="Pusula AI v11.3 - Horizon Metrics ve Chart Contract")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
os.makedirs("ai_models", exist_ok=True)


def get_connection():
    return pyodbc.connect(settings.connection_string)


# ============================================================
# sabitler
# ============================================================
BASE_FEATURES = [
    "Return",
    "OpenReturn",
    "Volume",
    "MA20_norm",
    "MA50_norm",
    "RSI14",
    "Volatility",
    "TrueRangePct",
    "ATR14Pct",
    "IntradayRangePct",
    "UpperWickPct",
    "LowerWickPct",
    "BodyPct",
    "CloseLocationValue",
    "GapReturn",
]

EXTERNAL_FEATURES = [
    "USDTRY_Return",
    "BIST100_Return",
    "Gold_Return",
    "BrentOil_Return",
    "InterestRate_Return",
    "Inflation_Return",
]

LOOKBACK = 90
FORECAST = 30
BACKTEST_DAYS = 90
BACKTEST_HORIZON = 5  

HORIZONS = np.array([5, 10, 20, 30], dtype=np.int32)
N_HORIZONS = len(HORIZONS)
MAX_HORIZON = int(np.max(HORIZONS))

QUANTILES = [0.10, 0.50, 0.90]
N_QUANTILES = len(QUANTILES)

FEATURE_SELECTION_MODE = "force_external"
MOMENTUM_WIN = 5

CLASS_THRESHOLD_K = 0.75

DIRECTION_SIGNIFICANCE_THR = 0.15

DIRECTION_METRIC_THR = 0.002  
PRACTICAL_HORIZON_DIRECTION_THR = 0.01  
SIGNAL_CONFIDENCE_THR = 0.45
SIGNAL_EDGE_THR = 0.08

MODEL_VERSION = "v11_2_ohlcv_features"
EVALUATION_VERSION = "v11_4_ohlcv_atr_features"


# veritabanı

def get_db_data(stock_id: int) -> pd.DataFrame:
    try:
        conn = get_connection()

        df_hisse = pd.read_sql(
            """
            SELECT Date, ClosePrice, OpenPrice, HighPrice, LowPrice, Volume
            FROM HistoricalData
            WHERE StockID = ?
            ORDER BY Date ASC
            """,
            conn,
            params=[stock_id],
        )

        df_dis = pd.read_sql(
            """
            SELECT *
            FROM ExternalData
            ORDER BY Date ASC
            """,
            conn,
        )

        conn.close()

        if df_hisse.empty:
            return df_hisse

        if df_dis.empty:
            df_hisse["Date"] = pd.to_datetime(df_hisse["Date"]).dt.date
            return df_hisse

        df_hisse["Date"] = pd.to_datetime(df_hisse["Date"]).dt.date
        df_dis["Date"] = pd.to_datetime(df_dis["Date"]).dt.date

        df = pd.merge(df_hisse, df_dis, on="Date", how="left")
        df.ffill(inplace=True)
        return df

    except Exception as e:
        raise Exception(f"veritabanı hatası: {str(e)}")


# indikatörler
def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    required_cols = {"ClosePrice", "OpenPrice", "Volume"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Eksik kolonlar: {sorted(missing)}")

    close = df["ClosePrice"].astype(float)
    open_ = df["OpenPrice"].astype(float)

    if "HighPrice" in df.columns:
        high = pd.to_numeric(df["HighPrice"], errors="coerce").astype(float)
    else:
        high = pd.Series(np.nan, index=df.index, dtype=float)

    if "LowPrice" in df.columns:
        low = pd.to_numeric(df["LowPrice"], errors="coerce").astype(float)
    else:
        low = pd.Series(np.nan, index=df.index, dtype=float)

    high = high.fillna(np.maximum(open_, close))
    low = low.fillna(np.minimum(open_, close))

    high = np.maximum(high, np.maximum(open_, close))
    low = np.minimum(low, np.minimum(open_, close))

    prev_close = close.shift(1)

    true_range = pd.concat(
        [
            (high - low).abs(),
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)

    intraday_range = (high - low).replace(0, np.nan)
    candle_body = (close - open_).abs()

    df["TrueRange"] = true_range
    df["TrueRangePct"] = true_range / close.replace(0, np.nan)
    df["ATR14"] = true_range.rolling(14).mean()
    df["ATR14Pct"] = df["ATR14"] / close.replace(0, np.nan)
    df["IntradayRangePct"] = intraday_range / close.replace(0, np.nan)
    df["UpperWickPct"] = (high - np.maximum(open_, close)).clip(lower=0) / close.replace(0, np.nan)
    df["LowerWickPct"] = (np.minimum(open_, close) - low).clip(lower=0) / close.replace(0, np.nan)
    df["BodyPct"] = candle_body / close.replace(0, np.nan)
    df["CloseLocationValue"] = ((close - low) / intraday_range).clip(0, 1).fillna(0.5)
    df["GapReturn"] = (open_ / prev_close.replace(0, np.nan)) - 1.0

    df["Return"] = close.pct_change()
    df["OpenReturn"] = open_.pct_change()

    df["MA20"] = close.rolling(20).mean()
    df["MA50"] = close.rolling(50).mean()

    df["MA20_norm"] = (close / (df["MA20"] + 1e-12)) - 1.0
    df["MA50_norm"] = (close / (df["MA50"] + 1e-12)) - 1.0

    delta = close.diff()
    avg_gain = delta.clip(lower=0).rolling(14).mean()
    avg_loss = (-delta.clip(upper=0)).rolling(14).mean()
    df["RSI14"] = 100.0 - (100.0 / (1.0 + avg_gain / (avg_loss + 1e-10)))

    df["Volatility"] = df["Return"].rolling(10).std()

    for col in ["USDTRY", "BIST100", "Gold", "BrentOil", "InterestRate", "Inflation"]:
        if col in df.columns:
            series = pd.to_numeric(df[col], errors="coerce")
            df[f"{col}_Return"] = series.pct_change()

    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.dropna(inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


# feature seçimi ve profil
def select_features(train_df: pd.DataFrame, stock_id: int) -> List[str]:
    
    aktif = []

    for feat in BASE_FEATURES:
        if feat in train_df.columns:
            aktif.append(feat)

    if "Return" not in aktif:
        raise ValueError("Return feature listesinde yok. add_indicators kontrol edilmeli.")

    for feat in EXTERNAL_FEATURES:
        if feat not in train_df.columns:
            continue

        series = pd.to_numeric(train_df[feat], errors="coerce")
        finite_count = int(np.isfinite(series).sum())
        std_val = float(np.nanstd(series.values.astype(np.float64))) if finite_count > 0 else 0.0

        if finite_count >= 30 and np.isfinite(std_val) and std_val > 1e-12:
            aktif.append(feat)

    return aktif


def get_profile(df: pd.DataFrame) -> Dict[str, Any]:
   
    ret = df["Return"].astype(float)

    vol_252 = float(ret.tail(252).std() * np.sqrt(252))
    vol_60 = float(ret.tail(60).std() * np.sqrt(252))

    candidates = [v for v in [vol_252, vol_60] if np.isfinite(v)]
    vol = max(candidates) if candidates else 0.60

    if vol < 0.30:
        return {
            "batch": 64,
            "dropout": 0.18,
            "profil": "DUSUK_VOL",
            "annVol252": round(vol_252, 4) if np.isfinite(vol_252) else None,
            "annVol60": round(vol_60, 4) if np.isfinite(vol_60) else None,
        }
    elif vol < 0.60:
        return {
            "batch": 32,
            "dropout": 0.23,
            "profil": "ORTA_VOL",
            "annVol252": round(vol_252, 4) if np.isfinite(vol_252) else None,
            "annVol60": round(vol_60, 4) if np.isfinite(vol_60) else None,
        }
    else:
        return {
            "batch": 16,
            "dropout": 0.30,
            "profil": "YUKSEK_VOL",
            "annVol252": round(vol_252, 4) if np.isfinite(vol_252) else None,
            "annVol60": round(vol_60, 4) if np.isfinite(vol_60) else None,
        }


# custom layer: ordered quantiles
@tf.keras.utils.register_keras_serializable(package="Eskiz")
class OrderedQuantilesLayer(Layer):
   
    def __init__(self, min_width: float = 1e-5, **kwargs):
        super().__init__(**kwargs)
        self.min_width = min_width

    def call(self, raw: tf.Tensor) -> tf.Tensor:
        q50 = raw[..., 0:1]
        low_width = tf.nn.softplus(raw[..., 1:2]) + self.min_width
        high_width = tf.nn.softplus(raw[..., 2:3]) + self.min_width

        q10 = q50 - low_width
        q90 = q50 + high_width

        return tf.concat([q10, q50, q90], axis=-1)

    def get_config(self) -> Dict[str, Any]:
        config = super().get_config()
        config.update({"min_width": self.min_width})
        return config


# loss fonksiyonları
@tf.keras.utils.register_keras_serializable(package="Eskiz")
def multi_horizon_quantile_loss(y_true: tf.Tensor, y_pred: tf.Tensor) -> tf.Tensor:
   
    y_true = tf.cast(y_true, tf.float32)
    y_pred = tf.cast(y_pred, tf.float32)

    y_true_exp = tf.expand_dims(y_true, axis=-1)

    q = tf.constant(QUANTILES, dtype=tf.float32)
    q = tf.reshape(q, (1, 1, N_QUANTILES))

    err = y_true_exp - y_pred
    pinball = tf.maximum(q * err, (q - 1.0) * err)
    loss_q = tf.reduce_mean(pinball)

    q50 = y_pred[:, :, 1]

    significant = tf.cast(tf.abs(y_true) > DIRECTION_SIGNIFICANCE_THR, tf.float32)

    dir_raw = tf.nn.softplus(-3.0 * y_true * q50)
    loss_dir = tf.reduce_sum(significant * dir_raw) / (tf.reduce_sum(significant) + 1e-8)

    width = tf.reduce_mean(y_pred[:, :, 2] - y_pred[:, :, 0])

    return loss_q + 0.15 * loss_dir + 0.01 * width


# model — direct multi-horizon

def build_model_v11(lookback: int, n_features: int, dropout: float) -> Model:
    enc_input = Input(shape=(lookback, n_features), name="enc_input")

    enc_x = LSTM(128, return_sequences=True, name="enc1")(enc_input)
    enc_x = Dropout(dropout, name="dropout1")(enc_x)

    enc_seq = LSTM(64, return_sequences=True, name="enc2")(enc_x)
    enc_seq = Dropout(dropout, name="dropout2")(enc_seq)

    context_last = LSTM(64, return_sequences=False, name="context")(enc_seq)

    momentum_input = Input(shape=(2,), name="momentum_input")
    momentum_dense = Dense(16, activation="relu", name="momentum_dense")(momentum_input)

    query = Concatenate(name="query")([context_last, momentum_dense])
    query = Dense(64, activation="relu", name="query_dense")(query)

    query_exp = Reshape((1, 64), name="query_reshape")(query)
    context_vector = AdditiveAttention(name="attention")([query_exp, enc_seq])
    context_vector = Reshape((64,), name="context_reshape")(context_vector)

    x = Concatenate(axis=-1, name="concat_attention")([query, context_vector])
    x = Dense(64, activation="relu", name="dense64")(x)
    x = Dropout(dropout, name="dropout3")(x)
    x = Dense(32, activation="relu", name="dense32")(x)

    raw_q = Dense(N_HORIZONS * 3, name="raw_quantile_params")(x)
    raw_q = Reshape((N_HORIZONS, 3), name="raw_quantiles")(raw_q)
    quantile_output = OrderedQuantilesLayer(name="quantiles")(raw_q)

    direction_output = Dense(3, activation="softmax", name="direction")(x)

    model = Model(
        inputs=[enc_input, momentum_input],
        outputs=[quantile_output, direction_output],
        name="Eskiz1_v11_1_ForceExternal",
    )

    model.compile(
        optimizer=Adam(learning_rate=0.001),
        loss=[
            multi_horizon_quantile_loss,
            tf.keras.losses.SparseCategoricalCrossentropy(),
        ],
        loss_weights=[1.0, 0.35],
    )

    return model


# dataset üretimi

def compute_raw_momentum(raw_returns: np.ndarray, end_idx: int, ret_sigma: float) -> np.ndarray:
    recent = raw_returns[end_idx - MOMENTUM_WIN:end_idx]
    return np.array(
        [
            float(np.mean(recent) / (ret_sigma + 1e-8)),
            float(np.std(recent) / (ret_sigma + 1e-8)),
        ],
        dtype=np.float32,
    )


def create_direct_horizon_dataset(
    train_df: pd.DataFrame,
    features: List[str],
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, MinMaxScaler, np.ndarray, float]:

    if len(train_df) < LOOKBACK + MAX_HORIZON + 50:
        raise ValueError(
            f"Yetersiz train verisi. Gerekli minimum yaklaşık {LOOKBACK + MAX_HORIZON + 50}, mevcut {len(train_df)}."
        )

    n_features = len(features)

    x_scaler = MinMaxScaler(feature_range=(-1, 1))
    X_scaled = x_scaler.fit_transform(train_df[features].values.astype(np.float32))

    close = train_df["ClosePrice"].values.astype(np.float64)
    log_close = np.log(np.maximum(close, 1e-12))

    raw_returns = train_df["Return"].values.astype(np.float64)
    ret_sigma = float(np.nanstd(raw_returns) + 1e-8)

    y_scale = (ret_sigma * np.sqrt(HORIZONS.astype(np.float32))).astype(np.float32)
    y_scale = np.maximum(y_scale, 1e-8)

    X_enc, X_mom, Y_ret, Y_cls = [], [], [], []

    for end_idx in range(LOOKBACK, len(train_df) - MAX_HORIZON):
        X_enc.append(X_scaled[end_idx - LOOKBACK:end_idx])
        X_mom.append(compute_raw_momentum(raw_returns, end_idx, ret_sigma))

        base_idx = end_idx - 1

        y = np.array(
            [
                log_close[base_idx + int(h)] - log_close[base_idx]
                for h in HORIZONS
            ],
            dtype=np.float32,
        )

        Y_ret.append(y / y_scale)

        local_start = max(0, end_idx - 60)
        local_vol = float(np.nanstd(raw_returns[local_start:end_idx]) + 1e-8)
        threshold = CLASS_THRESHOLD_K * local_vol * np.sqrt(30.0)

        y30 = float(y[-1])

        if y30 > threshold:
            cls = 2  # up
        elif y30 < -threshold:
            cls = 0  # down
        else:
            cls = 1  # flat

        Y_cls.append(cls)

    return (
        np.array(X_enc, dtype=np.float32),
        np.array(X_mom, dtype=np.float32),
        np.array(Y_ret, dtype=np.float32),
        np.array(Y_cls, dtype=np.int32),
        x_scaler,
        y_scale.astype(np.float32),
        ret_sigma,
    )


def build_sample_weights(Y_cls: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:

    n = len(Y_cls)
    quantile_weights = np.ones(n, dtype=np.float32)

    counts = np.bincount(Y_cls, minlength=3).astype(np.float32)
    counts = np.maximum(counts, 1.0)

    class_weights = n / (3.0 * counts)
    direction_weights = class_weights[Y_cls].astype(np.float32)

    direction_weights = np.clip(direction_weights, 0.25, 4.0)

    return quantile_weights, direction_weights


# eğitim / kaydetme

def model_paths(stock_id: int) -> Dict[str, str]:

    return {
        "model": f"ai_models/model_v11_2_{stock_id}.keras",
        "scaler": f"ai_models/scaler_v11_2_{stock_id}.gz",
        "profil": f"ai_models/profil_v11_2_{stock_id}.gz",
        "features": f"ai_models/features_v11_2_{stock_id}.gz",
        "y_scale": f"ai_models/y_scale_v11_2_{stock_id}.gz",
        "ret_sigma": f"ai_models/ret_sigma_v11_2_{stock_id}.gz",
        "version": f"ai_models/version_v11_2_{stock_id}.gz",
    }


def train_and_save_model(
    df: pd.DataFrame,
    stock_id: int,
    features: List[str],
) -> Tuple[Model, MinMaxScaler, np.ndarray, float, Dict[str, Any]]:

    train_df = df.iloc[:-BACKTEST_DAYS].copy()

    if len(train_df) < LOOKBACK + MAX_HORIZON + 100:
        raise ValueError(
            f"Eğitim için yetersiz veri. Train uzunluğu: {len(train_df)}. "
            f"Daha fazla tarihsel veri gerekli."
        )

    (
        X_enc,
        X_mom,
        Y_ret,
        Y_cls,
        x_scaler,
        y_scale,
        ret_sigma,
    ) = create_direct_horizon_dataset(train_df, features)

    profil = get_profile(train_df)
    dropout = float(profil["dropout"])

    model = build_model_v11(LOOKBACK, len(features), dropout)

    callbacks = [
        EarlyStopping(
            monitor="val_loss",
            patience=18,
            restore_best_weights=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=8,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    sw_quantiles, sw_direction = build_sample_weights(Y_cls)

    n_samples = len(X_enc)
    val_size = max(1, int(n_samples * 0.15))
    train_size = n_samples - val_size

    if train_size <= 0:
        raise ValueError("Train/validation ayrımı için yeterli örnek oluşmadı.")

    X_enc_train, X_enc_val = X_enc[:train_size], X_enc[train_size:]
    X_mom_train, X_mom_val = X_mom[:train_size], X_mom[train_size:]
    Y_ret_train, Y_ret_val = Y_ret[:train_size], Y_ret[train_size:]
    Y_cls_train, Y_cls_val = Y_cls[:train_size], Y_cls[train_size:]
    sw_q_train, sw_q_val = sw_quantiles[:train_size], sw_quantiles[train_size:]
    sw_d_train, sw_d_val = sw_direction[:train_size], sw_direction[train_size:]

    model.fit(
        [X_enc_train, X_mom_train],
        [Y_ret_train, Y_cls_train],
        sample_weight=[sw_q_train, sw_d_train],
        validation_data=(
            [X_enc_val, X_mom_val],
            [Y_ret_val, Y_cls_val],
            [sw_q_val, sw_d_val],
        ),
        epochs=150,
        batch_size=int(profil["batch"]),
        shuffle=False,
        callbacks=callbacks,
        verbose=1,
    )

    paths = model_paths(stock_id)

    model.save(paths["model"])
    joblib.dump(x_scaler, paths["scaler"])
    joblib.dump(profil, paths["profil"])
    joblib.dump(features, paths["features"])
    joblib.dump(y_scale, paths["y_scale"])
    joblib.dump(ret_sigma, paths["ret_sigma"])
    joblib.dump(MODEL_VERSION, paths["version"])

    return model, x_scaler, y_scale, ret_sigma, profil


# model yükleme / stale kontrol

CUSTOM_OBJECTS = {
    "OrderedQuantilesLayer": OrderedQuantilesLayer,
    "multi_horizon_quantile_loss": multi_horizon_quantile_loss,
}


def is_model_stale(stock_id: int, active_features: List[str]) -> bool:
    paths = model_paths(stock_id)

    required = [
        "model",
        "scaler",
        "features",
        "y_scale",
        "ret_sigma",
        "version",
    ]

    for key in required:
        if not os.path.exists(paths[key]):
            return True

    try:
        saved_version = joblib.load(paths["version"])
        if saved_version != MODEL_VERSION:
            return True

        saved_features = joblib.load(paths["features"])
        if saved_features != active_features:
            return True

        age_days = (datetime.now() - datetime.fromtimestamp(os.path.getmtime(paths["model"]))).days
        if age_days > 30:
            return True

        test_m = load_model(paths["model"], custom_objects=CUSTOM_OBJECTS)

        output_shapes = test_m.output_shape
        if not isinstance(output_shapes, list) or len(output_shapes) != 2:
            return True

        q_shape, d_shape = output_shapes

        if len(q_shape) != 3 or q_shape[1] != N_HORIZONS or q_shape[2] != N_QUANTILES:
            return True

        if len(d_shape) != 2 or d_shape[-1] != 3:
            return True

        return False

    except Exception:
        return True


def load_saved_model_bundle(stock_id: int) -> Tuple[Model, MinMaxScaler, np.ndarray, float, Dict[str, Any], List[str]]:
    paths = model_paths(stock_id)

    model = load_model(paths["model"], custom_objects=CUSTOM_OBJECTS)
    scaler = joblib.load(paths["scaler"])
    y_scale = joblib.load(paths["y_scale"])
    ret_sigma = joblib.load(paths["ret_sigma"])
    profil = joblib.load(paths["profil"]) if os.path.exists(paths["profil"]) else {}
    features = joblib.load(paths["features"])

    return model, scaler, y_scale, float(ret_sigma), profil, features


# stock_id başına eğitim kilidi: aynı hisse için eşzamanlı /predict istekleri
# çakışıp iki kez eğitim başlatmasın ve DefaultRequestHeaders benzeri race condition'lara yol açmasın diye.
_training_locks: Dict[int, threading.Lock] = {}
_training_locks_guard = threading.Lock()


def _get_training_lock(stock_id: int) -> threading.Lock:
    with _training_locks_guard:
        if stock_id not in _training_locks:
            _training_locks[stock_id] = threading.Lock()
        return _training_locks[stock_id]


def load_or_train_model(
    df: pd.DataFrame,
    stock_id: int,
    active_features: List[str],
) -> Tuple[Model, MinMaxScaler, np.ndarray, float, Dict[str, Any], List[str], str]:
    if not is_model_stale(stock_id, active_features):
        model, x_scaler, y_scale, ret_sigma, profil, saved_features = load_saved_model_bundle(stock_id)
        message = (
            f"Hafizadaki v11.1 Force External Model + v11.3 Horizon Metrics + Chart Fix. "
            f"[{profil.get('profil', '?')}] ({len(saved_features)} feat)"
        )
        return model, x_scaler, y_scale, ret_sigma, profil, saved_features, message

    lock = _get_training_lock(stock_id)
    if not lock.acquire(blocking=False):
        raise HTTPException(
            status_code=409,
            detail=f"StockID {stock_id} için model şu anda başka bir istek tarafından eğitiliyor, lütfen kısa süre sonra tekrar deneyin.",
        )
    try:
        # kilidi beklerken başka bir istek eğitimi bitirmiş olabilir; tekrar kontrol edilir.
        if is_model_stale(stock_id, active_features):
            print(f"[Eğitim] {stock_id} eğitiliyor... ({MODEL_VERSION})")
            model, x_scaler, y_scale, ret_sigma, profil = train_and_save_model(
                df=df,
                stock_id=stock_id,
                features=active_features,
            )
            message = (
                f"v11.1 Force External Model egitildi + v11.3 Horizon Metrics + Chart Fix. "
                f"[{profil.get('profil', '?')}] ({len(active_features)} feat)"
            )
            return model, x_scaler, y_scale, ret_sigma, profil, active_features, message

        model, x_scaler, y_scale, ret_sigma, profil, saved_features = load_saved_model_bundle(stock_id)
        message = (
            f"Hafizadaki v11.1 Force External Model + v11.3 Horizon Metrics + Chart Fix. "
            f"[{profil.get('profil', '?')}] ({len(saved_features)} feat)"
        )
        return model, x_scaler, y_scale, ret_sigma, profil, saved_features, message
    finally:
        lock.release()


# tahmin yardımcıları

def make_seed_inputs(
    df: pd.DataFrame,
    features: List[str],
    x_scaler: MinMaxScaler,
    ret_sigma: float,
    end_idx_exclusive: int = None,
) -> Tuple[np.ndarray, np.ndarray]:

    if end_idx_exclusive is None:
        end_idx_exclusive = len(df)

    start_idx = end_idx_exclusive - LOOKBACK

    if start_idx < 0:
        raise ValueError("Seed input için yeterli LOOKBACK verisi yok.")

    feature_window = df[features].iloc[start_idx:end_idx_exclusive].values.astype(np.float32)
    scaled_window = x_scaler.transform(feature_window).astype(np.float32)

    seed_batch = scaled_window.reshape(1, LOOKBACK, len(features))

    raw_returns = df["Return"].values.astype(np.float64)
    momentum = compute_raw_momentum(raw_returns, end_idx_exclusive, ret_sigma).reshape(1, 2)

    return seed_batch, momentum.astype(np.float32)


def model_predict_outputs(
    model: Model,
    seed_batch: np.ndarray,
    seed_momentum: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    pred = model.predict([seed_batch, seed_momentum], verbose=0)

    if isinstance(pred, dict):
        q_scaled = pred["quantiles"][0]
        direction_probs = pred["direction"][0]
    else:
        q_scaled = pred[0][0]
        direction_probs = pred[1][0]

    return q_scaled.astype(np.float64), direction_probs.astype(np.float64)


def interpolate_horizon_curve(q_values: np.ndarray) -> np.ndarray:

    days = np.arange(1, FORECAST + 1)
    xp = np.array([0, *HORIZONS], dtype=np.float64)
    fp = np.r_[0.0, q_values.astype(np.float64)]

    return np.interp(days, xp, fp)


def direct_horizon_forecast(
    model: Model,
    x_scaler: MinMaxScaler,
    y_scale: np.ndarray,
    ret_sigma: float,
    df: pd.DataFrame,
    features: List[str],
    last_price: float,
) -> Dict[str, Any]:
    seed_batch, seed_momentum = make_seed_inputs(
        df=df,
        features=features,
        x_scaler=x_scaler,
        ret_sigma=ret_sigma,
    )

    q_scaled, direction_probs = model_predict_outputs(model, seed_batch, seed_momentum)

    q_real = q_scaled * y_scale.reshape(-1, 1)

    q10 = q_real[:, 0]
    q50 = q_real[:, 1]
    q90 = q_real[:, 2]

    q10_curve = interpolate_horizon_curve(q10)
    q50_curve = interpolate_horizon_curve(q50)
    q90_curve = interpolate_horizon_curve(q90)

    lower_prices = last_price * np.exp(q10_curve)
    mean_prices = last_price * np.exp(q50_curve)
    upper_prices = last_price * np.exp(q90_curve)

    return {
        "mean": [float(x) for x in mean_prices],
        "lower": [float(x) for x in lower_prices],
        "upper": [float(x) for x in upper_prices],
        "directionProbabilities": {
            "down": float(direction_probs[0]),
            "flat": float(direction_probs[1]),
            "up": float(direction_probs[2]),
        },
        "horizonReturns": {
            "days": [int(x) for x in HORIZONS.tolist()],
            "q10": [float(x) for x in q10.tolist()],
            "q50": [float(x) for x in q50.tolist()],
            "q90": [float(x) for x in q90.tolist()],
        },
    }


# backtest — horizon-aligned + naive baseline

def get_horizon_position(horizon: int) -> int:
    matches = np.where(HORIZONS == int(horizon))[0]
    if len(matches) == 0:
        raise ValueError(f"BACKTEST_HORIZON={horizon} HORIZONS içinde yok: {HORIZONS.tolist()}")
    return int(matches[0])


def classify_returns(returns: np.ndarray, threshold: float) -> np.ndarray:
    """
    -1 = down, 0 = flat, 1 = up
    """
    returns = np.asarray(returns, dtype=np.float64)
    out = np.zeros_like(returns, dtype=np.int32)
    out[returns > threshold] = 1
    out[returns < -threshold] = -1
    return out


def horizon_aligned_backtest(
    model: Model,
    x_scaler: MinMaxScaler,
    y_scale: np.ndarray,
    ret_sigma: float,
    df: pd.DataFrame,
    features: List[str],
    n_days: int = BACKTEST_DAYS,
    horizon: int = BACKTEST_HORIZON,
) -> Dict[str, Any]:

    horizon = int(horizon)
    h_pos = get_horizon_position(horizon)

    if len(df) < LOOKBACK + n_days + horizon:
        raise ValueError("Horizon-aligned backtest için yeterli veri yok.")

    close_prices = df["ClosePrice"].values.astype(np.float64)

    target_start = len(df) - n_days
    target_end = len(df)  # exclusive

    real_prices = []
    model_predictions = []
    naive_predictions = []
    origin_prices = []
    target_dates = []
    origin_dates = []
    predicted_log_returns = []
    real_log_returns = []

    date_values = None
    if "Date" in df.columns:
        date_values = df["Date"].astype(str).values

    for target_idx in range(target_start, target_end):
        origin_idx = target_idx - horizon
        end_idx_exclusive = origin_idx + 1

        if origin_idx < 0 or end_idx_exclusive < LOOKBACK:
            continue

        seed_batch, seed_momentum = make_seed_inputs(
            df=df,
            features=features,
            x_scaler=x_scaler,
            ret_sigma=ret_sigma,
            end_idx_exclusive=end_idx_exclusive,
        )

        q_scaled, _ = model_predict_outputs(model, seed_batch, seed_momentum)
        q_real = q_scaled * y_scale.reshape(-1, 1)

        pred_log_ret = float(q_real[h_pos, 1])  # q50, selected horizon
        origin_price = float(close_prices[origin_idx])
        real_price = float(close_prices[target_idx])
        model_price = origin_price * float(np.exp(pred_log_ret))
        naive_price = origin_price

        real_prices.append(real_price)
        model_predictions.append(float(model_price))
        naive_predictions.append(float(naive_price))
        origin_prices.append(float(origin_price))
        predicted_log_returns.append(pred_log_ret)
        real_log_returns.append(float(np.log((real_price + 1e-12) / (origin_price + 1e-12))))

        if date_values is not None:
            target_dates.append(str(date_values[target_idx]))
            origin_dates.append(str(date_values[origin_idx]))

    return {
        "mode": "horizon_aligned",
        "horizon": horizon,
        "horizonPosition": h_pos,
        "real": real_prices,
        "model": model_predictions,
        "naive": naive_predictions,
        "originPrices": origin_prices,
        "targetDates": target_dates,
        "originDates": origin_dates,
        "predictedLogReturns": predicted_log_returns,
        "realLogReturns": real_log_returns,
    }


def class_distribution(classes: np.ndarray) -> Dict[str, float]:
    classes = np.asarray(classes, dtype=np.int32)
    n = max(1, len(classes))
    return {
        "downPct": round(float(np.mean(classes == -1) * 100.0), 2),
        "flatPct": round(float(np.mean(classes == 0) * 100.0), 2),
        "upPct": round(float(np.mean(classes == 1) * 100.0), 2),
        "downCount": int(np.sum(classes == -1)),
        "flatCount": int(np.sum(classes == 0)),
        "upCount": int(np.sum(classes == 1)),
        "samples": int(n),
    }


def safe_corr(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if len(a) < 2 or len(b) < 2:
        return 0.0
    if np.nanstd(a) < 1e-12 or np.nanstd(b) < 1e-12:
        return 0.0
    corr = float(np.corrcoef(a, b)[0, 1])
    return corr if np.isfinite(corr) else 0.0


def calculate_horizon_metrics(
    real: List[float],
    predicted: List[float],
    origins: List[float],
    horizon: int = BACKTEST_HORIZON,
    direction_threshold: float = None,
) -> Dict[str, Any]:

    real_arr = np.asarray(real, dtype=np.float64)
    pred_arr = np.asarray(predicted, dtype=np.float64)
    origin_arr = np.asarray(origins, dtype=np.float64)

    n = min(len(real_arr), len(pred_arr), len(origin_arr))
    real_arr = real_arr[:n]
    pred_arr = pred_arr[:n]
    origin_arr = origin_arr[:n]

    if n == 0:
        return {
            "accuracyScore": 0.0,
            "directionScore": 0.0,
            "rawDirectionScore": 0.0,
            "threeClassAccuracy": 0.0,
            "directionCoverage": 0.0,
            "predictedActionRate": 0.0,
            "rmse": 0.0,
            "mape": 0.0,
            "meanRealReturn": 0.0,
            "meanPredictedReturn": 0.0,
            "returnCorrelation": 0.0,
            "directionThreshold": 0.0,
            "samples": 0,
            "actualClassDistribution": class_distribution(np.array([], dtype=np.int32)),
            "predictedClassDistribution": class_distribution(np.array([], dtype=np.int32)),
        }

    mape = np.mean(np.abs(real_arr - pred_arr) / (np.abs(real_arr) + 1e-10))
    rmse = np.sqrt(np.mean((real_arr - pred_arr) ** 2))

    real_ret = (real_arr - origin_arr) / (np.abs(origin_arr) + 1e-10)
    pred_ret = (pred_arr - origin_arr) / (np.abs(origin_arr) + 1e-10)

    if direction_threshold is None:
        direction_threshold = float(DIRECTION_METRIC_THR * np.sqrt(max(1, int(horizon))))
    else:
        direction_threshold = float(direction_threshold)

    real_cls = classify_returns(real_ret, direction_threshold)
    pred_cls = classify_returns(pred_ret, direction_threshold)

    three_class_accuracy = np.mean(real_cls == pred_cls) * 100.0

    significant_mask = real_cls != 0
    direction_coverage = float(np.mean(significant_mask) * 100.0)

    if np.sum(significant_mask) == 0:
        direction_score = 0.0
    else:
        direction_score = np.mean(real_cls[significant_mask] == pred_cls[significant_mask]) * 100.0

    predicted_action_rate = float(np.mean(pred_cls != 0) * 100.0)

    raw_direction_score = three_class_accuracy

    accuracy_score = max(0.0, min(100.0, (1.0 - float(mape)) * 100.0))

    return {
        "accuracyScore": round(float(accuracy_score), 2),
        "directionScore": round(float(direction_score), 2),
        "rawDirectionScore": round(float(raw_direction_score), 2),
        "threeClassAccuracy": round(float(three_class_accuracy), 2),
        "directionCoverage": round(float(direction_coverage), 2),
        "predictedActionRate": round(float(predicted_action_rate), 2),
        "rmse": round(float(rmse), 6),
        "mape": round(float(mape), 6),
        "meanRealReturn": round(float(np.mean(real_ret)), 6),
        "meanPredictedReturn": round(float(np.mean(pred_ret)), 6),
        "medianRealReturn": round(float(np.median(real_ret)), 6),
        "medianPredictedReturn": round(float(np.median(pred_ret)), 6),
        "returnCorrelation": round(float(safe_corr(real_ret, pred_ret)), 6),
        "directionThreshold": round(float(direction_threshold), 6),
        "samples": int(n),
        "actualClassDistribution": class_distribution(real_cls),
        "predictedClassDistribution": class_distribution(pred_cls),
    }


def calculate_skill_vs_naive(model_metrics: Dict[str, float], naive_metrics: Dict[str, float]) -> Dict[str, float]:
    naive_mape = float(naive_metrics.get("mape", 0.0))
    model_mape = float(model_metrics.get("mape", 0.0))

    naive_rmse = float(naive_metrics.get("rmse", 0.0))
    model_rmse = float(model_metrics.get("rmse", 0.0))

    if naive_mape > 1e-12:
        mape_skill = (naive_mape - model_mape) / naive_mape * 100.0
    else:
        mape_skill = 0.0

    if naive_rmse > 1e-12:
        rmse_skill = (naive_rmse - model_rmse) / naive_rmse * 100.0
    else:
        rmse_skill = 0.0

    direction_skill = float(model_metrics.get("directionScore", 0.0)) - float(naive_metrics.get("directionScore", 0.0))
    raw_direction_skill = float(model_metrics.get("rawDirectionScore", 0.0)) - float(naive_metrics.get("rawDirectionScore", 0.0))

    return {
        "mapeSkillPct": round(float(mape_skill), 2),
        "rmseSkillPct": round(float(rmse_skill), 2),
        "directionSkillPctPoint": round(float(direction_skill), 2),
        "rawDirectionSkillPctPoint": round(float(raw_direction_skill), 2),
        "beatsNaiveByMape": bool(mape_skill > 0),
        "beatsNaiveByRmse": bool(rmse_skill > 0),
    }


def build_signal_quality(forecast: Dict[str, Any]) -> Dict[str, Any]:
    probs = forecast["directionProbabilities"]
    ordered_probs = [
        ("down", float(probs["down"])),
        ("flat", float(probs["flat"])),
        ("up", float(probs["up"])),
    ]
    ordered_probs.sort(key=lambda x: x[1], reverse=True)

    top_direction, top_prob = ordered_probs[0]
    second_prob = ordered_probs[1][1]
    prob_edge = top_prob - second_prob

    q10_30 = float(forecast["horizonReturns"]["q10"][-1])
    q50_30 = float(forecast["horizonReturns"]["q50"][-1])
    q90_30 = float(forecast["horizonReturns"]["q90"][-1])

    band_width_30 = q90_30 - q10_30
    risk_adjusted_return = q50_30 / (band_width_30 + 1e-8)

    is_direction_confident = bool(
        top_prob >= SIGNAL_CONFIDENCE_THR and prob_edge >= SIGNAL_EDGE_THR
    )

    if is_direction_confident and top_direction == "up" and q50_30 > 0:
        trade_bias = "LONG_CANDIDATE"
    elif is_direction_confident and top_direction == "down" and q50_30 < 0:
        trade_bias = "RISK_OFF_OR_SHORT_CANDIDATE"
    else:
        trade_bias = "LOW_CONFIDENCE_OR_NO_TRADE"

    return {
        "topDirection": top_direction,
        "directionConfidence": round(float(top_prob), 4),
        "directionEdge": round(float(prob_edge), 4),
        "isDirectionConfident": is_direction_confident,
        "q50_30d": round(float(q50_30), 6),
        "q10_30d": round(float(q10_30), 6),
        "q90_30d": round(float(q90_30), 6),
        "bandWidth30d": round(float(band_width_30), 6),
        "riskAdjustedReturn30d": round(float(risk_adjusted_return), 6),
        "tradeBias": trade_bias,
    }




def next_business_day_strings(last_date: Any, n_days: int) -> List[str]:
    try:
        start = pd.to_datetime(last_date)
        dates = pd.bdate_range(start=start + pd.offsets.BDay(1), periods=n_days)
        return [d.date().isoformat() for d in dates]
    except Exception:
        return [f"T+{i}" for i in range(1, n_days + 1)]


def build_chart_data(
    backtest: Dict[str, Any],
    forecast: Dict[str, Any],
    df: pd.DataFrame,
) -> Dict[str, Any]:

    backtest_rows = []
    n = min(
        len(backtest.get("real", [])),
        len(backtest.get("model", [])),
        len(backtest.get("naive", [])),
        len(backtest.get("originPrices", [])),
    )

    target_dates = backtest.get("targetDates", [])
    origin_dates = backtest.get("originDates", [])
    pred_log_returns = backtest.get("predictedLogReturns", [])
    real_log_returns = backtest.get("realLogReturns", [])

    for i in range(n):
        origin_price = float(backtest["originPrices"][i])
        real_price = float(backtest["real"][i])
        model_price = float(backtest["model"][i])
        naive_price = float(backtest["naive"][i])

        backtest_rows.append({
            "index": i,
            "date": str(target_dates[i]) if i < len(target_dates) else str(i),
            "targetDate": str(target_dates[i]) if i < len(target_dates) else str(i),
            "originDate": str(origin_dates[i]) if i < len(origin_dates) else None,
            "realPrice": real_price,
            "modelPrediction": model_price,
            "naivePrediction": naive_price,
            "originPrice": origin_price,
            "actualReturn": float((real_price - origin_price) / (abs(origin_price) + 1e-10)),
            "predictedReturn": float((model_price - origin_price) / (abs(origin_price) + 1e-10)),
            "actualLogReturn": float(real_log_returns[i]) if i < len(real_log_returns) else None,
            "predictedLogReturn": float(pred_log_returns[i]) if i < len(pred_log_returns) else None,
        })

    if "Date" in df.columns:
        last_date = df["Date"].iloc[-1]
    else:
        last_date = None

    future_dates = next_business_day_strings(last_date, len(forecast.get("mean", [])))

    forecast_rows = []
    for i, mean_price in enumerate(forecast.get("mean", [])):
        forecast_rows.append({
            "forecastDay": i + 1,
            "date": future_dates[i] if i < len(future_dates) else f"T+{i+1}",
            "mean": float(mean_price),
            "lower": float(forecast["lower"][i]),
            "upper": float(forecast["upper"][i]),
        })

    return {
        "backtest": backtest_rows,
        "forecast": forecast_rows,
        "contractVersion": "chart_contract_v1",
        "xAxisRule": "Use backtest[].date and forecast[].date. Do not generate synthetic past dates in frontend.",
    }

# ANA ENDPOINT

@app.get("/predict/{stock_id}")
def predict(stock_id: int):
    try:
        df = get_db_data(stock_id)
        df = add_indicators(df)

        min_required = LOOKBACK + MAX_HORIZON + BACKTEST_DAYS + 100
        if len(df) < min_required:
            return {
                "error": f"Yetersiz veri. Minimum yaklaşık {min_required} satır gerekli, mevcut {len(df)}."
            }

        feature_selection_df = df.iloc[:-BACKTEST_DAYS].copy()
        active_features = select_features(feature_selection_df, stock_id)

        if len(active_features) == 0:
            return {"error": "Aktif feature bulunamadı."}

        model, x_scaler, y_scale, ret_sigma, profil, active_features, message = load_or_train_model(
            df=df,
            stock_id=stock_id,
            active_features=active_features,
        )

        backtest = horizon_aligned_backtest(
            model=model,
            x_scaler=x_scaler,
            y_scale=y_scale,
            ret_sigma=ret_sigma,
            df=df,
            features=active_features,
            n_days=BACKTEST_DAYS,
            horizon=BACKTEST_HORIZON,
        )

        past_90_real = backtest["real"]
        past_90_ai = backtest["model"]
        past_90_naive = backtest["naive"]

        metrics = calculate_horizon_metrics(
            real=past_90_real,
            predicted=past_90_ai,
            origins=backtest["originPrices"],
            horizon=BACKTEST_HORIZON,
        )
        naive_metrics = calculate_horizon_metrics(
            real=past_90_real,
            predicted=past_90_naive,
            origins=backtest["originPrices"],
            horizon=BACKTEST_HORIZON,
        )

        practical_metrics = calculate_horizon_metrics(
            real=past_90_real,
            predicted=past_90_ai,
            origins=backtest["originPrices"],
            horizon=BACKTEST_HORIZON,
            direction_threshold=PRACTICAL_HORIZON_DIRECTION_THR,
        )
        practical_naive_metrics = calculate_horizon_metrics(
            real=past_90_real,
            predicted=past_90_naive,
            origins=backtest["originPrices"],
            horizon=BACKTEST_HORIZON,
            direction_threshold=PRACTICAL_HORIZON_DIRECTION_THR,
        )

        skill_vs_naive = calculate_skill_vs_naive(metrics, naive_metrics)
        practical_skill_vs_naive = calculate_skill_vs_naive(practical_metrics, practical_naive_metrics)

        last_price = float(df["ClosePrice"].iloc[-1])

        forecast = direct_horizon_forecast(
            model=model,
            x_scaler=x_scaler,
            y_scale=y_scale,
            ret_sigma=ret_sigma,
            df=df,
            features=active_features,
            last_price=last_price,
        )

        signal_quality = build_signal_quality(forecast)
        chart_data = build_chart_data(backtest=backtest, forecast=forecast, df=df)

        return {
            "stockId": stock_id,
            "pastData": past_90_real,
            "pastPredictions": past_90_ai,
            "naivePredictions": past_90_naive,
            "backtestOriginPrices": backtest["originPrices"],
            "backtestTargetDates": backtest["targetDates"],
            "backtestOriginDates": backtest["originDates"],
            "predictions": forecast["mean"],
            "lowerBound": forecast["lower"],
            "upperBound": forecast["upper"],
            "directionProbabilities": forecast["directionProbabilities"],
            "horizonReturns": forecast["horizonReturns"],
            "confidenceScore": metrics["accuracyScore"],
            "directionScore": practical_metrics["directionScore"],
            "rawDirectionScore": practical_metrics["rawDirectionScore"],
            "directionCoverage": practical_metrics["directionCoverage"],
            "strictHorizonMetrics": metrics,
            "practicalHorizonMetrics": practical_metrics,
            "naiveMetrics": naive_metrics,
            "practicalNaiveMetrics": practical_naive_metrics,
            "skillVsNaive": skill_vs_naive,
            "practicalSkillVsNaive": practical_skill_vs_naive,
            "backtestMode": backtest["mode"],
            "backtestHorizon": backtest["horizon"],
            "chartData": chart_data,
            "signalQuality": signal_quality,
            "rmse": metrics["rmse"],
            "mape": metrics["mape"],
            "forecastDays": FORECAST,
            "horizons": [int(x) for x in HORIZONS.tolist()],
            "activeFeatures": len(active_features),
            "activeFeatureNames": active_features,
            "featureSelectionMode": FEATURE_SELECTION_MODE,
            "modelVersion": MODEL_VERSION,
            "evaluationVersion": EVALUATION_VERSION,
            "message": message.replace("v11.2 Horizon Backtest", "v11.3 Horizon Metrics + Chart Fix"),
            "note": (
                "v11.3: model v11.1 Force External mimarisini kullanır; backtest T+1 interpolasyon değil, "
                "T+5 horizon-aligned olarak hesaplanır. chartData alanındaki tarih değerleri frontend için tek doğru eksendir."
            ),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# v12-alpha daily behavior signal
# rule-based günlük davranış katmanı.
# ana tahmin motorunu değiştirmeden teşhis ve yardımcı sinyal üretir.

def _behavior_safe_float(value, default=0.0):
    try:
        if value is None:
            return default
        value = float(value)
        if math.isnan(value) or math.isinf(value):
            return default
        return value
    except Exception:
        return default


def _behavior_round(value, digits=4):
    value = _behavior_safe_float(value, None)
    if value is None:
        return None
    return round(value, digits)


def _behavior_clip(value, low, high):
    value = _behavior_safe_float(value, 0.0)
    return max(low, min(high, value))


def _behavior_tanh_score(value, scale=1.0):
    value = _behavior_safe_float(value, 0.0)
    if scale <= 0:
        scale = 1.0
    return float(np.tanh(value / scale) * 100.0)


def _behavior_get_connection():

    return get_connection()


def _behavior_classify_volatility(vol20, vol60):
    vol20 = _behavior_safe_float(vol20)
    vol60 = _behavior_safe_float(vol60)

    if vol60 <= 0:
        return "unknown", 1.0

    ratio = vol20 / vol60

    if ratio >= 1.35:
        return "high", ratio

    if ratio <= 0.75:
        return "low", ratio

    return "normal", ratio


def _behavior_classify_volume(volume_ratio):
    volume_ratio = _behavior_safe_float(volume_ratio, 1.0)

    if volume_ratio >= 1.50:
        return "high"

    if volume_ratio <= 0.70:
        return "low"

    return "normal"


def _behavior_direction_label(score, flat_risk):
    score = _behavior_safe_float(score)
    flat_risk = _behavior_safe_float(flat_risk)

    if score >= 18 and flat_risk <= 75:
        return "up"

    if score <= -18 and flat_risk <= 75:
        return "down"

    return "flat"


def _behavior_trend_state(momentum_score, autocorr60, volatility_state):
    momentum_score = _behavior_safe_float(momentum_score)
    autocorr60 = _behavior_safe_float(autocorr60)

    if abs(momentum_score) >= 35 and autocorr60 >= -0.15:
        return "trend_following"

    if autocorr60 <= -0.18:
        return "mean_reverting"

    if volatility_state == "high" and abs(momentum_score) < 30:
        return "choppy_high_vol"

    return "choppy"


def _behavior_make_interpretation(direction_bias, trend_state, volatility_state, flat_risk, actionable):
    if direction_bias == "flat":
        if flat_risk >= 75:
            return "Model davranış sinyali net yön üretmiyor; flat riski yüksek."
        return "Davranış sinyali yatay/kararsız rejime işaret ediyor."

    if direction_bias == "up":
        if actionable:
            return "Günlük davranış sinyali yukarı yönlü momentumu destekliyor."
        return "Yukarı eğilim var ancak güven/flat riski nedeniyle ana sinyal değil."

    if direction_bias == "down":
        if actionable:
            return "Günlük davranış sinyali aşağı yönlü baskıyı destekliyor."
        return "Aşağı eğilim var ancak güven/flat riski nedeniyle ana sinyal değil."

    return "Davranış sinyali yorumlanamadı."


@app.get("/behavior-signal/{stock_id}")
def get_behavior_signal(stock_id: int):
    conn = None

    try:
        conn = _behavior_get_connection()

        df = pd.read_sql(
            """
            SELECT 
                Date,
                OpenPrice,
                ClosePrice,
                Volume
            FROM HistoricalData
            WHERE StockID = ?
            ORDER BY Date ASC
            """,
            conn,
            params=[stock_id]
        )

        if df is None or df.empty:
            return {
                "stockId": stock_id,
                "modelVersion": "v12_alpha_daily_behavior_signal",
                "signalMode": "rule_based_daily",
                "error": "Bu StockID için HistoricalData bulunamadı."
            }

        df = df.copy()
        df["Date"] = pd.to_datetime(df["Date"])
        df["OpenPrice"] = pd.to_numeric(df["OpenPrice"], errors="coerce")
        df["ClosePrice"] = pd.to_numeric(df["ClosePrice"], errors="coerce")
        df["Volume"] = pd.to_numeric(df["Volume"], errors="coerce")

        df = df.dropna(subset=["Date", "OpenPrice", "ClosePrice"])
        df = df[df["ClosePrice"] > 0]
        df = df.sort_values("Date").reset_index(drop=True)

        if len(df) < 80:
            return {
                "stockId": stock_id,
                "modelVersion": "v12_alpha_daily_behavior_signal",
                "signalMode": "rule_based_daily",
                "samples": int(len(df)),
                "error": "Davranış sinyali için en az 80 günlük veri önerilir."
            }

        close = df["ClosePrice"].astype(float)
        open_price = df["OpenPrice"].astype(float)
        volume = df["Volume"].fillna(0).astype(float)

        returns = close.pct_change().replace([np.inf, -np.inf], np.nan)
        intraday_return = ((close / open_price) - 1.0).replace([np.inf, -np.inf], np.nan)

        last_close = _behavior_safe_float(close.iloc[-1])
        last_open = _behavior_safe_float(open_price.iloc[-1])
        last_date = df["Date"].iloc[-1].date().isoformat()

        def pct_change_window(window):
            if len(close) <= window:
                return 0.0
            base = _behavior_safe_float(close.iloc[-window - 1])
            if base <= 0:
                return 0.0
            return (last_close / base) - 1.0

        mom5 = pct_change_window(5)
        mom10 = pct_change_window(10)
        mom20 = pct_change_window(20)
        mom60 = pct_change_window(60)

        ma5 = close.rolling(5).mean().iloc[-1]
        ma20 = close.rolling(20).mean().iloc[-1]
        ma50 = close.rolling(50).mean().iloc[-1]

        ma20 = _behavior_safe_float(ma20)
        ma50 = _behavior_safe_float(ma50)

        ma_spread_20_50 = 0.0
        if ma50 > 0:
            ma_spread_20_50 = (ma20 / ma50) - 1.0

        vol5 = _behavior_safe_float(returns.tail(5).std())
        vol20 = _behavior_safe_float(returns.tail(20).std())
        vol60 = _behavior_safe_float(returns.tail(60).std())

        volatility_state, volatility_ratio = _behavior_classify_volatility(vol20, vol60)

        volume20 = _behavior_safe_float(volume.tail(20).mean())
        last_volume = _behavior_safe_float(volume.iloc[-1])
        volume_ratio = 1.0

        if volume20 > 0:
            volume_ratio = last_volume / volume20

        volume_pressure = _behavior_classify_volume(volume_ratio)

        high60 = _behavior_safe_float(close.tail(60).max(), last_close)
        low60 = _behavior_safe_float(close.tail(60).min(), last_close)

        if high60 > low60:
            range_position_60 = (last_close - low60) / (high60 - low60)
        else:
            range_position_60 = 0.5

        range_position_60 = _behavior_clip(range_position_60, 0.0, 1.0)

        breakout_pressure = (range_position_60 - 0.5) * 200.0
        breakout_score = abs(breakout_pressure)

        safe_vol20 = max(vol20, 0.0005)

        z_mom5 = mom5 / (safe_vol20 * math.sqrt(5))
        z_mom20 = mom20 / (safe_vol20 * math.sqrt(20))
        z_ma = ma_spread_20_50 / max(safe_vol20 * 2.0, 0.0005)

        z_mom5 = _behavior_clip(z_mom5, -3.0, 3.0)
        z_mom20 = _behavior_clip(z_mom20, -3.0, 3.0)
        z_ma = _behavior_clip(z_ma, -3.0, 3.0)

        momentum_raw = (0.30 * z_mom5) + (0.45 * z_mom20) + (0.25 * z_ma)
        momentum_score = _behavior_tanh_score(momentum_raw, scale=1.20)

        autocorr60 = returns.tail(60).autocorr(lag=1)
        autocorr60 = _behavior_safe_float(autocorr60, 0.0)

        trend_state = _behavior_trend_state(momentum_score, autocorr60, volatility_state)

        volume_support = 0.0
        if volume_pressure == "high":
            volume_support = np.sign(momentum_score) * min(22.0, abs(momentum_score) * 0.25)
        elif volume_pressure == "low":
            volume_support = -np.sign(momentum_score) * min(12.0, abs(momentum_score) * 0.15)

        direction_composite = (
            0.56 * momentum_score +
            0.29 * breakout_pressure +
            0.15 * volume_support
        )

        direction_composite = _behavior_clip(direction_composite, -100.0, 100.0)

        flat_risk = 100.0 - abs(direction_composite)

        if volatility_state == "low":
            flat_risk += 10.0

        if trend_state in ["choppy", "choppy_high_vol"]:
            flat_risk += 12.0

        if trend_state == "trend_following":
            flat_risk -= 10.0

        if breakout_score >= 65:
            flat_risk -= 8.0

        if volume_pressure == "high" and abs(momentum_score) >= 25:
            flat_risk -= 6.0

        flat_risk = _behavior_clip(flat_risk, 0.0, 100.0)

        direction_bias = _behavior_direction_label(direction_composite, flat_risk)

        direction_confidence = 45.0
        direction_confidence += abs(direction_composite) * 0.42
        direction_confidence -= flat_risk * 0.18

        if trend_state == "trend_following":
            direction_confidence += 8.0

        if volume_pressure == "high":
            direction_confidence += 4.0

        if volatility_state == "high":
            direction_confidence -= 3.0

        direction_confidence = _behavior_clip(direction_confidence, 0.0, 100.0)

        actionable = (
            direction_bias != "flat"
            and direction_confidence >= 55.0
            and flat_risk <= 68.0
        )

        if actionable and direction_bias == "up":
            trade_bias = "EXPERIMENTAL_UP_BIAS"
        elif actionable and direction_bias == "down":
            trade_bias = "EXPERIMENTAL_DOWN_BIAS"
        else:
            trade_bias = "LOW_CONFIDENCE_OR_NO_TRADE"

        interpretation = _behavior_make_interpretation(
            direction_bias=direction_bias,
            trend_state=trend_state,
            volatility_state=volatility_state,
            flat_risk=flat_risk,
            actionable=actionable
        )

        warnings = []

        if flat_risk >= 75:
            warnings.append("HIGH_FLAT_RISK")

        if trend_state in ["choppy", "choppy_high_vol"]:
            warnings.append("CHOPPY_REGIME")

        if volatility_state == "high":
            warnings.append("HIGH_VOLATILITY")

        if direction_confidence < 50:
            warnings.append("LOW_CONFIDENCE")

        return {
            "stockId": stock_id,
            "modelVersion": "v12_alpha_daily_behavior_signal",
            "signalMode": "rule_based_daily",
            "description": "Günlük veriden üretilen deneysel davranış sinyali. Ana tahmin motoruna henüz bağlı değildir.",

            "samples": int(len(df)),
            "lastDate": last_date,
            "lastOpen": _behavior_round(last_open, 4),
            "lastClose": _behavior_round(last_close, 4),

            "directionBias": direction_bias,
            "directionComposite": _behavior_round(direction_composite, 2),
            "directionConfidence": _behavior_round(direction_confidence, 2),
            "flatRisk": _behavior_round(flat_risk, 2),
            "actionable": bool(actionable),
            "tradeBias": trade_bias,

            "trendState": trend_state,
            "volatilityState": volatility_state,
            "volumePressure": volume_pressure,

            "momentumScore": _behavior_round(momentum_score, 2),
            "breakoutScore": _behavior_round(breakout_score, 2),
            "breakoutPressure": _behavior_round(breakout_pressure, 2),
            "rangePosition60": _behavior_round(range_position_60, 4),

            "warnings": warnings,
            "interpretation": interpretation,

            "metrics": {
                "mom5": _behavior_round(mom5, 5),
                "mom10": _behavior_round(mom10, 5),
                "mom20": _behavior_round(mom20, 5),
                "mom60": _behavior_round(mom60, 5),
                "intradayReturnLast": _behavior_round(intraday_return.iloc[-1], 5),
                "maSpread20_50": _behavior_round(ma_spread_20_50, 5),
                "vol5": _behavior_round(vol5, 5),
                "vol20": _behavior_round(vol20, 5),
                "vol60": _behavior_round(vol60, 5),
                "volatilityRatio20_60": _behavior_round(volatility_ratio, 4),
                "volumeRatio20": _behavior_round(volume_ratio, 4),
                "returnAutocorr60": _behavior_round(autocorr60, 4)
            }
        }

    except Exception as e:
        return {
            "stockId": stock_id,
            "modelVersion": "v12_alpha_daily_behavior_signal",
            "signalMode": "rule_based_daily",
            "error": str(e)
        }

    finally:
        try:
            if conn is not None:
                conn.close()
        except Exception:
            pass

@app.get("/health")
def health():
    return {
        "status": "ok",
        "modelVersion": MODEL_VERSION,
        "evaluationVersion": EVALUATION_VERSION,
        "featureSelectionMode": FEATURE_SELECTION_MODE,
        "lookback": LOOKBACK,
        "forecast": FORECAST,
        "backtestHorizon": BACKTEST_HORIZON,
        "horizons": [int(x) for x in HORIZONS.tolist()],
    }


if __name__ == "__main__":
    uvicorn.run(app, host=settings.api_host, port=settings.api_port)
