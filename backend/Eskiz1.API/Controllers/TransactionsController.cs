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

        // GET: api/transactions -> Tüm geçmiş işlemleri listeler
        [HttpGet]
        public async Task<IActionResult> GetTransactions()
        {
            var transactions = await _context.Transactions.ToListAsync();
            return Ok(transactions);
        }

        // POST: api/transactions -> Piyasa fiyatından bakiye kontrollü işlem yapar
        [HttpPost]
        public async Task<IActionResult> AddTransaction(Transaction transaction)
        {
            // 1. Kullanıcıyı ve cüzdanını kontrol et
            var user = await _context.Users.FindAsync(transaction.UserID);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            // 2. Veritabanındaki (Yahoo'dan çekilen) EN GÜNCEL fiyatı bul
            var latestPriceData = await _context.HistoricalData
                .Where(h => h.StockID == transaction.StockID)
                .OrderByDescending(h => h.Date)
                .FirstOrDefaultAsync();

            if (latestPriceData == null)
            {
                return BadRequest("Bu hisse için fiyat verisi bulunamadı. Önce Yahoo Finance üzerinden verileri eşitlemelisiniz (Sync).");
            }

            // 3. Kullanıcının elle girdiği fiyatı, gerçek piyasa fiyatıyla eziyoruz
            transaction.PriceAtTransaction = latestPriceData.ClosePrice;

            // 4. İşlem tutarını (Miktar * Gerçek Kapanış Fiyatı) hesapla
            decimal totalAmount = transaction.Quantity * transaction.PriceAtTransaction;

            // 5. Alım-Satım tipine göre cüzdanı güncelle
            if (transaction.TransactionType.ToUpper() == "BUY")
            {
                if (user.Balance < totalAmount)
                {
                    return BadRequest($"Yetersiz bakiye! İşlem Tutarı: {totalAmount} TL, Cüzdan: {user.Balance} TL. Gerçek piyasa fiyatı: {transaction.PriceAtTransaction} TL.");
                }
                
                user.Balance -= totalAmount;
            }
            else if (transaction.TransactionType.ToUpper() == "SELL")
            {
                // Satışta parayı cüzdana ekliyoruz
                user.Balance += totalAmount;
            }
            else
            {
                return BadRequest("Geçersiz işlem tipi. Sadece 'BUY' veya 'SELL' kullanabilirsin.");
            }

            // 6. İşlemi kaydet ve cüzdan güncellemesini yansıt
            _context.Transactions.Add(transaction);
            await _context.SaveChangesAsync();

            return Ok(new { 
                Mesaj = "İşlem gerçek piyasa fiyatı üzerinden başarıyla gerçekleşti!", 
                GerceklesenFiyat = transaction.PriceAtTransaction,
                ToplamTutar = totalAmount,
                YeniBakiye = user.Balance 
            });
        }
    }
}