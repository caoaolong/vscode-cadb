---
name: sql-validator
description: Use this skill to validate SQL for safety and optimize performance before execution.
---

# sql-validator

## Overview

This skill ensures SQL is safe and efficient.

## Instructions

### 1. Perform Safety Check

Detect:

- DELETE without WHERE
- DROP statements
- risky UPDATE

---

### 2. Perform Performance Check

Detect:

- full table scans
- missing LIMIT
- inefficient joins

---

### 3. Optimize SQL

- Add LIMIT if missing
- Rewrite inefficient queries if needed

---

### 4. Output Result

```json
{
  "safe": true,
  "optimized_sql": "...",
  "issues": []
}
```

## Rules

+ Never change query meaning
+ Always return SQL
