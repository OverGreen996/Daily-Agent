param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$target=[IO.Path]::GetFullPath($Destination).TrimEnd('\')+'\'
$zip=[IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Archive))
try {
 $seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
 $total=[long]0
 foreach($entry in $zip.Entries){
  $name=$entry.FullName.Replace('\','/')
  $resolved=[IO.Path]::GetFullPath((Join-Path $Destination $name))
  if(!$resolved.StartsWith($target,[StringComparison]::OrdinalIgnoreCase) -or $name.Contains(':') -or !$seen.Add($name)){throw 'Unsafe plugin ZIP path'}
  if((($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960){throw 'ZIP symlink rejected'}
  $total+=$entry.Length;if($total -gt 100000000 -or $zip.Entries.Count -gt 6000){throw 'Plugin ZIP exceeds extraction limit'}
 }
 foreach($entry in $zip.Entries){$file=Join-Path $Destination $entry.FullName;if($entry.FullName.EndsWith('/')){$null=New-Item -ItemType Directory -Path $file -Force}else{$null=New-Item -ItemType Directory -Path (Split-Path $file -Parent) -Force;[IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$file,$false)}}
}finally{$zip.Dispose()}
