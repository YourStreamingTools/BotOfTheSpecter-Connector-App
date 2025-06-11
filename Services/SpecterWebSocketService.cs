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
        private bool _disposed;        public event EventHandler<bool> ConnectionStatusChanged;

        public bool IsConnected => _client?.Connected ?? false;

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
        }

        public async Task StopAsync()
        {
            _cancellationTokenSource?.Cancel();
            
            if (_client != null)
            {
                await _client.DisconnectAsync();
                _client.Dispose();
                _client = null;
            }

            _cancellationTokenSource?.Dispose();
            _cancellationTokenSource = null;
        }

        private async Task ConnectLoop(CancellationToken cancellationToken)
        {
            const string websocketUri = "wss://websocket.botofthespecter.com";

            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {                    _logger.LogInformation("Connecting to Specter WebSocket server...");
                    
                    _client = new SocketIOClient.SocketIO(websocketUri);
                      _client.OnConnected += (sender, e) =>
                    {
                        _logger.LogInformation("Connected to Specter WebSocket server.");
                        ConnectionStatusChanged?.Invoke(this, true);
                    };

                    _client.OnDisconnected += (sender, e) =>
                    {
                        _logger.LogInformation("Disconnected from Specter WebSocket server.");
                        ConnectionStatusChanged?.Invoke(this, false);
                    };

                    _client.On("error", response =>
                    {
                        _logger.LogError("Specter WebSocket error: {Error}", response);
                        ConnectionStatusChanged?.Invoke(this, false);
                    });

                    await _client.ConnectAsync();

                    // Keep connection alive
                    while (_client.Connected && !cancellationToken.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
                    }

                    ConnectionStatusChanged?.Invoke(this, false);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Specter WebSocket connection error");
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
