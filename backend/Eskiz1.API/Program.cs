using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;
 
var builder = WebApplication.CreateBuilder(args);
 
// ✅ Adım 4: AddHttpClient() tek seferlik — duplicate temizlendi
builder.Services.AddHttpClient();
builder.Services.AddScoped<Eskiz1.API.Services.YahooFinanceService>();
 
builder.Services.AddControllers();
 
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
 
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
 
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});
 
var app = builder.Build();
 
app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();
app.MapControllers();
 
app.Run();
 
