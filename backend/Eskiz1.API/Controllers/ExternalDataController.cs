using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Eskiz1.API.Services;
using Eskiz1.API.Data;
using Microsoft.EntityFrameworkCore;

namespace Eskiz1.API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ExternalDataController : ControllerBase
    {
        private readonly ExternalDataService _service;
        private readonly AppDbContext _context;

        public ExternalDataController(ExternalDataService service, AppDbContext context)
        {
            _service = service;
            _context = context;
        }

        // post: api/externaldata/sync -> dış piyasa verilerini yahoo finance üzerinden senkronize eder.
        [Authorize]
        [HttpPost("sync")]
        public async Task<IActionResult> Sync()
        {
            var sonuc = await _service.SyncExternalDataAsync();
            if (sonuc.StartsWith("OK_"))
            {
                int sayi = int.Parse(sonuc.Split('_')[1]);
                return Ok($"Dış veri senkronizasyonu tamamlandı. {sayi} yeni kayıt eklendi.");
            }
            return BadRequest(sonuc);
        }

        // get: api/externaldata/status -> dış veri durumunu özetler.
        [HttpGet("status")]
        public async Task<IActionResult> Status()
        {
            var toplam  = await _context.ExternalData.CountAsync();
            var ilk     = await _context.ExternalData.MinAsync(e => (DateTime?)e.Date);
            var son     = await _context.ExternalData.MaxAsync(e => (DateTime?)e.Date);
            var sonKayit = await _context.ExternalData
                .OrderByDescending(e => e.Date)
                .FirstOrDefaultAsync();

            return Ok(new
            {
                ToplamKayit = toplam,
                IlkTarih    = ilk,
                SonTarih    = son,
                SonDegerler = sonKayit == null ? null : new
                {
                    Tarih    = sonKayit.Date,
                    USDTRY   = sonKayit.USDTRY,
                    BIST100  = sonKayit.BIST100,
                    Gold     = sonKayit.Gold,
                    BrentOil = sonKayit.BrentOil
                }
            });
        }
    }
}