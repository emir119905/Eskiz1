using System.Diagnostics;
using System.Text;

namespace Eskiz1.API.Services;

public sealed class ZetaRunSnapshot
{
    public bool IsRunning { get; init; }
    public DateTime? LastRunStartedAt { get; init; }
    public DateTime? LastRunCompletedAt { get; init; }
    public bool? LastRunSuccess { get; init; }
    public string? LastRunMessage { get; init; }
    public int? LastExitCode { get; init; }
}

public sealed class ZetaRunResult
{
    public bool Success { get; init; }
    public string Message { get; init; } = string.Empty;
    public DateTime StartedAt { get; init; }
    public DateTime CompletedAt { get; init; }
    public double DurationSeconds { get; init; }
    public int ExitCode { get; init; }
    public string OutputTail { get; init; } = string.Empty;
}

public class ZetaRunService
{
    private readonly ZetaPaths _paths;
    private readonly ILogger<ZetaRunService> _logger;
    private readonly SemaphoreSlim _runLock = new(1, 1);
    private readonly object _stateLock = new();

    private bool _isRunning;
    private DateTime? _lastRunStartedAt;
    private DateTime? _lastRunCompletedAt;
    private bool? _lastRunSuccess;
    private string? _lastRunMessage;
    private int? _lastExitCode;

    public ZetaRunService(ZetaPaths paths, ILogger<ZetaRunService> logger)
    {
        _paths = paths;
        _logger = logger;
    }

    public ZetaRunSnapshot GetSnapshot()
    {
        lock (_stateLock)
        {
            return new ZetaRunSnapshot
            {
                IsRunning = _isRunning,
                LastRunStartedAt = _lastRunStartedAt,
                LastRunCompletedAt = _lastRunCompletedAt,
                LastRunSuccess = _lastRunSuccess,
                LastRunMessage = _lastRunMessage,
                LastExitCode = _lastExitCode
            };
        }
    }

    public bool IsRunning
    {
        get
        {
            lock (_stateLock)
            {
                return _isRunning;
            }
        }
    }

    public async Task<ZetaRunResult> RunAsync(CancellationToken cancellationToken = default)
    {
        if (!await _runLock.WaitAsync(0, cancellationToken))
        {
            throw new InvalidOperationException("Zeta Radar zaten çalışıyor.");
        }

        var startedAt = DateTime.UtcNow;

        lock (_stateLock)
        {
            _isRunning = true;
            _lastRunStartedAt = startedAt;
            _lastRunMessage = "Zeta Radar script çalıştırılıyor.";
        }

        try
        {
            var aiServiceDir = _paths.ResolveAiServiceDirectory();
            var scriptPath = _paths.ResolveScriptPath();
            var outputDir = _paths.ResolveOutputDirectory();

            if (aiServiceDir is null || scriptPath is null || outputDir is null)
            {
                return FinishRun(
                    startedAt,
                    success: false,
                    exitCode: -1,
                    message: "Zeta script yolu bulunamadı. ai_service klasörünü kontrol edin.",
                    outputTail: string.Empty);
            }

            Directory.CreateDirectory(outputDir);

            var pythonExecutable = ResolvePythonExecutable(aiServiceDir);
            var arguments = $"\"{scriptPath}\" --output-dir \"{outputDir}\"";

            _logger.LogInformation(
                "Zeta Radar başlatılıyor. Python={Python}, Script={Script}, Output={Output}",
                pythonExecutable,
                scriptPath,
                outputDir);

            var processStartInfo = new ProcessStartInfo
            {
                FileName = pythonExecutable,
                Arguments = arguments,
                WorkingDirectory = aiServiceDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = Process.Start(processStartInfo)
                ?? throw new InvalidOperationException("Zeta script süreci başlatılamadı.");

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);

            await process.WaitForExitAsync(cancellationToken);

            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            var combinedOutput = BuildOutputTail(stdout, stderr);
            var completedAt = DateTime.UtcNow;
            var success = process.ExitCode == 0;

            if (success)
            {
                _logger.LogInformation("Zeta Radar tamamlandı. ExitCode={ExitCode}", process.ExitCode);
                return FinishRun(
                    startedAt,
                    success: true,
                    exitCode: process.ExitCode,
                    message: "Zeta Radar çalıştırması tamamlandı.",
                    outputTail: combinedOutput,
                    completedAt: completedAt);
            }

            _logger.LogWarning(
                "Zeta Radar hata ile bitti. ExitCode={ExitCode}, Output={Output}",
                process.ExitCode,
                combinedOutput);

            return FinishRun(
                startedAt,
                success: false,
                exitCode: process.ExitCode,
                message: "Zeta script hata ile sonlandı.",
                outputTail: combinedOutput,
                completedAt: completedAt);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Zeta Radar çalıştırması başarısız oldu.");
            return FinishRun(
                startedAt,
                success: false,
                exitCode: -1,
                message: $"Zeta Radar çalıştırılamadı: {ex.Message}",
                outputTail: ex.ToString());
        }
        finally
        {
            _runLock.Release();
        }
    }

    private ZetaRunResult FinishRun(
        DateTime startedAt,
        bool success,
        int exitCode,
        string message,
        string outputTail,
        DateTime? completedAt = null)
    {
        var finishedAt = completedAt ?? DateTime.UtcNow;

        lock (_stateLock)
        {
            _isRunning = false;
            _lastRunCompletedAt = finishedAt;
            _lastRunSuccess = success;
            _lastRunMessage = message;
            _lastExitCode = exitCode;
        }

        return new ZetaRunResult
        {
            Success = success,
            Message = message,
            StartedAt = startedAt,
            CompletedAt = finishedAt,
            DurationSeconds = Math.Round((finishedAt - startedAt).TotalSeconds, 1),
            ExitCode = exitCode,
            OutputTail = outputTail
        };
    }

    private static string ResolvePythonExecutable(string aiServiceDir)
    {
        var configured = Environment.GetEnvironmentVariable("ZETA_PYTHON_PATH");
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        var candidates = new[]
        {
            Path.Combine(aiServiceDir, "venv", "Scripts", "python.exe"),
            Path.Combine(aiServiceDir, ".venv", "Scripts", "python.exe"),
            Path.Combine(aiServiceDir, "venv", "bin", "python"),
            Path.Combine(aiServiceDir, ".venv", "bin", "python")
        };

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        if (OperatingSystem.IsWindows())
        {
            return "python";
        }

        return "python3";
    }

    private static string BuildOutputTail(string stdout, string stderr)
    {
        var builder = new StringBuilder();

        if (!string.IsNullOrWhiteSpace(stdout))
        {
            builder.AppendLine(stdout.Trim());
        }

        if (!string.IsNullOrWhiteSpace(stderr))
        {
            if (builder.Length > 0)
            {
                builder.AppendLine();
            }

            builder.AppendLine(stderr.Trim());
        }

        var combined = builder.ToString().Trim();
        if (combined.Length <= 4000)
        {
            return combined;
        }

        return combined[^4000..];
    }
}
