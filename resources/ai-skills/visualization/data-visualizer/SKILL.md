---
name: data-visualizer
description: Use this skill to convert data into visualization-ready format.
---

# data-visualizer

## Overview

This skill converts data into chart configurations.

## Instructions

### 1. Select Chart Type

- line: trends
- bar: comparisons
- pie: proportions

---

### 2. Map Data Fields

- choose x-axis
- choose y-axis

---

### 3. Output Visualization

```json
{
  "chart_type": "...",
  "x": "...",
  "y": "...",
  "data": [...]
}
```

## Rules

+ Do not analyze data
+ Do not render charts