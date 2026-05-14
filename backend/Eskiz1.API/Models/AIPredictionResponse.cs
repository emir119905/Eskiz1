using System.Collections.Generic;
 
namespace Eskiz1.API.Models
{
    public class AiPredictionResponse
    {
        public int StockId { get; set; }
        public List<decimal> PastData { get; set; }
        public List<decimal> Predictions { get; set; }
        public string Message { get; set; }
    }
}
 
