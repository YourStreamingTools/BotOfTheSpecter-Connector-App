using System;
using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using BotOfTheSpecterOBSConnector.ViewModels;

namespace BotOfTheSpecterOBSConnector
{
    public partial class MainWindow : Window
    {
        private readonly MainViewModel _viewModel;

        public MainWindow(MainViewModel viewModel)
        {
            InitializeComponent();
            _viewModel = viewModel;
            DataContext = _viewModel;
            
            // Set the password box value
            PasswordBox.Password = _viewModel.ServerPassword;
            
            Closing += (s, e) => _viewModel.Dispose();
        }

        private void PasswordBox_PasswordChanged(object sender, RoutedEventArgs e)
        {
            _viewModel.ServerPassword = PasswordBox.Password;
        }
    }

    [ValueConversion(typeof(bool), typeof(SolidColorBrush))]
    public class BoolToColorConverter : IValueConverter
    {
        public string TrueColor { get; set; } = "#FF00FF00";
        public string FalseColor { get; set; } = "#FFFF0000";

        public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (value is bool boolValue)
            {
                var colorString = boolValue ? TrueColor : FalseColor;
                return new SolidColorBrush((Color)ColorConverter.ConvertFromString(colorString));
            }
            return new SolidColorBrush(Colors.White);
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotImplementedException();
        }
    }
}
