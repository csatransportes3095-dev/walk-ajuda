# H2 Android Native - experimental controller

This is a NEW opt-in Hyper-V controller. It does not start Android Studio, Google Android Emulator, ADB or the existing H2 Android agent. It does not touch the H2 ADS module, H2 Auto, or production routes.

IMPORTANT: This is not yet a functional Android system. The repository has no bootable AOSP guest VHDX, interactive input/video channel, SOCKS5 routing, or Play Store certification. These items require separate implementation and validation.

## Requirements
- Windows Pro/Enterprise/Education with Hyper-V enabled and sufficient host resources (not Windows Home).
- Administrator permission to manage Hyper-V.
- A compatible UEFI bootable AOSP x86_64 VHDX image prepared independently. AOSP source code alone is not a bootable VHDX.
- Exact SHA-256 of the VHDX.

## Safety defaults
- Only H2N_001 to H2N_999 VM names are accepted.
- VM ownership checked against exact tag, VM ID manifest, generation and expected disk path.
- A differencing VHDX per VM; base image not written by this controller.
- All network adapters disconnected. Start refuses any connected switch. No proxy leak by default.
- No auto-start, no deletion functions, max five running H2 native VMs.
- No remote API, no worker command polling, no automatic downloads or Windows settings modification.

## Inspect host (no changes)
Import-Module .\workers\windows\h2-native\H2NativeCore.psm1 -Force
Get-H2NativeHostStatus | Format-List
Get-H2NativeInventory | Format-Table

## Run pure guard tests (no VM changes)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\tests\Guards.Tests.ps1

## Provision after obtaining and validating a Hyper-V bootable AOSP VHDX
New-H2NativeVm -VMName H2N_001 -ImagePath D:\AOSP\h2-android-uefi.vhdx -ImageSha256 <exact-64-character-hash>
Start-H2NativeVm -VMName H2N_001
Stop-H2NativeVm -VMName H2N_001

Unsigned boot can be explicitly authorized using -AllowUnsignedBoot when provisioning; it is disabled by default.

## Next milestones
1. Validate Windows edition and host Hyper-V readiness.
2. Produce and boot-test compatible AOSP UEFI VHDX, including drivers.
3. Implement an authenticated guest agent for smooth video, keyboard, gestures and clipboard.
4. Implement fail-closed per-VM SOCKS5 with DNS, IPv4/IPv6 and reconnect tests.
5. Expose native controls behind a separately tested administrator feature flag.
6. Test APK installation and app compatibility; Play Store and driver app support cannot be guaranteed.

## Hardware readiness report (added after PR #625)
Run the read-only Windows PowerShell 5.1 tool:
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\H2NativeReadiness.ps1`
Machine-readable output: append `-Json`.
To check a supplied AOSP VHDX integrity without creating a VM, pass `-ImagePath` and `-ExpectedSha256`. Hash calculation can take time on large images.
It only reads hardware/Hyper-V status and optional image checksum. Never installs software, modifies configuration, creates virtual machines, or changes the network.
An image checksum match does **not** prove that Android boots, or that the image is trusted or supports any specific applications. Verify provenance and boot on the real Windows host before proceeding.

## Offline first boot verification
AOSP x86_64 is NOT automatically UEFI/Hyper-V compatible. A bootable Gen2 VHDX with tested drivers and bootloader is required; this repository does not yet provide or build one.
Read-only VM audit command:
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\H2NativeBootAudit.ps1 -VMName H2N_001
It checks H2 ownership, Hyper-V firmware, parent VHDX and disconnected network. It never starts the VM. safeToAttemptOfflineBoot only indicates host prerequisites, NOT Android boot.
Actual guest boot must be confirmed at the Hyper-V console by a human. Running hypervisor state alone is not proof of Android boot. Do not enable networking until isolated SOCKS5 is implemented and validated.


## First boot (somente H2 Android Native, sem vinculo com as rotas do site)

Este console usa exclusivamente comandos Hyper-V e o VMConnect que ja fazem parte do
Windows. Ele NAO inicia o Android Studio, ADB ou outro emulador. A tela aberta
e a console de video da VM real, nao uma imitacao visual de celular.

Comece SEM privilgios de administrador, apenas lendo o diagnostico:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\H2NativeFirstBoot.ps1 -Action Host

Depois de confirmar Hyper-V e obter uma imagem AOSP x86_64 UEFI VHDX de origem conhecida
com SHA-256 exato, execute os seguintes comandos no PowerShell como administrador:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\H2NativeFirstBoot.ps1 -Action Create -VMName H2N_001 -ImagePath D:\AOSP\h2-android-uefi.vhdx -ImageSha256 HASH_EXATO
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\H2NativeFirstBoot.ps1 -Action Audit -VMName H2N_001
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\H2NativeFirstBoot.ps1 -Action Start -VMName H2N_001
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\H2NativeFirstBoot.ps1 -Action Console -VMName H2N_001

Para desligar com seguranca:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\workers\windows\h2-native\H2NativeFirstBoot.ps1 -Action Stop -VMName H2N_001

O primeiro boot fica inteiramente offline. H2 Native nao habilita rede sem isolamento
de proxy testado. Rodar Hyper-V NAO comprova que o Android iniciou. Se o AOSP VHDX nao
existir, o console nao cria uma VM de fachada. A imagem do Android, guest video/input
e proxy SOCKS5 validado continuam pendentes.
