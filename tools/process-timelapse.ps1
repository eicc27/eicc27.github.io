$ErrorActionPreference = "Stop"

$ffmpeg = (Get-Command ffmpeg.exe).Source
$ffprobe = (Get-Command ffprobe.exe).Source
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $repoRoot "videos"
$outputDir = Join-Path $sourceDir "web"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$targets = @(
  @{
    SourceLength = 253248070
    Slug = "chongqing-sunset-15s"
  },
  @{
    SourceLength = 302622485
    Slug = "dali-sunset-15s"
  },
  @{
    SourceLength = 306467573
    Slug = "lanzhou-sunset-15s"
  }
)

$displayFilter = "fps=24,scale=trunc(iw*432/ih/2)*2:432:flags=lanczos"
$lowFilter = "fps=20,scale=trunc(iw*360/ih/2)*2:360:flags=lanczos"
$freezeFilter = "fps=24,scale=trunc(iw*900/ih/2)*2:900:flags=lanczos"

foreach ($target in $targets) {
  $inputFile = Get-ChildItem -Path $sourceDir -File -Filter *.mp4 | Where-Object { $_.Length -eq $target.SourceLength } | Select-Object -First 1
  if (-not $inputFile) {
    throw "Missing source video for $($target.Slug)"
  }
  $inputPath = $inputFile.FullName

  $probe = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 -- $inputPath
  $duration = [double]$probe
  if ($duration -le 0) {
    throw "Unable to read duration for $inputPath"
  }

  $speedFactor = [double]::Parse((15 / $duration).ToString("0.0000000000", [System.Globalization.CultureInfo]::InvariantCulture), [System.Globalization.CultureInfo]::InvariantCulture)
  $setptsFilter = "setpts=$speedFactor*PTS"

  $displayOutput = Join-Path $outputDir "$($target.Slug).mp4"
  $lowOutput = Join-Path $outputDir "$($target.Slug)-low.mp4"
  $freezeOutput = Join-Path $outputDir "$($target.Slug)-hq.mp4"
  $posterOutput = Join-Path $outputDir "$($target.Slug).jpg"

  & $ffmpeg -y -i $inputPath -an -sn -vf "$setptsFilter,$displayFilter" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -profile:v high -movflags +faststart $displayOutput
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg encode failed for $inputPath"
  }

  & $ffmpeg -y -i $inputPath -an -sn -vf "$setptsFilter,$lowFilter" -c:v libx264 -preset slow -crf 31 -pix_fmt yuv420p -profile:v main -movflags +faststart $lowOutput
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg low-tier encode failed for $inputPath"
  }

  & $ffmpeg -y -i $inputPath -an -sn -vf "$setptsFilter,$freezeFilter" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -profile:v high -movflags +faststart $freezeOutput
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg HQ encode failed for $inputPath"
  }

  & $ffmpeg -y -ss 7.5 -i $displayOutput -frames:v 1 -update 1 -q:v 4 $posterOutput
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg poster export failed for $displayOutput"
  }
}

Get-ChildItem -Path $outputDir | Select-Object Name, Length, LastWriteTime
