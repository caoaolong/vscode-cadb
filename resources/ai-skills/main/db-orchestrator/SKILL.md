---
name: db-orchestrator
description: Use this skill for handling user database requests by generating an execution plan and routing tasks to appropriate agents.
---

# db-orchestrator

## Overview

This skill determines user intent and generates a structured execution plan using available database agents.

## Instructions

### 1. Analyze User Intent

Classify the request into one of:

- query (read data)
- write (insert/update/delete)
- analysis (insight/trend)
- schema (database structure)

---

### 2. Build Execution Plan

Construct a minimal and correct sequence of steps.

Available agents:

- SchemaAgent
- SQLAgent
- SQLValidatorAgent
- ExecutionAgent
- DataAnalysisAgent
- VisualizationAgent
- RepairAgent

---

### 3. Apply Planning Rules

- Include SchemaAgent if schema is required
- Always include SQLValidatorAgent before ExecutionAgent
- Include DataAnalysisAgent only for insights
- Include VisualizationAgent only if visualization is requested

---

### 4. Output Plan

Return a structured JSON plan:

```json
{
  "intent": "...",
  "plan": [
    {
      "step": 1,
      "agent": "...",
      "input": {}
    }
  ]
}