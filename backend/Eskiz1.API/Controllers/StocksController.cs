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

        // GET: api/stocks -> Tüm hisseleri listele
        [HttpGet]
        public async Task<IActionResult> GetStocks()
        {
            var stocks = await _context.Stocks.ToListAsync();
            return Ok(stocks);
        }

        // GET: api/stocks/search?q=turk -> Hisse ara (sembol veya şirket adına göre)
        // React arama çubuğu bu endpoint'i kullanacak
        [HttpGet("search")]
        public async Task<IActionResult> SearchStocks([FromQuery] string q)
        {
            if (string.IsNullOrWhiteSpace(q))
                return Ok(await _context.Stocks.ToListAsync());

            var query = q.ToUpper().Trim();

            var results = await _context.Stocks
                .Where(s =>
                    s.Symbol.Contains(query) ||
                    s.CompanyName.ToUpper().Contains(query) ||
                    s.Sector.ToUpper().Contains(query))
                .OrderBy(s => s.Symbol)
                .ToListAsync();

            return Ok(results);
        }

        // GET: api/stocks/1 -> Tek hisse detayı
        [HttpGet("{id}")]
        public async Task<IActionResult> GetStock(int id)
        {
            var stock = await _context.Stocks.FindAsync(id);
            if (stock == null) return NotFound("Hisse bulunamadı.");
            return Ok(stock);
        }

        // POST: api/stocks -> Yeni hisse ekle
        [HttpPost]
        public async Task<IActionResult> AddStock(Stock stock)
        {
            // Aynı sembol zaten varsa ekleme
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