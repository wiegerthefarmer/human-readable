# Headscale and Coudflare Overlap

**Format:** Living Comic (9 scenes)

---

## Scene 1 — wide

A split-screen style rooftop view: one side shows the public site bsbikebites.com on a browser, the other a private admin stack labeled Headscale. The visual joke is that they are adjacent only in the architectural diagram, not in the trust boundary.

- “Overlap is not the same as replacement.”
- “The internet remains uninvited, as usual.”

## Scene 2 — medium

Inside a compact server room, a small compose stack runs Headscale beside familiar services. The setup looks modest, because the whole point is that it does not need to be dramatic to become useful.

- “Another compose service. The least glamorous revolution.”
- “A single Go binary is doing its best.”

## Scene 3 — close-up

A terminal window shows a user being created and preauth keys minted. The interface is all business; the machine is only pretending this is ceremonial.

- “Create the user. Generate the keys. Avoid ceremony.”
- “Security, but with fewer robes.”

## Scene 4 — medium

The protagonist enrolls the VM, a laptop, and a phone into the mesh using tailscale up with the Headscale login server. Each device receives a stable 100.64.x.x address, which is not glamorous but is at least numerically committed.

- “Login server points to Headscale. The devices comply.”
- “Stable addresses: the rare reward for being technically correct.”

## Scene 5 — over-the-shoulder

SSH now rides the mesh instead of the public hostname. The command line is compact, almost smug, and the remote prompt appears as if it had been waiting in a less exposed corridor.

- “ssh claude@100.64.0.2”
- “The hostname has been deleted, and honestly, good.”

## Scene 6 — whiteboard

A whiteboard compares old and new admin paths: public SSH on one side, tailnet-only access on the other. The new route is shorter, calmer, and less visible to strangers with curiosity and scans.

- “Admin surface disappears from the internet.”
- “That is the nicest possible kind of disappearance.”

## Scene 7 — terminal

A terminal session checks access to Postgres and Proxmox through the mesh. The systems respond with the calm of equipment that has stopped being available to the general public.

- “SSH, Postgres, Proxmox UI. All private now.”
- “The attack surface has entered its quieter era.”

## Scene 8 — hallway

A hallway view outside the office shows the public-facing path left intact for customers browsing bsbikebites.com, while admin access stays off-camera and off the scan results. The two planes finally stop arguing in the same room.

- “Customers keep browsing. Admins keep tunneling.”
- “A fine arrangement. Minimal drama, maximal predictability.”

## Scene 9 — close-up

The final shot is a quiet monitor reflection: the tailnet is healthy, the public SSH hostname is gone, and the system looks relieved in the clinically sterile way infrastructure occasionally can.

- “Headscale replaces Cloudflare here.”
- “For admin, yes. For visitors, the web still needs a door.”
