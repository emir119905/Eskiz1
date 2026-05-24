using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Eskiz1.API.Models
{
    public class ExternalData
    {
        [Key]
        public int ID { get; set; }

        [Required]
        public DateTime Date { get; set; }

        // dolar/tl kuru
        [Column(TypeName = "decimal(18,4)")]
        public decimal USDTRY { get; set; }

        // bist100 endeksi
        [Column(TypeName = "decimal(18,2)")]
        public decimal BIST100 { get; set; }

        // altın fiyat verisi
        [Column(TypeName = "decimal(18,2)")]
        public decimal Gold { get; set; }

        // brent petrol fiyat verisi
        [Column(TypeName = "decimal(18,2)")]
        public decimal BrentOil { get; set; }
    }
}
