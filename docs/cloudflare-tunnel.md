# Sharing a local site with a Cloudflare quick tunnel

## Contents

- [What this gives you](#what-this-gives-you)
- [Before you start](#before-you-start)
- [Steps](#steps)
  - [1. Install cloudflared](#1-install-cloudflared)
  - [2. Allow the tunnel hostname](#2-allow-the-tunnel-hostname)
  - [3. Build and serve the site](#3-build-and-serve-the-site)
  - [4. Start the tunnel](#4-start-the-tunnel)
  - [5. Check the link from outside](#5-check-the-link-from-outside)
  - [6. Share it](#6-share-it)
- [Keep it running after the terminal closes](#keep-it-running-after-the-terminal-closes)
- [Stop sharing](#stop-sharing)
- [Troubleshooting](#troubleshooting)
- [How it was done the first time](#how-it-was-done-the-first-time)

## What this gives you

A public `https://<random-words>.trycloudflare.com` link to a site running on your own machine. You need no Cloudflare account, no domain and no open ports, because `cloudflared` makes an outbound connection to Cloudflare and Cloudflare forwards visitors through it.

Limits:

- The link works only while your machine is awake and both the site and `cloudflared` are running.
- The address changes every time you start the tunnel.
- Anyone with the link can open the site.
- Cloudflare gives account-less tunnels no uptime guarantee; they are meant for demos and testing.

## Before you start

- A Linux x86_64 machine with internet access. On ARM, download `cloudflared-linux-arm64` in step 1 instead.
- The site's project folder, with `npm install` already run.

Ports used so far:

| Project | Folder | Preview port |
|---|---|---|
| Bill pay, explained | `RSOP demo/` | 4391 |
| RSOP Designer | `RSOP demo 2/` | 4392 |
| Sender demo | `sender-initiate/` | 4393 |

Any free port works; use the same one in steps 3, 4 and 5.

## Steps

### 1. Install cloudflared

A single file in your home folder, so no `sudo` is needed:

```sh
mkdir -p ~/.local/bin
curl -L -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/.local/bin/cloudflared
~/.local/bin/cloudflared --version
```

The last command should print a version, for example `cloudflared version 2026.10.2`.

### 2. Allow the tunnel hostname

Vite, which Astro runs on, refuses requests for hostnames it does not know. Without this step your visitor sees *Blocked request. This host is not allowed*.

In `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  server: { allowedHosts: ['.trycloudflare.com'] },
});
```

The leading dot allows every subdomain. Astro applies this setting to both `astro dev` and `astro preview`.

Both `RSOP demo/` and `RSOP demo 2/` already have it, together with `.devtunnels.ms` for VS Code port forwarding.

For a plain Vite project, set `server.allowedHosts` and `preview.allowedHosts` in `vite.config.js` instead.

### 3. Build and serve the site

Share the built site, not `npm run dev`. The dev server shows Astro's developer toolbar to your visitor and loads slowly over a tunnel.

From the project folder:

```sh
npm run build
npx astro preview --port 4392 --host 127.0.0.1
```

In Astro 7, `astro preview` starts a background server and returns straight away. Manage it with `npx astro preview status`, `npx astro preview logs` and `npx astro preview stop`.

Check it locally:

```sh
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4392/
```

Expect `200`.

### 4. Start the tunnel

```sh
~/.local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4392
```

Within a few seconds the output shows two lines that matter:

```text
INF |  https://save-phones-alfred-economic.trycloudflare.com  |
INF Registered tunnel connection connIndex=0 ... location=khi02 protocol=quic
```

The first is your link. The second confirms that Cloudflare is connected. Leave the command running: closing it closes the link.

### 5. Check the link from outside

From any terminal, replace the address with yours and list the pages you want to check:

```sh
U=https://save-phones-alfred-economic.trycloudflare.com
for p in / /basics/ /inquiry/ /payment/; do
  printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 $U$p)" "$p"
done
```

Every line should start with `200`. Opening the link on your phone over mobile data is a good second check.

### 6. Share it

Send the `https://….trycloudflare.com` address.

After you change the site, run `npm run build` again. The preview server serves the new files, and the same link shows them without restarting the tunnel.

## Keep it running after the terminal closes

Start the tunnel in the background, writing its output to a log, then read the link from the log:

```sh
nohup ~/.local/bin/cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4392 > ~/cloudflared.log 2>&1 &
sleep 8
grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' ~/cloudflared.log
```

The preview server from step 3 already runs in the background.

## Stop sharing

```sh
pkill -f "cloudflared tunnel"    # or Ctrl+C in the terminal running it
npx astro preview stop           # from the project folder
```

Check that nothing is left behind:

```sh
pgrep -af "cloudflared tunnel" || echo "no tunnel running"
ss -ltnp | grep -E ':439[0-9]' || echo "no preview server running"
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| *Blocked request. This host is not allowed* | The tunnel hostname is not in `allowedHosts` | Do step 2, then stop and restart the preview server |
| Cloudflare error page, or 502 Bad Gateway | Nothing is listening on the port the tunnel points to | Check `ss -ltnp \| grep 4392`; start the preview again or fix the port in the tunnel command |
| No `trycloudflare.com` line appears | Outbound connections to Cloudflare are blocked. `cloudflared` uses QUIC over UDP by default, which some office networks block | Add `--protocol http2` to the tunnel command |
| `Port 4392 is in use` | Another server already uses it | Stop it, or pick another free port and use it in steps 3 to 5 |
| The link shows old content | The preview serves `dist/`, which only changes on build | Run `npm run build` |
| The link stopped working | `cloudflared` exited, the machine slept, or the network dropped | Start the tunnel again and send the new address |

For a link that never changes, use a named tunnel instead. That needs a Cloudflare account and a domain managed in Cloudflare, so it is a different setup from this one.

## How it was done the first time

On 2026-10-21, `RSOP demo/` was shared this way:

1. `cloudflared` 2026.10.2 was installed to `~/.local/bin` as in step 1.
2. `server.allowedHosts` was added to `astro.config.mjs`.
3. The site was rebuilt and served with `npx astro preview --port 4391 --host 127.0.0.1`. The dev server on port 4321 was left running untouched.
4. The tunnel connected through Cloudflare's Karachi edge (`location=khi02`) over QUIC.
5. All seven pages and the font files returned `200` through `https://save-phones-alfred-economic.trycloudflare.com`. That address no longer works; every run gets a new one.
