---
name: mv-archimate
description: Create ArchiMate enterprise architecture diagrams using PlantUML syntax. Best for business/application/technology layer modeling, capability mapping, and TOGAF-aligned enterprise architecture.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "PlantUML", "enterprise", "ArchiMate", "TOGAF"]
    related_skills: ["mv-uml", "mv-cloud", "mv-bpmn"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-archimate")`. Output ArchiMate diagrams as PlantUML code blocks.

# ArchiMate Enterprise Architecture

**Quick Start:** Identify TOGAF layer → Select ArchiMate elements → Define relationships → Apply motivation/strategy extensions → Wrap in ` ```plantuml ` fence.

## Core Layers

| Layer | Color | Elements |
|-------|-------|----------|
| Motivation | Purple | Stakeholder, Driver, Assessment, Goal, Principle, Requirement |
| Strategy | Gold | Capability, Resource, Course of Action |
| Business | Yellow | Business Actor, Role, Process, Function, Service, Product |
| Application | Blue | Application Component, Service, Interface, Data Object |
| Technology | Green | Node, Device, System Software, Network, Path |
| Physical | Brown | Equipment, Facility, Material |
| Implementation | Grey | Work Package, Deliverable, Plateau, Gap |

## Example: Layered View

```plantuml
@startuml
skinparam defaultFontSize 11
skinparam rectangleBackgroundColor #FEFECE

' Business Layer
rectangle "Business" #LightYellow {
    rectangle "Online\nSales" as bs1
    rectangle "Customer\nSupport" as bs2
}

' Application Layer
rectangle "Application" #LightBlue {
    rectangle "CRM\nSystem" as app1
    rectangle "ERP\nSystem" as app2
}

' Technology Layer
rectangle "Technology" #LightGreen {
    rectangle "Cloud\nInfrastructure" as tech1
    database "Database\nCluster" as tech2
}

bs1 ..> app1 : serves
bs2 ..> app1 : serves
bs2 ..> app2 : serves
app1 ..> tech1 : runs on
app2 ..> tech1 : runs on
app1 ..> tech2 : uses
app2 ..> tech2 : uses
@enduml
```

## Relationship Types

| Symbol | Meaning |
|--------|---------|
| `-->` | Composition |
| `..>` | Realization |
| `-->>` | Serving |
| `..>>` | Access |
| `->>` | Triggering |
| `..\|>` | Specialization |
| `--\|>` | Assignment |

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Mixed layers | Keep each layer in separate rectangle |
| Too many elements | Limit to 10-15 per diagram |