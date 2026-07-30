using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Eskiz1.API.Models
{
    public class User
    {
        [Key]
        public int UserID { get; set; }

        [Required]
        public string FirstName { get; set; } = string.Empty;

        [Required]
        public string LastName { get; set; } = string.Empty;

        [Required]
        public string Email { get; set; } = string.Empty;

        [Required]
        public string PasswordHash { get; set; } = string.Empty;

        // bakiye alanı için decimal hassasiyeti tanımlanır.
        [Column(TypeName = "decimal(18,2)")]
        public decimal Balance { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}