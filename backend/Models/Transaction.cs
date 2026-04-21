using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Eskiz1.API.Models
{
    public class Transaction
    {
        [Key]
        public int TransactionID { get; set; }

        // 1. Bağlantı: İşlemi Yapan Kullanıcı
        [Required]
        public int UserID { get; set; }

        [ForeignKey("UserID")]
        public User User { get; set; }

        // 2. Bağlantı: İşleme Konu Olan Hisse
        [Required]
        public int StockID { get; set; }

        [ForeignKey("StockID")]
        public Stock Stock { get; set; }

        [Required]
        [MaxLength(10)]
        public string TransactionType { get; set; }

        [Required]
        public int Quantity { get; set; }

        [Required]
        public decimal PriceAtTransaction { get; set; }

        public DateTime TransactionDate { get; set; } = DateTime.Now;
    }
}