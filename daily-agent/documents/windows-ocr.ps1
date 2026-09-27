# On-demand Windows OCR. One PNG request on stdin; no files or shell commands from the document.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$stream=$null
$bitmap=$null
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Globalization.Language,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Graphics.Imaging.SoftwareBitmap,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Storage.Streams.InMemoryRandomAccessStream,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Storage.Streams.DataWriter,Windows.Foundation,ContentType=WindowsRuntime]
  $awaitMethod=[System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {$_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'} | Select-Object -First 1
  function Await-OcrOperation($operation,[Type]$resultType) {
    $task=$awaitMethod.MakeGenericMethod($resultType).Invoke($null,@($operation))
    $task.GetAwaiter().GetResult()
  }
  $available=@([Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages)
  $language=$available | Where-Object {$_.LanguageTag -like 'zh-Hant*'} | Select-Object -First 1
  if(!$language){$language=$available | Where-Object {$_.LanguageTag -like 'en-*'} | Select-Object -First 1}
  if(!$language){$language=$available | Select-Object -First 1}
  if(!$language){throw 'Windows OCR language pack is unavailable. Install an OCR language in Windows language settings.'}
  $engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($language)
  if(!$engine){throw 'Windows OCR engine is unavailable.'}
  $request=[Console]::In.ReadToEnd() | ConvertFrom-Json
  $bytes=[Convert]::FromBase64String($request.image)
  if($bytes.Length -gt 20MB){throw 'OCR image exceeds the size limit.'}
  $stream=New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
  $writer=New-Object Windows.Storage.Streams.DataWriter($stream)
  try {
    $writer.WriteBytes($bytes)
    $null=Await-OcrOperation ($writer.StoreAsync()) ([uint32])
    $null=$writer.DetachStream()
  }finally{$writer.Dispose()}
  $stream.Seek(0)
  $decoder=Await-OcrOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  if($decoder.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $decoder.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension){throw 'OCR image dimensions exceed the supported limit.'}
  $bitmap=Await-OcrOperation ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8,[Windows.Graphics.Imaging.BitmapAlphaMode]::Ignore)) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $result=Await-OcrOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  @{text=(@($result.Lines | ForEach-Object {$_.Text}) -join "`n");language=$language.LanguageTag;provider='windows-ocr'} | ConvertTo-Json -Compress -Depth 4
}catch {
  @{error=$_.Exception.Message} | ConvertTo-Json -Compress
  exit 1
}finally {
  if($bitmap){$bitmap.Dispose()}
  if($stream){$stream.Dispose()}
}
