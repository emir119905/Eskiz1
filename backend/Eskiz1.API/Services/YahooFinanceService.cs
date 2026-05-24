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

        private static bool TryGetDecimalAt(List<JsonElement> values, int index, out decimal value)
        {
            value = 0m;

            if (index < 0 || index >= values.Count) return false;
            if (values[index].ValueKind == JsonValueKind.Null) return false;

            try
            {
                value = values[index].GetDecimal();
                return value > 0m;
            }
            catch
            {
                return false;
            }
        }

        private static bool TryGetLongAt(List<JsonElement> values, int index, out long value)
        {
            value = 0;

            if (index < 0 || index >= values.Count) return false;
            if (values[index].ValueKind == JsonValueKind.Null) return false;

            try
            {
                value = values[index].GetInt64();
                return value >= 0;
            }
            catch
            {
                return false;
            }
        }

        private static bool DecimalChanged(decimal? current, decimal incoming)
        {
            if (!current.HasValue) return true;
            if (current.GetValueOrDefault() <= 0m) return true;

            // yahoo finance değerleri küçük ondalık farklarla dönebildiği için dört haneli tolerans kullanılır.
            return Math.Abs(current.GetValueOrDefault() - incoming) > 0.0001m;
        }

        private static long ToUnixSecondsUtc(DateTime date)
        {
            return new DateTimeOffset(DateTime.SpecifyKind(date.Date, DateTimeKind.Utc)).ToUnixTimeSeconds();
        }

        public async Task<string> FetchAndSaveHistoricalDataAsync(string symbol, int stockId)
        {
            try
            {
                // mevcut kayıtlar güncellenebilmesi için tracking açık şekilde alınır.
                // eski 10y range yaklaşımı bazı başlangıç tarihlerini dışarıda bırakabildiği için kullanılmaz.
                // period1/period2 ile mevcut en eski veritabanı tarihinden itibaren veri alınır.
                var existingRows = await _context.HistoricalData
                    .Where(h => h.StockID == stockId)
                    .AsTracking()
                    .ToListAsync();

                var periodStart = existingRows.Any()
                    ? existingRows.Min(h => h.Date.Date).AddDays(-10)
                    : DateTime.UtcNow.Date.AddYears(-10).AddDays(-10);

                var periodEnd = DateTime.UtcNow.Date.AddDays(5);

                var period1 = ToUnixSecondsUtc(periodStart);
                var period2 = ToUnixSecondsUtc(periodEnd);
                var encodedSymbol = Uri.EscapeDataString(symbol);

                string url =
                    $"https://query1.finance.yahoo.com/v8/finance/chart/{encodedSymbol}" +
                    $"?period1={period1}&period2={period2}&interval=1d&events=history&includeAdjustedClose=true";

                _httpClient.DefaultRequestHeaders.Clear();
                _httpClient.DefaultRequestHeaders.Add(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                );

                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    return $"HTTP hatası: {response.StatusCode} - {response.ReasonPhrase} (Sembol: {symbol})";
                }

                var jsonString = await response.Content.ReadAsStringAsync();

                using JsonDocument doc = JsonDocument.Parse(jsonString);
                var chart = doc.RootElement.GetProperty("chart");

                if (chart.TryGetProperty("error", out var errorElement) && errorElement.ValueKind != JsonValueKind.Null)
                {
                    return $"Yahoo Finance hata yanıtı döndürdü. (Sembol: {symbol})";
                }

                var resultArray = chart.GetProperty("result");
                if (resultArray.GetArrayLength() == 0)
                {
                    return $"Yahoo Finance sonuç verisi boş döndü. (Sembol: {symbol})";
                }

                var result = resultArray[0];

                if (!result.TryGetProperty("timestamp", out var timestampElement))
                {
                    return $"Yahoo Finance zaman bilgisi döndürmedi. (Sembol: {symbol})";
                }

                var timestamps = timestampElement.EnumerateArray().ToList();
                var quote = result.GetProperty("indicators").GetProperty("quote")[0];

                var openPrices = quote.GetProperty("open").EnumerateArray().ToList();
                var highPrices = quote.GetProperty("high").EnumerateArray().ToList();
                var lowPrices = quote.GetProperty("low").EnumerateArray().ToList();
                var closePrices = quote.GetProperty("close").EnumerateArray().ToList();
                var volumes = quote.GetProperty("volume").EnumerateArray().ToList();

                var existingByDate = existingRows
                    .GroupBy(h => h.Date.Date)
                    .ToDictionary(
                        g => g.Key,
                        g => g.OrderByDescending(x => x.DataID).First()
                    );

                var historicalDataList = new List<HistoricalData>();
                int addedCount = 0;
                int updatedCount = 0;

                for (int i = 0; i < timestamps.Count; i++)
                {
                    if (!TryGetDecimalAt(closePrices, i, out var closePrice)) continue;
                    if (!TryGetDecimalAt(openPrices, i, out var openPrice)) continue;

                    if (!TryGetDecimalAt(highPrices, i, out var highPrice))
                    {
                        highPrice = Math.Max(openPrice, closePrice);
                    }

                    if (!TryGetDecimalAt(lowPrices, i, out var lowPrice))
                    {
                        lowPrice = Math.Min(openPrice, closePrice);
                    }

                    if (lowPrice > highPrice)
                    {
                        (lowPrice, highPrice) = (highPrice, lowPrice);
                    }

                    TryGetLongAt(volumes, i, out var volume);

                    var date = DateTimeOffset
                        .FromUnixTimeSeconds(timestamps[i].GetInt64())
                        .UtcDateTime
                        .Date;

                    if (existingByDate.TryGetValue(date, out var existing))
                    {
                        bool changed = false;

                        // eski kayıtlar gerçek yahoo finance high/low değerleriyle güncellenir.
                        // null veya 0 değerler güncellenir; geçici değerler varsa ve yahoo finance farklı değer döndürüyorsa onlar da güncellenir.
                        if (DecimalChanged(existing.HighPrice, highPrice))
                        {
                            existing.HighPrice = highPrice;
                            changed = true;
                        }

                        if (DecimalChanged(existing.LowPrice, lowPrice))
                        {
                            existing.LowPrice = lowPrice;
                            changed = true;
                        }

                        // temel fiyat ve hacim alanları yalnızca hatalıysa düzeltilir.
                        if (existing.OpenPrice <= 0m)
                        {
                            existing.OpenPrice = openPrice;
                            changed = true;
                        }

                        if (existing.ClosePrice <= 0m)
                        {
                            existing.ClosePrice = closePrice;
                            changed = true;
                        }

                        if (existing.Volume <= 0 && volume > 0)
                        {
                            existing.Volume = volume;
                            changed = true;
                        }

                        if (changed)
                        {
                            updatedCount++;
                        }

                        continue;
                    }

                    historicalDataList.Add(new HistoricalData
                    {
                        StockID = stockId,
                        Date = date,
                        OpenPrice = openPrice,
                        HighPrice = highPrice,
                        LowPrice = lowPrice,
                        ClosePrice = closePrice,
                        Volume = volume
                    });

                    addedCount++;
                }

                if (historicalDataList.Any())
                {
                    await _context.HistoricalData.AddRangeAsync(historicalDataList);
                }

                if (historicalDataList.Any() || updatedCount > 0)
                {
                    await _context.SaveChangesAsync();
                }

                return $"OK_{addedCount}_{updatedCount}";
            }
            catch (Exception ex)
            {
                return $"İşlem sırasında hata oluştu: {ex.Message}";
            }
        }
    }
}
