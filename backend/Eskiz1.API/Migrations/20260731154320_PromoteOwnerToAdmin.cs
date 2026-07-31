using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Eskiz1.API.Migrations
{
    /// <inheritdoc />
    public partial class PromoteOwnerToAdmin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // rol/üyelik yönetim endpoint'leri Admin-only'e çekildi (bkz. UsersController); sahip hesap
            // (en düşük UserID) önceki migrasyonda Developer (1) yapılmıştı, artık Admin (2) olmalı ki
            // kendi rol yönetim ekranından kilitlenmesin.
            migrationBuilder.Sql(@"
                UPDATE Users
                SET Role = 2
                WHERE UserID = (SELECT MIN(UserID) FROM Users);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                UPDATE Users
                SET Role = 1
                WHERE UserID = (SELECT MIN(UserID) FROM Users) AND Role = 2;
            ");
        }
    }
}
