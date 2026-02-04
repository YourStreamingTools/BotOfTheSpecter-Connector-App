# Overview

**BotOfTheSpecter** is a powerful integration tool that bridges BotOfTheSpecter and external services (including OBS Studio) through real-time WebSocket connections. It enables seamless automation by allowing BotOfTheSpecter to trigger actions and monitor streaming events, creating a unified control experience for content creators.

## Key Features

- 🔗 **Real-time WebSocket Integration**: Direct connection between BotOfTheSpecter and OBS Studio
- 🎬 **Scene Management**: Switch scenes automatically based on BotOfTheSpecter events
- 👁️ **Source Control**: Toggle source visibility and manage scene items remotely
- 📡 **Event Monitoring**: Track streaming, recording, scene changes, and source events in real-time
- 💾 **Persistent Configuration**: Save all settings securely for auto-connection on startup
- 🛡️ **Secure Credentials**: Password-protected API key and OBS password storage
- 📊 **Event Logging**: Comprehensive logging with user-friendly emoji indicators
- 🔄 **Auto-Reconnection**: Intelligent reconnection logic handles network interruptions gracefully

## How It Works

1. **Connect BotOfTheSpecter**: Enter your BotOfTheSpecter API key and establish the connection
2. **Configure OBS**: Provide your OBS WebSocket server details (host, port, password)
3. **Enable Automation**: BotOfTheSpecter can now send commands to control your OBS scenes and sources
4. **Monitor Events**: View real-time logs of all OBS events and BotOfTheSpecter actions

## System Requirements

- **Python**: 3.8 or higher (PyQt6 requires Python 3.8+)
- **OBS Studio**: 28.0 or higher (with WebSocket Server plugin enabled)
- **BotOfTheSpecter**: Active account with valid API key
- **Operating System**: Windows (tested). macOS/Linux may work but are not officially tested.

## Installation & Usage

See the [main README](https://raw.githubusercontent.com/YourStreamingTools/BotOfTheSpecter-OBS-Connector/refs/heads/main/README.md) for installation and usage instructions.

## Version History

[Version 1.1](1.1.md) - Real-Time Bitrate Monitoring & Control Lock Feature

[Version 1.0](1.0.md) - Initial Release
