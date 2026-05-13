using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using System.Linq;

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

        // GET: api/portfolio/1 -> 1 numaralı kullanıcının portföy özetini getirir
        [HttpGet("{userId}")]
        public async Task<IActionResult> GetPortfolioSummary(int userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            // Kullanıcının tüm işlemlerini hisse bilgisiyle beraber çek
            var transactions = await _context.Transactions
                .Where(t => t.UserID == userId)
                .Include(t => t.Stock) 
                .ToListAsync();

            // Aynı hissede yapılan alım satımları gruplayıp eldeki net lotu hesapla
            var holdings = transactions
                .GroupBy(t => t.StockID)
                .Select(g => new
                {
                    StockID = g.Key,
                    Symbol = g.First().Stock?.Symbol,
                    
                    // Toplam Alınan - Toplam Satılan = Eldeki Lot
                    TotalQuantity = g.Where(t => t.TransactionType.ToUpper() == "BUY").Sum(t => t.Quantity) -
                                    g.Where(t => t.TransactionType.ToUpper() == "SELL").Sum(t => t.Quantity)
                })
                .Where(h => h.TotalQuantity > 0) // Sadece elinde hala mal olanları göster
                .ToList();

            return Ok(new
            {
                AdSoyad = $"{user.FirstName} {user.LastName}",
                GuncelBakiye = user.Balance,
                SahipOlunanHisseler = holdings
            });
        }
    }
}