Headscale and Cloudflare overlap
Good instinct to ask, because Headscale and Cloudflare only partially overlap — the key fact to anchor on: Headscale coordinates a private WireGuard mesh between devices you enroll. It cannot serve anonymous public visitors. Your customers browsing bsbikebites.com will never be in your tailnet, so something still has to do public ingress. That splits the question in two:

The admin plane (SSH, Postgres access, Proxmox UI) — Headscale replaces Cloudflare here, and honestly better. Steps:

Run headscale as another compose service (or LXC — it's a single Go binary + SQLite). It needs one reachable endpoint for clients to phone home to — your VM's public campus IP works, even just a high port.
Create a user and preauth keys: headscale users create bsbb, headscale preauthkeys create --user bsbb.
tailscale up --login-server https://your-headscale:8080 --authkey ... on the VM, your laptop, your phone. Devices get stable 100.64.x.x IPs; enable MagicDNS if you want names.
SSH then rides the mesh (ssh claude@100.64.0.2), and you delete the public ssh.bsbikebites.com hostname entirely — the admin surface disappears from the internet, which is strictly better t

---

Theme: Private mesh for admin access, public ingress left to the grown-ups
Accent: wireguard_blue
