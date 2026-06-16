---
name: mv-cloud
description: Create cloud provider architecture diagrams using PlantUML syntax with provider-specific stencil icons. Best for cloud infrastructure design — AWS, Azure, GCP, Alibaba, IBM, OpenStack, and Kubernetes architectures.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "PlantUML", "AWS", "Azure", "GCP", "cloud"]
    related_skills: ["mv-network", "mv-security", "mv-iot", "mv-uml"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-cloud")`. Output cloud architecture diagrams as PlantUML code blocks.

# Cloud Architecture Diagram Generator

**Quick Start:** Select provider (AWS/Azure/GCP/etc.) → Identify core services → Use `mxgraph.<provider>.<service>` stencil syntax → Connect components → Wrap in ` ```plantuml ` fence.

## Provider Stencil Namespaces

| Provider | Namespace | Icon Count |
|----------|-----------|------------|
| AWS | `mxgraph.aws4.*` | 500+ |
| Azure | `mxgraph.azure2.*` | 400+ |
| GCP | `mxgraph.gcp2.*` | 300+ |
| Kubernetes | `mxgraph.kubernetes.*` | 50+ |
| Alibaba Cloud | `mxgraph.alibaba_cloud.*` | 200+ |
| IBM Cloud | `mxgraph.ibm.*` | 100+ |
| OpenStack | `mxgraph.openstack.*` | 50+ |

## Icon Naming Convention

Use lowercase with underscores:
```
aws4.ec2               → EC2 instance
aws4.lambda            → Lambda function
aws4.api_gateway       → API Gateway
aws4.dynamodb          → DynamoDB
aws4.s3                → S3 bucket
aws4.rds               → RDS database
azure2.virtual_machines → Azure VM
gcp2.cloud_functions   → Cloud Functions
kubernetes.pod         → K8s Pod
kubernetes.svc         → K8s Service
```

## Example: Serverless Web App on AWS

```plantuml
@startuml
skinparam defaultFontSize 12

mxgraph.aws4.route53 "Route 53" as dns
mxgraph.aws4.cloudfront "CloudFront" as cdn
mxgraph.aws4.api_gateway "API Gateway" as api
mxgraph.aws4.lambda "Lambda" as fn
mxgraph.aws4.dynamodb "DynamoDB" as db
mxgraph.aws4.s3 "S3\nStatic Assets" as s3

dns --> cdn
cdn --> s3
cdn --> api
api --> fn
fn --> db
@enduml
```

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Icon not rendering | Check exact name with underscores |
| Poor layout | Use `left to right direction` or `top to bottom direction` |
| Text wrapping | Use `\n` for line breaks in labels |
| Missing arrows | Define all connections explicitly |