# Deploying to the DIB UAT VM

## Contents

- [Where it runs](#where-it-runs)
- [Layout on the VM](#layout-on-the-vm)
- [Redeploy after a change](#redeploy-after-a-change)
  - [Back office](#back-office)
  - [Sender demo](#sender-demo)
- [Operate](#operate)
- [Gotchas](#gotchas)

## Where it runs

Both frontends run on `dib-uat` (10.0.150.35, RHEL 8.10) as systemd services, under `appuser`. Open them with the VPN connected:

| App | URL | Service |
|---|---|---|
| Back office | http://10.0.150.35:4392 | `rsop-backoffice` |
| Sender demo (phone) | http://10.0.150.35:4393 | `rsop-sender` |

The VM has no Docker and no internet, so everything is built on a laptop and copied over. Both services start on boot and restart on failure.

## Layout on the VM

```text
/opt/rsop-frontend/
  node -> node-v22.21.1-linux-x64   Node 22 (the VM's own Node 20 is too old for Astro 7)
  backoffice/                       dist/, package.json, production node_modules
  sender/                           dist/, server/, src/data/bills.ts, package.json, .env
  units/                            copies of the two .service files in /etc/systemd/system/
```

The sender needs no `node_modules`; its server uses Node's built-ins and loads `bills.ts` directly, which needs Node 22.18 or later. Its `.env` holds the bill API settings and stays out of git.

## Redeploy after a change

Run from this laptop with the VPN on. Each command asks for `appuser`'s password; the `sudo` step asks again.

### Back office

Only `dist/` changes unless dependencies do:

```sh
cd "RSOP demo 2" && npm run check && npm run build
tar czf - dist | ssh appuser@10.0.150.35 'cd /opt/rsop-frontend/backoffice && rm -rf dist && tar xzf -'
ssh -t appuser@10.0.150.35 'sudo systemctl restart rsop-backoffice'
```

If `package.json` changed, also copy `package.json` and `package-lock.json`, run `npm ci --omit=dev` on the laptop in a copy of the folder, and send its `node_modules` too.

### Sender demo

```sh
cd sender-initiate && npm run check && npm run build
tar czf - dist server src/data/bills.ts package.json | ssh appuser@10.0.150.35 'cd /opt/rsop-frontend/sender && rm -rf dist server && tar xzf -'
ssh -t appuser@10.0.150.35 'sudo systemctl restart rsop-sender'
```

## Operate

```sh
systemctl status rsop-backoffice rsop-sender
journalctl -u rsop-backoffice -n 50          # needs sudo for the full log
sudo systemctl restart rsop-backoffice
```

## Gotchas

- **Sign-in fails with 403 "Cross-site POST form submissions are forbidden".** Astro trusts only the hosts in `security.allowedDomains` (`astro.config.mjs`); any other Host is treated as `localhost` and the form fails the origin check. Add the new host there and rebuild.
- **The sender answers 403 "Host not allowed".** Add the host to `ALLOWED_HOSTS` in `/etc/systemd/system/rsop-sender.service`, then `sudo systemctl daemon-reload && sudo systemctl restart rsop-sender`.
- **Backends.** The back office reads the flow API at 10.0.70.144:9991 and the logs at 10.0.150.35:7774 (this VM). Override them with `RSOP_API_BASE`, `RSOP_INQUIRY_LOG_BASE` and `RSOP_PAYMENT_LOG_BASE` in the unit's `Environment=` line.
- **Disk.** The root filesystem was 82% full (9.5 GB free) on 2026-10-23; the deployment uses about 420 MB of it.
