# BLM2058 - Proje
## 1: Veri Gereksinimleri Analizi

Amaç kullanıcıların borsa verilerini takip edip hayali bir bakiye ile portföy yönetebilmesini sağlamak.

**Veri Gereksinimleri:**
- **Kullanıcı:** Ad, Soyad, Email (Unique), Bakiye.
- **Hisse (Stock):** Sembol, Şirket Adı, Sektör.
- **Tarihsel Veri:** Tarih, Açılış, Kapanış, Hacim (Hangi hisseye ait olduğu StockID ile bağlanacak).
- **İşlem (Transaction):** İşlem tipi (Al/Sat), Adet, İşlem Fiyatı, Tarih.

## 2: ER (Varlık-İlişki) Diyagramı Mantığı

- **1:N İlişkisi:** Bir Kullanıcı -> N tane İşlem yapabilir.
- **1:N İlişkisi:** Bir Hisse -> N tane Tarihsel Veri kaydına sahip olabilir.
- **1:N İlişkisi:** Bir Hisse -> N tane İşlem içinde yer alabilir.