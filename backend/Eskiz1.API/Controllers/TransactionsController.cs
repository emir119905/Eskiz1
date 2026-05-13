using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models;

namespace Eskiz1.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TransactionsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public TransactionsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> GetTransactions()
        {
            var transactions = await _context.Transactions.ToListAsync();
            return Ok(transactions);
        }

        // GÜNCELLENEN KISIM: Bakiye Kontrollü Al-Sat İşlemi
        [HttpPost]
        public async Task<IActionResult> AddTransaction(Transaction transaction)
        {
            // 1. Kullanıcıyı bul
            var user = await _context.Users.FindAsync(transaction.UserID);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            // 2. İşlem tutarını hesapla (Miktar * Fiyat)
            decimal totalAmount = transaction.Quantity * transaction.PriceAtTransaction;

            // 3. Alım (BUY) işlemiyse parayı düş, Satım (SELL) işlemiyse parayı ekle
            if (transaction.TransactionType.ToUpper() == "BUY")
            {
                if (user.Balance < totalAmount)
                    return BadRequest($"Yetersiz bakiye brom! Cüzdanında {user.Balance} TL var, sen {totalAmount} TL'lik işlem deniyorsun.");
                
                user.Balance -= totalAmount;
            }
            else if (transaction.TransactionType.ToUpper() == "SELL")
            {
                // (İleride burada "Adamın elinde o kadar hisse var mı?" kontrolü de ekleriz)
                user.Balance += totalAmount;
            }
            else
            {
                return BadRequest("Geçersiz işlem tipi. Lütfen BUY veya SELL gönder.");
            }

            // 4. İşlemi kaydet ve değişiklikleri veritabanına işle
            _context.Transactions.Add(transaction);
            await _context.SaveChangesAsync();

            return Ok(new { 
                Mesaj = "İşlem başarıyla gerçekleşti!", 
                KalanBakiye = user.Balance, 
                IslemDetayi = transaction 
            });
        }
    }
}