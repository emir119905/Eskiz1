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
                string url = $"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=1mo";

                _httpClient.DefaultRequestHeaders.Clear();
                _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

                var response = await _httpClient.GetAsync(url);
                
                // Eğer HTTP hatası varsa (404, 403 vb.) direkt hatayı döndür
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

                var historicalDataList = new List<HistoricalData>();

                for (int i = 0; i < timestamps.Count; i++)
                {
                    if (closePrices[i].ValueKind == JsonValueKind.Null) continue;

                    var date = DateTimeOffset.FromUnixTimeSeconds(timestamps[i].GetInt64()).DateTime;

                    historicalDataList.Add(new HistoricalData
                    {
                        StockID = stockId,
                        Date = date,
                        OpenPrice = openPrices[i].GetDecimal(),
                        ClosePrice = closePrices[i].GetDecimal(),
                        Volume = volumes[i].GetInt64()
                    });
                }

                await _context.HistoricalData.AddRangeAsync(historicalDataList);
                await _context.SaveChangesAsync();

                return "OK";
            }
            catch (Exception ex)
            {
                // JSON parçalama veya C# tarafındaki asıl hatayı fırlat
                return $"Kod Patladı: {ex.Message}";
            }
        }
    }
}