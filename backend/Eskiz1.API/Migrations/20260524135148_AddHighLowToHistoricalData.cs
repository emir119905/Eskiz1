using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Eskiz1.API.Migrations
{
    /// <inheritdoc />
    public partial class AddHighLowToHistoricalData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "HighPrice",
                table: "HistoricalData",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LowPrice",
                table: "HistoricalData",
                type: "decimal(18,4)",
                precision: 18,
                scale: 4,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HighPrice",
                table: "HistoricalData");

            migrationBuilder.DropColumn(
                name: "LowPrice",
                table: "HistoricalData");
        }
    }
}
