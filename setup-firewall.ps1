# Open Windows Defender Firewall Rule for Port 3000 (SIN-OS POS Local Wi-Fi Sync)
New-NetFirewallRule -DisplayName "SIN-OS POS Server Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
Write-Host "Windows Firewall Rule added for Port 3000 successfully!"
