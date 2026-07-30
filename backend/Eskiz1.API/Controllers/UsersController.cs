using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;

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

        // get: api/users -> sistemdeki tüm kullanıcıları listeler.
        [HttpGet]
        public async Task<IActionResult> GetUsers()
        {
            var users = await _context.Users
                .Select(u => new { u.UserID, u.FirstName, u.LastName, u.Email, u.Balance, u.CreatedAt })
                .ToListAsync();
            return Ok(users);
        }
    }
}