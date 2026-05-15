using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models;

namespace Eskiz1.API.Services
{
    public class YahooFinanceService
    {
        private readonly HttpClient _httpClient;
        private readonly AppDbContext _context;

        public YahooFinanceService(HttpClient httpClient, AppDbContext context)
        {
            _httpClient = httpClient;
            _context = context;
        }

        public async Task<string> FetchAndSaveHistoricalDataAsync(string symbol, int stockId)
        {
            try
            {
                // Senin ayarladığın gibi 1 yıllık veri çekiyoruz (range=1y)
                string url = $"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=10y";

                _httpClient.DefaultRequestHeaders.Clear();
                _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                    return $"HTTP Hatası: {response.StatusCode} - {response.ReasonPhrase} (Sembol: {symbol})";

                var jsonString = await response.Content.ReadAsStringAsync();
                
                using JsonDocument doc = JsonDocument.Parse(jsonString);
                var result = doc.RootElement.GetProperty("chart").GetProperty("result")[0];
                
                var timestamps = result.GetProperty("timestamp").EnumerateArray().ToList();
                var quote = result.GetProperty("indicators").GetProperty("quote")[0];
                
                var openPrices = quote.GetProperty("open").EnumerateArray().ToList();
                var closePrices = quote.GetProperty("close").EnumerateArray().ToList();
                var volumes = quote.GetProperty("volume").EnumerateArray().ToList();

                // 1. ADIM: Veritabanında bu hisseye ait DAHA ÖNCE KAYDEDİLMİŞ tarihleri getir
                var existingDates = await _context.HistoricalData
                    .Where(h => h.StockID == stockId)
                    .Select(h => h.Date.Date)
                    .ToListAsync();

                var historicalDataList = new List<HistoricalData>();
                int addedCount = 0; // Kaç yeni satır eklendiğini sayalım

                for (int i = 0; i < timestamps.Count; i++)
                {
                    if (closePrices[i].ValueKind == JsonValueKind.Null) continue;

                    var date = DateTimeOffset.FromUnixTimeSeconds(timestamps[i].GetInt64()).DateTime.Date;

                    // 2. ADIM: EĞER BU TARİH VERİTABANINDA VARSA, PAS GEÇ! (İşte sihirli filtre burası)
                    if (existingDates.Contains(date)) continue;

                    historicalDataList.Add(new HistoricalData
                    {
                        StockID = stockId,
                        Date = date,
                        OpenPrice = openPrices[i].GetDecimal(),
                        ClosePrice = closePrices[i].GetDecimal(),
                        Volume = volumes[i].GetInt64()
                    });
                    
                    addedCount++;
                }

                // Sadece YENİ veriler listeye girdiyse veritabanına yaz
                if (historicalDataList.Any())
                {
                    await _context.HistoricalData.AddRangeAsync(historicalDataList);
                    await _context.SaveChangesAsync();
                    return $"OK_{addedCount}"; // OK_250 gibi bir yanıt dönecek
                }

                return "OK_0"; // Eklenecek yeni veri yoksa
            }
            catch (Exception ex)
            {
                return $"Kod Patladı: {ex.Message}";
            }
        }
    }
}