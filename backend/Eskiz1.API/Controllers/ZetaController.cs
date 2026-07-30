using System.Text.Json;
using Eskiz1.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Eskiz1.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ZetaController : ControllerBase
{
    private const int StaleRadarAfterDays = 5;
    private const int StaleReportAfterDays = 7;

    private readonly ZetaPaths _paths;
    private readonly ZetaRunService _runService;

    public ZetaController(ZetaPaths paths, ZetaRunService runService)
    {
        _paths = paths;
        _runService = runService;
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var runSnapshot = _runService.GetSnapshot();
        var radarPath = _paths.ResolveArtifactFile("zeta_latest_radar.json");
        var backtestPath = _paths.ResolveArtifactFile("zeta_backtest_summary.json");
        var reportPath = _paths.ResolveArtifactFile("zeta_scenario_report.json");

        var latestRadarExists = FileExists(radarPath);
        var backtestSummaryExists = FileExists(backtestPath);
        var scenarioReportExists = FileExists(reportPath);

        DateTime? latestRadarDate = null;
        DateTime? generatedAt = null;
        string? selectedModel = null;
        int? totalStocks = null;
        int? featureCount = null;
        DateTime? artifactUpdatedAt = null;

        if (latestRadarExists && radarPath is not null)
        {
            var radarMeta = await ReadRadarMetadataAsync(radarPath);
            latestRadarDate = radarMeta.Date;
            totalStocks = radarMeta.TotalStocks;
            artifactUpdatedAt = MaxWriteTime(artifactUpdatedAt, radarPath);
        }

        if (scenarioReportExists && reportPath is not null)
        {
            var reportMeta = await ReadScenarioReportMetadataAsync(reportPath);
            generatedAt = reportMeta.GeneratedAt;
            selectedModel = reportMeta.SelectedModel;
            featureCount = reportMeta.FeatureCount;
            artifactUpdatedAt = MaxWriteTime(artifactUpdatedAt, reportPath);
        }

        if (backtestSummaryExists && backtestPath is not null)
        {
            artifactUpdatedAt = MaxWriteTime(artifactUpdatedAt, backtestPath);
        }

        var isStale = false;
        var message = BuildStatusMessage(
            latestRadarExists,
            backtestSummaryExists,
            scenarioReportExists,
            latestRadarDate,
            generatedAt,
            out isStale);

        if (runSnapshot.IsRunning)
        {
            message = "Zeta Radar şu anda çalışıyor.";
        }

        return Ok(new
        {
            latestRadarExists,
            backtestSummaryExists,
            scenarioReportExists,
            latestRadarDate = latestRadarDate?.ToString("yyyy-MM-dd"),
            generatedAt = generatedAt?.ToString("yyyy-MM-ddTHH:mm:ss"),
            artifactUpdatedAt = artifactUpdatedAt?.ToString("yyyy-MM-ddTHH:mm:ss"),
            isStale = runSnapshot.IsRunning || isStale,
            message,
            selectedModel,
            totalStocks,
            featureCount,
            expectedFolder = "ai_service/artifacts/v12_zeta",
            isRunning = runSnapshot.IsRunning,
            lastRunStartedAt = runSnapshot.LastRunStartedAt?.ToString("yyyy-MM-ddTHH:mm:ss"),
            lastRunCompletedAt = runSnapshot.LastRunCompletedAt?.ToString("yyyy-MM-ddTHH:mm:ss"),
            lastRunSuccess = runSnapshot.LastRunSuccess,
            lastRunMessage = runSnapshot.LastRunMessage,
            lastExitCode = runSnapshot.LastExitCode
        });
    }

    [Authorize]
    [HttpPost("run")]
    public async Task<IActionResult> RunRadar(CancellationToken cancellationToken)
    {
        if (_runService.IsRunning)
        {
            var snapshot = _runService.GetSnapshot();
            return Conflict(new
            {
                message = "Zeta Radar zaten çalışıyor.",
                startedAt = snapshot.LastRunStartedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
            });
        }

        try
        {
            var result = await _runService.RunAsync(cancellationToken);

            if (!result.Success)
            {
                return BadRequest(new
                {
                    success = false,
                    message = result.Message,
                    startedAt = result.StartedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
                    completedAt = result.CompletedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
                    durationSeconds = result.DurationSeconds,
                    exitCode = result.ExitCode,
                    outputTail = result.OutputTail
                });
            }

            return Ok(new
            {
                success = true,
                message = result.Message,
                startedAt = result.StartedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
                completedAt = result.CompletedAt.ToString("yyyy-MM-ddTHH:mm:ss"),
                durationSeconds = result.DurationSeconds,
                exitCode = result.ExitCode,
                outputTail = result.OutputTail
            });
        }
        catch (InvalidOperationException ex)
        {
            var snapshot = _runService.GetSnapshot();
            return Conflict(new
            {
                message = ex.Message,
                startedAt = snapshot.LastRunStartedAt?.ToString("yyyy-MM-ddTHH:mm:ss")
            });
        }
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
        var filePath = _paths.ResolveArtifactFile(fileName);

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

    private static bool FileExists(string? filePath)
    {
        return filePath is not null && System.IO.File.Exists(filePath);
    }

    private static DateTime? MaxWriteTime(DateTime? current, string filePath)
    {
        var writeTime = System.IO.File.GetLastWriteTimeUtc(filePath);
        return current.HasValue
            ? writeTime > current.Value ? writeTime : current
            : writeTime;
    }

    private static string BuildStatusMessage(
        bool latestRadarExists,
        bool backtestSummaryExists,
        bool scenarioReportExists,
        DateTime? latestRadarDate,
        DateTime? generatedAt,
        out bool isStale)
    {
        isStale = false;

        if (!latestRadarExists && !backtestSummaryExists && !scenarioReportExists)
        {
            return "Zeta çıktıları henüz üretilmemiş.";
        }

        if (!latestRadarExists || !backtestSummaryExists || !scenarioReportExists)
        {
            isStale = true;
            return "Bazı Zeta çıktı dosyaları eksik.";
        }

        if (latestRadarDate.HasValue &&
            (DateTime.UtcNow.Date - latestRadarDate.Value.Date).TotalDays > StaleRadarAfterDays)
        {
            isStale = true;
            return "Zeta radar çıktısı güncel değil; yeniden çalıştırılması önerilir.";
        }

        if (generatedAt.HasValue &&
            (DateTime.UtcNow - generatedAt.Value.ToUniversalTime()).TotalDays > StaleReportAfterDays)
        {
            isStale = true;
            return "Zeta model raporu eski; yeniden çalıştırılması önerilir.";
        }

        return "Zeta çıktıları mevcut ve güncel görünüyor.";
    }

    private static async Task<(DateTime? Date, int? TotalStocks)> ReadRadarMetadataAsync(string filePath)
    {
        await using var stream = System.IO.File.OpenRead(filePath);
        using var document = await JsonDocument.ParseAsync(stream);
        var root = document.RootElement;

        DateTime? date = null;
        if (root.TryGetProperty("date", out var dateElement) &&
            DateTime.TryParse(dateElement.GetString(), out var parsedDate))
        {
            date = parsedDate.Date;
        }

        int? totalStocks = null;
        if (root.TryGetProperty("totalStocks", out var totalStocksElement) &&
            totalStocksElement.TryGetInt32(out var parsedTotalStocks))
        {
            totalStocks = parsedTotalStocks;
        }

        return (date, totalStocks);
    }

    private static async Task<(DateTime? GeneratedAt, string? SelectedModel, int? FeatureCount)> ReadScenarioReportMetadataAsync(string filePath)
    {
        await using var stream = System.IO.File.OpenRead(filePath);
        using var document = await JsonDocument.ParseAsync(stream);
        var root = document.RootElement;

        DateTime? generatedAt = null;
        if (root.TryGetProperty("generatedAt", out var generatedAtElement) &&
            DateTime.TryParse(generatedAtElement.GetString(), out var parsedGeneratedAt))
        {
            generatedAt = parsedGeneratedAt;
        }

        string? selectedModel = null;
        if (root.TryGetProperty("selectedModel", out var selectedModelElement))
        {
            selectedModel = selectedModelElement.GetString();
        }

        int? featureCount = null;
        if (root.TryGetProperty("featureCount", out var featureCountElement) &&
            featureCountElement.TryGetInt32(out var parsedFeatureCount))
        {
            featureCount = parsedFeatureCount;
        }

        return (generatedAt, selectedModel, featureCount);
    }
}
