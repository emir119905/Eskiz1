import os
import joblib
import pandas as pd
import numpy as np
import pyodbc
from fastapi import FastAPI, HTTPException
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout
import uvicorn

app = FastAPI(title="Eskiz-1 Multivariate AI Service")

# Modellerin saklanacağı klasör
os.makedirs("ai_models", exist_ok=True)

# 1. DATABASE BAĞLANTISI (Artık OpenPrice ve Volume de çekiyoruz!)
def get_db_data(stock_id: int):
    try:
        conn_str = (
            r'DRIVER={ODBC Driver 17 for SQL Server};'
            r'SERVER=localhost\SQLEXPRESS;'
            r'DATABASE=Eskiz1DB;'
            r'Trusted_Connection=yes;'
            r'TrustServerCertificate=yes;' 
        )
        # SADECE CLOSE DEĞİL, 3 BÜYÜK PARAMETREYİ ÇEKİYORUZ
        query = f"SELECT Date, ClosePrice, OpenPrice, Volume FROM HistoricalData WHERE StockID = {stock_id} ORDER BY Date ASC"
        
        conn = pyodbc.connect(conn_str)
        df = pd.read_sql(query, conn)
        conn.close()
        return df
    except Exception as e:
        raise Exception(f"Veritabanı Bağlantı Hatası: {str(e)}")

# 2. FABRİKA: ÇOK DEĞİŞKENLİ MODELİ EĞİT
def train_and_save_model(df, stock_id):
    # 3 özelliği de alıyoruz
    features = ['ClosePrice', 'OpenPrice', 'Volume']
    data = df[features].values
    
    # MinMaxScaler her bir kolonu kendi içinde 0 ile 1 arasına sıkıştırır
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(data)
    
    prediction_days = 60
    x_train, y_train = [], []
    
    for x in range(prediction_days, len(scaled_data)):
        x_train.append(scaled_data[x-prediction_days:x]) # 60 günlük 3'lü paketler
        y_train.append(scaled_data[x]) # Model aynı anda 3 şeyi de tahmin edecek!
        
    x_train, y_train = np.array(x_train), np.array(y_train)
    
    # LSTM Mimarisi (Artık input shape 3 boyutlu!)
    model = Sequential()
    model.add(LSTM(units=50, return_sequences=True, input_shape=(x_train.shape[1], x_train.shape[2])))
    model.add(Dropout(0.2))
    model.add(LSTM(units=50, return_sequences=False))
    model.add(Dropout(0.2))
    model.add(Dense(units=25))
    model.add(Dense(units=3)) # ÇIKIŞ KATMANI: Close, Open, Volume için 3 nöron!
    
    model.compile(optimizer='adam', loss='mean_squared_error')
    
    # 50 Epoch ile derin öğrenme
    model.fit(x_train, y_train, epochs=50, batch_size=32, verbose=0)
    
    # BEYNİ VE ÖLÇEĞİ DİSKE KAYDET
    model.save(f"ai_models/model_{stock_id}.keras")
    joblib.dump(scaler, f"ai_models/scaler_{stock_id}.gz")
    
    return model, scaler, scaled_data

# 3. ZEKİ TAHMİN ENDPOINT'İ
@app.get("/predict/{stock_id}")
def predict(stock_id: int):
    try:
        df = get_db_data(stock_id)
        if len(df) < 100:
            return {"error": "Yetersiz veri! En az 100 günlük veri çekmelisin brom."}
            
        model_path = f"ai_models/model_{stock_id}.keras"
        scaler_path = f"ai_models/scaler_{stock_id}.gz"
        
        if os.path.exists(model_path) and os.path.exists(scaler_path):
            model = load_model(model_path)
            scaler = joblib.load(scaler_path)
            
            features = ['ClosePrice', 'OpenPrice', 'Volume']
            data = df[features].values
            scaled_data = scaler.transform(data)
            
            message = "Hafızadaki Gelişmiş Multivariate Model kullanıldı."
        else:
            model, scaler, scaled_data = train_and_save_model(df, stock_id)
            message = "Yeni hisse çok değişkenli (Multivariate) olarak eğitildi!"
        
        # --- MULTI-STEP FORECASTING ---
        future_predictions = []
        
        # Tahmine başlayacağımız ilk 60 günlük pencereyi (3 boyutlu) alıyoruz
        current_batch = scaled_data[-60:].reshape(1, 60, 3)
        
        for i in range(30):
            # 1. Sıradaki günü (Close, Open, Volume) tahmin et
            next_prediction = model.predict(current_batch, verbose=0) # Çıktı: (1, 3)
            
            # 2. Tahmini gerçek sayılara (TL ve Adet) çevir
            real_values = scaler.inverse_transform(next_prediction)
            
            # 3. Bize frontend'de sadece Kapanış Fiyatı (ClosePrice) lazım. 
            # Listede 0. indeks ClosePrice'tır.
            future_predictions.append(float(real_values[0][0]))
            
            # 4. Pencereyi kaydır: Modelin kendi tahmin ettiği 3 veriyi listeye ekle
            next_prediction_reshaped = next_prediction.reshape(1, 1, 3)
            current_batch = np.append(current_batch[:, 1:, :], next_prediction_reshaped, axis=1)
        
        # Geçmiş 30 günün gerçek kapanış fiyatları
        past_30_days = [float(x) for x in df['ClosePrice'].tail(30).values]
        
        return {
            "stockId": stock_id,
            "pastData": past_30_days,
            "predictions": future_predictions,
            "message": message
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)