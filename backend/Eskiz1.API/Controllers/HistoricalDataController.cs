using Microsoft.AspNetCore.Mvc;
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

        [HttpPost("sync/{stockId}")]
        public async Task<IActionResult> SyncDataFromYahoo(int stockId)
        {
            var stock = await _context.Stocks.FindAsync(stockId);
            if (stock == null) return NotFound("Hisse bulunamadı!");

            var resultMessage = await _yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);
            
            if (resultMessage.StartsWith("OK_"))
            {
                int count = int.Parse(resultMessage.Split('_')[1]);
                if (count > 0)
                    return Ok($"{stock.Symbol} için {count} adet YENİ günlük veri başarıyla veritabanına eklendi.");
                else
                    return Ok($"{stock.Symbol} için veritabanı zaten güncel. Yeni veri eklenmedi.");
            }
            else
            {
                return BadRequest($"HATA DETAYI: {resultMessage}");
            }
        }
    }
}