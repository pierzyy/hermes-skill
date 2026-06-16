---
name: mv-iot
description: Create IoT architecture diagrams using PlantUML syntax with device, sensor, and edge computing icons. Best for smart home/factory, fleet management, digital twins, and IoT platform architecture.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "PlantUML", "IoT", "sensors", "edge"]
    related_skills: ["mv-cloud", "mv-network"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-iot")`. Output IoT architecture diagrams as PlantUML code blocks.

# IoT Architecture Diagram Generator

**Quick Start:** Identify device layer → Map edge/fog computing → Connect to cloud services → Use IoT-specific stencils → Wrap in ` ```plantuml ` fence.

## IoT Stencil Icons

| Layer | Stencil Examples |
|-------|-----------------|
| Devices | `mxgraph.aws4.iot_core`, sensors, actuators |
| Edge | `mxgraph.aws4.iot_greengrass`, edge gateways |
| Cloud | `mxgraph.aws4.iot_analytics`, `mxgraph.aws4.iot_events` |
| Protocols | MQTT, CoAP, HTTP, WebSocket labels on links |

## IoT Architecture Layers

```
┌─────────────────────────────────┐
│  Device Layer (Sensors/Actuators)│
├─────────────────────────────────┤
│  Edge Layer (Gateways/Fog)      │
├─────────────────────────────────┤
│  Cloud Layer (Ingest/Process)   │
├─────────────────────────────────┤
│  Application Layer (Dashboards) │
└─────────────────────────────────┘
```

## Example: Smart Factory

```plantuml
@startuml
skinparam defaultFontSize 11

rectangle "Factory Floor" #LightYellow {
    mxgraph.aws4.iot_sensor "Temperature\nSensor" as sens1
    mxgraph.aws4.iot_sensor "Vibration\nSensor" as sens2
    mxgraph.aws4.iot_actuator "Conveyor\nActuator" as act1
}

rectangle "Edge Gateway" #LightBlue {
    mxgraph.aws4.iot_greengrass "Greengrass\nEdge" as edge
}

rectangle "AWS Cloud" #Lavender {
    mxgraph.aws4.iot_core "IoT Core" as iot
    mxgraph.aws4.iot_analytics "IoT Analytics" as ana
    mxgraph.aws4.lambda "Lambda\nRules" as fn
    mxgraph.aws4.dynamodb "Device\nShadow" as shadow
}

sens1 --> edge : MQTT
sens2 --> edge : MQTT
edge --> iot : TLS
iot --> fn
iot --> shadow
iot --> ana
fn --> act1 : Command
@enduml
```

## Common Protocols in Diagrams

| Protocol | Label Convention | Use Case |
|----------|-----------------|----------|
| MQTT | `: MQTT` on link | Device-to-cloud telemetry |
| CoAP | `: CoAP` on link | Constrained devices |
| HTTP/2 | `: HTTP/2` on link | Gateway-to-cloud |
| WebSocket | `: WS` on link | Real-time bidirectional |