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

app = FastAPI(title="Eskiz-1 AI Prediction Service")

# Modellerin ve Scaler'ların ortalıkta dağınık durmaması için bir klasör açıyoruz
os.makedirs("ai_models", exist_ok=True)

# 1. DATABASE BAĞLANTISI
def get_db_data(stock_id: int):
    try:
        conn_str = (
            r'DRIVER={ODBC Driver 17 for SQL Server};'
            r'SERVER=localhost\SQLEXPRESS;'
            r'DATABASE=Eskiz1DB;'
            r'Trusted_Connection=yes;'
            r'TrustServerCertificate=yes;' 
        )
        query = f"SELECT Date, ClosePrice FROM HistoricalData WHERE StockID = {stock_id} ORDER BY Date ASC"
        
        conn = pyodbc.connect(conn_str)
        df = pd.read_sql(query, conn)
        conn.close()
        return df
    except Exception as e:
        raise Exception(f"Veritabanı Bağlantı Hatası: {str(e)}")

# 2. FABRİKA: MODELİ EĞİT VE KAYDET (Sadece ilk kez sorulan hisseler için)
def train_and_save_model(df, stock_id):
    data = df['ClosePrice'].values.reshape(-1, 1)
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(data)
    
    prediction_days = 60
    x_train, y_train = [], []
    
    for x in range(prediction_days, len(scaled_data)):
        x_train.append(scaled_data[x-prediction_days:x, 0])
        y_train.append(scaled_data[x, 0])
        
    x_train, y_train = np.array(x_train), np.array(y_train)
    x_train = np.reshape(x_train, (x_train.shape[0], x_train.shape[1], 1))
    
    # LSTM Mimarisi
    model = Sequential()
    model.add(LSTM(units=50, return_sequences=True, input_shape=(x_train.shape[1], 1)))
    model.add(Dropout(0.2))
    model.add(LSTM(units=50, return_sequences=False))
    model.add(Dropout(0.2))
    model.add(Dense(units=25))
    model.add(Dense(units=1))
    
    model.compile(optimizer='adam', loss='mean_squared_error')
    
    # 50 EPOCH! Artık model adam akıllı öğreniyor.
    model.fit(x_train, y_train, epochs=50, batch_size=32, verbose=0)
    
    # BEYNİ VE ÖLÇEĞİ DİSKE KAYDET
    model.save(f"ai_models/model_{stock_id}.keras")
    joblib.dump(scaler, f"ai_models/scaler_{stock_id}.gz")
    
    return model, scaler, scaled_data

# 3. ZEKİ TAHMİN ENDPOINT'İ (30 Günlük Multi-Step)
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
            data = df['ClosePrice'].values.reshape(-1, 1)
            scaled_data = scaler.transform(data)
            message = "Hafızadaki model ile 30 günlük trend hesaplandı."
        else:
            model, scaler, scaled_data = train_and_save_model(df, stock_id)
            message = "Yeni hisse eğitildi ve 30 günlük trend hesaplandı."
        
        # --- MULTI-STEP FORECASTING (30 GÜNLÜK ZİNCİR) ---
        future_predictions = []
        
        # Tahmine başlayacağımız ilk 60 günlük pencereyi alıyoruz
        current_batch = scaled_data[-60:].reshape(1, 60, 1)
        
        for i in range(30): # 30 gün boyunca bu döngü dönecek
            # 1. Sıradaki günü tahmin et
            next_prediction = model.predict(current_batch, verbose=0)
            
            # 2. Tahmini TL/Dolar cinsine çevirip listeye ekle
            real_price = scaler.inverse_transform(next_prediction)
            future_predictions.append(float(real_price[0][0]))
            
            # 3. Pencereyi kaydır: En eski günü at, yeni tahmini pencerenin sonuna ekle
            next_prediction_reshaped = next_prediction.reshape(1, 1, 1)
            current_batch = np.append(current_batch[:, 1:, :], next_prediction_reshaped, axis=1)
        
        return {
            "stockId": stock_id,
            "predictions": future_predictions, # Artık tek rakam değil, 30 elemanlı liste dönüyor!
            "message": message
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)