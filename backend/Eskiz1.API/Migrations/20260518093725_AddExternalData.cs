using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Eskiz1.API.Migrations
{
    /// <inheritdoc />
    public partial class AddExternalData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ExternalData",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Date = table.Column<DateTime>(type: "datetime2", nullable: false),
                    USDTRY = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    BIST100 = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Gold = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    BrentOil = table.Column<decimal>(type: "decimal(18,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExternalData", x => x.ID);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExternalData");
        }
    }
}
