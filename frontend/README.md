# Pusula AI — Portföy Yönetimi ve Varlık Tahmin Sistemi

Pusula AI, finansal varlıkların tarihsel fiyat verilerini saklayan, portföy işlemlerini yöneten ve deneysel yapay zekâ tabanlı analiz çıktıları üreten çok katmanlı bir web uygulamasıdır.

Proje; React tabanlı frontend, .NET Web API tabanlı backend, SQL Server veritabanı ve Python tabanlı analiz servisinden oluşur.

> Bu proje akademik çalışma kapsamında geliştirilmiştir. Uygulamada yer alan analiz ve tahmin çıktıları yatırım tavsiyesi değildir.

---

## Proje Kapsamı

Uygulama temel olarak aşağıdaki işlevleri sağlar:

- Hisse ve finansal varlık kayıtlarının yönetilmesi
- Tarihsel fiyat verilerinin veritabanında saklanması
- Yahoo Finance üzerinden OHLCV verilerinin senkronize edilmesi
- Dış piyasa verilerinin saklanması
- Sanal portföy üzerinde alım/satım işlemlerinin yapılması
- Dashboard üzerinden finansal analiz çıktılarının görüntülenmesi
- Model Lab ekranında deneysel model metriklerinin incelenmesi
- Raporlar ekranında proje kapsamının ve sistem mimarisinin özetlenmesi

---

## Sistem Mimarisi

Proje dört ana bileşenden oluşur:

```text
frontend/      React + Vite arayüzü
backend/       .NET Web API ve Entity Framework katmanı
ai_service/    Python tabanlı analiz ve tahmin servisi
database/      SQL Server veritabanı ve migration/script yapısı
```

Genel veri akışı:

```text
Kullanıcı Arayüzü
      ↓
.NET Web API
      ↓
SQL Server Veritabanı
      ↓
Python Analiz Servisi
      ↓
Dashboard / Model Lab / Raporlar
```

---

## Kullanılan Teknolojiler

### Frontend

- React
- Vite
- JavaScript
- Recharts
- CSS-in-JS / inline style yapısı

### Backend

- .NET Web API
- Entity Framework Core
- SQL Server
- Swagger
- HttpClient servisleri

### Yapay Zekâ / Analiz Servisi

- Python
- FastAPI
- Pandas
- NumPy
- scikit-learn
- TensorFlow / Keras
- pyodbc

### Veri Kaynakları

- Yahoo Finance tarihsel fiyat verileri
- SQL Server üzerinde saklanan dış piyasa verileri
- Kullanıcı işlemleri ve portföy kayıtları

---

## Veritabanı Yapısı

Projede kullanılan temel tablolar aşağıdaki gibidir:

### Users

Kullanıcı bilgilerini ve sanal nakit bakiyesini tutar.

Temel alanlar:

- UserID
- FirstName
- LastName
- Email
- Balance
- CreatedAt

### Stocks

Sistemde takip edilen finansal varlıkları tutar.

Temel alanlar:

- StockID
- Symbol
- CompanyName
- Sector

### HistoricalData

Hisselere ait tarihsel OHLCV fiyat verilerini tutar.

Temel alanlar:

- DataID
- StockID
- Date
- OpenPrice
- HighPrice
- LowPrice
- ClosePrice
- Volume

### Transactions

Kullanıcıların sanal portföy üzerinde yaptığı alım/satım işlemlerini tutar.

Temel alanlar:

- TransactionID
- UserID
- StockID
- TransactionType
- Quantity
- PriceAtTransaction
- TransactionDate

### ExternalData

Piyasa geneline dair dış verileri tutar.

Temel alanlar:

- ID
- Date
- USDTRY
- BIST100
- Gold
- BrentOil

---

## Temel Modüller

### Dashboard

Seçilen finansal varlık için model çıktıları, backtest grafikleri, fiyat senaryoları ve davranış sinyalleri görüntülenir.

### Portföy

Kullanıcı sanal portföyünü görüntüler. Alım/satım işlemleri gerçekleştirilir ve portföy değeri hesaplanır.

### İzleme Listesi

Kullanıcının takip etmek istediği varlıkları yerel olarak saklar ve hızlı analiz akışı sağlar.

### Model Lab

Farklı hisseler üzerinde toplu analiz yapılmasını sağlar. Model metrikleri, yön başarısı, aksiyon oranı ve risk etiketleri bu ekranda incelenir.

### Raporlar

Projenin amacı, mimarisi, veritabanı yapısı ve analiz modülleri hakkında kısa bir brifing sunar.

### Veri Yönetimi

Admin panel üzerinden hisse ekleme, tarihsel veri senkronizasyonu, veri durumu kontrolü ve tarihsel veri silme işlemleri yapılır.

---

## Kurulum

### 1. Depoyu Klonlama

```bash
git clone <repo-linki>
cd <proje-klasoru>
```

### 2. Backend Kurulumu

```bash
cd backend/Eskiz1.API
dotnet restore
dotnet build
dotnet run
```

Backend varsayılan olarak aşağıdaki port üzerinden çalışır:

```text
http://localhost:5221
```

Swagger arayüzü:

```text
http://localhost:5221/swagger
```

### 3. Veritabanı Ayarı

`backend/Eskiz1.API/appsettings.json` içindeki bağlantı cümlesi yerel SQL Server kurulumuna göre düzenlenmelidir.

Örnek bağlantı:

```json
{
  "ConnectionStrings": {
    "DefaultConnection": "Server=localhost\\SQLEXPRESS;Database=Eskiz1DB;Trusted_Connection=True;TrustServerCertificate=True;"
  }
}
```

Entity Framework migration kullanılıyorsa:

```bash
dotnet ef database update
```

### 4. Frontend Kurulumu

```bash
cd frontend
npm install
npm run dev
```

Frontend varsayılan olarak aşağıdaki port üzerinden çalışır:

```text
http://localhost:5173
```

### 5. Python Analiz Servisi

```bash
cd ai_service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Python analiz servisi varsayılan olarak aşağıdaki port üzerinden çalışır:

```text
http://127.0.0.1:8000
```

---

## Teslim Paketi Notu

Proje teslim paketinde aşağıdaki klasör ve dosyalar boyut/ortam bağımlılığı nedeniyle yer almayabilir:

- `node_modules/`
- `frontend/dist/`
- `backend/**/bin/`
- `backend/**/obj/`
- `ai_service/venv/`
- `ai_service/__pycache__/`
- `ai_service/ai_models/`
- büyük model çıktıları ve geçici artifact dosyaları

Bu dosyalar proje kurulumu sırasında ilgili bağımlılık yöneticileriyle yeniden oluşturulabilir.

---

## Çalıştırma Sırası

Uygulamanın tam çalışması için önerilen sıra:

1. SQL Server veritabanını hazırlayın.
2. Backend API servisini başlatın.
3. Python analiz servisini başlatın.
4. Frontend uygulamasını başlatın.
5. Admin panel üzerinden veri senkronizasyonunu kontrol edin.
6. Dashboard veya Model Lab ekranlarından analizleri çalıştırın.

---

## Akademik Değerlendirme Açısından Öne Çıkan Noktalar

Bu proje kapsamında aşağıdaki veritabanı ve yazılım geliştirme konuları uygulanmıştır:

- İlişkisel veritabanı tasarımı
- Entity Framework ile tablo modelleme
- CRUD işlemleri
- API endpoint tasarımı
- Veritabanı üzerinden portföy hesaplama
- Tarihsel finansal verinin saklanması
- Dış veri senkronizasyonu
- Çok katmanlı uygulama mimarisi
- Frontend üzerinden veri görüntüleme ve yönetme
- Python servisinin veritabanı verilerini kullanarak analiz üretmesi

---

## Güvenlik ve Kullanım Notları

- Uygulama akademik/demo amaçlıdır.
- Analiz çıktıları yatırım tavsiyesi değildir.
- Gerçek kullanıcı kimlik doğrulama ve yetkilendirme yapısı eklenmeden canlı ortamda kullanılmamalıdır.
- Bağlantı cümleleri ve ortam değişkenleri canlı sistemlerde güvenli şekilde saklanmalıdır.

---

## Geliştirici

**Emir Yağız Kefeli**  
**Öğrenci No:** 24290738  
