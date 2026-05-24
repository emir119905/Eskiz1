using System;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc.ModelBinding.Validation;
namespace Eskiz1.API.Models
{
    public class Transaction
    {
        public int TransactionID { get; set; }
        public int UserID { get; set; }
        public int StockID { get; set; }

        // işlem tipi enum olarak tutulur; böylece yazım farklılıklarından kaynaklanan hatalar azaltılır.
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