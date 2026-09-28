# Tailscale verification for MoneyTrack v2

MoneyTrack binds the web app to loopback only (`127.0.0.1:3100`). Remote access is via **Tailscale Serve** (tailnet-only), not Funnel.

## 1. Confirm loopback bind

From an elevated or normal Command Prompt:

```bat
netstat -ano | findstr :3100
```

**Expected:** a `LISTENING` line with local address `127.0.0.1:3100`.

**Failure:** `0.0.0.0:3100` or `[::]:3100` means the app is exposed on all interfaces — stop it and fix the bind before continuing.

## 2. Confirm Serve is active

```bat
tailscale serve status
```

**Expected:** HTTPS on port 443 proxying to `http://127.0.0.1:3100`.

## 3. Confirm Funnel is **not** enabled

```bat
tailscale funnel status
```

**Expected:** empty / no public funnel. Funnel would expose the app to the public internet.

## 4. End-to-end check from another tailnet device

1. Ensure MagicDNS and HTTPS certificates are enabled in the Tailscale admin console.
2. Open `https://<machine-name>.<tailnet>.ts.net` from a phone or laptop on the same tailnet.
3. You should see the MoneyTrack login screen. Application login is still required — network reachability is not authentication.

## 5. Disable Serve

```bat
tailscale serve reset
```
