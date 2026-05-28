namespace Eskiz1.API.Services;

public class ZetaPaths
{
    private readonly IWebHostEnvironment _environment;

    public ZetaPaths(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public string? ResolveAiServiceDirectory()
    {
        var currentDirectory = Directory.GetCurrentDirectory();

        var candidates = new[]
        {
            Path.Combine(currentDirectory, "..", "..", "ai_service"),
            Path.Combine(currentDirectory, "..", "..", "..", "ai_service"),
            Path.Combine(_environment.ContentRootPath, "..", "..", "ai_service"),
            Path.Combine(_environment.ContentRootPath, "..", "..", "..", "ai_service"),
            Path.Combine(currentDirectory, "ai_service")
        };

        return candidates
            .Select(Path.GetFullPath)
            .FirstOrDefault(dir =>
                Directory.Exists(dir) &&
                File.Exists(Path.Combine(dir, "v12_zeta_scenario_screener.py")));
    }

    public string? ResolveScriptPath()
    {
        var aiServiceDir = ResolveAiServiceDirectory();
        if (aiServiceDir is null)
        {
            return null;
        }

        var scriptPath = Path.Combine(aiServiceDir, "v12_zeta_scenario_screener.py");
        return File.Exists(scriptPath) ? scriptPath : null;
    }

    public string? ResolveOutputDirectory()
    {
        var aiServiceDir = ResolveAiServiceDirectory();
        return aiServiceDir is null
            ? null
            : Path.Combine(aiServiceDir, "artifacts", "v12_zeta");
    }

    public string? ResolveArtifactFile(string fileName)
    {
        var outputDirectory = ResolveOutputDirectory();
        if (outputDirectory is not null)
        {
            var outputCandidate = Path.Combine(outputDirectory, fileName);
            if (File.Exists(outputCandidate))
            {
                return outputCandidate;
            }
        }

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
            .FirstOrDefault(File.Exists);
    }
}
