import sys
from PyQt6.QtWidgets import QApplication
from PyQt6.QtGui import QGuiApplication
from PyQt6.QtCore import Qt
from constants import setup_logging, setup_obs_events_logging
from ui import MainWindow

def main():
    # Setup logging
    setup_logging()
    # Setup OBS events logger
    setup_obs_events_logging()
    # Create and run the application
    # Set high DPI scale rounding policy BEFORE creating the application instance
    QGuiApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())

if __name__ == '__main__':
    main()