# YII LED kiosk operator runbook

This is the event-day recovery guide. Use the dedicated playback computer and the operator
controls only. Do not edit content, delete release folders, or close the terminal that owns the
kiosk unless the **Full restart** procedure tells you to do so.

## What a healthy kiosk looks like

- The LED wall shows the globe or the current project presentation.
- No browser tabs, address bar, menus, or technical messages are visible.
- The playback computer is connected to the LED wall and the operator console is powered.
- The sidecar and watchdog normally start automatically when the operator account logs in.

If the wall is blank, frozen, or showing a browser error, start with **Reload**. If that does not
restore the presentation, follow the recovery steps in order.

## Startup

1. Turn on the playback computer, the LED wall, and the operator console.
2. Sign in to the dedicated event operator account.
3. Wait up to two minutes. The kiosk should open by itself and settle on the globe/idle view.
4. Confirm that one category can be selected and that a project preview appears.
5. If the browser does not appear, use the computer's approved **YII LED Kiosk** autostart entry
   once. If it still does not appear, use **Full restart**.

## Open the operator controls

Use the approved concealed operator activation gesture for this event. It is intentionally not
shown on the LED wall. The operator layer is a separate control screen; closing it returns to the
same public presentation.

## Soft reset — first recovery step

Use this when navigation is confused, a selection is stale, or the presentation is not responding
normally but the browser is still visible.

1. Open the operator controls.
2. Choose **Deep reset to idle**.
3. Wait for the globe/idle view.
4. Select a category and confirm one project to verify the normal journey.

This cancels the current presentation and cleans up temporary playback work. It does not restart
the browser, change content, or require network access.

## Forced-media recovery

Use this when a video or narrated story is not playing, is stuck, or has fallen back to its still
image.

1. Open the operator controls and choose **Force media failure** in the simulator. This deliberately
   exercises the safe media fallback; it is a test/recovery control, not a content deletion.
2. Confirm that the wall remains filled by the story's fallback composition rather than going
   black.
3. Choose **Deep reset to idle**.
4. Re-enter the project and try the story once more.
5. If the same media remains unavailable, leave the fallback visible and record the project name,
   option number, and time for the production/content lead. Do not repeatedly restart the entire
   computer for one media asset.

## Globe recovery

Use this when the globe is frozen, markers are missing, or category preview movement is wrong.

1. Open the operator controls.
2. Choose **Recover globe**.
3. Wait for the globe/idle view to return.
4. Select a category and move between two project previews.
5. If it is still wrong, use **Deep reset to idle**, then **Reload**.

## Cesium / geographic recovery

Use this when the project landing view or geographic scene is frozen, incomplete, or showing the
wrong renderer. The public fallback composition is acceptable while the geographic view recovers.

1. Open the operator controls.
2. Choose **Recover Cesium**.
3. Return to idle, select the affected project, and confirm it again.
4. If the geographic scene remains unavailable, use **Clear preload cache**, then **Recover
   Cesium** once more.
5. If the project still presents safely with its approved local fallback, continue the event and
   record the project name and time. Use **Reload** only if the whole presentation is affected.

## Reload — browser refresh through the watchdog

Use this after soft reset and renderer recovery when the page is frozen, stale, or the operator
controls do not respond. Reload asks the local watchdog to replace the browser process; the
sidecar does not reload itself.

1. Open the operator controls if they are available.
2. Choose **Request reload**.
3. Keep the LED wall in view and wait up to one minute for the kiosk to return to the globe/idle
   view.
4. Test one category and one project.

If the controls cannot open, go directly to **Full restart**.

## Full restart

Use this when the browser is gone, the sidecar/watchdog terminal is closed, or reload does not
restore the idle view.

1. Tell the event lead that the wall will be unavailable briefly.
2. Close the visible kiosk terminal only if it is clearly the kiosk launcher terminal. Do not close
   unrelated production tools.
3. Start the approved **YII LED Kiosk** launcher/autostart entry.
4. Wait for the sidecar and browser to return, then wait for the globe/idle view.
5. Test one category, one project, and one content option.
6. If startup fails twice, leave the approved safe presentation visible if possible and contact the
   playback lead with the time and the last visible screen.

The watchdog automatically relaunches Chromium after an unexpected browser death. Do not manually
open several Chrome windows; that can hide which window is being supervised.

## Disconnect/reconnect the operator console

Use this when the console status is disconnected or button presses are not reaching the wall.

1. Open the operator controls and check the console connection status.
2. Turn off or unplug the console's event-local connection for ten seconds.
3. Restore power/cable/network as instructed by the hardware lead.
4. Choose **Reconnect simulator/console** if that control is shown.
5. Wait for the status to show connected and test one harmless navigation action.
6. If the wall presentation was interrupted, use **Deep reset to idle**; do not reload just for a
   temporary console disconnect.

If the status remains disconnected, keep the public presentation running and call the hardware
lead. The experience should remain safe and visible even while input is unavailable.

## Escalation notes

When reporting a problem, provide: current screen, project/category, option number if known, the
recovery steps already tried, and the local time. Never send credentials, tokens, or arbitrary
URLs in an incident message.