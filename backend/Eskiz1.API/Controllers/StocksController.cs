using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models;

namespace Eskiz1.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class StocksController : ControllerBase
    {
        private readonly AppDbContext _context;

        public StocksController(AppDbContext context)
        {
            _context = context;
        }

        // get: api/stocks -> tüm hisseleri listeler.
        [HttpGet]
        public async Task<IActionResult> GetStocks()
        {
            var stocks = await _context.Stocks.ToListAsync();
            return Ok(stocks);
        }

        // get: api/stocks/search?q=turk -> sembol veya şirket adına göre hisse arar.
        // frontend arama alanı bu endpoint üzerinden sonuç alır.
        [HttpGet("search")]
        public async Task<IActionResult> SearchStocks([FromQuery] string q)
        {
            if (string.IsNullOrWhiteSpace(q))
                return Ok(await _context.Stocks.ToListAsync());

            var query = q.ToUpper().Trim();

            var results = await _context.Stocks
                .Where(s =>
                    s.Symbol.Contains(query) ||
                    (s.CompanyName ?? string.Empty).ToUpper().Contains(query) ||
                    (s.Sector ?? string.Empty).ToUpper().Contains(query))
                .OrderBy(s => s.Symbol)
                .ToListAsync();

            return Ok(results);
        }

        // get: api/stocks/1 -> tek hisse detayını döndürür.
        [HttpGet("{id}")]
        public async Task<IActionResult> GetStock(int id)
        {
            var stock = await _context.Stocks.FindAsync(id);
            if (stock == null) return NotFound("Hisse bulunamadı.");
            return Ok(stock);
        }

        // post: api/stocks -> yeni hisse kaydı oluşturur.
        [HttpPost]
        public async Task<IActionResult> AddStock(Stock stock)
        {
            // aynı sembol zaten kayıtlıysa tekrar eklenmez.
            var existing = await _context.Stocks
                .FirstOrDefaultAsync(s => s.Symbol == stock.Symbol.ToUpper());
            if (existing != null)
                return Conflict($"{stock.Symbol} sembolü zaten kayıtlı.");

            stock.Symbol = stock.Symbol.ToUpper().Trim();
            _context.Stocks.Add(stock);
            await _context.SaveChangesAsync();
            return Ok(stock);
        }
    }
}