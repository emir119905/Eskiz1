using Microsoft.AspNetCore.Mvc;
using Eskiz1.API.Services;
using Eskiz1.API.Data;
using Microsoft.EntityFrameworkCore;

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

        [HttpPost("sync/{stockId}")]
        public async Task<IActionResult> SyncDataFromYahoo(int stockId)
        {
            var stock = await _context.Stocks.FindAsync(stockId);
            if (stock == null) return NotFound("Hisse bulunamadı!");

            // Artık true/false yerine string mesaj dönüyor
            var resultMessage = await _yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);
            
            if (resultMessage == "OK")
                return Ok($"{stock.Symbol} için son 1 aylık veriler başarıyla çekildi.");
            else
                return BadRequest($"HATA DETAYI: {resultMessage}");
        }
    }
}