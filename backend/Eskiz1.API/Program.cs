using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;

var builder = WebApplication.CreateBuilder(args);
// Yahoo API için HTTP İstemcisini ve kendi yazdığımız servisi sisteme kaydediyoruz
builder.Services.AddHttpClient();
builder.Services.AddScoped<Eskiz1.API.Services.YahooFinanceService>();

// 1. Garsonları (Controllers) sisteme dahil ediyoruz
builder.Services.AddControllers();

// 2. Swagger vitrinini (arayüzü) kuruyoruz
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// 3. Veritabanı motorumuzu SQL Server'a bağlıyoruz
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services.AddHttpClient();

var app = builder.Build();
// 4. Uygulama çalışırken Swagger vitrinini herkese açıyoruz
app.UseSwagger();
app.UseSwaggerUI();

// 5. Garsonların gelen istekleri karşılayacağı yolları (rotaları) açıyoruz
app.MapControllers();

app.Run();