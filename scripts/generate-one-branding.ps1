Add-Type -AssemblyName System.Drawing

function New-Color([string]$hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function Get-Font([float]$size, [bool]$extraBlack) {
  $fonts = if ($extraBlack) {
    @('Segoe UI Black', 'Arial Black', 'Segoe UI Bold', 'Arial Bold', 'Arial')
  } else {
    @('Segoe UI Bold', 'Arial Bold', 'Arial')
  }

  foreach ($name in $fonts) {
    try {
      return New-Object System.Drawing.Font($name, $size, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    } catch {}
  }

  throw 'No font'
}

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  return @{ Bitmap = $bmp; Graphics = $g }
}

function New-RoundRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function Draw-RedOne($g, [int]$w, [int]$h, [bool]$wordmark) {
  $redTop = New-Color '#FF2A2A'
  $redBottom = New-Color '#D10000'
  $goldTop = New-Color '#FFF29B'
  $goldBottom = New-Color '#FFD400'

  $cardW = [float]($w * 0.86)
  $cardH = [float]($h * 0.74)
  if ($wordmark) { $cardH = [float]($h * 0.56) }
  $cardX = [float](($w - $cardW) / 2)
  $cardY = [float](($h - $cardH) / 2)
  if ($wordmark) { $cardY = [float]($h * 0.10) }
  $radius = [float]($cardW * 0.15)

  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(42, 0, 0, 0))
  $shadowPath = New-RoundRectPath ($cardX + ($w * 0.01)) ($cardY + ($h * 0.02)) $cardW $cardH $radius
  $cardPath = New-RoundRectPath $cardX $cardY $cardW $cardH $radius
  $g.FillPath($shadowBrush, $shadowPath)

  $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.RectangleF]::new($cardX, $cardY, $cardW, $cardH), $redTop, $redBottom, 90)
  $g.FillPath($grad, $cardPath)

  $glowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(35, 255, 255, 255), [float][Math]::Max(4, $w * 0.006))
  $g.DrawPath($glowPen, $cardPath)

  $fontSize = [float][Math]::Max(100, $w * 0.29)
  if ($wordmark) { $fontSize = [float][Math]::Max(100, $w * 0.22) }
  $font = Get-Font $fontSize $true
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

  $textRect = [System.Drawing.RectangleF]::new($cardX, ($cardY + ($cardH * 0.08)), $cardW, ($cardH * 0.84))
  $shadowRect = [System.Drawing.RectangleF]::new(($cardX + ($w * 0.012)), ($cardY + ($cardH * 0.11)), $cardW, ($cardH * 0.84))
  $g.DrawString('ONE', $font, (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(95, 90, 0, 0))), $shadowRect, $sf)

  $textBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.RectangleF]::new($cardX, $cardY, $cardW, $cardH), $goldTop, $goldBottom, 90)
  $g.DrawString('ONE', $font, $textBrush, $textRect, $sf)

  if ($wordmark) {
    $titleFont = Get-Font ([float][Math]::Max(62, $w * 0.10)) $true
    $titleRect = [System.Drawing.RectangleF]::new(0, ($cardY + $cardH + ($h * 0.08)), $w, ($h * 0.16))
    $titleShadow = [System.Drawing.RectangleF]::new(($w * 0.002), ($cardY + $cardH + ($h * 0.083)), $w, ($h * 0.16))
    $g.DrawString('ONE', $titleFont, (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(50, 0, 0, 0))), $titleShadow, $sf)
    $g.DrawString('ONE', $titleFont, (New-Object System.Drawing.SolidBrush($redBottom)), $titleRect, $sf)
  }
}

function Save-Art([string]$path, [int]$w, [int]$h, [bool]$wordmark) {
  $c = New-Canvas $w $h
  try {
    $c.Graphics.Clear([System.Drawing.Color]::White)
    Draw-RedOne $c.Graphics $w $h $wordmark
    $c.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $c.Graphics.Dispose()
    $c.Bitmap.Dispose()
  }
}

function Save-TransparentArt([string]$path, [int]$w, [int]$h, [bool]$wordmark) {
  $c = New-Canvas $w $h
  try {
    Draw-RedOne $c.Graphics $w $h $wordmark
    $c.Bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $c.Graphics.Dispose()
    $c.Bitmap.Dispose()
  }
}

$base = 'C:\BOT\apps\mobile-sales'
$assets = Join-Path $base 'assets\images'
$res = Join-Path $base 'android\app\src\main\res'

Save-Art (Join-Path $assets 'icon.png') 1024 1024 $false
Save-Art (Join-Path $assets 'favicon.png') 256 256 $false
Save-TransparentArt (Join-Path $assets 'android-icon-foreground.png') 1024 1024 $false
Save-TransparentArt (Join-Path $assets 'android-icon-monochrome.png') 1024 1024 $false
Save-TransparentArt (Join-Path $assets 'splash-icon.png') 1400 720 $true

$bg = New-Canvas 1024 1024
try {
  $bg.Graphics.Clear([System.Drawing.Color]::White)
  $bg.Bitmap.Save((Join-Path $assets 'android-icon-background.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $bg.Graphics.Dispose()
  $bg.Bitmap.Dispose()
}

$densitySizes = @{
  'mipmap-mdpi' = 48
  'mipmap-hdpi' = 72
  'mipmap-xhdpi' = 96
  'mipmap-xxhdpi' = 144
  'mipmap-xxxhdpi' = 192
}

foreach ($key in $densitySizes.Keys) {
  $dir = Join-Path $res $key
  $size = [int]$densitySizes[$key]
  Save-Art (Join-Path $dir 'ic_launcher.png') $size $size $false
  Save-Art (Join-Path $dir 'ic_launcher_round.png') $size $size $false
  Save-TransparentArt (Join-Path $dir 'ic_launcher_foreground.png') $size $size $false
  Save-TransparentArt (Join-Path $dir 'ic_launcher_monochrome.png') $size $size $false

  $bgDensity = New-Canvas $size $size
  try {
    $bgDensity.Graphics.Clear([System.Drawing.Color]::White)
    $bgDensity.Bitmap.Save((Join-Path $dir 'ic_launcher_background.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bgDensity.Graphics.Dispose()
    $bgDensity.Bitmap.Dispose()
  }
}

$splashSizes = @{
  'drawable-mdpi' = 180
  'drawable-hdpi' = 240
  'drawable-xhdpi' = 320
  'drawable-xxhdpi' = 420
  'drawable-xxxhdpi' = 520
}

foreach ($key in $splashSizes.Keys) {
  $dir = Join-Path $res $key
  $size = [int]$splashSizes[$key]
  Save-TransparentArt (Join-Path $dir 'splashscreen_logo.png') ($size * 2) $size $true
}
