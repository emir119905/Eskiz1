using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models;

namespace Eskiz1.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class PortfolioController : ControllerBase
    {
        private readonly AppDbContext _context;

        public PortfolioController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/portfolio/1 -> Kullanıcının portföy özeti (kar/zarar dahil)
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

                // Ortalama maliyet: toplam ödenen / toplam alınan lot
                decimal toplamOdenen   = buyTxs.Sum(t => t.Quantity * t.PriceAtTransaction);
                int     toplamAlinan   = buyTxs.Sum(t => t.Quantity);
                decimal ortMaliyet     = toplamAlinan > 0 ? toplamOdenen / toplamAlinan : 0;

                // Anlık fiyat: veritabanındaki en son kapanış
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
    }
}