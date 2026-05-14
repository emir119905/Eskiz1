using Microsoft.AspNetCore.Mvc;
using System;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;    // AppDbContext buradan geliyor
using Eskiz1.API.Models;  // ✅ AiPredictionResponse artık kendi dosyasında
 
namespace Eskiz1.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PredictionController : ControllerBase
    {
        private readonly HttpClient _httpClient;
        private readonly AppDbContext _context;
        private readonly Eskiz1.API.Services.YahooFinanceService _yahooService; // ✅ Adım 3: Yahoo sync için eklendi
 
        public PredictionController(HttpClient httpClient, AppDbContext context, Eskiz1.API.Services.YahooFinanceService yahooService)
        {
            _httpClient = httpClient;
            _context = context;
            _yahooService = yahooService;
        }
 
        [HttpGet("{stockId}")]
        public async Task<IActionResult> GetPredictionFromAI(int stockId)
        {
            string pythonApiUrl = $"http://127.0.0.1:8000/predict/{stockId}";
 
            try
            {
                // 1. Veritabanındaki en son verinin tarihini bul
                var lastDataDate = await _context.HistoricalData
                    .Where(h => h.StockID == stockId)  // ✅ Düzeltildi: StockId → StockID
                    .MaxAsync(h => (DateTime?)h.Date);
 
                var today = DateTime.Today;
 
                // 2. Veri eskiyse Yahoo'dan çek ve SQL'e yaz
                if (lastDataDate == null || lastDataDate.Value.Date < today.AddDays(-1))
                {
                    var stock = await _context.Stocks.FindAsync(stockId);
                    if (stock == null)
                        return NotFound("Hisse bulunamadı.");
 
                    // ✅ Adım 3: Artık gerçekten sync yapıyor, yorum satırı değil
                    await _yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);
                    Console.WriteLine($"[SİSTEM] {stock.Symbol} için eksik veriler Yahoo Finance'den güncellendi.");
                }
 
                // 3. Python motoruna istek at
                var response = await _httpClient.GetAsync(pythonApiUrl);
 
                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    return StatusCode((int)response.StatusCode, new { message = "Python motoru hata döndürdü.", detail = errorContent });
                }
 
                var jsonResult = await response.Content.ReadAsStringAsync();
 
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var predictionData = JsonSerializer.Deserialize<AiPredictionResponse>(jsonResult, options);
 
                return Ok(predictionData);
            }
            catch (HttpRequestException ex)
            {
                return StatusCode(500, new { message = "Python sunucusuna ulaşılamıyor. Uvicorn çalışıyor mu?", error = ex.Message });
            }
        }
    }
}
 
