using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Services;
using Eskiz1.API.Data;

namespace Eskiz1.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class HistoricalDataController : ControllerBase
    {
        private readonly YahooFinanceService _yahooService;
        private readonly AppDbContext _context;

        public HistoricalDataController(YahooFinanceService yahooService, AppDbContext context)
        {
            _yahooService = yahooService;
            _context = context;
        }

        private static (bool Ok, int Added, int Updated) ParseYahooResult(string resultMessage)
        {
            if (string.IsNullOrWhiteSpace(resultMessage) || !resultMessage.StartsWith("OK_"))
            {
                return (false, 0, 0);
            }

            var parts = resultMessage.Split('_', StringSplitOptions.RemoveEmptyEntries);

            int added = 0;
            int updated = 0;

            if (parts.Length > 1) int.TryParse(parts[1], out added);
            if (parts.Length > 2) int.TryParse(parts[2], out updated);

            return (true, added, updated);
        }

        private static string BuildSyncMessage(string symbol, int added, int updated)
        {
            if (added > 0 && updated > 0)
            {
                return $"{symbol} için {added} yeni veri eklendi, {updated} mevcut kaydın high/low verisi güncellendi.";
            }

            if (added > 0)
            {
                return $"{symbol} için {added} adet yeni OHLCV verisi eklendi.";
            }

            if (updated > 0)
            {
                return $"{symbol} için {updated} mevcut kaydın high/low verisi güncellendi.";
            }

            return $"{symbol} zaten güncel.";
        }

        // post: api/historicaldata/sync/1 -> yahoo finance üzerinden ohlcv verisini senkronize eder ve eksik high/low alanlarını günceller.
        [HttpPost("sync/{stockId}")]
        public async Task<IActionResult> SyncDataFromYahoo(int stockId)
        {
            var stock = await _context.Stocks.FindAsync(stockId);
            if (stock == null) return NotFound("Hisse bulunamadı.");

            var resultMessage = await _yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);
            var parsed = ParseYahooResult(resultMessage);

            if (parsed.Ok)
            {
                return Ok(new
                {
                    Mesaj = BuildSyncMessage(stock.Symbol, parsed.Added, parsed.Updated),
                    Symbol = stock.Symbol,
                    AddedCount = parsed.Added,
                    UpdatedCount = parsed.Updated
                });
            }

            return BadRequest($"İşlem sırasında hata oluştu: {resultMessage}");
        }

        // post: api/historicaldata/syncall -> tüm hisseler için ohlcv verisini senkronize eder ve eksik high/low alanlarını günceller.
        [HttpPost("syncall")]
        public async Task<IActionResult> SyncAllStocks()
        {
            var stocks = await _context.Stocks.ToListAsync();
            var results = new List<object>();

            foreach (var stock in stocks)
            {
                var result = await _yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);
                var parsed = ParseYahooResult(result);

                results.Add(new
                {
                    Symbol = stock.Symbol,
                    Status = parsed.Ok ? "OK" : "HATA",
                    YeniKayit = parsed.Ok ? parsed.Added : -1,
                    GuncellenenKayit = parsed.Ok ? parsed.Updated : -1,
                    Detay = parsed.Ok ? BuildSyncMessage(stock.Symbol, parsed.Added, parsed.Updated) : result
                });
            }

            return Ok(results);
        }

        // delete: api/historicaldata/stock/1 -> seçili hissenin tarihsel verilerini siler.
        // not: hisse kaydını veya kullanıcı işlemlerini silmez; yalnızca historicaldata kayıtlarını temizler.
        [HttpDelete("stock/{stockId}")]
        public async Task<IActionResult> DeleteHistoricalDataByStock(int stockId)
        {
            var stock = await _context.Stocks.FindAsync(stockId);
            if (stock == null)
            {
                return NotFound($"StockID {stockId} için hisse bulunamadı.");
            }

            var records = await _context.HistoricalData
                .Where(h => h.StockID == stockId)
                .ToListAsync();

            var deletedCount = records.Count;

            if (deletedCount == 0)
            {
                return Ok(new
                {
                    Mesaj = $"{stock.Symbol} için silinecek tarihsel veri bulunamadı.",
                    StockID = stockId,
                    Symbol = stock.Symbol,
                    DeletedCount = 0
                });
            }

            _context.HistoricalData.RemoveRange(records);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                Mesaj = $"{stock.Symbol} için {deletedCount} tarihsel veri kaydı silindi.",
                StockID = stockId,
                Symbol = stock.Symbol,
                DeletedCount = deletedCount
            });
        }

        // get: api/historicaldata/status -> hisse bazında veritabanı durumunu özetler.
        [HttpGet("status")]
        public async Task<IActionResult> GetDatabaseStatus()
        {
            var stocks = await _context.Stocks.ToListAsync();
            var statusList = new List<object>();
            int totalRecords = 0;
            int totalOhlcMissing = 0;

            foreach (var stock in stocks)
            {
                var records = await _context.HistoricalData
                    .Where(h => h.StockID == stock.StockID)
                    .ToListAsync();

                if (!records.Any())
                {
                    statusList.Add(new
                    {
                        StockID = stock.StockID,
                        Symbol = stock.Symbol,
                        Durum = "VERİ YOK",
                        KayitSayisi = 0,
                        OhlcEksikSayisi = 0,
                        OhlcTamSayisi = 0,
                        OhlcTamlikYuzde = 0.0,
                        IlkTarih = (DateTime?)null,
                        SonTarih = (DateTime?)null,
                        GunFarki = (int?)null,
                        BoslukVar = (bool?)null
                    });

                    continue;
                }

                totalRecords += records.Count;

                var dates = records.Select(r => r.Date.Date).OrderBy(d => d).ToList();
                var ilkTarih = dates.First();
                var sonTarih = dates.Last();
                var gunFarki = (sonTarih - ilkTarih).Days;

                // beklenen iş günü sayısı ile gerçek kayıt sayısı karşılaştırılır.
                // hafta sonları işlem günü olmadığı için yaklaşık yüzde 85 tolerans kullanılır.
                int beklenenIsGunu = (int)(gunFarki * 5.0 / 7.0);
                bool boslukVar = records.Count < (int)(beklenenIsGunu * 0.85);

                int ohlcEksikSayisi = records.Count(r =>
                    !r.HighPrice.HasValue ||
                    !r.LowPrice.HasValue ||
                    r.HighPrice.GetValueOrDefault() <= 0m ||
                    r.LowPrice.GetValueOrDefault() <= 0m
                );

                int ohlcTamSayisi = records.Count - ohlcEksikSayisi;
                totalOhlcMissing += ohlcEksikSayisi;

                double ohlcTamlikYuzde = records.Count == 0
                    ? 0.0
                    : Math.Round((double)ohlcTamSayisi / records.Count * 100.0, 2);

                string durum = boslukVar
                    ? "BOŞLUK VAR"
                    : ohlcEksikSayisi > 0
                        ? "OHLC EKSİK"
                        : "SAĞLIKLI";

                statusList.Add(new
                {
                    StockID = stock.StockID,
                    Symbol = stock.Symbol,
                    Durum = durum,
                    KayitSayisi = records.Count,
                    OhlcEksikSayisi = ohlcEksikSayisi,
                    OhlcTamSayisi = ohlcTamSayisi,
                    OhlcTamlikYuzde = ohlcTamlikYuzde,
                    IlkTarih = ilkTarih,
                    SonTarih = sonTarih,
                    GunFarki = gunFarki,
                    BoslukVar = boslukVar
                });
            }

            return Ok(new
            {
                ToplamHisse = stocks.Count,
                ToplamKayit = totalRecords,
                ToplamOhlcEksik = totalOhlcMissing,
                HisseDurumlari = statusList
            });
        }
    }
}
