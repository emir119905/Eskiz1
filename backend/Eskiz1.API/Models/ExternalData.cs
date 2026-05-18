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

        // Dolar/TL kuru
        [Column(TypeName = "decimal(18,4)")]
        public decimal USDTRY { get; set; }

        // BIST100 endeksi
        [Column(TypeName = "decimal(18,2)")]
        public decimal BIST100 { get; set; }

        // Altın (ileride lazım olur)
        [Column(TypeName = "decimal(18,2)")]
        public decimal Gold { get; set; }

        // Brent petrol (TUPRS gibi hisseler için)
        [Column(TypeName = "decimal(18,2)")]
        public decimal BrentOil { get; set; }
    }
}