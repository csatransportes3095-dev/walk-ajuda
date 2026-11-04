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
// A visible companion must never steal focus from the real Chrome window.
public sealed class H2PhoneDisplayForm : System.Windows.Forms.Form {
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override System.Windows.Forms.CreateParams CreateParams {
    get {
      var props=base.CreateParams;
      props.ExStyle |= 0x08000000 | 0x00000080; // NOACTIVATE | TOOLWINDOW
      return props;
    }
  }
}
'@ -ReferencedAssemblies "System.Drawing","System.Windows.Forms"

# Cosmetic phone shell. Only the visible HWND position is adjusted;
# the real Chrome instance, cookies, proxy, profiles and browser commands stay intact.
function RGB([int]$r,[int]$g,[int]$b) { [System.Drawing.Color]::FromArgb($r,$g,$b) }
function Set-PhoneCorners([System.Windows.Forms.Form]$target) {
  $w=$target.Width; $h=$target.Height
  if($w -lt 100 -or $h -lt 100){return}
  $d=60
  $path=New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0,0,$d,$d,180,90)
  $path.AddArc(($w-$d-1),0,$d,$d,270,90)
  $path.AddArc(($w-$d-1),($h-$d-1),$d,$d,0,90)
  $path.AddArc(0,($h-$d-1),$d,$d,90,90)
  $path.CloseFigure()
  $old=$target.Region
  $target.Region=New-Object System.Drawing.Region -ArgumentList $path
  if($old){$old.Dispose()}
  $path.Dispose()
}
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
$desktop=[System.Windows.Forms.Screen]::FromHandle($chrome).WorkingArea
$width=[Math]::Min(390,[Math]::Max(310,$desktop.Width-48))
$height=[Math]::Min(790,[Math]::Max(400,$desktop.Height-154))
$targetX=[Math]::Max($desktop.Left+12,[Math]::Min($rect.Left,$desktop.Right-$width-12))
$targetY=[Math]::Max($desktop.Top+66,[Math]::Min($rect.Top,$desktop.Bottom-$height-66))
[H2PhoneWindowNative]::MoveWindow($chrome,$targetX,$targetY,$width,$height,$true)|Out-Null

$frame=New-Object H2PhoneDisplayForm
$frame.FormBorderStyle=[System.Windows.Forms.FormBorderStyle]::None
$frame.ShowInTaskbar=$false
$frame.StartPosition=[System.Windows.Forms.FormStartPosition]::Manual
$frame.BackColor=RGB 10 14 25
$frame.ForeColor=RGB 243 248 255
$frame.TopMost=$false
$frame.AutoScaleMode=[System.Windows.Forms.AutoScaleMode]::None
$frame.Width=$width+24
$frame.Height=$height+126
$frame.Text="H2ADS - Phone visual"
$frame.Location=New-Object System.Drawing.Point(($targetX-12),($targetY-62))
$frame.add_SizeChanged({Set-PhoneCorners $frame})
Set-PhoneCorners $frame
$frame.add_Shown({
  [H2PhoneWindowNative]::SetWindowPos($frame.Handle,$chrome,0,0,0,0,
    [H2PhoneWindowNative]::SWP_NOACTIVATE -bor 0x0001 -bor 0x0002)|Out-Null
})

# Windows PowerShell 5.1 reads UTF-8 without BOM incorrectly.
# All icons are drawn as vector geometry, never font glyphs.
$script:battery=95
$script:wifiOn=$true
$status=New-Object System.Windows.Forms.Panel
$status.Dock="Top"
$status.Height=62
$status.BackColor=RGB 13 18 33
$status.Cursor=[System.Windows.Forms.Cursors]::Hand
$status.add_Paint({
  param($sender,$e)
  $g=$e.Graphics
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $w=$sender.ClientSize.Width
  $fg=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 242 247 255)
  $pen=New-Object System.Drawing.Pen -ArgumentList (RGB 242 247 255),2
  $font=New-Object System.Drawing.Font -ArgumentList "Segoe UI",11,([System.Drawing.FontStyle]::Bold)
  $small=New-Object System.Drawing.Font -ArgumentList "Segoe UI",9,([System.Drawing.FontStyle]::Bold)
  try {
    $g.DrawString([DateTime]::Now.ToString("HH:mm"),$font,$fg,23,19)
    # Discreet punch-hole camera.
    $ring=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 43 53 73)
    $lens=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 2 6 14)
    $g.FillEllipse($ring,($w/2-9),19,18,18)
    $g.FillEllipse($lens,($w/2-5),23,10,10)
    $ring.Dispose();$lens.Dispose()
    # Signal bars.
    for($i=0;$i -lt 4;$i++){ $sh=4+3*$i; $g.FillRectangle($fg,($w-151+5*$i),(36-$sh),3,$sh) }
    # WiFi arcs (grey when switched off).
    if(-not $script:wifiOn){$pen.Color=RGB 101 115 140}
    $g.DrawArc($pen,($w-117),22,24,17,205,130)
    $g.DrawArc($pen,($w-112),28,14,10,205,130)
    $dot=New-Object System.Drawing.SolidBrush -ArgumentList $pen.Color
    $g.FillEllipse($dot,($w-107),37,4,4)
    $dot.Dispose()
    $pen.Color=RGB 242 247 255
    # Battery icon plus readable percentage.
    $bx=$w-84
    $g.DrawRectangle($pen,$bx,22,26,13)
    $g.FillRectangle($fg,($bx+27),26,3,5)
    $bc=if($script:battery -le 20){RGB 255 166 102}else{RGB 120 238 175}
    $fill=New-Object System.Drawing.SolidBrush -ArgumentList $bc
    $g.FillRectangle($fill,($bx+2),24,(22*$script:battery/100),9)
    $fill.Dispose()
    $g.DrawString(("$($script:battery)%"),$small,$fg,($w-49),22)
  } finally { $small.Dispose();$font.Dispose();$pen.Dispose();$fg.Dispose() }
})
$status.add_MouseClick({
  param($sender,$e)
  if($e.X -ge ($status.Width-90)){ $script:battery=if($script:battery -ge 100){0}else{[Math]::Min(100,$script:battery+5)} }
  elseif($e.X -ge ($status.Width-130)){ $script:wifiOn=-not $script:wifiOn }
  $status.Invalidate()
})
$status.add_MouseWheel({
  param($sender,$e)
  $change=if($e.Delta -gt 0){5}else{-5}
  $script:battery=[Math]::Max(0,[Math]::Min(100,$script:battery+$change))
  $status.Invalidate()
})
$frame.Controls.Add($status)

$footer=New-Object System.Windows.Forms.Panel
$footer.Dock="Bottom"
$footer.Height=64
$footer.BackColor=RGB 13 18 33
$footer.add_Paint({
  param($sender,$e)
  $g=$e.Graphics
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $w=$sender.ClientSize.Width
  $pen=New-Object System.Drawing.Pen -ArgumentList (RGB 222 235 252),2.5
  $pill=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 222 235 252)
  try {
    # Back, home gesture bar and recent-apps icons: decorative only.
    $x=[int]($w*0.24);$y=30
    $g.DrawLine($pen,($x+6),($y-9),($x-3),$y)
    $g.DrawLine($pen,($x-3),$y,($x+6),($y+9))
    $g.FillRectangle($pill,([int]($w/2)-28),28,56,4)
    $rx=[int]($w*0.76)-9
    $g.DrawRectangle($pen,$rx,21,18,18)
  } finally {$pill.Dispose();$pen.Dispose()}
})
$frame.Controls.Add($footer)

$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=500
$timer.add_Tick({
  try {
    if(-not (Get-Process -Id $BrowserPid -ErrorAction SilentlyContinue)) {
      $timer.Stop();$frame.Close();return
    }
    if(-not [H2PhoneWindowNative]::IsWindowVisible($chrome) -or
       [H2PhoneWindowNative]::IsIconic($chrome)){
      $frame.Hide();return
    }
    $r=New-Object H2PhoneWindowNative+Rectangle
    if(-not [H2PhoneWindowNative]::GetWindowRect($chrome,[ref]$r)){return}
    $frame.Location=New-Object System.Drawing.Point(($r.Left-12),($r.Top-62))
    $frame.Size=New-Object System.Drawing.Size(($r.Right-$r.Left+24),($r.Bottom-$r.Top+126))
    if(-not $frame.Visible){$frame.Show()}
    [H2PhoneWindowNative]::SetWindowPos($frame.Handle,$chrome,0,0,0,0,
      [H2PhoneWindowNative]::SWP_NOACTIVATE -bor 0x0001 -bor 0x0002)|Out-Null
    $status.Invalidate()
  } catch {}
})
$frame.add_FormClosed({$timer.Stop();$timer.Dispose()})
$timer.Start()
[System.Windows.Forms.Application]::Run($frame)
