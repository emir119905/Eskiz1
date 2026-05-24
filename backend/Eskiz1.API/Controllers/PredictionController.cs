using Microsoft.AspNetCore.Mvc;
using System;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models;

namespace Eskiz1.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PredictionController : ControllerBase
    {
        private readonly HttpClient _httpClient;
        private readonly AppDbContext _context;
        private readonly Eskiz1.API.Services.YahooFinanceService _yahooService;

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
                // veritabanındaki en son tarihsel veri tarihi bulunur.
                var lastDataDate = await _context.HistoricalData
                    .Where(h => h.StockID == stockId)
                    .MaxAsync(h => (DateTime?)h.Date);

                var today = DateTime.Today;

                // veri güncel değilse yahoo finance üzerinden senkronizasyon yapılır.
                if (lastDataDate == null || lastDataDate.Value.Date < today.AddDays(-1))
                {
                    var stock = await _context.Stocks.FindAsync(stockId);
                    if (stock == null)
                        return NotFound("Hisse bulunamadı.");

                    // eksik tarihsel veriler analizden önce güncellenir.
                    await _yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);
                    Console.WriteLine($"[Sistem] {stock.Symbol} için eksik veriler Yahoo Finance üzerinden güncellendi.");
                }

                // analiz servisine tahmin isteği gönderilir.
                var response = await _httpClient.GetAsync(pythonApiUrl);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    return StatusCode((int)response.StatusCode, new { message = "Analiz servisi hata döndürdü.", detail = errorContent });
                }

                var jsonResult = await response.Content.ReadAsStringAsync();

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var predictionData = JsonSerializer.Deserialize<AiPredictionResponse>(jsonResult, options);

                return Ok(predictionData);
            }
            catch (HttpRequestException ex)
            {
                return StatusCode(500, new { message = "Analiz servisine ulaşılamıyor. Lütfen Python API servisinin çalıştığını kontrol edin.", error = ex.Message });
            }
        }
    }
}