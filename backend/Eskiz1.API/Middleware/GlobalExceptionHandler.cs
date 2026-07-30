using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Eskiz1.API.Middleware
{
    // tüm controller'larda yakalanmayan istisnaları tek tip ProblemDetails şemasına çevirir.
    public class GlobalExceptionHandler : IExceptionHandler
    {
        private readonly ILogger<GlobalExceptionHandler> _logger;
        private readonly IHostEnvironment _environment;

        public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger, IHostEnvironment environment)
        {
            _logger = logger;
            _environment = environment;
        }

        public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
        {
            _logger.LogError(exception, "İşlenmeyen istisna: {Path}", httpContext.Request.Path);

            var problemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "Beklenmeyen bir hata oluştu.",
                Detail = _environment.IsDevelopment() ? exception.Message : "Sunucu tarafında bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
                Instance = httpContext.Request.Path,
            };

            httpContext.Response.StatusCode = problemDetails.Status.Value;
            await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);

            return true;
        }
    }
}
