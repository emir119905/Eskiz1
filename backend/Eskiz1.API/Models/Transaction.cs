using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation; // Güvenlik görevlisini susturan kütüphane

namespace Eskiz1.API.Models
{
    public class Transaction
    {
        public int TransactionID { get; set; }
        public int UserID { get; set; }
        public int StockID { get; set; }
        public string TransactionType { get; set; } 
        public int Quantity { get; set; }
        public decimal PriceAtTransaction { get; set; }
        public DateTime TransactionDate { get; set; } = DateTime.Now;

        [JsonIgnore]
        [ValidateNever] // <-- İŞTE SİHİRLİ DOKUNUŞ BU
        public User? User { get; set; }
        
        [JsonIgnore]
        [ValidateNever] // <-- BUNA DA EKLİYORUZ
        public Stock? Stock { get; set; }
    }
}