using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace BotOfTheSpecterOBSConnector.Services
{
    public class IconDownloadService
    {
        private readonly ILogger<IconDownloadService> _logger;
        private readonly HttpClient _httpClient;

        public IconDownloadService(ILogger<IconDownloadService> logger, HttpClient httpClient)
        {
            _logger = logger;
            _httpClient = httpClient;
        }

        public async Task DownloadIconIfNotExists(string iconPath)
        {
            if (File.Exists(iconPath))
                return;

            const string iconUrl = "https://cdn.botofthespecter.com/app-builds/assets/icons/app-icon.ico";
            
            try
            {
                _logger.LogInformation("Downloading application icon...");
                var response = await _httpClient.GetAsync(iconUrl);
                
                if (response.IsSuccessStatusCode)
                {
                    var iconData = await response.Content.ReadAsByteArrayAsync();
                    await File.WriteAllBytesAsync(iconPath, iconData);
                    _logger.LogInformation("Application icon downloaded successfully.");
                }
                else
                {
                    _logger.LogWarning($"Failed to download icon. Status code: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error downloading application icon");
            }
        }
    }
}
