param(
  [Parameter(Mandatory=$true)][int]$BrowserPid,
  [string]$InstanceName = "H2ADS",
  [switch]$VisualSelfTest
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
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern int SetWindowRgn(IntPtr hwnd,IntPtr region,bool redraw);
  [DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);
  public static bool RoundChromeWindow(IntPtr hwnd,int w,int h) {
    if(hwnd==IntPtr.Zero || w<120 || h<160 || IsZoomed(hwnd)) return false;
    // IMPORTANT: The Chrome process and PowerShell can use DIFFERENT DPI units.
    // A Win32 region sized from this companion truncated Chrome at 175% scaling.
    // Remove any old hard clip; DWM draws corners without hiding browser pixels.
    SetWindowRgn(hwnd,IntPtr.Zero,true);
    try {
      int preference=2; // DWMWCP_ROUND: ask Windows 11 for native corners.
      return DwmSetWindowAttribute(hwnd,33,ref preference,4)==0;
    } catch {
      // Older Windows: keep Chrome rectangular and FULLY visible.
      return false;
    }
  }
  public static void RestoreChromeWindow(IntPtr hwnd) {
    if(hwnd==IntPtr.Zero)return;
    SetWindowRgn(hwnd,IntPtr.Zero,true);
    try {int preference=0;DwmSetWindowAttribute(hwnd,33,ref preference,4);}catch{}
  }
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
// WinForms native phone chassis. The real Chrome HWND remains fully interactive.
public sealed class H2PhoneDisplayForm : System.Windows.Forms.Form {
  public H2PhoneDisplayForm() {
    DoubleBuffered=true;
    SetStyle(System.Windows.Forms.ControlStyles.UserPaint |
      System.Windows.Forms.ControlStyles.AllPaintingInWmPaint |
      System.Windows.Forms.ControlStyles.OptimizedDoubleBuffer |
      System.Windows.Forms.ControlStyles.ResizeRedraw,true);
  }
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override System.Windows.Forms.CreateParams CreateParams {
    get {
      var props=base.CreateParams;
      props.ExStyle |= 0x08000000 | 0x00000080; // NOACTIVATE | TOOLWINDOW
      return props;
    }
  }
  private static System.Drawing.Drawing2D.GraphicsPath Rounded(float x,float y,float w,float h,float radius) {
    float d=radius*2f;
    var p=new System.Drawing.Drawing2D.GraphicsPath();
    p.AddArc(x,y,d,d,180f,90f);
    p.AddArc(x+w-d,y,d,d,270f,90f);
    p.AddArc(x+w-d,y+h-d,d,d,0f,90f);
    p.AddArc(x,y+h-d,d,d,90f,90f);
    p.CloseFigure();
    return p;
  }
  protected override void OnResize(System.EventArgs e) {
    base.OnResize(e);
    if(Width<120 || Height<200)return;
    using(var outline=Rounded(0,0,Width-1,Height-1,46f)) {
      var old=Region;
      Region=new System.Drawing.Region(outline);
      if(old!=null)old.Dispose();
    }
    Invalidate();
  }
  protected override void OnPaint(System.Windows.Forms.PaintEventArgs e) {
    base.OnPaint(e);
    if(Width<120 || Height<200)return;
    var g=e.Graphics;
    g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
    float w=ClientSize.Width,h=ClientSize.Height;
    // One continuous phone chassis: coherent corner radii on every layer.
    // The browser's pixels are never painted over or masked by this form.
    using(var body=Rounded(0.7f,0.7f,w-1.4f,h-1.4f,45f))
    using(var metal=new System.Drawing.Drawing2D.LinearGradientBrush(
      new System.Drawing.RectangleF(0,0,w,h),
      System.Drawing.Color.FromArgb(86,107,132),
      System.Drawing.Color.FromArgb(14,21,37),0f)) {
      g.FillPath(metal,body);
    }
    using(var rim=Rounded(2f,2f,w-4f,h-4f,43f))
    using(var edge=new System.Drawing.Pen(System.Drawing.Color.FromArgb(133,158,187),1.5f)) {
      g.DrawPath(edge,rim);
    }
    using(var glass=Rounded(5f,5f,w-10f,h-10f,41f))
    using(var dark=new System.Drawing.Drawing2D.LinearGradientBrush(
      new System.Drawing.RectangleF(5,5,w-10,h-10),
      System.Drawing.Color.FromArgb(19,26,43),
      System.Drawing.Color.FromArgb(4,9,18),90f)) {
      g.FillPath(dark,glass);
    }
    using(var inside=Rounded(8f,8f,w-16f,h-16f,38f))
    using(var shine=new System.Drawing.Pen(System.Drawing.Color.FromArgb(64,90,118),1f)) {
      g.DrawPath(shine,inside);
    }
    // Internal screen recess exactly aligned with the real Chrome HWND.
    // The status bar and Chrome remain inside this phone-safe rounded area.
    using(var screen=Rounded(20f,84f,w-40f,h-146f,28f))
    using(var back=new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(1,5,12)))
    using(var outline=new System.Drawing.Pen(System.Drawing.Color.FromArgb(100,122,151),1.3f)) {
      g.FillPath(back,screen);
      g.DrawPath(outline,screen);
    }
    // Refined satin side edges and simulated volume/power hardware keys.
    using(var side=new System.Drawing.Pen(System.Drawing.Color.FromArgb(63,114,142),1f)) {
      g.DrawLine(side,9f,135f,9f,h-141f);
      g.DrawLine(side,w-9f,141f,w-9f,h-151f);
    }
    using(var shadow=new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(28,37,58)))
    using(var hardware=new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(120,145,173))) {
      g.FillRectangle(shadow,w-9f,173f,5f,82f);
      g.FillRectangle(hardware,w-7f,178f,2.5f,72f);
      g.FillRectangle(shadow,w-9f,289f,5f,61f);
      g.FillRectangle(hardware,w-7f,294f,2.5f,51f);
    }
  }
}
'@ -ReferencedAssemblies "System.Drawing","System.Windows.Forms"

# Cosmetic phone shell. Only the visible HWND position is adjusted;
# the real Chrome instance, cookies, proxy, profiles and browser commands stay intact.
function RGB([int]$r,[int]$g,[int]$b) { [System.Drawing.Color]::FromArgb($r,$g,$b) }
function Set-RoundedPanelRegion($control,[int]$radius) {
  $diameter=$radius*2
  $path=New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc(0,0,$diameter,$diameter,180,90)
  $path.AddArc(($control.Width-$diameter),0,$diameter,$diameter,270,90)
  $path.AddArc(($control.Width-$diameter),($control.Height-$diameter),$diameter,$diameter,0,90)
  $path.AddArc(0,($control.Height-$diameter),$diameter,$diameter,90,90)
  $path.CloseFigure()
  $old=$control.Region
  $control.Region=New-Object System.Drawing.Region($path)
  if($old -ne $null){$old.Dispose()}
  $path.Dispose()
}
# Visual self-test used only by the Windows CI, never by normal instances.
if($VisualSelfTest) {
  $preview=New-Object H2PhoneDisplayForm
  $bitmap=New-Object System.Drawing.Bitmap -ArgumentList 428,915
  try {
    $preview.Size=New-Object System.Drawing.Size -ArgumentList 428,915
    $preview.CreateControl()
    $preview.DrawToBitmap($bitmap,(New-Object System.Drawing.Rectangle -ArgumentList 0,0,428,915))
    if($bitmap.Width -ne 428 -or $bitmap.Height -ne 915){throw "Phone geometry invalid"}
    Write-Output "H2ADS: smartphone body painted in Windows PowerShell 5.1"
  } finally { $bitmap.Dispose();$preview.Dispose() }
  exit 0
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
$bezel=20
$topPad=84
$bottomPad=62
$width=[Math]::Min(392,[Math]::Max(310,$desktop.Width-2*$bezel-12))
$height=[Math]::Min(780,[Math]::Max(400,$desktop.Height-$topPad-$bottomPad-12))
$targetX=[Math]::Max($desktop.Left+$bezel+6,[Math]::Min($rect.Left,$desktop.Right-$width-$bezel-6))
$targetY=[Math]::Max($desktop.Top+$topPad+6,[Math]::Min($rect.Top,$desktop.Bottom-$height-$bottomPad-6))
[H2PhoneWindowNative]::MoveWindow($chrome,$targetX,$targetY,$width,$height,$true)|Out-Null
[H2PhoneWindowNative]::RoundChromeWindow($chrome,$width,$height)|Out-Null
$script:roundedW=$width
$script:roundedH=$height

$frame=New-Object H2PhoneDisplayForm
$frame.FormBorderStyle=[System.Windows.Forms.FormBorderStyle]::None
$frame.ShowInTaskbar=$false
$frame.StartPosition=[System.Windows.Forms.FormStartPosition]::Manual
$frame.BackColor=RGB 10 14 25
$frame.ForeColor=RGB 243 248 255
$frame.TopMost=$false
$frame.AutoScaleMode=[System.Windows.Forms.AutoScaleMode]::None
$frame.Width=$width+2*$bezel
$frame.Height=$height+$topPad+$bottomPad
$frame.Text="H2ADS - Phone visual"
$frame.Location=New-Object System.Drawing.Point(($targetX-$bezel),($targetY-$topPad))
# One single radius comes from H2PhoneDisplayForm.OnResize.
# Do not reapply a competing PowerShell region (previously radius 30 vs 46).
$frame.add_Shown({
  [H2PhoneWindowNative]::SetWindowPos($frame.Handle,$chrome,0,0,0,0,
    [H2PhoneWindowNative]::SWP_NOACTIVATE -bor 0x0001 -bor 0x0002)|Out-Null
})

# Windows PowerShell 5.1 reads UTF-8 without BOM incorrectly.
# All icons are drawn as vector geometry, never font glyphs.
$script:battery=95
$script:wifiOn=$true
$status=New-Object System.Windows.Forms.Panel
$status.Height=52
$status.Width=$frame.Width-44
$status.Location=New-Object System.Drawing.Point(22,14)
$status.BackColor=RGB 16 23 39
$status.Cursor=[System.Windows.Forms.Cursors]::Hand
Set-RoundedPanelRegion $status 24
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
    $g.DrawString([DateTime]::Now.ToString("HH:mm"),$font,$fg,20,16)
    # Discreet punch-hole camera.
    $ring=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 43 53 73)
    $lens=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 2 6 14)
    $g.FillEllipse($ring,($w/2-9),16,18,18)
    $g.FillEllipse($lens,($w/2-5),20,10,10)
    $ring.Dispose();$lens.Dispose()
    # Signal bars.
    for($i=0;$i -lt 4;$i++){ $sh=4+3*$i; $g.FillRectangle($fg,($w-181+5*$i),(33-$sh),3,$sh) }
    $g.DrawString("5G",$small,$fg,($w-157),21)
    # WiFi arcs (grey when switched off).
    if(-not $script:wifiOn){$pen.Color=RGB 101 115 140}
    $g.DrawArc($pen,($w-124),19,24,17,205,130)
    $g.DrawArc($pen,($w-119),25,14,10,205,130)
    $dot=New-Object System.Drawing.SolidBrush -ArgumentList $pen.Color
    $g.FillEllipse($dot,($w-114),34,4,4)
    $dot.Dispose()
    $pen.Color=RGB 242 247 255
    # Battery icon plus readable percentage.
    $bx=$w-84
    $g.DrawRectangle($pen,$bx,19,26,13)
    $g.FillRectangle($fg,($bx+27),23,3,5)
    $bc=if($script:battery -le 20){RGB 255 166 102}else{RGB 120 238 175}
    $fill=New-Object System.Drawing.SolidBrush -ArgumentList $bc
    $g.FillRectangle($fill,($bx+2),21,(22*$script:battery/100),9)
    $fill.Dispose()
    $g.DrawString(("$($script:battery)%"),$small,$fg,($w-49),19)
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
$footer.Height=52
$footer.Width=$frame.Width-44
$footer.Location=New-Object System.Drawing.Point(22,($frame.Height-60))
$footer.BackColor=RGB 10 15 27
Set-RoundedPanelRegion $footer 24
$footer.add_Paint({
  param($sender,$e)
  $g=$e.Graphics
  $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $w=$sender.ClientSize.Width
  $pen=New-Object System.Drawing.Pen -ArgumentList (RGB 222 235 252),2.5
  $pill=New-Object System.Drawing.SolidBrush -ArgumentList (RGB 222 235 252)
  try {
    # Back, home gesture bar and recent-apps icons: decorative only.
    $x=[int]($w*0.24);$y=27
    $g.DrawLine($pen,($x+6),($y-9),($x-3),$y)
    $g.DrawLine($pen,($x-3),$y,($x+6),($y+9))
    $g.FillRectangle($pill,([int]($w/2)-28),25,56,4)
    $rx=[int]($w*0.76)-9
    $g.DrawRectangle($pen,$rx,18,18,18)
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
    # When maximized, return Chrome to its normal square native window.
    if([H2PhoneWindowNative]::IsZoomed($chrome)){
      if($script:roundedW -gt 0){
        [H2PhoneWindowNative]::RestoreChromeWindow($chrome)
        $script:roundedW=0;$script:roundedH=0
      }
      $frame.Hide();return
    }
    $r=New-Object H2PhoneWindowNative+Rectangle
    if(-not [H2PhoneWindowNative]::GetWindowRect($chrome,[ref]$r)){return}
    $cw=$r.Right-$r.Left
    $ch=$r.Bottom-$r.Top
    if($cw -ne $script:roundedW -or $ch -ne $script:roundedH){
      if([H2PhoneWindowNative]::RoundChromeWindow($chrome,$cw,$ch)){
        $script:roundedW=$cw;$script:roundedH=$ch
      }
    }
    $frame.Location=New-Object System.Drawing.Point(($r.Left-$bezel),($r.Top-$topPad))
    $frame.Size=New-Object System.Drawing.Size(($cw+2*$bezel),($ch+$topPad+$bottomPad))
    $status.Width=$frame.Width-44
    $status.Location=New-Object System.Drawing.Point(22,14)
    Set-RoundedPanelRegion $status 24
    $footer.Width=$frame.Width-44
    $footer.Left=22
    $footer.Top=$frame.Height-60
    Set-RoundedPanelRegion $footer 24
    if(-not $frame.Visible){$frame.Show()}
    [H2PhoneWindowNative]::SetWindowPos($frame.Handle,$chrome,0,0,0,0,
      [H2PhoneWindowNative]::SWP_NOACTIVATE -bor 0x0001 -bor 0x0002)|Out-Null
    $status.Invalidate()
    $frame.Invalidate()
  } catch {}
})
$frame.add_FormClosed({$timer.Stop();$timer.Dispose()})
$timer.Start()
[System.Windows.Forms.Application]::Run($frame)
