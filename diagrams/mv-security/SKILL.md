---
name: mv-security
description: Create security architecture diagrams using PlantUML syntax with security-specific icons. Best for threat models, zero-trust architectures, IAM flows, encryption schemas, and compliance auditing.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "PlantUML", "security", "IAM", "compliance"]
    related_skills: ["mv-cloud", "mv-network"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-security")`. Output security diagrams as PlantUML code blocks.

# Security Architecture Diagram Generator

**Quick Start:** Map trust boundaries → Place security controls → Show data flows with encryption markers → Use security stencil icons → Wrap in ` ```plantuml ` fence.

## Security Stencil Icons

| Domain | Stencil Examples |
|--------|-----------------|
| IAM | `mxgraph.aws4.iam`, `mxgraph.azure2.active_directory`, `mxgraph.gcp2.cloud_iam` |
| Encryption | `mxgraph.aws4.kms`, `mxgraph.azure2.key_vault`, `mxgraph.gcp2.cloud_kms` |
| Network Security | `mxgraph.aws4.waf`, `mxgraph.aws4.shield`, `mxgraph.aws4.guardduty` |
| Compliance | `mxgraph.aws4.audit_manager`, `mxgraph.aws4.artifact` |
| Threat Detection | `mxgraph.aws4.detective`, `mxgraph.aws4.inspector` |

## Example: Zero-Trust Architecture

```plantuml
@startuml
skinparam defaultFontSize 11

actor "User" as u

rectangle "Identity Layer" #LightPink {
    mxgraph.aws4.iam "IAM" as iam
    mxgraph.aws4.cognito "Cognito" as cog
}

rectangle "Perimeter" #LightYellow {
    mxgraph.aws4.waf "WAF" as waf
    mxgraph.aws4.shield "Shield" as shield
    mxgraph.aws4.api_gateway "API GW" as api
}

rectangle "Compute" #LightGreen {
    mxgraph.aws4.lambda "Lambda" as fn
}

rectangle "Data" #LightBlue {
    mxgraph.aws4.kms "KMS" as kms
    mxgraph.aws4.dynamodb "DynamoDB" as db
}

u --> waf
waf --> api
api --> iam : auth
api --> fn : authorized
fn --> kms : decrypt
fn --> db : read/write
@enduml
```

## Security Diagram Patterns

| Pattern | Visual Convention |
|---------|------------------|
| Trust boundary | Dashed rectangle with color |
| Encrypted traffic | Label link with "TLS" or "🔒" |
| Authentication flow | Different line color (blue/orange) |
| Audit trail | Dotted line with "audit" label |
| Threat vector | Red dashed line |

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Too many controls | Group by layer, use separate diagrams |
| Unclear trust boundaries | Use distinct colors per zone |
| Forgot data classification | Label data stores with sensitivity level |