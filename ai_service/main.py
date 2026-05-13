import pandas as pd
import numpy as np
import pyodbc
from fastapi import FastAPI, HTTPException
from sklearn.preprocessing import MinMaxScaler
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
import uvicorn

app = FastAPI(title="Eskiz-1 AI Prediction Service")

# 1. DATABASE BAĞLANTISI (Senin C# Ayarlarınla Tam Uyumlu)
def get_db_data(stock_id: int):
    try:
        # NOT: Eğer 'Driver 17' hata verirse burayı 'ODBC Driver 18' yap brom
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

# 2. LSTM MODELİNİ İNŞA ET VE EĞİT
def train_lstm_model(df):
    # Kapanış fiyatlarını alıp 0-1 arasına sıkıştırıyoruz (Scaling)
    data = df['ClosePrice'].values.reshape(-1, 1)
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled_data = scaler.fit_transform(data)
    
    # Son 60 günü kullanarak tahmin yapacak pencereleme sistemi
    prediction_days = 60
    x_train, y_train = [], []
    
    for x in range(prediction_days, len(scaled_data)):
        x_train.append(scaled_data[x-prediction_days:x, 0])
        y_train.append(scaled_data[x, 0])
        
    x_train, y_train = np.array(x_train), np.array(y_train)
    x_train = np.reshape(x_train, (x_train.shape[0], x_train.shape[1], 1))
    
    # O MEŞHUR "KALIN" LSTM MİMARİSİ
    model = Sequential()
    
    # 1. LSTM Katmanı + Dropout (Hafıza hücresi)
    model.add(LSTM(units=50, return_sequences=True, input_shape=(x_train.shape[1], 1)))
    model.add(Dropout(0.2))
    
    # 2. LSTM Katmanı + Dropout
    model.add(LSTM(units=50, return_sequences=False))
    model.add(Dropout(0.2))
    
    # Çıkış Katmanları
    model.add(Dense(units=25))
    model.add(Dense(units=1)) # Yarınki fiyat tahmini
    
    model.compile(optimizer='adam', loss='mean_squared_error')
    
    # Epochs=5 hızlı test içindir, finalde sunumda bunu 20-25 yapıp şov yaparsın ;)
    model.fit(x_train, y_train, epochs=5, batch_size=32, verbose=0)
    
    return model, scaler, scaled_data

# 3. TAHMİN ENDPOINT'İ
@app.get("/predict/{stock_id}")
def predict(stock_id: int):
    try:
        # DB'den veriyi çek
        df = get_db_data(stock_id)
        
        # 60 gün pencereleme yapacağımız için en az 100 günlük veri şart
        if len(df) < 100:
            return {"error": "Yetersiz veri! Önce Yahoo'dan 1 yıllık veri çekmelisin brom."}
            
        # Modeli eğit
        model, scaler, scaled_data = train_lstm_model(df)
        
        # Geleceği (Yarını) Tahmin Et
        real_data = [scaled_data[len(scaled_data) - 60:len(scaled_data), 0]]
        real_data = np.array(real_data)
        real_data = np.reshape(real_data, (real_data.shape[0], real_data.shape[1], 1))
        
        prediction = model.predict(real_data)
        prediction = scaler.inverse_transform(prediction) # 0-1 aralığından TL fiyatına dön
        
        return {
            "stockId": stock_id,
            "prediction": float(prediction[0][0]),
            "message": "LSTM Tahmin Motoru başarıyla çalıştı."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)