using Microsoft.EntityFrameworkCore;
using Eskiz1.API.Data;

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