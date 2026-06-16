---
name: mv-bpmn
description: Create business process diagrams using PlantUML syntax with BPMN stencils. Best for workflow automation, enterprise integration patterns (EIP), Lean value stream mapping, and business process analysis.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "PlantUML", "BPMN", "workflow", "business-process"]
    related_skills: ["mv-uml", "mv-archimate"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-bpmn")`. Output BPMN diagrams as PlantUML code blocks.

# BPMN Diagram Generator

**Quick Start:** Map process flow → Identify participants and lanes → Place BPMN elements (task, gateway, event) → Connect with sequence flows → Wrap in ` ```plantuml ` fence.

## BPMN Element Types

| Element | Syntax | Purpose |
|---------|--------|---------|
| Task | `:Task Name;` | Unit of work |
| User Task | `:User Task;` with `<<user>>` stereotype | Human interaction |
| Service Task | `:Service Task;` with `<<service>>` stereotype | Automated service |
| Exclusive Gateway | `if (condition?) then (yes)` | XOR decision |
| Parallel Gateway | `fork` / `fork again` / `end fork` | AND split/join |
| Start Event | `start` | Process trigger |
| End Event | `end` / `stop` | Process completion |
| Timer Event | `@startuml` with timer shapes | Scheduled/delayed |
| Message Event | Message envelope shapes | Message-based flow |

## Example: Order Processing

```plantuml
@startuml
|Customer|
start
:Place Order;

|System|
if (Payment Valid?) then (yes)
  :Reserve Inventory;
  fork
    :Send Confirmation;
  fork again
    :Trigger Fulfillment;
  end fork
else (no)
  :Notify Failure;
  stop
endif

|Fulfillment|
:Pick Items;
:Pack Order;
:Ship Order;

|Customer|
:Receive Order;
stop
@enduml
```

## Enterprise Integration Patterns (EIP)

Use `mxgraph.eip.*` stencils:
- `mxgraph.eip.message_channel` — Message Channel
- `mxgraph.eip.message_router` — Content-Based Router
- `mxgraph.eip.message_translator` — Message Translator
- `mxgraph.eip.aggregator` — Aggregator
- `mxgraph.eip.splitter` — Splitter

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Missing gateway merge | Always close splits with matching join |
| Swimlane confusion | Keep roles consistent across diagram |
| Over-nested gateways | Flatten to max 2 levels |