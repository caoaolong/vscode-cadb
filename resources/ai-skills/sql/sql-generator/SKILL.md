---
name: sql-generator
description: Use this skill to generate SQL queries from user intent and schema.
---

# sql-generator

## Overview

This skill converts natural language queries into valid SQL.

## Instructions

### 1. Understand Query Intent

- Identify filters, joins, aggregations

---

### 2. Generate SQL

- Use only provided schema
- Apply correct JOIN logic
- Use aggregation when needed

---

### 3. Apply Safety Defaults

- Add LIMIT when result size is unknown
- Avoid SELECT *

---

### 4. Output SQL

```json
{
  "sql": "SELECT ..."
}
```

## Rules

+ Do not hallucinate tables or columns
+ Do not execute SQL
+ Output only SQL