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
import uvicorn

app = FastAPI(title="Eskiz-1 Quant Fund AI Service")
os.makedirs("ai_models", exist_ok=True)

FEATURES   = ['ClosePrice', 'OpenPrice', 'Volume', 'Return', 'MA20', 'MA50', 'RSI14']
N_FEATURES = len(FEATURES)
LOOKBACK   = 60
FORECAST   = 30

# ============================================================
# 1. VERİTABANI — SQL Injection kapatıldı
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
        query = "SELECT Date, ClosePrice, OpenPrice, Volume FROM HistoricalData WHERE StockID = ? ORDER BY Date ASC"
        conn = pyodbc.connect(conn_str)
        df = pd.read_sql(query, conn, params=[stock_id])
        conn.close()
        return df
    except Exception as e:
        raise Exception(f"Veritabani Baglanti Hatasi: {str(e)}")


# ============================================================
# 2. TEKNİK İNDİKATÖRLER
# ============================================================
def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    close = df['ClosePrice']
    df = df.copy()
    df['Return'] = close.pct_change()
    df['MA20']   = close.rolling(window=20).mean()
    df['MA50']   = close.rolling(window=50).mean()
    delta    = close.diff()
    gain     = delta.clip(lower=0)
    loss     = -delta.clip(upper=0)
    avg_gain = gain.rolling(window=14).mean()
    avg_loss = loss.rolling(window=14).mean()
    rs = avg_gain / (avg_loss + 1e-10)
    df['RSI14'] = 100 - (100 / (1 + rs))
    df.dropna(inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


# ============================================================
# 3. MODEL EĞİTİMİ
# ============================================================
def train_and_save_model(df: pd.DataFrame, stock_id: int):
    train_df    = df.iloc[:-90].copy()
    data        = train_df[FEATURES].values
    scaler      = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(data)

    x_train, y_train = [], []
    for i in range(LOOKBACK, len(scaled_data)):
        x_train.append(scaled_data[i - LOOKBACK:i])
        y_train.append(scaled_data[i, 0])

    x_train = np.array(x_train)
    y_train = np.array(y_train)

    model = Sequential([
        LSTM(units=100, return_sequences=True, input_shape=(LOOKBACK, N_FEATURES)),
        Dropout(0.2),
        LSTM(units=50, return_sequences=True),
        Dropout(0.2),
        LSTM(units=25, return_sequences=False),
        Dropout(0.2),
        Dense(units=25, activation='relu'),
        Dense(units=1)
    ])
    model.compile(optimizer='adam', loss='mean_squared_error')
    early_stop = EarlyStopping(monitor='val_loss', patience=10, restore_best_weights=True, verbose=1)
    model.fit(x_train, y_train, epochs=100, batch_size=32,
              validation_split=0.1, callbacks=[early_stop], verbose=1)

    model.save(f"ai_models/model_{stock_id}.keras")
    joblib.dump(scaler, f"ai_models/scaler_{stock_id}.gz")
    return model, scaler


# ============================================================
# 4. YARDIMCI: scaled → gerçek fiyat (batch destekli)
# ============================================================
def to_real_prices(scaler, scaled_col: np.ndarray) -> np.ndarray:
    """scaled_col: (N,) — sadece ClosePrice sütunu"""
    dummy = np.zeros((len(scaled_col), N_FEATURES))
    dummy[:, 0] = scaled_col
    return scaler.inverse_transform(dummy)[:, 0]


# ============================================================
# 5. WALK-FORWARD BACKTEST — Toplu (batch) hesaplama
# ============================================================
def walk_forward_backtest(model, scaler, all_scaled: np.ndarray, n_days: int = 90):
    """
    OPTİMİZASYON: 90 pencereyi stack'le, tek model.predict() ile hesapla.
    Eskiden: 90 ayrı çağrı → Şimdi: 1 çağrı (batch=90)
    """
    total = len(all_scaled)
    batches = np.stack([
        all_scaled[total - n_days - LOOKBACK + i : total - n_days + i]
        for i in range(n_days)
    ])  # (90, 60, 7)
    raw = model.predict(batches, verbose=0, batch_size=90)  # (90, 1)
    return to_real_prices(scaler, raw[:, 0]).tolist()


# ============================================================
# 6. MONTE CARLO — Batched (tüm simülasyonlar paralel)
# ============================================================
def monte_carlo_forecast(model, scaler, seed_batch: np.ndarray, n_simulations: int = 50):
    """
    OPTİMİZASYON: 50 simülasyonu tek batch'te çalıştır.
    Eskiden: 50 x 30 = 1500 çağrı → Şimdi: 30 çağrı (batch=50)  ~20x hızlanma
    """
    batched    = np.repeat(seed_batch, n_simulations, axis=0)  # (50, 60, 7)
    all_prices = []

    for _ in range(FORECAST):
        raw      = model(batched, training=True).numpy()  # (50, 1) — Dropout aktif
        raw_flat = raw[:, 0]                               # (50,)
        all_prices.append(to_real_prices(scaler, raw_flat))

        next_step            = np.zeros((n_simulations, 1, N_FEATURES))
        next_step[:, 0, 0]   = raw_flat
        next_step[:, 0, 1:]  = batched[:, -1, 1:]
        batched = np.concatenate([batched[:, 1:, :], next_step], axis=1)

    sims = np.array(all_prices).T  # (n_simulations, FORECAST)
    return {
        "mean":  np.mean(sims, axis=0).tolist(),
        "lower": np.percentile(sims, 10, axis=0).tolist(),
        "upper": np.percentile(sims, 90, axis=0).tolist(),
    }


# ============================================================
# 7. ANA ENDPOINT
# ============================================================
@app.get("/predict/{stock_id}")
def predict(stock_id: int):
    try:
        df = get_db_data(stock_id)
        df = add_technical_indicators(df)

        if len(df) < 200:
            return {"error": "Yetersiz veri. En az 1-2 yillik veri gerekiyor."}

        model_path  = f"ai_models/model_{stock_id}.keras"
        scaler_path = f"ai_models/scaler_{stock_id}.gz"

        model_is_stale = False
        if os.path.exists(model_path):
            age_days = (datetime.now() - datetime.fromtimestamp(os.path.getmtime(model_path))).days
            if age_days > 30:
                model_is_stale = True

        if os.path.exists(model_path) and os.path.exists(scaler_path) and not model_is_stale:
            model  = load_model(model_path)
            scaler = joblib.load(scaler_path)
            message = "Hafizadaki model kullanildi."
        else:
            reason = "yeni hisse" if not os.path.exists(model_path) else "model 30+ gun eski"
            print(f"[EGITIM] {stock_id} icin model egitiliyor ({reason})...")
            model, scaler = train_and_save_model(df, stock_id)
            message = "Model yeniden egitildi (Walk-Forward + EarlyStopping)."

        all_scaled   = scaler.transform(df[FEATURES].values)
        past_90_real = [float(x) for x in df['ClosePrice'].tail(90).values]
        past_90_ai   = walk_forward_backtest(model, scaler, all_scaled, n_days=90)

        errors         = [abs(past_90_real[i] - past_90_ai[i]) / (past_90_real[i] + 1e-10) for i in range(90)]
        accuracy_score = round(max(0.0, min(100.0, (1 - sum(errors) / len(errors)) * 100)), 2)

        seed_batch = all_scaled[-LOOKBACK:].reshape(1, LOOKBACK, N_FEATURES)
        forecast   = monte_carlo_forecast(model, scaler, seed_batch, n_simulations=50)

        return {
            "stockId":         stock_id,
            "pastData":        past_90_real,
            "pastPredictions": past_90_ai,
            "predictions":     forecast["mean"],
            "lowerBound":      forecast["lower"],
            "upperBound":      forecast["upper"],
            "confidenceScore": accuracy_score,
            "forecastDays":    FORECAST,
            "message":         message
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)