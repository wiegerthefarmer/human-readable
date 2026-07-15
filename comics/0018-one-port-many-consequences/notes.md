# Perimeter Ingress Node — Cloudflare-free public exposure over Headscale

## What this replaces
A public site that previously needed exceptions on both the campus external
firewall and the department internal firewall for every backend it touched.
After this, exactly **one** rule exists anywhere: port 443 open to this one
node on the campus external firewall. The department internal firewall gets
**zero** public-facing rules — the perimeter node reaches internal services
over the tailnet instead.

## Files
- `headscale-acl-policy.hujson` — deny-by-default ACL. Only `tag:ingress`
  (this node) can reach `tag:web-backend` ports; only sysadmins can reach the
  admin mesh. The ingress node has no path to SSH/Postgres/Proxmox even if
  compromised.
- `traefik.yml` — static Traefik config: entrypoints, Let's Encrypt, and the
  CrowdSec bouncer plugin.
- `dynamic.yml` — the actual routes. Add a new internal service by adding one
  router+service block here — no restart needed, Traefik hot-reloads it.
- `docker-compose.yml` — the whole node: Tailscale client (joined to your
  Headscale server as `tag:ingress`), CrowdSec, Traefik.
- `proxmox-vm-create.sh` — builds the VM on Proxmox (not LX

---

Theme: Perimeter ingress over Headscale with deny-by-default ACLs and hot-reloaded Traefik routes
Accent: one exposed 443 port, everything else politely hidden
