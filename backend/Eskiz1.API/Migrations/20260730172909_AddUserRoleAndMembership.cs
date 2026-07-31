using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Eskiz1.API.Migrations
{
    /// <inheritdoc />
    public partial class AddUserRoleAndMembership : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MembershipTier",
                table: "Users",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Role",
                table: "Users",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // en erken kayıt olan hesap (muhtemelen proje sahibinin kendi hesabı) Developer (1) yapılır;
            // sonraki tüm hesaplar varsayılan User (0) olarak kalır.
            migrationBuilder.Sql(@"
                UPDATE Users
                SET Role = 1
                WHERE UserID = (SELECT MIN(UserID) FROM Users);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MembershipTier",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Role",
                table: "Users");
        }
    }
}
