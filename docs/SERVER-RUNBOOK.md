# Start / restart the server (phone over USB)

The app on the phone talks to `http://localhost:3000`. That only works if
(a) the server is running on the Mac and (b) `adb reverse` is active.
`/v1/auth/refresh ... connectionError` in the app = one of these two is missing.

Use TWO terminal tabs. `npm run dev` never finishes — it keeps running and
holds the tab, so nothing typed after it in the same tab will run.

---

## Terminal 1 — the server (leave it open)

1. Go to the server folder
   ```
   cd ~/Dev/college_erp/server
   ```

2. Start it
   ```
   npm run dev
   ```

3. Wait for this line, then leave the tab alone:
   ```
   Server listening at http://127.0.0.1:3000
   ```

## Terminal 2 — connect the phone (run every time the USB cable is replugged)

4. Check the phone is visible (must say `device`, not `unauthorized`/empty)
   ```
   adb devices
   ```

5. Forward the phone's port 3000 to the Mac
   ```
   adb reverse tcp:3000 tcp:3000
   ```

6. Confirm (should print `UsbFfs tcp:3000 tcp:3000`)
   ```
   adb reverse --list
   ```

7. Check from the Mac (should print `{"status":"ok"}`)
   ```
   curl http://localhost:3000/health
   ```

Now open or restart the app on the phone.

---

## Restart the server

- Code changes: nothing to do, `npm run dev` reloads by itself.
- `.env` changes or it looks stuck: in Terminal 1 press `Ctrl + C`, then run
  `npm run dev` again.
- Phone unplugged/replugged or phone rebooted: redo steps 4–6 (the server can
  keep running).

## If it fails

- App shows `POST /v1/auth/refresh ... connectionError` → first run
  `adb reverse --list`. If it prints nothing, the forward is gone (it resets
  whenever the phone is unplugged, locked for long, or adb restarts). Run
  `adb reverse tcp:3000 tcp:3000` again, then reopen the app.

- `EADDRINUSE: address already in use :::3000` → an old server is still running.
  Stop it:
  ```
  lsof -ti tcp:3000 | xargs kill
  ```
  then `npm run dev` again.
- `adb devices` shows nothing / `unauthorized` → unlock the phone, replug the
  cable, accept the "Allow USB debugging" prompt, then redo step 5.
- `adb: command not found` → Android platform-tools not on PATH; use
  `~/Library/Android/sdk/platform-tools/adb` instead of `adb`.
- App says "Your session has ended. Please sign in again." → the server is
  reachable; just sign in again.
