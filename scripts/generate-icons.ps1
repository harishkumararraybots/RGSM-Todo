param(
  [string]$AppName = "Todo PWA",
  [string]$Bg = "#0b1220",
  [string]$Fg = "#22c55e"
)

# Generates PNG icons (192, 512) and maskable variants from a simple SVG using Windows PowerShell with System.Drawing.
# Requires .NET available to PowerShell 5.1 (present by default on Windows).

Add-Type -AssemblyName System.Drawing

function New-Svg {
  param([int]$Size, [string]$Bg, [string]$Fg)
  $r = [math]::Round($Size * 0.22)
  $stroke = [math]::Round($Size * 0.06)
  $font = [math]::Round($Size * 0.36)
  return @"
<svg xmlns='http://www.w3.org/2000/svg' width='$Size' height='$Size'>
  <rect width='100%' height='100%' rx='${r}' ry='${r}' fill='$Bg'/>
  <g fill='none' stroke='$Fg' stroke-width='$stroke' stroke-linecap='round' stroke-linejoin='round'>
    <path d='M ${0.22*$Size},${0.52*$Size} L ${0.42*$Size},${0.72*$Size} L ${0.78*$Size},${0.30*$Size}' />
  </g>
</svg>
"@
}

function SvgToBitmap {
  param([string]$Svg, [int]$Size)
  # Very simple rasterization using only background color and drawing a check using System.Drawing
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'HighQuality'

  # Parse colors (fallbacks)
  $bgColor = [System.Drawing.ColorTranslator]::FromHtml($Bg)
  $fgColor = [System.Drawing.ColorTranslator]::FromHtml($Fg)

  # Rounded background
  $radius = [int]($Size * 0.22)
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $gp.AddArc(0, 0, $d, $d, 180, 90)
  $gp.AddArc($Size-$d, 0, $d, $d, 270, 90)
  $gp.AddArc($Size-$d, $Size-$d, $d, $d, 0, 90)
  $gp.AddArc(0, $Size-$d, $d, $d, 90, 90)
  $gp.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush($bgColor)), $gp)

  # Check mark path
  $penWidth = [int]($Size * 0.06)
  $pen = New-Object System.Drawing.Pen($fgColor, $penWidth)
  $pen.StartCap = 'Round'
  $pen.EndCap = 'Round'
  $pen.LineJoin = 'Round'

  $p1 = New-Object System.Drawing.Point([int]($Size*0.22), [int]($Size*0.52))
  $p2 = New-Object System.Drawing.Point([int]($Size*0.42), [int]($Size*0.72))
  $p3 = New-Object System.Drawing.Point([int]($Size*0.78), [int]($Size*0.30))
  $g.DrawLines($pen, @($p1,$p2,$p3))

  $g.Dispose()
  return $bmp
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$iconsDir = Join-Path (Split-Path -Parent $root) "assets/icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

$targets = @(192, 512)
foreach ($size in $targets) {
  $svg = New-Svg -Size $size -Bg $Bg -Fg $Fg
  $bmp = SvgToBitmap -Svg $svg -Size $size
  $path = Join-Path $iconsDir "icon-$size.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

# Maskable variants: same art but saved to maskable-*.png
foreach ($size in $targets) {
  $svg = New-Svg -Size $size -Bg $Bg -Fg $Fg
  $bmp = SvgToBitmap -Svg $svg -Size $size
  $path = Join-Path $iconsDir "maskable-$size.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

Write-Host "Icons generated in $iconsDir"