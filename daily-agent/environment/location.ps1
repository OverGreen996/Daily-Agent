[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -AssemblyName System.Device
  $locationWatcher = New-Object System.Device.Location.GeoCoordinateWatcher
  [void]$locationWatcher.TryStart($true, [TimeSpan]::FromSeconds(6))
  $position = $locationWatcher.Position.Location
  if (-not $position.IsUnknown) {
    @{ latitude=$position.Latitude; longitude=$position.Longitude; accuracy=$position.HorizontalAccuracy; source='windows_location' } | ConvertTo-Json -Compress
  }
  $locationWatcher.Stop()
  $locationWatcher.Dispose()
} catch { }
