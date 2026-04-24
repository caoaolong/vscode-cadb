---
name: sql-executor
description: Use this skill to execute SQL queries and return results.
---

# sql-executor

## Overview

This skill executes SQL against the database and returns results.

## Instructions

### 1. Execute SQL

- Run SQL exactly as provided

---

### 2. Handle Result

- Return rows
- Count result size

---

### 3. Handle Errors

- Capture error message

---

### 4. Output Result

+ Success:

```json
{
  "success": true,
  "rows": [...],
  "row_count": 10
}
```

+ Failure:

```json
{
  "success": false,
  "error": "..."
}
```

## Rules

+ Do not modify SQL
+ Do not interpret data
