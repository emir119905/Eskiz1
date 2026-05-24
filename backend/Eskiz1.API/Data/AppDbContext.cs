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
        public DbSet<ExternalData> ExternalData { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // High/Low yeni eklendiği için nullable kalıyor; eski kayıtlar Yahoo sync ile backfill edilecek.
            modelBuilder.Entity<HistoricalData>()
                .Property(h => h.HighPrice)
                .HasPrecision(18, 4);

            modelBuilder.Entity<HistoricalData>()
                .Property(h => h.LowPrice)
                .HasPrecision(18, 4);
        }
    }
}
