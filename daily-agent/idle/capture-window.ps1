$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class CaptureWindow {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder s,int max);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
$handle=[CaptureWindow]::GetForegroundWindow()
$processIdValue=[uint32]0
$null=[CaptureWindow]::GetWindowThreadProcessId($handle,[ref]$processIdValue)
$proc=Get-Process -Id $processIdValue
$windowText=New-Object Text.StringBuilder(1024);$null=[CaptureWindow]::GetWindowText($handle,$windowText,1024)
if($proc.ProcessName -match 'keepass|1password|bitwarden|lastpass' -or $windowText.ToString() -match '密碼|password|付款|銀行'){throw 'Sensitive foreground window excluded'}
$null=[CaptureWindow]::SetProcessDPIAware()
$rect=New-Object CaptureWindow+RECT
if(![CaptureWindow]::GetWindowRect($handle,[ref]$rect)){throw 'No foreground window'}
$area=[Drawing.Rectangle]::Intersect([Drawing.Rectangle]::FromLTRB($rect.Left,$rect.Top,$rect.Right,$rect.Bottom),[Windows.Forms.SystemInformation]::VirtualScreen)
if($area.Width -lt 1 -or $area.Height -lt 1 -or $area.Width*$area.Height -gt 33000000){throw 'Unsupported capture size'}
$source=New-Object Drawing.Bitmap($area.Width,$area.Height)
$image=New-Object Drawing.Bitmap(640,360)
try{
 $g=[Drawing.Graphics]::FromImage($source)
 try{$g.CopyFromScreen($area.Location,[Drawing.Point]::Empty,$area.Size)}finally{$g.Dispose()}
 $g=[Drawing.Graphics]::FromImage($image)
 try{$g.Clear([Drawing.Color]::White);$scale=[Math]::Min(640/$area.Width,360/$area.Height);$g.DrawImage($source,0,0,[int]($area.Width*$scale),[int]($area.Height*$scale))}finally{$g.Dispose()}
 $stream=New-Object IO.MemoryStream
 try{$image.Save($stream,[Drawing.Imaging.ImageFormat]::Png);@{image=[Convert]::ToBase64String($stream.ToArray());process=$proc.ProcessName;width=640;height=360}|ConvertTo-Json -Compress}finally{$stream.Dispose()}
}finally{$source.Dispose();$image.Dispose()}
