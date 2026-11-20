Add-Type -AssemblyName System.Drawing
$srcPath = "C:\Users\thesi\Downloads\Hookah-menu-main\Hookah-menu-main\public\splash-loading.jpg"
$destPath = "C:\Users\thesi\Downloads\Hookah-menu-main\Hookah-menu-main\public\splash-loading.png"

$orig = [System.Drawing.Image]::FromFile($srcPath)
$newW = 720
$newH = [int]($orig.Height * (720 / $orig.Width))

$bmp = New-Object System.Drawing.Bitmap $newW, $newH
$graph = [System.Drawing.Graphics]::FromImage($bmp)
$graph.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graph.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graph.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graph.DrawImage($orig, 0, 0, $newW, $newH)

$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graph.Dispose()
$bmp.Dispose()
$orig.Dispose()

Write-Host "Compressed and converted splash image successfully to true PNG"
