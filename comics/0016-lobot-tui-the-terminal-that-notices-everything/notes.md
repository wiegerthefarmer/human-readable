# lobot-tui — Cluster Management TUI
![Lobot Cluster Management TUI](https://raw.githubusercontent.com/Queens-School-of-Computing/Lobot/main/assets/images/lobottuibanner.png)
## Overview

A [btop](https://github.com/aristocratos/btop)-style terminal dashboard for managing the Lobot JupyterHub cluster. Provides real-time visibility into running pods, node status, and resource group allocation — along with keyboard-driven access to all common admin operations.

Designed for the control plane where a terminal is always available, including during disaster recovery when a web interface may not be.

**Capabilities at a glance:**

- Real-time pod list with resource usage, image tag, resource group, node, age, and phase
- Per-resource-group utilisation table (CPU, RAM, GPU) showing jupyter-* workload only, updated every 5 seconds
- Per-node allocation table with CPU, RAM, GPU, and Longhorn disk usage — cordon/schedulable status
- Expandable per-disk sub-rows in the node table showing individual Longhorn disk detail
- Stream pod logs, exec bash into a pod, describe or delete pods
- Cordon, uncordon, and drain nodes (double-keypress to confirm)
- Launch image-pull, image-cleanup, apply-conf

---

Theme: A calm, technical control-room story about keeping a JupyterHub cluster upright while the web UI is hypothetically having a nap
Accent: keyboard-driven admin operations with disaster-recovery composure
