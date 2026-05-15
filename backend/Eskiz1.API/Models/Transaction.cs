using System;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;
using Eskiz1.API.Models;

namespace Eskiz1.API.Models
{
    public class Transaction
    {
        public int TransactionID { get; set; }
        public int UserID { get; set; }
        public int StockID { get; set; }

        // ✅ Adım 5: string → enum. "buy ", "BUY", "Buy" karışıklığı bitti.
        public TransactionType TransactionType { get; set; }

        public int Quantity { get; set; }
        public decimal PriceAtTransaction { get; set; }
        public DateTime TransactionDate { get; set; } = DateTime.Now;

        [JsonIgnore]
        [ValidateNever]
        public User? User { get; set; }

        [JsonIgnore]
        [ValidateNever]
        public Stock? Stock { get; set; }
    }
}