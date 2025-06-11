using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using BotOfTheSpecterOBSConnector.Models;
using BotOfTheSpecterOBSConnector.Services;
using BotOfTheSpecterOBSConnector.ViewModels;
using BotOfTheSpecterOBSConnector.Views;

namespace BotOfTheSpecterOBSConnector
{
    public partial class App : Application
    {
        private IHost _host;
        protected override async void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            try
            {
                _host = CreateHostBuilder().Build();                await _host.StartAsync();
                // Download icon if needed (for About dialog and other uses)
                var iconService = _host.Services.GetRequiredService<IconDownloadService>();
                var settings = _host.Services.GetRequiredService<AppSettings>();
                await iconService.DownloadIconIfNotExists(settings.IconPath);
                // Create and show main window
                var mainWindow = _host.Services.GetRequiredService<MainWindow>();
                mainWindow.Show();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to start application: {ex.Message}", "Startup Error", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                Shutdown();
            }
        }
        protected override async void OnExit(ExitEventArgs e)
        {
            if (_host != null)
            {
                await _host.StopAsync();
                _host.Dispose();
            }
            base.OnExit(e);
        }
        private static IHostBuilder CreateHostBuilder()
        {
            return Host.CreateDefaultBuilder()
                .ConfigureServices((context, services) =>
                {
                    // Configure logging
                    services.AddLogging(builder =>
                    {
                        var settings = new AppSettings();
                        settings.LoadSettings();
                        // Clear existing log if it's too large
                        if (File.Exists(settings.LogPath) && new FileInfo(settings.LogPath).Length > 1024 * 1024) // 1MB
                        {
                            File.Delete(settings.LogPath);
                        }
                        builder.AddFile(settings.LogPath, options =>
                        {
                            options.MinLevel = LogLevel.Information;
                            options.FileSizeLimitBytes = 1024 * 1024; // 1MB
                            options.MaxRollingFiles = 1;
                        });
                    });
                    // Register services
                    services.AddSingleton<AppSettings>(provider =>
                    {
                        var settings = new AppSettings();
                        settings.LoadSettings();
                        return settings;
                    });
                    services.AddHttpClient();
                    services.AddSingleton<IconDownloadService>();
                    services.AddSingleton<ApiValidationService>();
                    services.AddSingleton<SpecterWebSocketService>();
                    services.AddSingleton<OBSWebSocketService>();
                    services.AddSingleton<MainViewModel>();
                    services.AddSingleton<MainWindow>();
                    services.AddTransient<SetupDialog>();
                });
        }
    }

    // File logging extension
    public static class FileLoggerExtensions
    {
        public static ILoggingBuilder AddFile(this ILoggingBuilder builder, string filePath, Action<FileLoggerOptions> configure = null)
        {
            var options = new FileLoggerOptions { FilePath = filePath };
            configure?.Invoke(options);
            builder.Services.AddSingleton<ILoggerProvider>(provider =>
                new FileLoggerProvider(options));
            return builder;
        }
    }

    public class FileLoggerOptions
    {
        public string FilePath { get; set; } = "app.log";
        public LogLevel MinLevel { get; set; } = LogLevel.Information;
        public long FileSizeLimitBytes { get; set; } = 1024 * 1024; // 1MB
        public int MaxRollingFiles { get; set; } = 1;
    }

    public class FileLoggerProvider : ILoggerProvider
    {
        private readonly FileLoggerOptions _options;
        private readonly object _lock = new object();
        private FileLogger _logger;

        public FileLoggerProvider(FileLoggerOptions options)
        { _options = options; }

        public ILogger CreateLogger(string categoryName)
        {
            lock (_lock)
            {
                _logger ??= new FileLogger(_options);
                return _logger;
            }
        }

        public void Dispose()
        { _logger?.Dispose(); }
    }

    public class FileLogger : ILogger, IDisposable
    {
        private readonly FileLoggerOptions _options;
        private readonly object _lock = new object();
        private StreamWriter _writer;
        private bool _disposed;
        public FileLogger(FileLoggerOptions options)
        { _options = options; }
        public IDisposable BeginScope<TState>(TState state) => NullScope.Instance;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= _options.MinLevel;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception exception, Func<TState, Exception, string> formatter)
        {
            if (!IsEnabled(logLevel))
                return;
            lock (_lock)
            {
                try
                {
                    EnsureWriter();
                    var message = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} - {logLevel} - {formatter(state, exception)}";
                    _writer?.WriteLine(message);
                    _writer?.Flush();
                }
                catch
                {} // Ignore logging errors
            }
        }
        private void EnsureWriter()
        {
            if (_writer == null)
            {
                var directory = Path.GetDirectoryName(_options.FilePath);
                if (!string.IsNullOrEmpty(directory))
                { Directory.CreateDirectory(directory); }
                _writer = new StreamWriter(_options.FilePath, true);
            }
        }
        public void Dispose()
        {
            if (_disposed)
                return;
            _disposed = true;
            _writer?.Dispose();
        }
        private class NullScope : IDisposable
        {
            public static NullScope Instance { get; } = new NullScope();
            public void Dispose() { }
        }
    }
}
