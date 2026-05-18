using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models;

namespace Eskiz1.API.Services
{
    public class ExternalDataService
    {
        private readonly HttpClient _httpClient;
        private readonly AppDbContext _context;
        private readonly ILogger<ExternalDataService> _logger;

        // Çekeceğimiz dış veri sembolleri
        private static readonly Dictionary<string, string> Symbols = new()
        {
            { "USDTRY",   "USDTRY=X"  },
            { "BIST100",  "XU100.IS"   },
            { "Gold",     "GC=F"       },
            { "BrentOil", "BZ=F"       }
        };

        public ExternalDataService(HttpClient httpClient, AppDbContext context, ILogger<ExternalDataService> logger)
        {
            _httpClient = httpClient;
            _context    = context;
            _logger     = logger;
        }

        public async Task<string> SyncExternalDataAsync()
        {
            try
            {
                // Her sembol için veri çek
                var seriler = new Dictionary<string, Dictionary<DateTime, decimal>>();

                foreach (var (alan, sembol) in Symbols)
                {
                    var seri = await FetchSeriesAsync(sembol);
                    if (seri != null && seri.Count > 0)
                        seriler[alan] = seri;
                    else
                        _logger.LogWarning("[ExternalData] {sembol} verisi çekilemedi.", sembol);
                }

                if (seriler.Count == 0)
                    return "HATA: Hiçbir dış veri çekilemedi.";

                // Ortak tarihleri bul
                var tumTarihler = seriler.Values
                    .SelectMany(s => s.Keys)
                    .Distinct()
                    .OrderBy(d => d)
                    .ToList();

                // Veritabanındaki mevcut tarihleri çek
                var mevcutTarihler = await _context.ExternalData
                    .Select(e => e.Date.Date)
                    .ToListAsync();

                var yeniKayitlar = new List<ExternalData>();

                foreach (var tarih in tumTarihler)
                {
                    if (mevcutTarihler.Contains(tarih.Date)) continue;

                    // O tarihe ait değerleri al, yoksa 0 koy
                    var kayit = new ExternalData
                    {
                        Date     = tarih.Date,
                        USDTRY   = seriler.ContainsKey("USDTRY")   && seriler["USDTRY"].ContainsKey(tarih)   ? seriler["USDTRY"][tarih]   : 0,
                        BIST100  = seriler.ContainsKey("BIST100")  && seriler["BIST100"].ContainsKey(tarih)  ? seriler["BIST100"][tarih]  : 0,
                        Gold     = seriler.ContainsKey("Gold")     && seriler["Gold"].ContainsKey(tarih)     ? seriler["Gold"][tarih]     : 0,
                        BrentOil = seriler.ContainsKey("BrentOil") && seriler["BrentOil"].ContainsKey(tarih) ? seriler["BrentOil"][tarih] : 0,
                    };

                    yeniKayitlar.Add(kayit);
                }

                if (yeniKayitlar.Any())
                {
                    await _context.ExternalData.AddRangeAsync(yeniKayitlar);
                    await _context.SaveChangesAsync();
                }

                _logger.LogInformation("[ExternalData] {sayi} yeni kayıt eklendi.", yeniKayitlar.Count);
                return $"OK_{yeniKayitlar.Count}";
            }
            catch (Exception ex)
            {
                return $"HATA: {ex.Message}";
            }
        }

        private async Task<Dictionary<DateTime, decimal>> FetchSeriesAsync(string sembol)
        {
            try
            {
                string url = $"https://query1.finance.yahoo.com/v8/finance/chart/{sembol}?interval=1d&range=10y";

                _httpClient.DefaultRequestHeaders.Clear();
                _httpClient.DefaultRequestHeaders.Add("User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");

                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return null;

                var json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);

                var result      = doc.RootElement.GetProperty("chart").GetProperty("result")[0];
                var timestamps  = result.GetProperty("timestamp").EnumerateArray().ToList();
                var closePrices = result.GetProperty("indicators")
                                        .GetProperty("quote")[0]
                                        .GetProperty("close")
                                        .EnumerateArray().ToList();

                var seri = new Dictionary<DateTime, decimal>();
                for (int i = 0; i < timestamps.Count; i++)
                {
                    if (closePrices[i].ValueKind == JsonValueKind.Null) continue;
                    var tarih = DateTimeOffset.FromUnixTimeSeconds(timestamps[i].GetInt64()).DateTime.Date;
                    seri[tarih] = closePrices[i].GetDecimal();
                }

                return seri;
            }
            catch
            {
                return null;
            }
        }
    }
}