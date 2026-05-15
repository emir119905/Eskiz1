using System.Collections.Generic;

namespace Eskiz1.API.Models
{
    public class AiPredictionResponse
    {
        public int StockId { get; set; }
        public List<decimal> PastData { get; set; }           // Son 90 günün gerçek fiyatları
        public List<decimal> PastPredictions { get; set; }    // Walk-forward backtest sonuçları
        public List<decimal> Predictions { get; set; }        // Gelecek 30 günlük ortalama tahmin
        public List<decimal> LowerBound { get; set; }         // %10 kötümser senaryo bandı
        public List<decimal> UpperBound { get; set; }         // %90 iyimser senaryo bandı
        public double ConfidenceScore { get; set; }           // MAPE'den hesaplanan doğruluk skoru
        public int ForecastDays { get; set; }                 // Kaç gün tahmin edildi (30)
        public string Message { get; set; }
    }
}