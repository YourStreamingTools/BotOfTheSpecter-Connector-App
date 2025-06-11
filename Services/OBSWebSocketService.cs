using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using BotOfTheSpecterOBSConnector.Models;

namespace BotOfTheSpecterOBSConnector.Services
{    public class OBSWebSocketService : IDisposable
    {
        private readonly ILogger<OBSWebSocketService> _logger;
        private readonly AppSettings _settings;
        private readonly HttpClient _httpClient;
        private ClientWebSocket _webSocket;
        private CancellationTokenSource _cancellationTokenSource;
        private bool _disposed;
        private bool _isConnected;

        public event EventHandler<bool> ConnectionStatusChanged;

        public bool IsConnected => _isConnected && _webSocket?.State == WebSocketState.Open;

        public OBSWebSocketService(ILogger<OBSWebSocketService> logger, AppSettings settings, HttpClient httpClient)
        {
            _logger = logger;
            _settings = settings;
            _httpClient = httpClient;
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
            
            if (_webSocket != null)
            {
                if (_webSocket.State == WebSocketState.Open)
                {
                    await _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Stopping service", CancellationToken.None);
                }
                _webSocket.Dispose();
                _webSocket = null;
            }

            _isConnected = false;
            ConnectionStatusChanged?.Invoke(this, false);

            _cancellationTokenSource?.Dispose();
            _cancellationTokenSource = null;
        }

        public async Task ReconnectAsync()
        {
            await StopAsync();
            await StartAsync();
        }        private async Task ConnectLoop(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    _logger.LogInformation($"Connecting to OBS WebSocket server at {_settings.ServerIp}:{_settings.ServerPort}");
                    
                    _webSocket = new ClientWebSocket();
                    
                    var uri = new Uri($"ws://{_settings.ServerIp}:{_settings.ServerPort}");
                    
                    // Add authentication if password is provided
                    if (!string.IsNullOrEmpty(_settings.ServerPassword))
                    {
                        var authString = Convert.ToBase64String(Encoding.UTF8.GetBytes($":{_settings.ServerPassword}"));
                        _webSocket.Options.SetRequestHeader("Authorization", $"Basic {authString}");
                    }

                    await _webSocket.ConnectAsync(uri, cancellationToken);

                    if (_webSocket.State == WebSocketState.Open)
                    {
                        _isConnected = true;
                        _logger.LogInformation("Connected to OBS WebSocket server.");
                        ConnectionStatusChanged?.Invoke(this, true);

                        // Start listening for messages
                        var receiveTask = Task.Run(() => ReceiveLoop(cancellationToken), cancellationToken);

                        // Send initial identification/hello message if needed
                        await SendIdentificationMessage();

                        // Keep connection alive
                        while (_webSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
                        {
                            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
                        }
                    }

                    _isConnected = false;
                    ConnectionStatusChanged?.Invoke(this, false);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "OBS WebSocket connection error");
                    _isConnected = false;
                    ConnectionStatusChanged?.Invoke(this, false);
                }

                if (!cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
                }
            }
        }        private async Task SendIdentificationMessage()
        {
            try
            {
                // OBS WebSocket v5 protocol - send identification message
                var identifyMessage = new
                {
                    op = 1, // Identify
                    d = new
                    {
                        rpcVersion = 1,
                        authentication = !string.IsNullOrEmpty(_settings.ServerPassword) ? _settings.ServerPassword : null,
                        eventSubscriptions = 33 // Subscribe to all events
                    }
                };

                var json = JsonSerializer.Serialize(identifyMessage);
                var bytes = Encoding.UTF8.GetBytes(json);
                var buffer = new ArraySegment<byte>(bytes);

                await _webSocket.SendAsync(buffer, WebSocketMessageType.Text, true, CancellationToken.None);
                _logger.LogInformation("Sent identification message to OBS WebSocket");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending identification message");
            }
        }

        private async Task ReceiveLoop(CancellationToken cancellationToken)
        {
            var buffer = new byte[4096];
            var messageBuffer = new List<byte>();

            try
            {
                while (_webSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
                {
                    var result = await _webSocket.ReceiveAsync(new ArraySegment<byte>(buffer), cancellationToken);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        _logger.LogInformation("OBS WebSocket connection closed by server");
                        break;
                    }

                    messageBuffer.AddRange(buffer.Take(result.Count));

                    if (result.EndOfMessage)
                    {
                        var message = Encoding.UTF8.GetString(messageBuffer.ToArray());
                        messageBuffer.Clear();

                        await ProcessOBSMessage(message);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in OBS WebSocket receive loop");
            }
        }

        private async Task ProcessOBSMessage(string message)
        {
            try
            {
                var jsonDoc = JsonDocument.Parse(message);
                var root = jsonDoc.RootElement;

                if (root.TryGetProperty("op", out var opElement))
                {
                    var opCode = opElement.GetInt32();
                    
                    switch (opCode)
                    {
                        case 0: // Hello message
                            _logger.LogInformation("Received Hello from OBS WebSocket");
                            break;
                        case 2: // Identified
                            _logger.LogInformation("Successfully identified with OBS WebSocket");
                            break;
                        case 5: // Event
                            await HandleOBSEvent(root);
                            break;
                        case 7: // RequestResponse
                            _logger.LogDebug("Received request response from OBS");
                            break;
                        default:
                            _logger.LogDebug($"Received unknown op code: {opCode}");
                            break;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing OBS message: {message}");
            }
        }

        private async Task HandleOBSEvent(JsonElement eventMessage)
        {
            try
            {
                if (eventMessage.TryGetProperty("d", out var eventData))
                {
                    string eventType = "Unknown";
                    if (eventData.TryGetProperty("eventType", out var eventTypeElement))
                    {
                        eventType = eventTypeElement.GetString() ?? "Unknown";
                    }

                    // Check if this event should be skipped
                    var skipEvents = _settings.SkipEvents.Split(',', StringSplitOptions.RemoveEmptyEntries)
                                                       .Select(e => e.Trim())
                                                       .ToList();

                    if (skipEvents.Contains(eventType))
                    {
                        return;
                    }

                    _logger.LogInformation($"Sending OBS event to Specter: {eventType}");

                    // Create event data structure
                    var eventDataDict = new Dictionary<string, object>
                    {
                        ["name"] = eventType,
                        ["timestamp"] = DateTime.UtcNow.ToString("O"),
                        ["data"] = JsonSerializer.Deserialize<object>(eventData.GetRawText())
                    };

                    var json = JsonSerializer.Serialize(eventDataDict, new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        WriteIndented = false
                    });

                    // Send to API
                    await SendEventToSpecterApi(json);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling OBS event");
            }
        }

        private async Task SendEventToSpecterApi(string eventData)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(_settings.ApiKey))
                {
                    _logger.LogWarning("API key not set, cannot send event");
                    return;
                }

                var url = $"https://api.botofthespecter.com/SEND_OBS_EVENT?api_key={Uri.EscapeDataString(_settings.ApiKey)}";
                
                var formContent = new FormUrlEncodedContent(new[]
                {
                    new KeyValuePair<string, string>("data", eventData)
                });

                var response = await _httpClient.PostAsync(url, formContent);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation($"Event sent successfully. Status: {response.StatusCode}");
                }
                else
                {
                    _logger.LogWarning($"Failed to send event. Status: {response.StatusCode}");
                    var responseContent = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning($"Response: {responseContent}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error sending event to Specter API");
            }
        }        public void Dispose()
        {
            if (_disposed)
                return;

            _disposed = true;
            
            _cancellationTokenSource?.Cancel();
            
            if (_webSocket != null)
            {
                if (_webSocket.State == WebSocketState.Open)
                {
                    try
                    {
                        _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Disposing", CancellationToken.None).Wait(TimeSpan.FromSeconds(5));
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error closing WebSocket during dispose");
                    }
                }
                _webSocket.Dispose();
            }
            
            _cancellationTokenSource?.Dispose();
        }
    }
}
