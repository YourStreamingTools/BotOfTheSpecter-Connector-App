using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using BotOfTheSpecterOBSConnector.Models;
using BotOfTheSpecterOBSConnector.Services;
using BotOfTheSpecterOBSConnector.Views;

namespace BotOfTheSpecterOBSConnector.ViewModels
{
    public class MainViewModel : BaseViewModel, IDisposable
    {
        private readonly ILogger<MainViewModel> _logger;
        private readonly AppSettings _settings;
        private readonly SpecterWebSocketService _specterService;
        private readonly OBSWebSocketService _obsService;
        private readonly ApiValidationService _apiValidationService;
        private readonly IServiceProvider _serviceProvider;
        private string _specterConnectionStatus = "Specter WebSocket Connection: Connecting";
        private string _obsConnectionStatus = "OBS WebSocket Connection: Connecting";
        private bool _specterConnected;
        private bool _obsConnected;
        private string _logContent = string.Empty;
        private bool _disposed;
        private bool _showConfigurationWarning = true;
        public string SpecterConnectionStatus
        {
            get => _specterConnectionStatus;
            set => SetProperty(ref _specterConnectionStatus, value);
        }
        public string OBSConnectionStatus
        {
            get => _obsConnectionStatus;
            set => SetProperty(ref _obsConnectionStatus, value);
        }
        public bool SpecterConnected
        {
            get => _specterConnected;
            set => SetProperty(ref _specterConnected, value);
        }
        public bool OBSConnected
        {
            get => _obsConnected;
            set => SetProperty(ref _obsConnected, value);
        }
        public string LogContent
        {
            get => _logContent;
            set => SetProperty(ref _logContent, value);
        }
        public bool ShowConfigurationWarning
        {
            get => _showConfigurationWarning;
            set => SetProperty(ref _showConfigurationWarning, value);
        }
        public string ApiKey
        {
            get => _settings.ApiKey;
            set
            {
                if (_settings.ApiKey != value)
                {
                    _settings.ApiKey = value;
                    _settings.SaveSettings();
                    OnPropertyChanged();
                    UpdateConfigurationWarningVisibility();
                }
            }
        }
        public string ServerIp
        {
            get => _settings.ServerIp;
            set
            {
                if (_settings.ServerIp != value)
                {
                    _settings.ServerIp = value;
                    _settings.SaveSettings();
                    OnPropertyChanged();
                    UpdateConfigurationWarningVisibility();
                }
            }
        }
        public string ServerPort
        {
            get => _settings.ServerPort;
            set
            {
                if (_settings.ServerPort != value)
                {
                    _settings.ServerPort = value;
                    _settings.SaveSettings();
                    OnPropertyChanged();
                    UpdateConfigurationWarningVisibility();
                }
            }
        }
        public string ServerPassword
        {
            get => _settings.ServerPassword;
            set
            {
                if (_settings.ServerPassword != value)
                {
                    _settings.ServerPassword = value;
                    _settings.SaveSettings();
                    OnPropertyChanged();
                }
            }
        }
        public bool SceneTransitionStartedEnabled { get; set; } = true;
        public bool SceneTransitionVideoEndedEnabled { get; set; } = true;
        public bool SceneTransitionEndedEnabled { get; set; } = true;
        public ICommand ValidateApiKeyCommand { get; }
        public ICommand ReconnectOBSCommand { get; }
        public ICommand SaveEventSettingsCommand { get; }
        public ICommand RefreshLogsCommand { get; }
        public ICommand DismissConfigurationWarningCommand { get; }
        public MainViewModel(
            ILogger<MainViewModel> logger,
            AppSettings settings,
            SpecterWebSocketService specterService,
            OBSWebSocketService obsService,
            ApiValidationService apiValidationService,
            IServiceProvider serviceProvider)
        {
            _logger = logger;
            _settings = settings;
            _specterService = specterService;
            _obsService = obsService;
            _apiValidationService = apiValidationService;
            _serviceProvider = serviceProvider;
            ValidateApiKeyCommand = new RelayCommand(async () => await ValidateApiKeyAsync());
            ReconnectOBSCommand = new RelayCommand(async () => await ReconnectOBSAsync());
            SaveEventSettingsCommand = new RelayCommand(SaveEventSettings);
            RefreshLogsCommand = new RelayCommand(RefreshLogs);
            DismissConfigurationWarningCommand = new RelayCommand(DismissConfigurationWarning);
            LoadEventSettings();
            SetupEventHandlers();
            _ = InitializeApplicationAsync();
        }
        private async Task InitializeApplicationAsync()
        {
            try
            {
                // Check if we need to show configuration warning
                UpdateConfigurationWarningVisibility();
                // Only start services if we have valid configuration
                if (_settings.HasValidConfiguration())
                { await StartServicesAsync(); }
                else
                {
                    _logger.LogWarning("Application started without valid configuration. Services not started.");
                    SpecterConnectionStatus = "Specter WebSocket Connection: Configuration Required";
                    OBSConnectionStatus = "OBS WebSocket Connection: Configuration Required";
                }
            }
            catch (Exception ex)
            { _logger.LogError(ex, "Error initializing application"); }
        }
        private void LoadEventSettings()
        {
            var skipEvents = _settings.SkipEvents.Split(',');
            SceneTransitionStartedEnabled = !Array.Exists(skipEvents, e => e.Trim() == "SceneTransitionStarted");
            SceneTransitionVideoEndedEnabled = !Array.Exists(skipEvents, e => e.Trim() == "SceneTransitionVideoEnded");
            SceneTransitionEndedEnabled = !Array.Exists(skipEvents, e => e.Trim() == "SceneTransitionEnded");
        }
        private void SetupEventHandlers()
        {
            _specterService.ConnectionStatusChanged += (sender, connected) =>
            {
                Application.Current.Dispatcher.Invoke(() =>
                { SpecterConnected = connected; SpecterConnectionStatus = connected ? "Specter WebSocket Connection: Connected" : "Specter WebSocket Connection: Not Connected"; });
            };
            _obsService.ConnectionStatusChanged += (sender, connected) =>
            {
                Application.Current.Dispatcher.Invoke(() =>
                { OBSConnected = connected; OBSConnectionStatus = connected ? "OBS WebSocket Connection: Connected" : "OBS WebSocket Connection: Not Connected"; });
            };
        }
        private async Task StartServicesAsync()
        {
            try
            { await _specterService.StartAsync(); await _obsService.StartAsync(); }
            catch (Exception ex)
            { _logger.LogError(ex, "Error starting services"); }
        }
        private async Task ValidateApiKeyAsync()
        {
            try
            {
                if (string.IsNullOrWhiteSpace(ApiKey))
                {
                    MessageBox.Show("Please enter an API key.", "Validation Error", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                var isValid = await _apiValidationService.ValidateApiKeyAsync(ApiKey);
                if (isValid)
                {
                    MessageBox.Show("API Key is valid!", "Validation Success", MessageBoxButton.OK, MessageBoxImage.Information);
                    UpdateConfigurationWarningVisibility();
                }
                else
                {
                    MessageBox.Show("Invalid API Key. Please check and try again.", "Validation Error", MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validating API key");
                MessageBox.Show("An error occurred while validating the API key.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        private async Task ReconnectOBSAsync()
        {
            try
            { OBSConnectionStatus = "OBS WebSocket Connection: Connecting"; await _obsService.ReconnectAsync(); }
            catch (Exception ex)
            { _logger.LogError(ex, "Error reconnecting to OBS"); }
        }
        private void SaveEventSettings()
        {
            try
            {
                var skipEvents = new List<string>();
                if (!SceneTransitionStartedEnabled) skipEvents.Add("SceneTransitionStarted");
                if (!SceneTransitionVideoEndedEnabled) skipEvents.Add("SceneTransitionVideoEnded");
                if (!SceneTransitionEndedEnabled) skipEvents.Add("SceneTransitionEnded");
                _settings.SkipEvents = string.Join(",", skipEvents);
                _settings.SaveSettings();
                MessageBox.Show("Event settings saved successfully!", "Settings Saved", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving event settings");
                MessageBox.Show("An error occurred while saving event settings.", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        private void RefreshLogs()
        {
            try
            {
                if (File.Exists(_settings.LogPath))
                { LogContent = File.ReadAllText(_settings.LogPath); }
                else
                { LogContent = "No log file found."; }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error refreshing logs");
                LogContent = $"Error reading log file: {ex.Message}";
            }
        }
        private void UpdateConfigurationWarningVisibility()
        { ShowConfigurationWarning = _settings.NeedsSetup(); }
        private void DismissConfigurationWarning()
        { ShowConfigurationWarning = false; }
        public void Dispose()
        {
            if (_disposed)
                return;
            _disposed = true;
            _specterService?.Dispose();
            _obsService?.Dispose();
        }
    }
    public class RelayCommand : ICommand
    {
        private readonly Action _execute;
        private readonly Func<bool> _canExecute;
        public RelayCommand(Action execute, Func<bool> canExecute = null)
        { _execute = execute ?? throw new ArgumentNullException(nameof(execute)); _canExecute = canExecute; }
        public event EventHandler CanExecuteChanged
        { add => CommandManager.RequerySuggested += value; remove => CommandManager.RequerySuggested -= value; }
        public bool CanExecute(object parameter) => _canExecute != null ? _canExecute.Invoke() : true;
        public void Execute(object parameter) => _execute();
    }
}
