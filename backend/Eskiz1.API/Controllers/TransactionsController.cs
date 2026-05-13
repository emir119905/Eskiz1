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

        // GET: api/transactions -> Tüm al/sat işlemlerini listeler
        [HttpGet]
        public async Task<IActionResult> GetTransactions()
        {
            var transactions = await _context.Transactions.ToListAsync();
            return Ok(transactions);
        }

        // POST: api/transactions -> Yeni bir alım veya satım işlemi ekler
        [HttpPost]
        public async Task<IActionResult> AddTransaction(Transaction transaction)
        {
            _context.Transactions.Add(transaction);
            await _context.SaveChangesAsync();
            return Ok(transaction);
        }
    }
}