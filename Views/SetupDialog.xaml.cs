using System;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using BotOfTheSpecterOBSConnector.Models;
using BotOfTheSpecterOBSConnector.Services;
namespace BotOfTheSpecterOBSConnector.Views
{
    public partial class SetupDialog : Window
    {
        private readonly ILogger<SetupDialog> _logger;
        private readonly AppSettings _settings;
        private readonly ApiValidationService _apiValidationService;
        private readonly OBSWebSocketService _obsService;
        private bool _apiKeyValidated = false;
        private bool _obsConnectionTested = false;
        public bool SetupCompleted { get; private set; }
        public SetupDialog(
            ILogger<SetupDialog> logger,
            AppSettings settings,
            ApiValidationService apiValidationService,
            OBSWebSocketService obsService)
        {
            InitializeComponent();
            _logger = logger;
            _settings = settings;
            _apiValidationService = apiValidationService;
            _obsService = obsService;
            LoadCurrentSettings();
        }
        private void LoadCurrentSettings()
        {
            ApiKeyTextBox.Text = _settings.ApiKey;
            ServerIpTextBox.Text = _settings.ServerIp;
            ServerPortTextBox.Text = _settings.ServerPort;
            if (!string.IsNullOrEmpty(_settings.ServerPassword))
            { ServerPasswordBox.Password = "••••••••"; }
            UpdateSaveButtonState();
        }
        private async void ValidateApiButton_Click(object sender, RoutedEventArgs e)
        {
            var apiKey = ApiKeyTextBox.Text.Trim();
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                MessageBox.Show("Please enter an API key before validating.", "Validation Error",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            ValidateApiButton.IsEnabled = false;
            ValidateApiButton.Content = "Validating...";
            try
            {
                var isValid = await _apiValidationService.ValidateApiKeyAsync(apiKey);
                if (isValid)
                {
                    _apiKeyValidated = true;
                    ValidateApiButton.Content = "✓ Valid";
                    ValidateApiButton.Background = System.Windows.Media.Brushes.Green;
                    MessageBox.Show("API Key is valid!", "Validation Success",
                        MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                {
                    _apiKeyValidated = false;
                    ValidateApiButton.Content = "✗ Invalid";
                    ValidateApiButton.Background = System.Windows.Media.Brushes.Red;
                    MessageBox.Show("Invalid API Key. Please check and try again.", "Validation Error",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validating API key");
                _apiKeyValidated = false;
                ValidateApiButton.Content = "✗ Error";
                ValidateApiButton.Background = System.Windows.Media.Brushes.Red;
                MessageBox.Show("An error occurred while validating the API key.", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                ValidateApiButton.IsEnabled = true;
                UpdateSaveButtonState();
            }
        }
        private async void TestOBSButton_Click(object sender, RoutedEventArgs e)
        {
            var serverIp = ServerIpTextBox.Text.Trim();
            var serverPort = ServerPortTextBox.Text.Trim();
            var serverPassword = ServerPasswordBox.Password;
            if (string.IsNullOrWhiteSpace(serverIp) || string.IsNullOrWhiteSpace(serverPort))
            {
                MessageBox.Show("Please enter server IP and port before testing.", "Test Error",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            if (!int.TryParse(serverPort, out int port) || port < 1 || port > 65535)
            {
                MessageBox.Show("Please enter a valid port number (1-65535).", "Test Error",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            TestOBSButton.IsEnabled = false;
            TestOBSButton.Content = "Testing...";
            try
            {
                // Temporarily update OBS service settings for testing
                var originalIp = _settings.ServerIp;
                var originalPort = _settings.ServerPort;
                var originalPassword = _settings.ServerPassword;
                _settings.ServerIp = serverIp;
                _settings.ServerPort = serverPort;
                _settings.ServerPassword = serverPassword;
                // Test connection
                var connected = await TestOBSConnectionAsync();
                if (connected)
                {
                    _obsConnectionTested = true;
                    TestOBSButton.Content = "✓ Connected";
                    TestOBSButton.Background = System.Windows.Media.Brushes.Green;
                    MessageBox.Show("Successfully connected to OBS!", "Connection Success",
                        MessageBoxButton.OK, MessageBoxImage.Information);
                }
                else
                {
                    _obsConnectionTested = false;
                    TestOBSButton.Content = "✗ Failed";
                    TestOBSButton.Background = System.Windows.Media.Brushes.Red;
                    MessageBox.Show("Failed to connect to OBS. Please check your settings.", "Connection Error",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                    // Restore original settings on failure
                    _settings.ServerIp = originalIp;
                    _settings.ServerPort = originalPort;
                    _settings.ServerPassword = originalPassword;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error testing OBS connection");
                _obsConnectionTested = false;
                TestOBSButton.Content = "✗ Error";
                TestOBSButton.Background = System.Windows.Media.Brushes.Red;
                MessageBox.Show("An error occurred while testing the OBS connection.", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                TestOBSButton.IsEnabled = true;
                UpdateSaveButtonState();
            }
        }
        private async Task<bool> TestOBSConnectionAsync()
        {
            try
            {
                await _obsService.StopAsync();
                await _obsService.StartAsync();
                // Wait a moment for connection attempt
                await Task.Delay(2000);
                var connected = _obsService.IsConnected;
                await _obsService.StopAsync();
                return connected;
            }
            catch
            {
                return false;
            }
        }
        private void SaveButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                // Save all settings
                _settings.ApiKey = ApiKeyTextBox.Text.Trim();
                _settings.ServerIp = ServerIpTextBox.Text.Trim();
                _settings.ServerPort = ServerPortTextBox.Text.Trim();
                // Only update password if it's not the placeholder
                if (ServerPasswordBox.Password != "••••••••")
                { _settings.ServerPassword = ServerPasswordBox.Password; }
                _settings.SaveSettings();
                SetupCompleted = true;
                DialogResult = true;
                Close();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving settings");
                MessageBox.Show("An error occurred while saving settings.", "Error",
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        private void SkipButton_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Are you sure you want to skip setup? The application may not work properly without proper configuration.",
                "Skip Setup", MessageBoxButton.YesNo, MessageBoxImage.Warning);
            if (result == MessageBoxResult.Yes)
            {
                SetupCompleted = false;
                DialogResult = false;
                Close();
            }
        }
        private void UpdateSaveButtonState()
        {
            // Enable save button if we have minimum required settings
            var hasApiKey = !string.IsNullOrWhiteSpace(ApiKeyTextBox.Text);
            var hasOBSSettings = !string.IsNullOrWhiteSpace(ServerIpTextBox.Text) && 
                                 !string.IsNullOrWhiteSpace(ServerPortTextBox.Text);
            SaveButton.IsEnabled = hasApiKey && hasOBSSettings;
        }
    }
}
