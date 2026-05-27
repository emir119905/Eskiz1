using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace Eskiz1.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ZetaController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;

    public ZetaController(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    [HttpGet("latest-radar")]
    public async Task<IActionResult> GetLatestRadar()
    {
        return await ReadZetaJsonFile("zeta_latest_radar.json");
    }

    [HttpGet("backtest-summary")]
    public async Task<IActionResult> GetBacktestSummary()
    {
        return await ReadZetaJsonFile("zeta_backtest_summary.json");
    }

    [HttpGet("scenario-report")]
    public async Task<IActionResult> GetScenarioReport()
    {
        return await ReadZetaJsonFile("zeta_scenario_report.json");
    }

    private async Task<IActionResult> ReadZetaJsonFile(string fileName)
    {
        var filePath = ResolveZetaArtifactPath(fileName);

        if (filePath is null || !System.IO.File.Exists(filePath))
        {
            return NotFound(new
            {
                message = "Zeta çıktı dosyası bulunamadı.",
                fileName,
                expectedFolder = "ai_service/artifacts/v12_zeta"
            });
        }

        var json = await System.IO.File.ReadAllTextAsync(filePath);

        try
        {
            using var document = JsonDocument.Parse(json);
            return Ok(document.RootElement.Clone());
        }
        catch (JsonException)
        {
            return BadRequest(new
            {
                message = "Zeta çıktı dosyası geçerli JSON formatında değil.",
                fileName
            });
        }
    }

    private string? ResolveZetaArtifactPath(string fileName)
    {
        var currentDirectory = Directory.GetCurrentDirectory();

        var candidates = new[]
        {
            Path.Combine(currentDirectory, "artifacts", "v12_zeta", fileName),
            Path.Combine(currentDirectory, "..", "..", "ai_service", "artifacts", "v12_zeta", fileName),
            Path.Combine(currentDirectory, "..", "..", "..", "ai_service", "artifacts", "v12_zeta", fileName),
            Path.Combine(_environment.ContentRootPath, "..", "..", "ai_service", "artifacts", "v12_zeta", fileName),
            Path.Combine(_environment.ContentRootPath, "..", "..", "..", "ai_service", "artifacts", "v12_zeta", fileName)
        };

        return candidates
            .Select(Path.GetFullPath)
            .FirstOrDefault(System.IO.File.Exists);
    }
}