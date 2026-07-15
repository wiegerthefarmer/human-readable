# One Port, Many Consequences

**Format:** Living Comic (9 scenes)

---

## Scene 1 — wide

A campus edge diagram is simplified with almost suspicious efficiency: dozens of prior firewall exceptions get crossed out until only one external rule remains, pointing at a single perimeter node. The internal firewall behind it is left looking relieved, if slightly underemployed.

- Old design: many exceptions, many places to forget them.
- New design: one port, one node, one problem statement.

## Scene 2 — medium

The protagonist VM appears on a Proxmox host as a deliberately non-LXC guest, with neat virtualization boundaries and a measured amount of pride. A shell script hovers nearby like an overconfident construction foreman.

- Built as a VM, not an LXC, because some abstractions are too light to be trusted with traffic.
- Virtualization: one more layer, one fewer incident report.

## Scene 3 — close-up

A terminal displays the Headscale ACL policy in crisp deny-by-default language. Only the ingress tag can touch web backends, and only sysadmins can approach the admin mesh; the rest of the graph is politely but firmly inaccessible.

- Default deny is not a slogan; it is a lifestyle.
- If compromised, the ingress node gets exactly the amount of power it was promised: very little.

## Scene 4 — terminal

The node joins the tailnet and immediately stops trying to be interesting. Traffic paths become internal-only, and the admin mesh remains behind the sysadmin gate like a well-behaved secret.

- Public exposure is not the same as public reachability.
- The tailnet carries the burden so the firewall does not have to.

## Scene 5 — whiteboard

A static Traefik configuration is sketched like a concise airport diagram: entrypoints, Let's Encrypt, and a CrowdSec bouncer plugin are all in their assigned places. Nothing decorative survives contact with the whiteboard marker.

- Static config belongs in static files; opinions belong elsewhere.
- Let’s Encrypt handles trust, CrowdSec handles rude surprises.

## Scene 6 — over-the-shoulder

From behind the protagonist’s shoulder, the dynamic routing file is edited to add one more internal service block. The route appears instantly, hot-reloading with the calm confidence of a system that has seen this before.

- Add a service, add a router, save the file.
- No restart. The node has better reflexes than the old exception list.

## Scene 7 — hallway

A quiet corridor in the department building shows the before-and-after effect of the new design. On one side, old firewall exceptions linger in memory; on the other, nothing public-facing touches internal systems at all.

- The best internal firewall rule is the one that never gets written.
- Attack surface reduction: now in architectural form.

## Scene 8 — server-room

Inside the rack, the ingress VM stands between the public Internet and the internal tailnet like a very small customs office. Requests arrive at 443, are checked, and either continue inward or are turned away without drama.

- Everything enters through the node; almost nothing gets to improvise.
- The system has one public door and many private hallways.

## Scene 9 — close-up

A final verification screen summarizes the whole arrangement: one external rule, zero public internal rules, deny-by-default ACLs, and dynamic routes that can change without a restart. The protagonist sits quietly, having achieved the rarest state in infrastructure: less surprising.

- The system is now public in exactly one place.
- Everything else is internal, tagged, and unexcited.
