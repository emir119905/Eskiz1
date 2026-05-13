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

        [HttpPost]
        public async Task<IActionResult> AddTransaction(Transaction transaction)
        {
            // 1. HACKER KORUMASI: Eksi veya sıfır lot girilemez!
            if (transaction.Quantity <= 0)
            {
                return BadRequest("Miktar 0'dan büyük olmalı brom, eksi lotla kimi sikiyosun?");
            }

            var user = await _context.Users.FindAsync(transaction.UserID);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            var latestPriceData = await _context.HistoricalData
                .Where(h => h.StockID == transaction.StockID)
                .OrderByDescending(h => h.Date)
                .FirstOrDefaultAsync();

            if (latestPriceData == null)
                return BadRequest("Bu hisse için fiyat verisi bulunamadı. Önce Yahoo Finance üzerinden verileri eşitlemelisiniz (Sync).");

            transaction.PriceAtTransaction = latestPriceData.ClosePrice;
            decimal totalAmount = transaction.Quantity * transaction.PriceAtTransaction;

            if (transaction.TransactionType.ToUpper() == "BUY")
            {
                if (user.Balance < totalAmount)
                    return BadRequest($"Paran yok lan fakir köpek! İşlem Tutarı: {totalAmount} TL, Cüzdan: {user.Balance} TL.");
                
                user.Balance -= totalAmount;
            }
            else if (transaction.TransactionType.ToUpper() == "SELL")
            {
                // 2. AÇIĞA SATIŞ KORUMASI: Adamın elinde satmak istediği kadar lot var mı hesapla
                var pastTransactions = await _context.Transactions
                    .Where(t => t.UserID == transaction.UserID && t.StockID == transaction.StockID)
                    .ToListAsync();

                var totalBought = pastTransactions.Where(t => t.TransactionType.ToUpper() == "BUY").Sum(t => t.Quantity);
                var totalSold = pastTransactions.Where(t => t.TransactionType.ToUpper() == "SELL").Sum(t => t.Quantity);
                var currentStockCount = totalBought - totalSold;

                if (currentStockCount < transaction.Quantity)
                {
                    return BadRequest($"Adam mı sikiyorsun brom, açığa satış yasak! Elinde sadece {currentStockCount} lot var, sen {transaction.Quantity} lot satmaya çalışıyorsun.");
                }

                user.Balance += totalAmount;
            }
            else
            {
                return BadRequest("Geçersiz işlem tipi. Sadece 'BUY' veya 'SELL' kullanabilirsin.");
            }

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