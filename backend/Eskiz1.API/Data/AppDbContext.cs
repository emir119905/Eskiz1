using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Models;

namespace Eskiz1.API.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Stock> Stocks { get; set; }
        public DbSet<HistoricalData> HistoricalData { get; set; }
        public DbSet<Transaction> Transactions { get; set; }
    }
}