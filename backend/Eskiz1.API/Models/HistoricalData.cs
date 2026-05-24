using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Eskiz1.API.Models
{
    public class HistoricalData
    {
        [Key]
        public int DataID { get; set; }

        [Required]
        public int StockID { get; set; }

        [ForeignKey("StockID")]
        public Stock Stock { get; set; }

        [Required]
        public DateTime Date { get; set; }

        public decimal OpenPrice { get; set; }

        // ohlcv veri zemini için eklendi.
        // eski kayıtların migration sonrası güncellenebilmesi için nullable tutulur.
        [Column(TypeName = "decimal(18,4)")]
        public decimal? HighPrice { get; set; }

        [Column(TypeName = "decimal(18,4)")]
        public decimal? LowPrice { get; set; }

        public decimal ClosePrice { get; set; }

        public long Volume { get; set; }
    }
}
