using Eskiz1.API.Data;
using Eskiz1.API.Services;
using Microsoft.EntityFrameworkCore;

namespace Eskiz1.API.Services
{
    public class DailyDataSyncService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<DailyDataSyncService> _logger;

        public DailyDataSyncService(IServiceProvider serviceProvider, ILogger<DailyDataSyncService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[OtomatikSync] Servis başlatıldı.");

            // Uygulama açılınca hemen sync yap
            await SyncAll();

            while (!stoppingToken.IsCancellationRequested)
            {
                var simdi         = DateTime.Now;
                var geceyarisi    = DateTime.Today.AddDays(1);
                var beklemeZamani = geceyarisi - simdi;

                _logger.LogInformation("[OtomatikSync] Sonraki sync: {zaman}", geceyarisi.ToString("dd.MM.yyyy HH:mm"));
                await Task.Delay(beklemeZamani, stoppingToken);

                if (!stoppingToken.IsCancellationRequested)
                    await SyncAll();
            }
        }

        private async Task SyncAll()
        {
            using var scope          = _serviceProvider.CreateScope();
            var context              = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var yahooService         = scope.ServiceProvider.GetRequiredService<YahooFinanceService>();
            var externalDataService  = scope.ServiceProvider.GetRequiredService<ExternalDataService>();

            // 1. Hisse verileri
            var stocks = await context.Stocks.ToListAsync();
            _logger.LogInformation("[OtomatikSync] {sayi} hisse sync ediliyor...", stocks.Count);

            int toplamYeni = 0;
            foreach (var stock in stocks)
            {
                try
                {
                    var sonuc = await yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);
                    if (sonuc.StartsWith("OK_"))
                    {
                        int yeni = int.Parse(sonuc.Split('_')[1]);
                        toplamYeni += yeni;
                        _logger.LogInformation("[OtomatikSync] {sembol}: {yeni} yeni kayıt.", stock.Symbol, yeni);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError("[OtomatikSync] {sembol} hata: {hata}", stock.Symbol, ex.Message);
                }
            }

            // 2. Dış veriler (USDTRY, BIST100, Altın, Brent)
            _logger.LogInformation("[OtomatikSync] Dış veriler sync ediliyor...");
            var externalSonuc = await externalDataService.SyncExternalDataAsync();
            _logger.LogInformation("[OtomatikSync] Dış veri: {sonuc}", externalSonuc);

            _logger.LogInformation("[OtomatikSync] Tamamlandı. Hisse: {toplam} yeni kayıt.", toplamYeni);
        }
    }
}