using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models;

namespace Eskiz1.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class PortfolioController : ControllerBase
    {
        private readonly AppDbContext _context;

        public PortfolioController(AppDbContext context)
        {
            _context = context;
        }

        // get: api/portfolio/1 -> kullanıcının portföy özetini kar/zarar bilgisiyle birlikte döndürür.
        [HttpGet("{userId}")]
        public async Task<IActionResult> GetPortfolioSummary(int userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            var transactions = await _context.Transactions
                .Where(t => t.UserID == userId)
                .Include(t => t.Stock)
                .ToListAsync();

            var holdings = new List<object>();
            decimal toplamPortfoyDegeri = 0;
            decimal toplamKarZarar = 0;

            foreach (var group in transactions.GroupBy(t => t.StockID))
            {
                var buyTxs  = group.Where(t => t.TransactionType == TransactionType.BUY).ToList();
                var sellTxs = group.Where(t => t.TransactionType == TransactionType.SELL).ToList();

                int netLot = buyTxs.Sum(t => t.Quantity) - sellTxs.Sum(t => t.Quantity);
                if (netLot <= 0) continue;

                // ortalama maliyet, toplam ödenen tutarın toplam alınan lot miktarına bölünmesiyle hesaplanır.
                decimal toplamOdenen   = buyTxs.Sum(t => t.Quantity * t.PriceAtTransaction);
                int     toplamAlinan   = buyTxs.Sum(t => t.Quantity);
                decimal ortMaliyet     = toplamAlinan > 0 ? toplamOdenen / toplamAlinan : 0;

                // güncel değer hesabında veritabanındaki en son kapanış fiyatı kullanılır.
                var sonFiyatKaydi = await _context.HistoricalData
                    .Where(h => h.StockID == group.Key)
                    .OrderByDescending(h => h.Date)
                    .FirstOrDefaultAsync();

                decimal sonFiyat      = sonFiyatKaydi?.ClosePrice ?? ortMaliyet;
                decimal anlikDeger    = netLot * sonFiyat;
                decimal karZarar      = (sonFiyat - ortMaliyet) * netLot;
                decimal karZararYuzde = ortMaliyet > 0
                    ? Math.Round((sonFiyat - ortMaliyet) / ortMaliyet * 100, 2)
                    : 0;

                toplamPortfoyDegeri += anlikDeger;
                toplamKarZarar      += karZarar;

                holdings.Add(new
                {
                    StockID        = group.Key,
                    Symbol         = group.First().Stock?.Symbol,
                    CompanyName    = group.First().Stock?.CompanyName,
                    Lot            = netLot,
                    OrtMaliyet     = Math.Round(ortMaliyet, 2),
                    SonFiyat       = Math.Round(sonFiyat, 2),
                    AnlikDeger     = Math.Round(anlikDeger, 2),
                    KarZarar       = Math.Round(karZarar, 2),
                    KarZararYuzde  = karZararYuzde,
                    SonGuncelleme  = sonFiyatKaydi?.Date
                });
            }

            return Ok(new
            {
                AdSoyad             = $"{user.FirstName} {user.LastName}",
                NakitBakiye         = user.Balance,
                ToplamPortfoyDegeri = Math.Round(toplamPortfoyDegeri, 2),
                ToplamVarlik        = Math.Round(user.Balance + toplamPortfoyDegeri, 2),
                ToplamKarZarar      = Math.Round(toplamKarZarar, 2),
                SahipOlunanHisseler = holdings
            });
        }

        // get: api/portfolio/1/history -> kullanıcının işlem geçmişinden ve hisse fiyat geçmişinden
        // günlük portföy değeri eğrisini (equity curve) BIST100 kıyaslamasıyla birlikte yeniden inşa eder.
        [HttpGet("{userId}/history")]
        public async Task<IActionResult> GetPortfolioHistory(int userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            var transactions = await _context.Transactions
                .Where(t => t.UserID == userId)
                .Include(t => t.Stock)
                .OrderBy(t => t.TransactionDate)
                .ToListAsync();

            if (transactions.Count == 0)
            {
                return Ok(new { Gunler = new List<object>(), Islemler = new List<object>() });
            }

            var stockIds = transactions.Select(t => t.StockID).Distinct().ToList();

            var priceHistory = await _context.HistoricalData
                .Where(h => stockIds.Contains(h.StockID))
                .OrderBy(h => h.Date)
                .ToListAsync();

            var pricesByStock = priceHistory
                .GroupBy(h => h.StockID)
                .ToDictionary(g => g.Key, g => g.OrderBy(h => h.Date).ToList());

            var bist100History = await _context.ExternalData
                .Where(e => e.BIST100 > 0)
                .OrderBy(e => e.Date)
                .ToListAsync();

            var ilkTarih = transactions.First().TransactionDate.Date;

            // gösterge takvimi: işlem yapılan hisselerin fiyat verisi bulunan günlerin birleşimidir;
            // böylece her gün için gerçek bir kapanış fiyatına dayanan bir portföy değeri hesaplanabilir.
            var takvim = priceHistory
                .Select(h => h.Date.Date)
                .Distinct()
                .Where(d => d >= ilkTarih)
                .OrderBy(d => d)
                .ToList();

            if (takvim.Count == 0)
            {
                return Ok(new { Gunler = new List<object>(), Islemler = new List<object>() });
            }

            // mevcut bakiyeden geriye dönük başlangıç nakdi türetilir; böylece sabit bir kayıt bakiyesi
            // varsaymak yerine gerçek işlem geçmişiyle her zaman tutarlı kalır.
            decimal toplamAlim  = transactions.Where(t => t.TransactionType == TransactionType.BUY).Sum(t => t.Quantity * t.PriceAtTransaction);
            decimal toplamSatim = transactions.Where(t => t.TransactionType == TransactionType.SELL).Sum(t => t.Quantity * t.PriceAtTransaction);
            decimal baslangicNakit = user.Balance - toplamSatim + toplamAlim;

            decimal nakit = baslangicNakit;
            var netLotlar  = new Dictionary<int, int>();
            var sonFiyatlar = new Dictionary<int, decimal>();
            var priceIndex  = stockIds.ToDictionary(id => id, _ => 0);

            int txIndex = 0;
            int bistIndex = 0;
            decimal? sonBist100 = null;
            decimal? ilkPortfoyDegeri = null;
            decimal? ilkBist100 = null;

            var gunler = new List<object>();

            foreach (var gun in takvim)
            {
                while (txIndex < transactions.Count && transactions[txIndex].TransactionDate.Date <= gun)
                {
                    var t = transactions[txIndex];
                    var tutar = t.Quantity * t.PriceAtTransaction;

                    if (t.TransactionType == TransactionType.BUY)
                    {
                        nakit -= tutar;
                        netLotlar[t.StockID] = netLotlar.GetValueOrDefault(t.StockID) + t.Quantity;
                    }
                    else
                    {
                        nakit += tutar;
                        netLotlar[t.StockID] = netLotlar.GetValueOrDefault(t.StockID) - t.Quantity;
                    }

                    txIndex++;
                }

                decimal holdingsDegeri = 0;

                foreach (var stockId in netLotlar.Keys)
                {
                    if (pricesByStock.TryGetValue(stockId, out var fiyatlar))
                    {
                        int idx = priceIndex[stockId];
                        while (idx < fiyatlar.Count && fiyatlar[idx].Date.Date <= gun)
                        {
                            sonFiyatlar[stockId] = fiyatlar[idx].ClosePrice;
                            idx++;
                        }
                        priceIndex[stockId] = idx;
                    }

                    if (netLotlar[stockId] > 0 && sonFiyatlar.TryGetValue(stockId, out var fiyat))
                    {
                        holdingsDegeri += netLotlar[stockId] * fiyat;
                    }
                }

                decimal portfoyDegeri = nakit + holdingsDegeri;

                while (bistIndex < bist100History.Count && bist100History[bistIndex].Date.Date <= gun)
                {
                    sonBist100 = bist100History[bistIndex].BIST100;
                    bistIndex++;
                }

                ilkPortfoyDegeri ??= portfoyDegeri;
                if (sonBist100.HasValue) ilkBist100 ??= sonBist100;

                gunler.Add(new
                {
                    Tarih            = gun,
                    Nakit            = Math.Round(nakit, 2),
                    HisseDegeri      = Math.Round(holdingsDegeri, 2),
                    ToplamDeger      = Math.Round(portfoyDegeri, 2),
                    GetiriYuzde      = ilkPortfoyDegeri.Value != 0
                        ? Math.Round((portfoyDegeri / ilkPortfoyDegeri.Value - 1) * 100, 2)
                        : 0,
                    Bist100          = sonBist100,
                    Bist100GetiriYuzde = (sonBist100.HasValue && ilkBist100.HasValue && ilkBist100.Value != 0)
                        ? Math.Round((sonBist100.Value / ilkBist100.Value - 1) * 100, 2)
                        : (decimal?)null
                });
            }

            var islemler = transactions.Select(t => new
            {
                Tarih  = t.TransactionDate,
                Symbol = t.Stock?.Symbol,
                Tip    = t.TransactionType.ToString(),
                Adet   = t.Quantity,
                Fiyat  = t.PriceAtTransaction
            });

            return Ok(new { Gunler = gunler, Islemler = islemler });
        }
    }
}