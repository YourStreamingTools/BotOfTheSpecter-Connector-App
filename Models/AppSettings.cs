using System;
using System.IO;
using System.Configuration;
using System.Collections.Generic;

namespace BotOfTheSpecterOBSConnector.Models
{
    public class AppSettings
    {
        private const string VERSION = "1.0";
        private const string SETTINGS_DIR_NAME = "YourStreamingTools\\BotOfTheSpecter";
        
        public string SettingsDirectory { get; }
        public string IconPath { get; }
        public string SettingsPath { get; }
        public string LogPath { get; }
        
        public string ApiKey { get; set; } = string.Empty;
        public string ServerIp { get; set; } = "localhost";
        public string ServerPort { get; set; } = "4455";
        public string ServerPassword { get; set; } = string.Empty;
        public string SkipEvents { get; set; } = "SceneTransitionStarted,SceneTransitionVideoEnded,SceneTransitionEnded";

        public AppSettings()
        {
            var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            SettingsDirectory = Path.Combine(localAppData, SETTINGS_DIR_NAME);
            IconPath = Path.Combine(SettingsDirectory, "app-icon.ico");
            SettingsPath = Path.Combine(SettingsDirectory, "OBSConnectorSettings.ini");
            LogPath = Path.Combine(SettingsDirectory, "OBSConnectorLog.txt");
            
            Directory.CreateDirectory(SettingsDirectory);
        }

        public void LoadSettings()
        {
            if (!File.Exists(SettingsPath))
            {
                CreateDefaultSettings();
                return;
            }

            try
            {
                var lines = File.ReadAllLines(SettingsPath);
                var currentSection = string.Empty;
                var needsUpdate = false;
                string storedVersion = null;

                foreach (var line in lines)
                {
                    var trimmedLine = line.Trim();
                    if (trimmedLine.StartsWith("[") && trimmedLine.EndsWith("]"))
                    {
                        currentSection = trimmedLine[1..^1];
                    }
                    else if (trimmedLine.Contains("="))
                    {
                        var parts = trimmedLine.Split('=', 2);
                        if (parts.Length == 2)
                        {
                            var key = parts[0].Trim();
                            var value = parts[1].Trim();

                            switch (currentSection)
                            {
                                case "VERSION":
                                    if (key == "version")
                                    {
                                        storedVersion = value;
                                        if (value != VERSION)
                                            needsUpdate = true;
                                    }
                                    break;
                                case "API":
                                    if (key == "apiKey")
                                        ApiKey = value;
                                    break;
                                case "OBS":
                                    switch (key)
                                    {
                                        case "server_ip":
                                            ServerIp = value;
                                            break;
                                        case "server_port":
                                            ServerPort = value;
                                            break;
                                        case "server_password":
                                            ServerPassword = value;
                                            break;
                                    }
                                    break;
                                case "EVENTS":
                                    if (key == "skip_events")
                                        SkipEvents = value;
                                    break;
                            }
                        }
                    }
                }

                if (needsUpdate || storedVersion == null)
                {
                    SaveSettings();
                }
            }
            catch (Exception)
            {
                CreateDefaultSettings();
            }
        }

        public void SaveSettings()
        {
            try
            {
                var content = $@"[VERSION]
version={VERSION}

[API]
apiKey={ApiKey}

[OBS]
server_ip={ServerIp}
server_port={ServerPort}
server_password={ServerPassword}

[EVENTS]
skip_events={SkipEvents}
";
                File.WriteAllText(SettingsPath, content);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to save settings: {ex.Message}", ex);
            }
        }        private void CreateDefaultSettings()
        {
            ApiKey = string.Empty;
            ServerIp = "localhost";
            ServerPort = "4455";
            ServerPassword = string.Empty;
            SkipEvents = "SceneTransitionStarted,SceneTransitionVideoEnded,SceneTransitionEnded";
            SaveSettings();
        }

        public bool NeedsSetup()
        {
            // Check if we have the minimum required settings
            return string.IsNullOrWhiteSpace(ApiKey) || 
                   string.IsNullOrWhiteSpace(ServerIp) || 
                   string.IsNullOrWhiteSpace(ServerPort) ||
                   !File.Exists(SettingsPath);
        }

        public bool HasValidConfiguration()
        {
            return !string.IsNullOrWhiteSpace(ApiKey) &&
                   !string.IsNullOrWhiteSpace(ServerIp) &&
                   !string.IsNullOrWhiteSpace(ServerPort) &&
                   int.TryParse(ServerPort, out int port) &&
                   port > 0 && port <= 65535;
        }
    }
}
