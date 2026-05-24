using Eskiz1.API.Data;
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

            // uygulama başlatıldığında ilk veri senkronizasyonu yapılır.
            await SyncAll();

            while (!stoppingToken.IsCancellationRequested)
            {
                var simdi = DateTime.Now;
                var geceYarisi = DateTime.Today.AddDays(1);
                var beklemeZamani = geceYarisi - simdi;

                _logger.LogInformation("[OtomatikSync] Sonraki senkronizasyon: {zaman}", geceYarisi.ToString("dd.MM.yyyy HH:mm"));
                await Task.Delay(beklemeZamani, stoppingToken);

                if (!stoppingToken.IsCancellationRequested)
                {
                    await SyncAll();
                }
            }
        }

        private async Task SyncAll()
        {
            using var scope = _serviceProvider.CreateScope();

            var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var yahooService = scope.ServiceProvider.GetRequiredService<YahooFinanceService>();
            var externalDataService = scope.ServiceProvider.GetRequiredService<ExternalDataService>();

            // kayıtlı hisseler için tarihsel fiyat verileri güncellenir.
            var stocks = await context.Stocks.ToListAsync();

            _logger.LogInformation("[OtomatikSync] {sayi} hisse senkronize ediliyor.", stocks.Count);

            int toplamYeni = 0;
            int toplamGuncellenen = 0;

            foreach (var stock in stocks)
            {
                try
                {
                    var sonuc = await yahooService.FetchAndSaveHistoricalDataAsync(stock.Symbol, stock.StockID);

                    if (sonuc.StartsWith("OK_"))
                    {
                        var parts = sonuc.Split('_', StringSplitOptions.RemoveEmptyEntries);

                        int yeni = 0;
                        int guncellenen = 0;

                        if (parts.Length > 1)
                        {
                            int.TryParse(parts[1], out yeni);
                        }

                        if (parts.Length > 2)
                        {
                            int.TryParse(parts[2], out guncellenen);
                        }

                        toplamYeni += yeni;
                        toplamGuncellenen += guncellenen;

                        _logger.LogInformation(
                            "[OtomatikSync] {sembol}: {yeni} yeni kayıt, {guncellenen} güncellenen kayıt.",
                            stock.Symbol,
                            yeni,
                            guncellenen
                        );
                    }
                    else
                    {
                        _logger.LogWarning("[OtomatikSync] {sembol}: senkronizasyon tamamlanamadı. Detay: {detay}", stock.Symbol, sonuc);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError("[OtomatikSync] {sembol} için senkronizasyon hatası: {hata}", stock.Symbol, ex.Message);
                }
            }

            // dış piyasa verileri güncellenir.
            _logger.LogInformation("[OtomatikSync] Dış veriler senkronize ediliyor.");

            var externalSonuc = await externalDataService.SyncExternalDataAsync();

            _logger.LogInformation("[OtomatikSync] Dış veri sonucu: {sonuc}", externalSonuc);
            _logger.LogInformation(
                "[OtomatikSync] Tamamlandı. Hisse verileri: {toplamYeni} yeni kayıt, {toplamGuncellenen} güncellenen kayıt.",
                toplamYeni,
                toplamGuncellenen
            );
        }
    }
}
