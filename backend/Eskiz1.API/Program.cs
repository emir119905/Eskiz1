using System.Text;
using Eskiz1.API.Data;
using Eskiz1.API.Middleware;
using Eskiz1.API.Models;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddHttpClient(string.Empty, client =>
{
    client.Timeout = TimeSpan.FromMinutes(10);
});

builder.Services.AddScoped<Eskiz1.API.Services.YahooFinanceService>();
builder.Services.AddScoped<Eskiz1.API.Services.ExternalDataService>();
builder.Services.AddSingleton<Eskiz1.API.Services.ZetaPaths>();
builder.Services.AddSingleton<Eskiz1.API.Services.ZetaRunService>();
builder.Services.AddHostedService<Eskiz1.API.Services.DailyDataSyncService>();

builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<Eskiz1.API.Services.JwtTokenService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173", "http://127.0.0.1:5173" };

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
    });
});

var jwtKey = builder.Configuration["Jwt:Key"];
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey ?? string.Empty)),
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

var app = builder.Build();

app.UseExceptionHandler();

app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
