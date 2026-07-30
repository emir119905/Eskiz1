using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models;

namespace Eskiz1.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
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
            if (transaction.Quantity <= 0)
                return BadRequest("Miktar 0'dan büyük olmalıdır.");

            var user = await _context.Users.FindAsync(transaction.UserID);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            var latestPriceData = await _context.HistoricalData
                .Where(h => h.StockID == transaction.StockID)
                .OrderByDescending(h => h.Date)
                .FirstOrDefaultAsync();

            if (latestPriceData == null)
                return BadRequest("Bu hisse için fiyat verisi bulunamadı. Önce Yahoo Finance üzerinden verileri senkronize edin.");

            transaction.PriceAtTransaction = latestPriceData.ClosePrice;
            decimal totalAmount = transaction.Quantity * transaction.PriceAtTransaction;

            // işlem tipi enum değeri üzerinden kontrol edilir.
            if (transaction.TransactionType == TransactionType.BUY)
            {
                if (user.Balance < totalAmount)
                    return BadRequest($"Yetersiz bakiye. İşlem tutarı: {totalAmount:C}, Mevcut bakiye: {user.Balance:C}");

                user.Balance -= totalAmount;
            }
            else if (transaction.TransactionType == TransactionType.SELL)
            {
                var pastTransactions = await _context.Transactions
                    .Where(t => t.UserID == transaction.UserID && t.StockID == transaction.StockID)
                    .ToListAsync();

                var totalBought = pastTransactions
                    .Where(t => t.TransactionType == TransactionType.BUY)
                    .Sum(t => t.Quantity);

                var totalSold = pastTransactions
                    .Where(t => t.TransactionType == TransactionType.SELL)
                    .Sum(t => t.Quantity);

                var currentStockCount = totalBought - totalSold;

                if (currentStockCount < transaction.Quantity)
                    return BadRequest($"Satış miktarı mevcut lot miktarını aşamaz. Mevcut lot: {currentStockCount}, istenen satış miktarı: {transaction.Quantity}");

                user.Balance += totalAmount;
            }
            else
            {
                return BadRequest("Geçersiz işlem tipi. Sadece 'BUY' veya 'SELL' kullanılabilir.");
            }

            _context.Transactions.Add(transaction);
            await _context.SaveChangesAsync();

            return Ok(new
            {
                Mesaj = "İşlem son kapanış fiyatı üzerinden başarıyla gerçekleşti.",
                GerceklesenFiyat = transaction.PriceAtTransaction,
                ToplamTutar = totalAmount,
                YeniBakiye = user.Balance
            });
        }
    }
}