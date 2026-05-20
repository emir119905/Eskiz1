"""
Eskiz-1 v11.0 — Direct Multi-Horizon LSTM Quant Engine
======================================================

Bu sürüm v10'daki auto-regressive / rolling forecast yaklaşımını kaldırır.

Ana değişiklikler:
  1. Rolling Forecast YOK:
     Model kendi tahminini tekrar input'a yedirmez.

  2. Direct Multi-Horizon:
     Model T+5, T+10, T+20, T+30 gün sonrası cumulative log return tahmin eder.

  3. Target MinMaxScaler YOK:
     Return hedefleri sıfır-merkezli kalır. Böylece direction loss gerçek işareti öğrenir.

  4. Multi-Head Output:
     - Quantile Head: q10 / q50 / q90 cumulative return
     - Direction Head: down / flat / up olasılığı

  5. Ordered Quantiles:
     q10 <= q50 <= q90 mimari olarak garanti edilir.

  6. Daha Dürüst Backtest:
     Son 90 gün holdout olarak ayrılır. Model bu bölgeyi eğitimde görmez.
"""

import os
import joblib
from datetime import datetime
from typing import Dict, List, Tuple, Any

import numpy as np
import pandas as pd
import pyodbc
import tensorflow as tf
import uvicorn

from fastapi import FastAPI, HTTPException
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
# APP
# ============================================================
app = FastAPI(title="Eskiz-1 v11.0 - Direct Multi-Horizon Quant Engine")
os.makedirs("ai_models", exist_ok=True)


# ============================================================
# SABİTLER
# ============================================================
BASE_FEATURES = [
    "Return",
    "OpenReturn",
    "Volume",
    "MA20_norm",
    "MA50_norm",
    "RSI14",
    "Volatility",
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

HORIZONS = np.array([5, 10, 20, 30], dtype=np.int32)
N_HORIZONS = len(HORIZONS)
MAX_HORIZON = int(np.max(HORIZONS))

QUANTILES = [0.10, 0.50, 0.90]
N_QUANTILES = len(QUANTILES)

CORR_THR = 0.15
MOMENTUM_WIN = 5

# 30 günlük sınıflandırma eşiği:
# threshold = CLASS_THRESHOLD_K * rolling_volatility * sqrt(30)
CLASS_THRESHOLD_K = 0.75

# Çok küçük hareketlerde direction loss'u devre dışı bırakır.
# Ölçeklenmiş target üzerinde çalışır.
DIRECTION_SIGNIFICANCE_THR = 0.15

MODEL_VERSION = "v11_direct_multi_horizon"


# ============================================================
# 1. VERİTABANI
# ============================================================
def get_db_data(stock_id: int) -> pd.DataFrame:
    try:
        conn_str = (
            r"DRIVER={ODBC Driver 17 for SQL Server};"
            r"SERVER=localhost\SQLEXPRESS;"
            r"DATABASE=Eskiz1DB;"
            r"Trusted_Connection=yes;"
            r"TrustServerCertificate=yes;"
        )
        conn = pyodbc.connect(conn_str)

        df_hisse = pd.read_sql(
            """
            SELECT Date, ClosePrice, OpenPrice, Volume
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
        raise Exception(f"DB Hatasi: {str(e)}")


# ============================================================
# 2. İNDİKATÖRLER
# ============================================================
def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    required_cols = {"ClosePrice", "OpenPrice", "Volume"}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Eksik kolonlar: {sorted(missing)}")

    close = df["ClosePrice"].astype(float)
    open_ = df["OpenPrice"].astype(float)

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


# ============================================================
# 3. FEATURE SEÇİMİ VE PROFİL
# ============================================================
def select_features(train_df: pd.DataFrame, stock_id: int) -> List[str]:
    """
    Feature selection sadece train_df üzerinden yapılır.
    Böylece holdout/test döneminden bilgi sızıntısı engellenir.
    """
    aktif = [feat for feat in BASE_FEATURES if feat in train_df.columns]

    if "Return" not in aktif:
        raise ValueError("Return feature listesinde yok. add_indicators kontrol edilmeli.")

    for feat in EXTERNAL_FEATURES:
        if feat not in train_df.columns:
            continue

        try:
            kor = abs(train_df[feat].corr(train_df["Return"]))
            if np.isfinite(kor) and kor >= CORR_THR:
                aktif.append(feat)
        except Exception:
            pass

    return aktif


def get_profile(df: pd.DataFrame) -> Dict[str, Any]:
    vol = float(df["Return"].tail(252).std() * np.sqrt(252))

    if not np.isfinite(vol):
        vol = 0.60

    if vol < 0.30:
        return {"batch": 64, "dropout": 0.15, "profil": "DUSUK_VOL"}
    elif vol < 0.60:
        return {"batch": 32, "dropout": 0.20, "profil": "ORTA_VOL"}
    else:
        return {"batch": 16, "dropout": 0.25, "profil": "YUKSEK_VOL"}


# ============================================================
# 4. CUSTOM LAYER: ORDERED QUANTILES
# ============================================================
@tf.keras.utils.register_keras_serializable(package="Eskiz")
class OrderedQuantilesLayer(Layer):
    """
    raw[..., 0] -> q50
    raw[..., 1] -> low width
    raw[..., 2] -> high width

    Çıktı:
      q10 = q50 - softplus(low width)
      q50 = raw median
      q90 = q50 + softplus(high width)

    Böylece q10 <= q50 <= q90 mimari olarak garanti edilir.
    """

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


# ============================================================
# 5. LOSS FUNCTIONS
# ============================================================
@tf.keras.utils.register_keras_serializable(package="Eskiz")
def multi_horizon_quantile_loss(y_true: tf.Tensor, y_pred: tf.Tensor) -> tf.Tensor:
    """
    y_true: (batch, N_HORIZONS)
    y_pred: (batch, N_HORIZONS, N_QUANTILES)

    Hedefler cumulative log return / horizon scale.
    Yani sıfır-merkezli ve işaret koruyan ölçekte çalışır.
    """
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

    # Differentiable directional penalty:
    # y_true * q50 pozitifse doğru yön, negatifse yanlış yön.
    dir_raw = tf.nn.softplus(-3.0 * y_true * q50)
    loss_dir = tf.reduce_sum(significant * dir_raw) / (tf.reduce_sum(significant) + 1e-8)

    # Bantları sınırsız açmasın diye yumuşak width regularization.
    # OrderedQuantilesLayer sebebiyle q90 - q10 zaten pozitiftir.
    width = tf.reduce_mean(y_pred[:, :, 2] - y_pred[:, :, 0])

    return loss_q + 0.15 * loss_dir + 0.01 * width


# ============================================================
# 6. MODEL — DIRECT MULTI-HORIZON
# ============================================================
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

    # Quantile Head:
    # Her horizon için raw 3 parametre üretir.
    raw_q = Dense(N_HORIZONS * 3, name="raw_quantile_params")(x)
    raw_q = Reshape((N_HORIZONS, 3), name="raw_quantiles")(raw_q)
    quantile_output = OrderedQuantilesLayer(name="quantiles")(raw_q)

    # Direction Head:
    # 0 = down, 1 = flat, 2 = up
    direction_output = Dense(3, activation="softmax", name="direction")(x)

    model = Model(
        inputs=[enc_input, momentum_input],
        outputs=[quantile_output, direction_output],
        name="Eskiz1_v11_DirectMultiHorizon",
    )

    # Keras 3.x multi-output modellerde dict target/sample_weight bazen
    # output isimleriyle eşleşme hatası çıkarabiliyor. Bu yüzden compile
    # tarafında liste tabanlı loss kullanıyoruz. Output sırası:
    #   0 -> quantiles
    #   1 -> direction
    model.compile(
        optimizer=Adam(learning_rate=0.001),
        loss=[
            multi_horizon_quantile_loss,
            tf.keras.losses.SparseCategoricalCrossentropy(),
        ],
        loss_weights=[1.0, 0.35],
    )

    return model


# ============================================================
# 7. DATASET ÜRETİMİ
# ============================================================
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
    """
    Model input:
      X_enc: Son 90 gün feature penceresi
      X_mom: Son 5 gün raw return momentum özeti

    Model target:
      Y_ret: T+5/T+10/T+20/T+30 cumulative log return, horizon scale ile normalize edilmiş
      Y_cls: 30 günlük down/flat/up sınıfı
    """
    if len(train_df) < LOOKBACK + MAX_HORIZON + 50:
        raise ValueError(
            f"Yetersiz train verisi. Gerekli minimum yaklaşık {LOOKBACK + MAX_HORIZON + 50}, mevcut {len(train_df)}."
        )

    x_scaler = MinMaxScaler(feature_range=(-1, 1))
    X_scaled = x_scaler.fit_transform(train_df[features].values.astype(np.float32))

    close = train_df["ClosePrice"].values.astype(np.float64)
    log_close = np.log(np.maximum(close, 1e-12))

    raw_returns = train_df["Return"].values.astype(np.float64)
    ret_sigma = float(np.nanstd(raw_returns) + 1e-8)

    # Horizon büyüdükçe doğal getiri oynaklığı sqrt(horizon) ile ölçeklenir.
    y_scale = (ret_sigma * np.sqrt(HORIZONS.astype(np.float32))).astype(np.float32)
    y_scale = np.maximum(y_scale, 1e-8)

    X_enc, X_mom, Y_ret, Y_cls = [], [], [], []

    for end_idx in range(LOOKBACK, len(train_df) - MAX_HORIZON):
        X_enc.append(X_scaled[end_idx - LOOKBACK:end_idx])
        X_mom.append(compute_raw_momentum(raw_returns, end_idx, ret_sigma))

        base_idx = end_idx - 1

        # Cumulative log return hedefleri.
        y = np.array(
            [
                log_close[base_idx + int(h)] - log_close[base_idx]
                for h in HORIZONS
            ],
            dtype=np.float32,
        )

        Y_ret.append(y / y_scale)

        # Direction class sadece 30 günlük hedef üzerinden.
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
    """
    Balanced sampling yerine veri atmayız.
    Sadece direction head için sınıf ağırlıklı sample_weight kullanırız.
    """
    n = len(Y_cls)
    quantile_weights = np.ones(n, dtype=np.float32)

    counts = np.bincount(Y_cls, minlength=3).astype(np.float32)
    counts = np.maximum(counts, 1.0)

    class_weights = n / (3.0 * counts)
    direction_weights = class_weights[Y_cls].astype(np.float32)

    # Aşırı nadir sınıfta uçuk ağırlık olmasın.
    direction_weights = np.clip(direction_weights, 0.25, 4.0)

    return quantile_weights, direction_weights


# ============================================================
# 8. EĞİTİM / KAYDETME
# ============================================================
def model_paths(stock_id: int) -> Dict[str, str]:
    return {
        "model": f"ai_models/model_v11_{stock_id}.keras",
        "scaler": f"ai_models/scaler_v11_{stock_id}.gz",
        "profil": f"ai_models/profil_v11_{stock_id}.gz",
        "features": f"ai_models/features_v11_{stock_id}.gz",
        "y_scale": f"ai_models/y_scale_v11_{stock_id}.gz",
        "ret_sigma": f"ai_models/ret_sigma_v11_{stock_id}.gz",
        "version": f"ai_models/version_v11_{stock_id}.gz",
    }


def train_and_save_model(
    df: pd.DataFrame,
    stock_id: int,
    features: List[str],
) -> Tuple[Model, MinMaxScaler, np.ndarray, float, Dict[str, Any]]:
    """
    Son BACKTEST_DAYS eğitimden ayrılır.
    Böylece endpoint'in verdiği backtest modelin görmediği veri üzerinde yapılır.
    """
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

    # validation_split + dict/list sample_weight kombinasyonu bazı Keras
    # sürümlerinde eğitim başında 500'e düşüren yapı hatası üretebiliyor.
    # Zaman serisi mantığını koruyarak validasyonu elle sondan ayırıyoruz.
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


# ============================================================
# 9. MODEL YÜKLEME / STALE KONTROL
# ============================================================
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


# ============================================================
# 10. TAHMİN YARDIMCILARI
# ============================================================
def make_seed_inputs(
    df: pd.DataFrame,
    features: List[str],
    x_scaler: MinMaxScaler,
    ret_sigma: float,
    end_idx_exclusive: int = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    end_idx_exclusive:
      None ise df'in son LOOKBACK günü kullanılır.
      Değer verilirse [end_idx - LOOKBACK, end_idx) penceresi kullanılır.
    """
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

    # Keras output list döner: [quantiles, direction]
    if isinstance(pred, dict):
        q_scaled = pred["quantiles"][0]
        direction_probs = pred["direction"][0]
    else:
        q_scaled = pred[0][0]
        direction_probs = pred[1][0]

    return q_scaled.astype(np.float64), direction_probs.astype(np.float64)


def interpolate_horizon_curve(q_values: np.ndarray) -> np.ndarray:
    """
    q_values: HORIZONS uzunluğunda cumulative log return.
    Çıktı: 1..FORECAST günleri için interpolated cumulative log return.
    """
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

    # q_scaled: (N_HORIZONS, 3)
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


# ============================================================
# 11. BACKTEST
# ============================================================
def walk_forward_backtest_direct(
    model: Model,
    x_scaler: MinMaxScaler,
    y_scale: np.ndarray,
    ret_sigma: float,
    df: pd.DataFrame,
    features: List[str],
    n_days: int = BACKTEST_DAYS,
) -> List[float]:
    """
    Son n_days için 1 gün sonrası fiyat tahmini üretir.
    Model T+1 eğitilmediği için T+5 q50 horizonundan lineer interpolasyonla gün-1 tahmini çıkarılır.

    Gerçek karşılaştırma:
      base gün = t
      tahmin = t+1 fiyatı
      real = t+1 gerçek fiyatı
    """
    if len(df) < LOOKBACK + n_days + 1:
        raise ValueError("Backtest için yeterli veri yok.")

    close_prices = df["ClosePrice"].values.astype(np.float64)

    # n_days adet gerçek değer df.tail(n_days) olacak.
    # Bu yüzden base indexler: len(df)-n_days-1 ... len(df)-2
    start_base_idx = len(df) - n_days - 1

    predictions = []

    for base_idx in range(start_base_idx, len(df) - 1):
        end_idx_exclusive = base_idx + 1

        seed_batch, seed_momentum = make_seed_inputs(
            df=df,
            features=features,
            x_scaler=x_scaler,
            ret_sigma=ret_sigma,
            end_idx_exclusive=end_idx_exclusive,
        )

        q_scaled, _ = model_predict_outputs(model, seed_batch, seed_momentum)
        q_real = q_scaled * y_scale.reshape(-1, 1)

        q50 = q_real[:, 1]
        q50_curve = interpolate_horizon_curve(q50)

        # Gün-1 cumulative log return.
        pred_log_ret_day1 = float(q50_curve[0])
        base_price = float(close_prices[base_idx])
        pred_price_day1 = base_price * float(np.exp(pred_log_ret_day1))

        predictions.append(float(pred_price_day1))

    return predictions


def calculate_metrics(real: List[float], predicted: List[float]) -> Dict[str, float]:
    real_arr = np.asarray(real, dtype=np.float64)
    pred_arr = np.asarray(predicted, dtype=np.float64)

    n = min(len(real_arr), len(pred_arr))
    real_arr = real_arr[:n]
    pred_arr = pred_arr[:n]

    if n < 2:
        return {
            "accuracyScore": 0.0,
            "directionScore": 0.0,
            "rmse": 0.0,
            "mape": 0.0,
        }

    mape = np.mean(np.abs(real_arr - pred_arr) / (np.abs(real_arr) + 1e-10))
    rmse = np.sqrt(np.mean((real_arr - pred_arr) ** 2))

    real_dir = np.diff(real_arr) > 0
    pred_dir = np.diff(pred_arr) > 0
    direction_score = np.mean(real_dir == pred_dir) * 100.0

    # Eski API uyumluluğu için accuracyScore bırakıldı.
    # Ama finansal model kalitesini tek başına temsil etmez.
    accuracy_score = max(0.0, min(100.0, (1.0 - float(mape)) * 100.0))

    return {
        "accuracyScore": round(float(accuracy_score), 2),
        "directionScore": round(float(direction_score), 2),
        "rmse": round(float(rmse), 6),
        "mape": round(float(mape), 6),
    }


# ============================================================
# 12. ANA ENDPOINT
# ============================================================
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

        # Feature selection sadece train/holdout ayrımından önceki bölümde yapılır.
        feature_selection_df = df.iloc[:-BACKTEST_DAYS].copy()
        active_features = select_features(feature_selection_df, stock_id)

        if len(active_features) == 0:
            return {"error": "Aktif feature bulunamadı."}

        if is_model_stale(stock_id, active_features):
            print(f"[EGITIM] {stock_id} egitiliyor... ({MODEL_VERSION})")
            model, x_scaler, y_scale, ret_sigma, profil = train_and_save_model(
                df=df,
                stock_id=stock_id,
                features=active_features,
            )
            message = (
                f"v11 Direct Multi-Horizon Model egitildi. "
                f"[{profil.get('profil', '?')}] ({len(active_features)} feat)"
            )
        else:
            model, x_scaler, y_scale, ret_sigma, profil, saved_features = load_saved_model_bundle(stock_id)
            active_features = saved_features
            message = (
                f"Hafizadaki v11 Direct Multi-Horizon Model. "
                f"[{profil.get('profil', '?')}] ({len(active_features)} feat)"
            )

        # Holdout backtest:
        past_90_real = [float(x) for x in df["ClosePrice"].tail(BACKTEST_DAYS).values]
        past_90_ai = walk_forward_backtest_direct(
            model=model,
            x_scaler=x_scaler,
            y_scale=y_scale,
            ret_sigma=ret_sigma,
            df=df,
            features=active_features,
            n_days=BACKTEST_DAYS,
        )

        metrics = calculate_metrics(past_90_real, past_90_ai)

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

        return {
            "stockId": stock_id,
            "pastData": past_90_real,
            "pastPredictions": past_90_ai,
            "predictions": forecast["mean"],
            "lowerBound": forecast["lower"],
            "upperBound": forecast["upper"],
            "directionProbabilities": forecast["directionProbabilities"],
            "horizonReturns": forecast["horizonReturns"],
            "confidenceScore": metrics["accuracyScore"],
            "directionScore": metrics["directionScore"],
            "rmse": metrics["rmse"],
            "mape": metrics["mape"],
            "forecastDays": FORECAST,
            "horizons": [int(x) for x in HORIZONS.tolist()],
            "activeFeatures": len(active_features),
            "activeFeatureNames": active_features,
            "modelVersion": MODEL_VERSION,
            "message": message,
            "note": (
                "v11 rolling forecast kullanmaz. 30 gunluk cizgi, "
                "T+5/T+10/T+20/T+30 cumulative return tahminlerinden interpolasyonla uretilir."
            ),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {
        "status": "ok",
        "modelVersion": MODEL_VERSION,
        "lookback": LOOKBACK,
        "forecast": FORECAST,
        "horizons": [int(x) for x in HORIZONS.tolist()],
    }


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
