# MCP Health Gate (NON-NEGOTIABLE)

## Verify before ANY pipeline execution
Before starting any unit pipeline (`/start-unit`), verify ALL required MCP servers:
1. **Linear** (or your tracker): make a simple list query
2. **GitHub**: list pull requests
3. **Supabase** (if used): list tables

## If ANY MCP fails: ABORT immediately
- Report which MCP is down with the error message
- Do NOT proceed with partial MCP availability
- Do NOT fall back to CLI alternatives (e.g., `gh` instead of MCP)

## Why
The pipeline once started with a tracker MCP unavailable. All work completed without any state updates, making project tracking impossible. The cost of checking MCP health is trivial; the cost of running blind is severe.
