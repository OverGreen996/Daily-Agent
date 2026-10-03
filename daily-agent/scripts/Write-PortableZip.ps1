# Windows PowerShell 5.1 ZipFile.CreateFromDirectory writes backslash entries.
# Static hosting requires the ZIP standard forward slash, independent of runtime.
function Write-PortableZip([string]$Source,[string]$Destination) {
 Add-Type -AssemblyName System.IO.Compression
 $root=[IO.Path]::GetFullPath($Source).TrimEnd('\')
 $output=[IO.File]::Open([IO.Path]::GetFullPath($Destination),[IO.FileMode]::CreateNew)
 $archive=New-Object IO.Compression.ZipArchive($output,[IO.Compression.ZipArchiveMode]::Create,$false)
 try {
  foreach($file in Get-ChildItem -LiteralPath $root -Recurse -File){
   if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'ZIP source links are not allowed'}
   $relative=$file.FullName.Substring($root.Length+1).Replace('\','/')
   $entry=$archive.CreateEntry($relative,[IO.Compression.CompressionLevel]::Optimal)
   $inputStream=[IO.File]::OpenRead($file.FullName);$entryStream=$entry.Open()
   try{$inputStream.CopyTo($entryStream)}finally{$entryStream.Dispose();$inputStream.Dispose()}
  }
 }finally{$archive.Dispose();$output.Dispose()}
}
