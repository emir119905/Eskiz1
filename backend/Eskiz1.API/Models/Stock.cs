using System.ComponentModel.DataAnnotations;

namespace Eskiz1.API.Models
{
    public class Stock
    {
        [Key]
        public int StockID { get; set; }

        [Required]
        [MaxLength(10)]
        public string Symbol { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string CompanyName { get; set; } = string.Empty;

        public string Sector { get; set; } = string.Empty;
    }
}