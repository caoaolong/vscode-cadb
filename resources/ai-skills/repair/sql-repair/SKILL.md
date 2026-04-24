---
name: sql-repair
description: Use this skill to fix SQL errors based on execution feedback.
---

# sql-repair

## Overview

This skill fixes SQL errors while preserving original intent.

## Instructions

### 1. Analyze Error

- Parse database error message

---

### 2. Identify Root Cause

- syntax error
- missing column
- wrong table
- invalid join

---

### 3. Fix SQL

- Apply minimal changes
- Preserve intent

---

### 4. Output Fixed SQL

```json
{
  "fixed_sql": "..."
}
```

## Rules

+ Do not rewrite entire query unless necessary
+ Do not invent schema