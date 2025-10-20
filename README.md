# BotOfTheSpecter - OBS Connector

This application connects BotOfTheSpecter to OBS via WebSockets, enabling you to automate OBS actions based on events from BotOfTheSpecter.

## Features
- **Connects BotOfTheSpecter to OBS**:  Establishes a connection between BotOfTheSpecter and OBS using WebSockets for seamless automation.
- **API Key Management**:  Prompts you to enter your BotOfTheSpecter API key and stores it for future use.
- **OBS WebSocket Configuration**: Allows you to configure the OBS WebSocket server IP, port, and password and stores it for future use.
- **Connection Status Monitoring**: Displays the connection status of both the BotOfTheSpecter and OBS WebSocket connections.
- **GUI for Easy Setup**: Provides a user-friendly graphical interface for managing API keys and OBS settings.

## How it Works
1.  **API Key Entry**: Upon launching, the application prompts you to enter your BotOfTheSpecter API key. This key is validated against the BotOfTheSpecter API.
2.  **OBS WebSocket Setup**: Configure the connection details for your OBS WebSocket server, including the server IP, port, and password.
3.  **WebSocket Connections**: The application establishes connections to both the BotOfTheSpecter and OBS WebSocket servers.
4.  **Event Handling**: The application listens for events from the BotOfTheSpecter server. (Currently, received events are logged internally; future updates will expand on event-driven actions in OBS.)

## Getting Started

1.  **Download**:
    - Download the latest release from [Releases](https://github.com/YourStreamingTools/BotOfTheSpecter-OBS-Connector/releases) on GitHub.
    - Alternatively, you can download the application from the Specter Dashboard.
3.  **Configuration**:
    - Launch the application.
    - Enter your BotOfTheSpecter API key in the settings.
    - Configure your OBS WebSocket server settings.

## Future Development
- **Event-Driven OBS Actions**:  Implement actions in OBS triggered by specific events received from BotOfTheSpecter.
- **Expanded OBS Control**:  Add more controls for OBS, such as switching scenes, starting/stopping streams, and controlling sources.
- **Customizable Event Actions**: Allow users to define custom actions in OBS based on different BotOfTheSpecter events.

## Building from Source (Optional)
If you prefer to build the application from source, you can follow these steps:

1.  **Prerequisites**:
    -   Python 3.7 or higher
    -   PyQt5
    -   aiohttp
    -   python-socketio
    -   obs-websocket-py
    -   requests
2.  **Installation**:
    -   Clone the repository: `git clone https://github.com/YourStreamingTools/BotOfTheSpecter-OBS-Connector.git`
    -   Install dependencies: `pip install -r requirements.txt`
3.  **Run the Application**:
    -   Execute: `python main.py`