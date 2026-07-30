using Eskiz1.API.Data;
using Eskiz1.API.Models;
using Eskiz1.API.Models.Auth;
using Eskiz1.API.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Eskiz1.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        // yeni kayıt olan kullanıcılara sanal portföy simülasyonu için verilen başlangıç bakiyesi.
        private const decimal StartingBalance = 100000m;

        private readonly AppDbContext _context;
        private readonly IPasswordHasher<User> _passwordHasher;
        private readonly JwtTokenService _tokenService;

        public AuthController(AppDbContext context, IPasswordHasher<User> passwordHasher, JwtTokenService tokenService)
        {
            _context = context;
            _passwordHasher = passwordHasher;
            _tokenService = tokenService;
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register(RegisterRequest request)
        {
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();

            var exists = await _context.Users.AnyAsync(u => u.Email.ToLower() == normalizedEmail);
            if (exists)
                return Conflict("Bu e-posta adresiyle zaten bir kullanıcı kayıtlı.");

            var user = new User
            {
                FirstName = request.FirstName.Trim(),
                LastName = request.LastName.Trim(),
                Email = normalizedEmail,
                Balance = StartingBalance,
            };
            user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            return Ok(BuildAuthResponse(user));
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login(LoginRequest request)
        {
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == normalizedEmail);

            if (user == null)
                return Unauthorized("E-posta veya şifre hatalı.");

            var verifyResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
            if (verifyResult == PasswordVerificationResult.Failed)
                return Unauthorized("E-posta veya şifre hatalı.");

            return Ok(BuildAuthResponse(user));
        }

        private AuthResponse BuildAuthResponse(User user)
        {
            var (token, expiresAt) = _tokenService.CreateToken(user);

            return new AuthResponse
            {
                Token = token,
                ExpiresAt = expiresAt,
                UserId = user.UserID,
                FirstName = user.FirstName,
                LastName = user.LastName,
                Email = user.Email,
                Balance = user.Balance,
            };
        }
    }
}
