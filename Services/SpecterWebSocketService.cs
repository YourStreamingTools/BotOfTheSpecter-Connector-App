using System;
using System.Threading;
using System.Threading.Tasks;
using SocketIOClient;
using Microsoft.Extensions.Logging;

namespace BotOfTheSpecterOBSConnector.Services
{    public class SpecterWebSocketService : IDisposable
    {
        private readonly ILogger<SpecterWebSocketService> _logger;
        private SocketIOClient.SocketIO _client;
        private CancellationTokenSource _cancellationTokenSource;
        private bool _disposed;
        private bool _isRegistered; // Track if we've received WELCOME message

        public event EventHandler<bool> ConnectionStatusChanged;

        public bool IsConnected => _client != null && _client.Connected && _isRegistered;

        public SpecterWebSocketService(ILogger<SpecterWebSocketService> logger)
        {
            _logger = logger;
        }

        public async Task StartAsync()
        {
            if (_cancellationTokenSource != null)
                return;

            _cancellationTokenSource = new CancellationTokenSource();
            
            try
            {
                await ConnectLoop(_cancellationTokenSource.Token);
            }
            catch (OperationCanceledException)
            {
                // Expected when stopping
            }
        }        public async Task StopAsync()
        {
            _cancellationTokenSource?.Cancel();
            
            if (_client != null)
            {
                await _client.DisconnectAsync();
                _client.Dispose();
                _client = null;
            }

            _isRegistered = false;
            _cancellationTokenSource?.Dispose();
            _cancellationTokenSource = null;
        }

        private async Task ConnectLoop(CancellationToken cancellationToken)
        {
            const string websocketUri = "wss://websocket.botofthespecter.com";

            while (!cancellationToken.IsCancellationRequested)
            {                try
                {
                    _logger.LogInformation("Connecting to Specter WebSocket server...");
                    _isRegistered = false; // Reset registration status
                    
                    _client = new SocketIOClient.SocketIO(websocketUri);
                    
                    _client.OnConnected += async (sender, e) =>
                    {
                        _logger.LogInformation("Socket connected to Specter server, registering...");
                        // Send registration message
                        await _client.EmitAsync("register", new { type = "obs-connector" });
                    };

                    _client.OnDisconnected += (sender, e) =>
                    {
                        _logger.LogInformation("Disconnected from Specter WebSocket server.");
                        _isRegistered = false;
                        ConnectionStatusChanged?.Invoke(this, false);
                    };

                    // Listen for WELCOME message after registration
                    _client.On("welcome", response =>
                    {
                        _logger.LogInformation("Received WELCOME from Specter server - fully connected!");
                        _isRegistered = true;
                        ConnectionStatusChanged?.Invoke(this, true);
                    });

                    _client.On("error", response =>
                    {
                        _logger.LogError("Specter WebSocket error: {Error}", response);
                        _isRegistered = false;
                        ConnectionStatusChanged?.Invoke(this, false);
                    });                    await _client.ConnectAsync();

                    // Keep connection alive
                    while (_client.Connected && !cancellationToken.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
                    }

                    _isRegistered = false;
                    ConnectionStatusChanged?.Invoke(this, false);
                }                catch (Exception ex)
                {
                    _logger.LogError(ex, "Specter WebSocket connection error");
                    _isRegistered = false;
                    ConnectionStatusChanged?.Invoke(this, false);
                }

                if (!cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
                }
            }
        }

        public void Dispose()
        {
            if (_disposed)
                return;

            _disposed = true;
            
            _cancellationTokenSource?.Cancel();
            _client?.Dispose();
            _cancellationTokenSource?.Dispose();
        }
    }
}
