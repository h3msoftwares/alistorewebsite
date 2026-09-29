$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public sealed class TestRunPowerRequest : IDisposable {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct ReasonContext {
        public uint Version;
        public uint Flags;
        [MarshalAs(UnmanagedType.LPWStr)] public string SimpleReason;
        // Space for the remaining members of the native REASON_CONTEXT union.
        public IntPtr Reserved1;
        public IntPtr Reserved2;
    }
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeFileHandle PowerCreateRequest(ref ReasonContext context);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool PowerSetRequest(SafeFileHandle handle, int requestType);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool PowerClearRequest(SafeFileHandle handle, int requestType);
    [DllImport("kernel32.dll")]
    private static extern ulong GetTickCount64();
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryUnbiasedInterruptTime(out ulong time);

    private readonly SafeFileHandle handle;
    private bool systemRequested;
    private bool executionRequested;
    private readonly ulong startedTicks;
    private readonly ulong startedAwake;

    public TestRunPowerRequest() {
        var reason = new ReasonContext { Flags = 1, SimpleReason = "Ali Store backend test suite" };
        handle = PowerCreateRequest(ref reason);
        if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
        try {
            systemRequested = PowerSetRequest(handle, 1);
            if (!systemRequested) throw new Win32Exception(Marshal.GetLastWin32Error());
            executionRequested = PowerSetRequest(handle, 3);
            if (!executionRequested) throw new Win32Exception(Marshal.GetLastWin32Error());
            startedTicks = GetTickCount64();
            if (!QueryUnbiasedInterruptTime(out startedAwake)) throw new Win32Exception(Marshal.GetLastWin32Error());
        } catch { Dispose(); throw; }
    }
    public long SuspendedMilliseconds() {
        ulong awake;
        if (!QueryUnbiasedInterruptTime(out awake)) throw new Win32Exception(Marshal.GetLastWin32Error());
        return (long)(GetTickCount64() - startedTicks) - (long)((awake - startedAwake) / 10000);
    }
    public void Dispose() {
        if (executionRequested) PowerClearRequest(handle, 3);
        if (systemRequested) PowerClearRequest(handle, 1);
        handle.Dispose();
    }
}
'@

$powerRequest = [TestRunPowerRequest]::new()
$testExitCode = 1
try {
    Write-Host 'Windows sleep guard active. Keep the lid open; explicit sleep can override power requests.'
    $vitestArgs = @(ConvertFrom-Json -InputObject $env:ALISTORE_TEST_ARGS)
    & $env:ALISTORE_TEST_NODE "$PSScriptRoot/../node_modules/vitest/vitest.mjs" @vitestArgs
    $testExitCode = $LASTEXITCODE
    $suspendedMs = $powerRequest.SuspendedMilliseconds()
    if ($suspendedMs -gt 1000) {
        Write-Host "INVALID TEST RUN: Windows suspended for $suspendedMs ms. Rerun while awake; no automatic retries were applied."
        $testExitCode = 1
    }
} finally {
    $powerRequest.Dispose()
}
exit $testExitCode
