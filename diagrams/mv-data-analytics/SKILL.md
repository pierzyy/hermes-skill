---
name: mv-data-analytics
description: Create data pipeline and analytics architecture diagrams using PlantUML syntax with data-specific mxgraph icons. Best for ETL/ELT pipelines, data warehouses, lakehouse architectures, and ML workflows.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "PlantUML", "data", "ETL", "pipeline"]
    related_skills: ["mv-vega", "mv-infographic"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-data-analytics")`. Output data pipeline diagrams as PlantUML code blocks.

# Data Analytics Pipeline Diagram Generator

**Quick Start:** Map data flow (source → ingest → transform → serve → consume) → Use data-specific stencils → Label throughput/latency → Wrap in ` ```plantuml ` fence.

## Data Architecture Stencils

| Component | Stencil | Provider |
|-----------|---------|----------|
| Data Source | `mxgraph.aws4.database` | AWS |
| Streaming | `mxgraph.aws4.kinesis` | AWS |
| ETL Job | `mxgraph.aws4.glue` | AWS |
| Data Lake | `mxgraph.aws4.s3` | AWS |
| Data Warehouse | `mxgraph.aws4.redshift` | AWS |
| Orchestration | `mxgraph.aws4.step_functions` | AWS |
| ML Model | `mxgraph.aws4.sagemaker` | AWS |
| Dashboard | `mxgraph.aws4.quicksight` | AWS |
| Kafka | `mxgraph.apache.kafka` | Apache |
| Spark | `mxgraph.apache.spark` | Apache |
| Flink | `mxgraph.apache.flink` | Apache |

## Example: Modern Data Lakehouse

```plantuml
@startuml
skinparam defaultFontSize 11

rectangle "Sources" #LightYellow {
    mxgraph.aws4.database "OLTP\nDB" as source1
    mxgraph.aws4.kinesis "Click\nStream" as source2
    mxgraph.aws4.s3 "File\nIngest" as source3
}

rectangle "Ingest" #LightBlue {
    mxgraph.aws4.kinesis_data_firehose "Firehose" as ingest1
    mxgraph.aws4.glue "Glue\nCrawler" as ingest2
}

rectangle "Storage" #LightGreen {
    mxgraph.aws4.s3 "Data Lake\nS3" as lake
}

rectangle "Transform" #LightPink {
    mxgraph.aws4.glue "Glue\nETL" as etl
    mxgraph.aws4.emr "EMR\nSpark" as spark
}

rectangle "Serve" #Lavender {
    mxgraph.aws4.redshift "Redshift\nDW" as dw
    mxgraph.aws4.athena "Athena" as query
    mxgraph.aws4.sagemaker "SageMaker" as ml
}

source1 --> ingest2
source2 --> ingest1
source3 --> ingest2
ingest1 --> lake
ingest2 --> lake
lake --> etl
lake --> spark
etl --> dw
spark --> dw
dw --> query
dw --> ml
@enduml
```

## Layer Color Convention

| Layer | Color | Hex |
|-------|-------|-----|
| Sources | Yellow | #LightYellow |
| Ingest | Blue | #LightBlue |
| Storage | Green | #LightGreen |
| Transform | Pink | #LightPink |
| Serve | Purple | #Lavender |
| Consume | Orange | #LightSalmon |