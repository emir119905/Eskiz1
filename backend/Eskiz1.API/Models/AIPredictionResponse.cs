using System.Collections.Generic;

namespace Eskiz1.API.Models
{
    public class AiPredictionResponse
    {
        public int StockId { get; set; }
        public List<decimal> PastData { get; set; }           // son 90 günün gerçek fiyatları
        public List<decimal> PastPredictions { get; set; }    // walk-forward backtest sonuçları
        public List<decimal> Predictions { get; set; }        // gelecek 30 günlük ortalama tahmin
        public List<decimal> LowerBound { get; set; }         // %10 kötümser senaryo bandı
        public List<decimal> UpperBound { get; set; }         // %90 iyimser senaryo bandı
        public double ConfidenceScore { get; set; }           // mape üzerinden hesaplanan fiyat doğruluğu
        public double DirectionScore { get; set; }            // modelin yukarı/aşağı yön başarısı
        public int ForecastDays { get; set; }                 // tahmin edilen gün sayısı
        public string Message { get; set; }
    }
}
