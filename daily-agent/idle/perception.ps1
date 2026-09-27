[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class DailyWindow {
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint id);
 [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
 [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
 public static uint Idle() { LASTINPUTINFO i=new LASTINPUTINFO(); i.cbSize=(uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return unchecked((uint)Environment.TickCount-i.dwTime); }
 [StructLayout(LayoutKind.Sequential)] public struct POWER { public byte AC, Flags, Percent, Reserved; public uint Life, FullLife; }
 [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out POWER p);
 public static POWER Power() { POWER p; GetSystemPowerStatus(out p); return p; }
}
'@
while ($true) {
 $handle=[DailyWindow]::GetForegroundWindow()
 $title=New-Object System.Text.StringBuilder 512
 [void][DailyWindow]::GetWindowText($handle,$title,512)
 $processIdValue=[uint32]0
 [void][DailyWindow]::GetWindowThreadProcessId($handle,[ref]$processIdValue)
 $proc=Get-Process -Id $processIdValue -ErrorAction SilentlyContinue
 $power=[DailyWindow]::Power()
 $battery=$null
 if (($power.Flags -band 128) -eq 0 -and $power.Percent -ne 255) {
   $battery=@{ percent=[int]$power.Percent; charging=($power.AC -eq 1) }
 }
 @{process=$proc.ProcessName; title=$title.ToString(); idleMs=[DailyWindow]::Idle(); time=[DateTime]::Now.ToString('o'); network=[System.Net.NetworkInformation.NetworkInterface]::GetIsNetworkAvailable(); battery=$battery} | ConvertTo-Json -Compress
 Start-Sleep -Seconds 15
}
