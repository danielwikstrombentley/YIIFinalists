# Kiosk autostart templates

These templates start the checked-out kiosk launcher after the playback computer logs in. They
are intentionally ordinary OS configuration rather than a new service or hosted dependency.
Replace `/opt/yii/YIIFinalists` (Linux), `/Users/operator/YIIFinalists` (macOS), or
`C:\YII\YIIFinalists` (Windows) with the folder containing this repository. The operator account
must already have Node.js, pnpm, Chromium/Chrome, and the built local content installed.

The launcher starts the sidecar first and then the watchdog. The watchdog starts Chromium with the
required kiosk flags and restarts it if it exits unexpectedly.

## macOS — LaunchAgent

Save as `~/Library/LaunchAgents/com.yii.kiosk.plist`, replacing the paths and account name:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yii.kiosk</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/operator/YIIFinalists/tools/kiosk/launch/start.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/Users/operator/YIIFinalists</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/Users/operator/Library/Logs/yii-kiosk-launch.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/operator/Library/Logs/yii-kiosk-launch-error.log</string>
</dict>
</plist>
```

Load it for the logged-in operator:

```text
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.yii.kiosk.plist
```

To stop autostart while servicing the machine:

```text
launchctl bootout gui/$(id -u)/com.yii.kiosk
```

## Linux — systemd user service

Save as `~/.config/systemd/user/yii-kiosk.service`:

```ini
[Unit]
Description=YII LED kiosk
After=graphical-session.target network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/yii/YIIFinalists
ExecStart=/opt/yii/YIIFinalists/tools/kiosk/launch/start.sh
Restart=on-failure
RestartSec=5
Environment=DISPLAY=:0
Environment=XDG_RUNTIME_DIR=/run/user/1000

[Install]
WantedBy=default.target
```

Replace `1000` with the operator's user id if necessary, then enable it as that operator:

```text
systemctl --user daemon-reload
systemctl --user enable --now yii-kiosk.service
loginctl enable-linger operator
```

Check or stop it during service:

```text
systemctl --user status yii-kiosk.service
systemctl --user stop yii-kiosk.service
```

The graphical session must be available before the service starts. If the machine uses a desktop
autostart manager instead of systemd user services, create an application entry whose command is
the same `start.sh` path and whose working directory is the repository root.

## Windows — Task Scheduler

Create a task named **YII LED Kiosk** with these settings:

1. **Trigger:** At log on, for the dedicated operator account.
2. **General:** Run only when the operator is logged on; use the highest available privileges.
3. **Action:** Start a program.
   - Program: `C:\Program Files\Git\bin\bash.exe` (or the installed Bash path).
   - Arguments: `-lc "cd /c/YII/YIIFinalists && ./tools/kiosk/launch/start.sh"`.
   - Start in: `C:\YII\YIIFinalists`.
4. **Settings:** Restart the task if it stops; do not start a second instance.

If Git Bash is not available, use a PowerShell action that changes to the repository and invokes
the launcher through the installed Bash distribution. Keep the Chromium path in
`KIOSK_CHROMIUM` if the machine does not expose `chrome.exe` on `PATH`.

Run the launcher once manually before enabling the task. Confirm the app is visible, then sign out
and back in to verify that the task starts the sidecar and watchdog without an operator action.