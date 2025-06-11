using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace BotOfTheSpecterOBSConnector.Services
{
    public class ApiValidationService
    {
        private readonly ILogger<ApiValidationService> _logger;
        private readonly HttpClient _httpClient;

        public ApiValidationService(ILogger<ApiValidationService> logger, HttpClient httpClient)
        {
            _logger = logger;
            _httpClient = httpClient;
        }

        public async Task<bool> ValidateApiKeyAsync(string apiKey)
        {
            if (string.IsNullOrWhiteSpace(apiKey))
                return false;

            try
            {
                var url = $"https://api.botofthespecter.com/checkkey?api_key={Uri.EscapeDataString(apiKey)}";
                var response = await _httpClient.GetAsync(url);

                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var jsonDoc = JsonDocument.Parse(content);
                    
                    if (jsonDoc.RootElement.TryGetProperty("status", out var statusElement))
                    {
                        var status = statusElement.GetString();
                        var isValid = status == "Valid API Key";
                        
                        _logger.LogInformation($"API Key validation result: {status}");
                        return isValid;
                    }
                }

                _logger.LogWarning($"API Key validation failed. Status code: {response.StatusCode}");
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validating API key");
                return false;
            }
        }
    }
}
