param(
  [Parameter(Mandatory=$true)][int]$BrowserPid,
  [string]$InstanceName = "H2ADS"
)
# Cosmetic WinForms companion for the REAL Chrome HWND.
# Never injects browser code, traffic, network settings, profile or proxy.
# Runs as a separate, non-activating window behind the Chrome window.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class H2PhoneWindowNative {
  public delegate bool EnumWindowsDelegate(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsDelegate callback, IntPtr param);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hwnd, StringBuilder text, int capacity);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out Rectangle rect);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hwnd,int x,int y,int w,int h,bool repaint);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
  [StructLayout(LayoutKind.Sequential)] public struct Rectangle {
    public int Left, Top, Right, Bottom;
  }
  public static IntPtr FindChromeWindow(int browserPid) {
    IntPtr found=IntPtr.Zero;
    EnumWindows((hwnd,param) => {
      if(!IsWindowVisible(hwnd))return true;
      uint pid;
      GetWindowThreadProcessId(hwnd,out pid);
      if(pid!=(uint)browserPid)return true;
      var name=new StringBuilder(128);
      GetClassName(hwnd,name,name.Capacity);
      if(!name.ToString().StartsWith("Chrome_WidgetWin_"))return true;
      found=hwnd; return false;
    },IntPtr.Zero);
    return found;
  }
  public const uint SWP_NOACTIVATE=0x0010;
  public const uint SWP_NOOWNERZORDER=0x0200;
  public const uint SWP_NOSENDCHANGING=0x0400;
}
'@ -ReferencedAssemblies "System.Drawing"

function RGB([int]$r,[int]$g,[int]$b) {
  return [System.Drawing.Color]::FromArgb($r,$g,$b)
}
$desktop=[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$chrome=[IntPtr]::Zero
$deadline=[DateTime]::UtcNow.AddSeconds(22)
while($chrome -eq [IntPtr]::Zero -and [DateTime]::UtcNow -lt $deadline) {
  if(-not (Get-Process -Id $BrowserPid -ErrorAction SilentlyContinue)){exit 0}
  $chrome=[H2PhoneWindowNative]::FindChromeWindow($BrowserPid)
  if($chrome -eq [IntPtr]::Zero){Start-Sleep -Milliseconds 200}
}
if($chrome -eq [IntPtr]::Zero){exit 0}
$rect=New-Object H2PhoneWindowNative+Rectangle
if(-not [H2PhoneWindowNative]::GetWindowRect($chrome,[ref]$rect)){exit 0}
# Resize only the visible HWND. Browser process, tabs, profiles and network untouched.
$width=[Math]::Min(422,[Math]::Max(310,$desktop.Width-76))
$height=[Math]::Min(760,[Math]::Max(475,$desktop.Height-134))
$targetX=[Math]::Max($desktop.Left+24,[Math]::Min($rect.Left,$desktop.Right-$width-26))
$targetY=[Math]::Max($desktop.Top+52,[Math]::Min($rect.Top,$desktop.Bottom-$height-46))
[H2PhoneWindowNative]::MoveWindow($chrome,$targetX,$targetY,$width,$height,$true)|Out-Null

$frame=New-Object System.Windows.Forms.Form
$frame.FormBorderStyle=[System.Windows.Forms.FormBorderStyle]::None
$frame.ShowInTaskbar=$false
$frame.StartPosition=[System.Windows.Forms.FormStartPosition]::Manual
$frame.BackColor=RGB 11 17 29
$frame.ForeColor=RGB 240 247 255
$frame.TopMost=$false
$frame.AutoScaleMode=[System.Windows.Forms.AutoScaleMode]::None
$frame.Width=$width+18
$frame.Height=$height+99
$frame.Opacity=1.0
$frame.Text="H2ADS - Aparencia de celular"
$frame.add_Shown({
  # The frame always lives directly BEHIND Chrome; never takes browser focus.
  [H2PhoneWindowNative]::SetWindowPos($frame.Handle,$chrome,0,0,0,0,
    [H2PhoneWindowNative]::SWP_NOACTIVATE -bor 0x0001 -bor 0x0002)|Out-Null
})
$frame.Location=New-Object System.Drawing.Point(($targetX-9),($targetY-47))

$status=New-Object System.Windows.Forms.Panel
$status.Dock="Top";$status.Height=47;$status.BackColor=RGB 13 19 33
$frame.Controls.Add($status)
$time=New-Object System.Windows.Forms.Label
$time.Text="09:41";$time.AutoSize=$true;$time.Location=New-Object System.Drawing.Point(23,13)
$time.Font=New-Object System.Drawing.Font("Segoe UI",10,[System.Drawing.FontStyle]::Bold)
$time.ForeColor=RGB 247 249 252
$status.Controls.Add($time)
$notch=New-Object System.Windows.Forms.Label
$notch.Text="";$notch.Width=80;$notch.Height=13;$notch.BackColor=RGB 0 0 0
$notch.Location=New-Object System.Drawing.Point(([int](($frame.Width-80)/2)),4)
$status.Controls.Add($notch)
$battery=95
$wifiOn=$true
$right=New-Object System.Windows.Forms.Label
$right.Width=139;$right.Height=23;$right.TextAlign="MiddleRight"
$right.Location=New-Object System.Drawing.Point(($frame.Width-148),9)
$right.ForeColor=RGB 244 250 255
$right.Font=New-Object System.Drawing.Font("Segoe UI",9,[System.Drawing.FontStyle]::Bold)
$right.Cursor=[System.Windows.Forms.Cursors]::Hand
$status.Controls.Add($right)
function Update-PhoneIndicators {
  $w=if($wifiOn){"WiFi"}else{"WiFi off"}
  $right.Text="|||  $w   $battery%"
}
Update-PhoneIndicators
$right.add_Click({
  $script:battery=($script:battery+10)%110
  Update-PhoneIndicators
})
$right.add_MouseWheel({
  if($_.Delta -gt 0){$script:battery=[Math]::Min(100,$script:battery+5)}
  else{$script:battery=[Math]::Max(0,$script:battery-5)}
  Update-PhoneIndicators
})
$right.add_DoubleClick({$script:wifiOn=-not $script:wifiOn;Update-PhoneIndicators})
$footer=New-Object System.Windows.Forms.Panel
$footer.Dock="Bottom";$footer.Height=52;$footer.BackColor=RGB 13 19 33
$frame.Controls.Add($footer)
$nav=New-Object System.Windows.Forms.Label
$nav.Text="  ‹                       ○                       □  "
$nav.TextAlign="MiddleCenter";$nav.Dock="Fill"
$nav.ForeColor=RGB 218 235 251
$nav.Font=New-Object System.Drawing.Font("Segoe UI Symbol",15,[System.Drawing.FontStyle]::Regular)
$nav.Cursor=[System.Windows.Forms.Cursors]::Default
$footer.Controls.Add($nav)
# Thin side borders remain visible; the entire middle belongs to real Chrome.
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=450
$timer.add_Tick({
  try {
    if(-not (Get-Process -Id $BrowserPid -ErrorAction SilentlyContinue)){
      $timer.Stop();$frame.Close();return
    }
    if(-not [H2PhoneWindowNative]::IsWindowVisible($chrome) -or
       [H2PhoneWindowNative]::IsIconic($chrome)){
      $frame.Hide();return
    }
    $r=New-Object H2PhoneWindowNative+Rectangle
    if(-not [H2PhoneWindowNative]::GetWindowRect($chrome,[ref]$r)){return}
    $newPoint=New-Object System.Drawing.Point(($r.Left-9),($r.Top-47))
    $frame.Location=$newPoint
    $frame.Size=New-Object System.Drawing.Size(($r.Right-$r.Left+18),($r.Bottom-$r.Top+99))
    $right.Left=$frame.Width-148
    $notch.Left=[int](($frame.Width-80)/2)
    if(-not $frame.Visible){$frame.Show()}
    [H2PhoneWindowNative]::SetWindowPos($frame.Handle,$chrome,0,0,0,0,
      [H2PhoneWindowNative]::SWP_NOACTIVATE -bor 0x0001 -bor 0x0002)|Out-Null
    $time.Text=[DateTime]::Now.ToString("HH:mm")
  } catch {}
})
$frame.add_FormClosed({$timer.Stop();$timer.Dispose()})
$timer.Start()
[System.Windows.Forms.Application]::Run($frame)
