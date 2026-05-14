using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;

namespace Eskiz1.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class PredictionController : ControllerBase
    {
        private readonly HttpClient _httpClient;

        // Program.cs'te eklediğimiz HttpClient buraya otomatik gelecek (Dependency Injection)
        public PredictionController(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        [HttpGet("{stockId}")]
        public async Task<IActionResult> GetPredictionFromAI(int stockId)
        {
            // Python LSTM Motorunun Adresi (Dün çalışan port 8000'di)
            string pythonApiUrl = $"http://127.0.0.1:8000/predict/{stockId}";

            try
            {
                var response = await _httpClient.GetAsync(pythonApiUrl);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    return StatusCode((int)response.StatusCode, new { message = "Python motoru patladı brom!", detail = errorContent });
                }

                var jsonResult = await response.Content.ReadAsStringAsync();
                
                // Gelen metni az önce yazdığımız Tepsiye (C# Objesine) dönüştürüyoruz
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var predictionData = JsonSerializer.Deserialize<AiPredictionResponse>(jsonResult, options);
                
                // Ön yüze jilet gibi paketleyip sunuyoruz
                return Ok(predictionData);
            }
            catch (HttpRequestException ex)
            {
                // Eğer Python sunucusu kapalıysa C# patlamasın, bize efendi gibi haber versin
                return StatusCode(500, new { message = "Python sunucusuna ulaşılamıyor! Uvicorn açık mı kanka?", error = ex.Message });
            }
        }
    }
}
public class AiPredictionResponse
{
    public int StockId { get; set; }
    public List<decimal> Predictions { get; set; } // Python'dan gelen o 30 veri buraya akacak
    public string Message { get; set; }
}