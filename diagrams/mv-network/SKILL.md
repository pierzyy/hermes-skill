---
name: mv-network
description: Create network topology diagrams using PlantUML syntax with industry-standard device icons. Best for LAN/WAN architecture, enterprise networks, data center design, and network security zoning.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "PlantUML", "network", "topology", "Cisco"]
    related_skills: ["mv-cloud", "mv-security"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-network")`. Output network diagrams as PlantUML code blocks.

# Network Topology Diagram Generator

**Quick Start:** Identify network zones → Place devices using stencil icons → Connect with labeled links → Add firewalls between zones → Wrap in ` ```plantuml ` fence.

## Network Device Stencils

| Category | Stencil Examples |
|----------|-----------------|
| Cisco | `mxgraph.cisco.router`, `.switch`, `.firewall`, `.load_balancer`, `.wireless_controller` |
| Generic Network | `mxgraph.network.router`, `.switch`, `.firewall`, `.server`, `.workstation`, `.printer` |
| Citrix | `mxgraph.citrix.netscaler`, `.xendesktop`, `.xenapp` |
| Network Security | `mxgraph.network.vpn`, `.ids`, `.ips`, `.waf` |

## Example: Three-Tier Enterprise Network

```plantuml
@startuml
skinparam defaultFontSize 11

rectangle "DMZ" as dmz #LightYellow {
    mxgraph.network.firewall "Edge\nFirewall" as fw1
    mxgraph.network.load_balancer "Load\nBalancer" as lb
    mxgraph.network.server "Web\nServer" as web
}

rectangle "Internal" as internal #LightBlue {
    mxgraph.network.firewall "Internal\nFirewall" as fw2
    mxgraph.network.switch "Core\nSwitch" as sw
    mxgraph.network.server "App\nServer" as app
    mxgraph.network.database "DB\nServer" as db
    mxgraph.network.workstation "Workstations" as ws
}

cloud "Internet" as inet
inet --> fw1
fw1 --> lb
lb --> web
web --> fw2
fw2 --> sw
sw --> app
app --> db
sw --> ws
@enduml
```

## Best Practices

- Use rectangles with background colors to define network zones
- Label all inter-zone links with protocol/port
- Keep max 15-20 devices per diagram for readability
- Use `left to right direction` for wide diagrams

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Crossing links | Rearrange device order |
| Overlapping labels | Add spacing or reposition |
| Unclear zones | Use colored rectangles |