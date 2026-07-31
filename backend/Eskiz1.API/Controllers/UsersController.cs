using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
using Eskiz1.API.Models.Auth;

namespace Eskiz1.API.Controllers
{
    // kullanıcı oluşturma artık AuthController.Register üzerinden (şifre hash'lenerek) yapılır;
    // bu controller yalnızca oturum açmış kullanıcıların listeleme ihtiyacı için kalır.
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        // get: api/users -> sistemdeki tüm kullanıcıları listeler (rol/üyelik yönetim ekranı için).
        // sadece Admin görebilir; e-posta/bakiye gibi tüm kullanıcılara ait veriler burada döner.
        [Authorize(Roles = "Admin")]
        [HttpGet]
        public async Task<IActionResult> GetUsers()
        {
            var users = await _context.Users
                .Select(u => new { u.UserID, u.FirstName, u.LastName, u.Email, u.Balance, u.CreatedAt, u.Role, u.MembershipTier })
                .ToListAsync();
            return Ok(users);
        }

        // put: api/users/1/role -> bir kullanıcının rolünü değiştirir (Developer/Admin -> Geliştirici Araçları erişimi).
        // sadece Admin rolündeki hesaplar rol atayabilir; Admin, Developer'ın üstünde bir yetki katmanıdır.
        [Authorize(Roles = "Admin")]
        [HttpPut("{id}/role")]
        public async Task<IActionResult> UpdateRole(int id, UpdateRoleRequest request)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            user.Role = request.Role;
            await _context.SaveChangesAsync();

            return Ok(new { user.UserID, user.Email, user.Role });
        }

        // put: api/users/1/membership -> bir kullanıcının üyelik katmanını değiştirir.
        // şu an hiçbir yeri kısıtlamıyor; ileride ücretli üyelik eklenirse kullanılacak. sadece Admin değiştirebilir.
        [Authorize(Roles = "Admin")]
        [HttpPut("{id}/membership")]
        public async Task<IActionResult> UpdateMembership(int id, UpdateMembershipRequest request)
        {
            var user = await _context.Users.FindAsync(id);
            if (user == null) return NotFound("Kullanıcı bulunamadı.");

            user.MembershipTier = request.MembershipTier;
            await _context.SaveChangesAsync();

            return Ok(new { user.UserID, user.Email, user.MembershipTier });
        }
    }
}