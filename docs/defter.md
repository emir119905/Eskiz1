## 20/04/2026
proje klasör yapısı
BLM2058 için proje temeli

## 21/04/2026 
veritabanı ve ilk API
c# üzerinden tabloları database e yazdırma
ilk api yazıldı
swagger arayüzünde test edildi

## 13/05/2026

AI Service Entegrasyonu ve LSTM Tahmin Motoru

    Python 3.12 kurulumu ve ortam değişkenlerinin (Path) manuel konfigürasyonu

    FastAPI tabanlı AI_Service katmanının ve sanal ortamın (venv) oluşturulması

    TensorFlow/Keras kullanılarak 2 katmanlı LSTM derin öğrenme modelinin kodlanması

    SQL Server (SQLEXPRESS) ile Python/pyodbc veri boru hattının kurulması

    İlk borsa fiyat tahmininin başarıyla üretilmesi ve Swagger üzerinden test edilmesi

    Devasa venv klasörünün .gitignore ile Git takibinden çıkarılması ve temiz push

## 14/05/2026

    model artık çok değişkenli düşünerek tahmin yapıyor
    zincirleme bir şekilde önümüzdeki 30 günü hesaplıyor
    her bir hisse için özel olarak eğitilen modeller otomatik olarak oluşuyor ve saklı tutuluyor
    sanal borsa altyapısı ve portföy yönetimi
    alım satımlarda bakiye kontrolü ve güvenlik önlemleri
    eksik günlerin verileri otomatik şekilde alınıyor
    frontend backend iletişimi için bazı CORS politikaları ve HttpClient bağımlılıkları
    geçmiş verinin ve gelecek tahmininin birleştiği hibrit bir grafik
    enum ile tip güvenliği
    tablo çakışmaları önlendi