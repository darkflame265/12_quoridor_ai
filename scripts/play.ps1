param([switch]$Stop)
$ErrorActionPreference = 'Stop'
try {
    $projectRoot = Split-Path -Parent $PSScriptRoot
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $runtimeFolder = Join-Path $projectRoot '.local-app'
    New-Item -ItemType Directory -Force -Path $runtimeFolder | Out-Null
    $launchArguments = '"' + (Join-Path $PSScriptRoot 'play.mjs') + '"'
    if ($Stop) { $launchArguments += ' --stop' }
    $process = Start-Process -FilePath $nodePath -ArgumentList $launchArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeFolder "launch-$PID.log") -RedirectStandardError (Join-Path $runtimeFolder "launch-$PID.error.log")
    # Keep errors visible without leaving a terminal window open.
    if ($process.WaitForExit(15000) -and $process.ExitCode -ne 0) {
        $details = Get-Content -LiteralPath (Join-Path $runtimeFolder "launch-$PID.error.log") -Raw -Encoding UTF8
        (New-Object -ComObject WScript.Shell).Popup($details, 0, 'Quoridor AI', 16) | Out-Null
    }
} catch {
    (New-Object -ComObject WScript.Shell).Popup($_.Exception.Message, 0, 'Quoridor AI', 16) | Out-Null
}
