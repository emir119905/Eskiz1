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

        // POST: api/historicaldata/sync/1 -> Yahoo'dan veri çek
        [HttpPost("sync/{stockId}")]
        public async Task<IActionResult> SyncDataFromYahoo(int stockId)
        {
            var stock = await _context.Stocks.FindAsync(stockId);
            if (stock == null) return NotFound("Hisse bulunamadı!");

            var resultMessage = await _yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);

            if (resultMessage.StartsWith("OK_"))
            {
                int count = int.Parse(resultMessage.Split('_')[1]);
                return Ok(count > 0
                    ? $"{stock.Symbol} için {count} adet yeni veri eklendi."
                    : $"{stock.Symbol} zaten güncel.");
            }
            return BadRequest($"Hata: {resultMessage}");
        }

        // POST: api/historicaldata/syncall -> Tüm hisseler için Yahoo'dan veri çek
        [HttpPost("syncall")]
        public async Task<IActionResult> SyncAllStocks()
        {
            var stocks = await _context.Stocks.ToListAsync();
            var results = new List<object>();

            foreach (var stock in stocks)
            {
                var result = await _yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);
                int count = result.StartsWith("OK_") ? int.Parse(result.Split('_')[1]) : -1;
                results.Add(new
                {
                    Symbol = stock.Symbol,
                    Status = result.StartsWith("OK_") ? "OK" : "HATA",
                    YeniKayit = count,
                    Detay = result.StartsWith("OK_") ? null : result
                });
            }
            return Ok(results);
        }

        // GET: api/historicaldata/status -> Veritabanı durumu (hangi hissede ne kadar veri var)
        [HttpGet("status")]
        public async Task<IActionResult> GetDatabaseStatus()
        {
            var stocks = await _context.Stocks.ToListAsync();
            var statusList = new List<object>();

            foreach (var stock in stocks)
            {
                var records = await _context.HistoricalData
                    .Where(h => h.StockID == stock.StockID)
                    .ToListAsync();

                if (!records.Any())
                {
                    statusList.Add(new
                    {
                        StockID   = stock.StockID,
                        Symbol    = stock.Symbol,
                        Durum     = "VERİ YOK",
                        KayitSayisi = 0,
                        IlkTarih  = (DateTime?)null,
                        SonTarih  = (DateTime?)null,
                        GunFarki  = (int?)null,
                        BoslukVar = (bool?)null
                    });
                    continue;
                }

                var dates     = records.Select(r => r.Date.Date).OrderBy(d => d).ToList();
                var ilkTarih  = dates.First();
                var sonTarih  = dates.Last();
                var gunFarki  = (sonTarih - ilkTarih).Days;

                // Beklenen iş günü sayısı vs gerçek kayıt sayısı karşılaştır
                // Hafta sonu ~2/7 oranında iş günü değil, kabaca tolerans %85
                int beklenenIsGunu = (int)(gunFarki * 5.0 / 7.0);
                bool boslukVar = records.Count < (int)(beklenenIsGunu * 0.85);

                statusList.Add(new
                {
                    StockID     = stock.StockID,
                    Symbol      = stock.Symbol,
                    Durum       = boslukVar ? "BOŞLUK VAR" : "SAĞLIKLI",
                    KayitSayisi = records.Count,
                    IlkTarih    = ilkTarih,
                    SonTarih    = sonTarih,
                    GunFarki    = gunFarki,
                    BoslukVar   = boslukVar
                });
            }

            return Ok(new
            {
                ToplamHisse    = stocks.Count,
                ToplamKayit    = statusList.Sum(s => (int)s.GetType().GetProperty("KayitSayisi").GetValue(s)),
                HisseDurumlari = statusList
            });
        }
    }
}