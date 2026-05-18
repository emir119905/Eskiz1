import os
import joblib
from datetime import datetime
import pandas as pd
import numpy as np
import pyodbc
from fastapi import FastAPI, HTTPException
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
import tensorflow as tf
import uvicorn

app = FastAPI(title="Eskiz-1 Quant Fund AI Service")
os.makedirs("ai_models", exist_ok=True)

# Temel feature'lar — her hisse için sabit
BASE_FEATURES = ['ClosePrice', 'OpenPrice', 'Volume', 'Return', 'MA20', 'MA50', 'RSI14', 'Volatility']

# Dış veri feature'ları — korelasyon bazlı seçilecek
EXTERNAL_FEATURES = ['USDTRY', 'USDTRY_Return', 'BIST100', 'BIST100_Return', 'Gold', 'Gold_Return', 'BrentOil', 'BrentOil_Return']

LOOKBACK = 90
FORECAST = 30

# Korelasyon eşiği — bu değerin üstündeki dış veriler modele dahil edilir
CORRELATION_THRESHOLD = 0.35


# ============================================================
# 1. VERİTABANI — Hisse + Dış veri birleşik çekme
# ============================================================
def get_db_data(stock_id: int) -> pd.DataFrame:
    try:
        conn_str = (
            r'DRIVER={ODBC Driver 17 for SQL Server};'
            r'SERVER=localhost\SQLEXPRESS;'
            r'DATABASE=Eskiz1DB;'
            r'Trusted_Connection=yes;'
            r'TrustServerCertificate=yes;'
        )
        conn = pyodbc.connect(conn_str)

        # Hisse verisi
        hisse_query = """
            SELECT Date, ClosePrice, OpenPrice, Volume
            FROM HistoricalData
            WHERE StockID = ?
            ORDER BY Date ASC
        """
        df_hisse = pd.read_sql(hisse_query, conn, params=[stock_id])

        # Dış veri
        dis_query = """
            SELECT Date, USDTRY, BIST100, Gold, BrentOil
            FROM ExternalData
            ORDER BY Date ASC
        """
        df_dis = pd.read_sql(dis_query, conn)
        conn.close()

        if df_dis.empty:
            print(f"[UYARI] Dış veri tablosu boş. Sadece hisse verisiyle devam ediliyor.")
            return df_hisse

        # Tarihe göre birleştir (inner join — ikisinde de olan tarihler)
        df_hisse['Date'] = pd.to_datetime(df_hisse['Date']).dt.date
        df_dis['Date']   = pd.to_datetime(df_dis['Date']).dt.date

        df = pd.merge(df_hisse, df_dis, on='Date', how='left')
        df.ffill(inplace=True)  # eksik dış veri varsa önceki günle doldur
        return df

    except Exception as e:
        raise Exception(f"Veritabani Baglanti Hatasi: {str(e)}")


# ============================================================
# 2. TEKNİK İNDİKATÖRLER + DIŞ VERİ GETİRİLERİ
# ============================================================
def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    close = df['ClosePrice']

    # Temel indikatörler
    df['Return']     = close.pct_change()
    df['MA20']       = close.rolling(window=20).mean()
    df['MA50']       = close.rolling(window=50).mean()
    delta            = close.diff()
    gain             = delta.clip(lower=0)
    loss             = -delta.clip(upper=0)
    avg_gain         = gain.rolling(window=14).mean()
    avg_loss         = loss.rolling(window=14).mean()
    rs               = avg_gain / (avg_loss + 1e-10)
    df['RSI14']      = 100 - (100 / (1 + rs))
    df['Volatility'] = close.rolling(window=10).std()

    # Dış veri günlük getirileri
    for col in ['USDTRY', 'BIST100', 'Gold', 'BrentOil']:
        if col in df.columns:
            df[f'{col}_Return'] = df[col].pct_change()

    df.dropna(inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


# ============================================================
# 3. KORELASYON BAZLI DİNAMİK FEATURE SEÇİMİ
# ✅ Ana fikir: Her hisse hangi dış metrikle korelasyonluysa
#    sadece onları kullan. BIST100 bankaları etkiler ama
#    inşaat şirketlerini etkilemeyebilir.
# ============================================================
def select_features(df: pd.DataFrame, stock_id: int) -> list:
    aktif = BASE_FEATURES.copy()
    secilen_dis = []

    for feat in EXTERNAL_FEATURES:
        if feat not in df.columns:
            continue
        try:
            korelasyon = abs(df[feat].corr(df['ClosePrice']))
            if korelasyon >= CORRELATION_THRESHOLD:
                aktif.append(feat)
                secilen_dis.append(f"{feat}({korelasyon:.2f})")
        except:
            pass

    print(f"[KORELASYON] Hisse {stock_id} için seçilen dış featurelar: "
          f"{secilen_dis if secilen_dis else 'YOK (sadece teknik indikatörler)'}")

    return aktif


# ============================================================
# 4. DİNAMİK HİSSE PROFİLİ
# ============================================================
def get_stock_profile(df: pd.DataFrame) -> dict:
    son_252  = df['ClosePrice'].tail(252)
    vol      = son_252.pct_change().std() * np.sqrt(252)

    if vol < 0.30:
        return {"batch_size": 64, "dropout": 0.15, "profil": "DUSUK_VOL"}
    elif vol < 0.60:
        return {"batch_size": 32, "dropout": 0.20, "profil": "ORTA_VOL"}
    else:
        return {"batch_size": 16, "dropout": 0.30, "profil": "YUKSEK_VOL"}


# ============================================================
# 5. ÖZEL KAYIP FONKSİYONU — Yön cezası
# ============================================================
def directional_loss(y_true, y_pred):
    mse       = tf.reduce_mean(tf.square(y_true - y_pred))
    true_dir  = y_true[1:] - y_true[:-1]
    pred_dir  = y_pred[1:] - y_pred[:-1]
    yon_ceza  = tf.reduce_mean(tf.maximum(0.0, -(true_dir * pred_dir)))
    return 0.70 * mse + 0.30 * yon_ceza


# ============================================================
# 6. MODEL EĞİTİMİ
# ============================================================
def train_and_save_model(df: pd.DataFrame, stock_id: int, features: list):
    train_df    = df.iloc[:-90].copy()
    n_features  = len(features)
    data        = train_df[features].values
    scaler      = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(data)

    x_train, y_train = [], []
    for i in range(LOOKBACK, len(scaled_data)):
        x_train.append(scaled_data[i - LOOKBACK:i])
        y_train.append(scaled_data[i, 0])

    x_train = np.array(x_train)
    y_train = np.array(y_train)

    profil  = get_stock_profile(df)
    dropout = profil['dropout']
    print(f"[PROFİL] {profil['profil']} | {n_features} feature | batch={profil['batch_size']}")

    model = Sequential([
        LSTM(units=128, return_sequences=True, input_shape=(LOOKBACK, n_features)),
        Dropout(dropout),
        LSTM(units=64, return_sequences=True),
        Dropout(dropout),
        LSTM(units=32, return_sequences=False),
        Dropout(dropout),
        Dense(units=32, activation='relu'),
        Dense(units=1)
    ])
    model.compile(optimizer='adam', loss=directional_loss)

    early_stop = EarlyStopping(monitor='val_loss', patience=12, restore_best_weights=True, verbose=1)
    model.fit(x_train, y_train, epochs=150, batch_size=profil['batch_size'],
              validation_split=0.1, callbacks=[early_stop], verbose=1)

    model.save(f"ai_models/model_{stock_id}.keras")
    joblib.dump(scaler,   f"ai_models/scaler_{stock_id}.gz")
    joblib.dump(profil,   f"ai_models/profil_{stock_id}.gz")
    joblib.dump(features, f"ai_models/features_{stock_id}.gz")  # Feature listesini de kaydet

    return model, scaler


# ============================================================
# 7. YARDIMCI FONKSİYONLAR
# ============================================================
def to_real_prices(scaler, scaled_col: np.ndarray, n_features: int) -> np.ndarray:
    dummy = np.zeros((len(scaled_col), n_features))
    dummy[:, 0] = scaled_col
    return scaler.inverse_transform(dummy)[:, 0]


def walk_forward_backtest(model, scaler, all_scaled, n_features, n_days=90):
    total   = len(all_scaled)
    batches = np.stack([
        all_scaled[total - n_days - LOOKBACK + i : total - n_days + i]
        for i in range(n_days)
    ])
    raw = model.predict(batches, verbose=0, batch_size=90)
    return to_real_prices(scaler, raw[:, 0], n_features).tolist()


def monte_carlo_forecast(model, scaler, seed_batch, n_features, n_simulations=50):
    batched    = np.repeat(seed_batch, n_simulations, axis=0)
    all_prices = []

    for _ in range(FORECAST):
        raw      = model(batched, training=True).numpy()
        raw_flat = raw[:, 0]
        all_prices.append(to_real_prices(scaler, raw_flat, n_features))

        next_step           = np.zeros((n_simulations, 1, n_features))
        next_step[:, 0, 0]  = raw_flat
        next_step[:, 0, 1:] = batched[:, -1, 1:]
        batched = np.concatenate([batched[:, 1:, :], next_step], axis=1)

    sims = np.array(all_prices).T
    return {
        "mean":  np.mean(sims, axis=0).tolist(),
        "lower": np.percentile(sims, 10, axis=0).tolist(),
        "upper": np.percentile(sims, 90, axis=0).tolist(),
    }


def calculate_metrics(real, predicted):
    n        = len(real)
    mape     = sum(abs(real[i] - predicted[i]) / (real[i] + 1e-10) for i in range(n)) / n
    accuracy = round(max(0.0, min(100.0, (1 - mape) * 100)), 2)
    yon      = sum(1 for i in range(1, n) if (real[i] > real[i-1]) == (predicted[i] > predicted[i-1]))
    yon_skor = round(yon / (n - 1) * 100, 2)
    return {"accuracyScore": accuracy, "directionScore": yon_skor}


# ============================================================
# 8. ANA ENDPOINT
# ============================================================
@app.get("/predict/{stock_id}")
def predict(stock_id: int):
    try:
        df = get_db_data(stock_id)
        df = add_indicators(df)

        if len(df) < 250:
            return {"error": "Yetersiz veri. En az 2 yillik veri gerekiyor."}

        model_path    = f"ai_models/model_{stock_id}.keras"
        scaler_path   = f"ai_models/scaler_{stock_id}.gz"
        features_path = f"ai_models/features_{stock_id}.gz"

        # Mevcut feature seti
        aktif_features = select_features(df, stock_id)
        n_features     = len(aktif_features)

        # Model geçerli mi kontrol et
        model_is_stale = False
        if os.path.exists(model_path):
            age = (datetime.now() - datetime.fromtimestamp(os.path.getmtime(model_path))).days
            if age > 30:
                model_is_stale = True
            else:
                try:
                    # Kaydedilmiş feature listesiyle karşılaştır
                    if os.path.exists(features_path):
                        kayitli_features = joblib.load(features_path)
                        if kayitli_features != aktif_features:
                            print(f"[YENİDEN EĞİT] Feature seti değişti.")
                            model_is_stale = True
                    else:
                        model_is_stale = True
                except:
                    model_is_stale = True

        if os.path.exists(model_path) and os.path.exists(scaler_path) and not model_is_stale:
            model  = load_model(model_path, custom_objects={"directional_loss": directional_loss})
            scaler = joblib.load(scaler_path)
            profil = joblib.load(f"ai_models/profil_{stock_id}.gz") if os.path.exists(f"ai_models/profil_{stock_id}.gz") else {}
            message = f"Hafizadaki model kullanildi. [{profil.get('profil','?')}] ({n_features} feature)"
        else:
            print(f"[EGITIM] {stock_id} icin model egitiliyor...")
            model, scaler = train_and_save_model(df, stock_id, aktif_features)
            profil = joblib.load(f"ai_models/profil_{stock_id}.gz")
            message = f"Model yeniden egitildi. [{profil.get('profil','?')}] ({n_features} feature)"

        all_scaled   = scaler.transform(df[aktif_features].values)
        past_90_real = [float(x) for x in df['ClosePrice'].tail(90).values]
        past_90_ai   = walk_forward_backtest(model, scaler, all_scaled, n_features, n_days=90)
        metrics      = calculate_metrics(past_90_real, past_90_ai)

        seed_batch = all_scaled[-LOOKBACK:].reshape(1, LOOKBACK, n_features)
        forecast   = monte_carlo_forecast(model, scaler, seed_batch, n_features, n_simulations=50)

        return {
            "stockId":         stock_id,
            "pastData":        past_90_real,
            "pastPredictions": past_90_ai,
            "predictions":     forecast["mean"],
            "lowerBound":      forecast["lower"],
            "upperBound":      forecast["upper"],
            "confidenceScore": metrics["accuracyScore"],
            "directionScore":  metrics["directionScore"],
            "forecastDays":    FORECAST,
            "activeFeatures":  n_features,  # Kaç feature kullanıldı — debug için
            "message":         message
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)