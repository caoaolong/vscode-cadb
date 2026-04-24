---
name: db-schema-expert
description: Use this skill for retrieving database schema and mapping user queries to relevant tables and fields.
---

# db-schema-expert

## Overview

This skill provides structured database schema and semantic mappings.

## Instructions

### 1. Identify Relevant Tables

- Parse user query
- Select only relevant tables

---

### 2. Extract Schema Information

For each table:

- table name
- column names
- data types
- semantic descriptions

---

### 3. Identify Relationships

- Detect foreign keys
- Infer joins

---

### 4. Output Schema

```json
{
  "tables": [...],
  "relationships": [...],
  "relevant_tables": [...]
}
```

## Rules

+ Do not guess schema
+ Do not include irrelevant tables