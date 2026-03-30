---
name: research-stack
description: Analyzes project tech stack, discovers relevant skills/MCPs from skills.sh, identifies deployment concerns, and produces a Stack Research Report
---

# Research Stack

Analyzes your project's tech stack, searches for relevant external skills and MCPs, identifies deployment concerns, and produces a structured report that feeds into `/create-unit-tasks` for better task descriptions.

Run this **once per project** before creating tasks for deployment, infrastructure, or performance units.

## Usage

```
/research-stack
/research-stack --deployment vercel
/research-stack --skip-search          # offline mode, local analysis only
```

## Arguments
- `--deployment <target>`: Override deployment target (vercel, docker, aws, fly, railway)
- `--skip-search`: Skip web search (offline mode — only local stack analysis)

---

## Execution Steps

### Step 1: Load Project Context

Read these files to understand the stack:

1. `symphony.config.json` — stack commands, deployment target, project name
2. `CLAUDE.md` — stack description, conventions, project structure
3. Root `package.json` (or `Cargo.toml`, `pyproject.toml`, `go.mod`) — exact dependency versions
4. Deployment configs if they exist:
   - `vercel.json` — Vercel configuration
   - `Dockerfile` / `docker-compose.yml` — Docker deployment
   - `fly.toml` — Fly.io
   - `netlify.toml` — Netlify
   - `serverless.yml` — AWS Serverless Framework
5. `tsconfig.json` / `next.config.*` / `vite.config.*` — build configuration
6. `.mcp.json` or `settings.local.json` — currently configured MCPs

If no deployment config exists, flag this as a critical concern.

### Step 2: Analyze Tech Stack

Parse dependencies and classify them:

```
| Category | Name | Version | Notes |
|----------|------|---------|-------|
| Framework | next | 15.1.0 | App Router, RSC |
| Runtime | node | >=20 | |
| ORM | prisma | 6.19.2 | Serverless needs pooling |
| Database | postgresql | - | Provider: Supabase |
| Bundler | turborepo | 2.3.0 | Monorepo |
| Testing (unit) | vitest | 2.1.0 | |
| Testing (e2e) | playwright | 1.49.0 | |
| UI | tailwind + shadcn | 3.4.0 | |
| API | trpc | 11.0.0 | Type-safe |
| Deployment | ? | - | NOT CONFIGURED |
```

Flag version-specific concerns:
- Next.js 15+ → App Router RSC hydration issues, Turbopack compatibility
- Prisma 6.x → Serverless connection pooling required (Accelerate or PgBouncer)
- Express 5.x → Breaking changes from Express 4
- React 19.x → Concurrent features, use() hook patterns

### Step 3: Search for External Skills

> Skip this step if `--skip-search` flag is set.

Use WebSearch to find relevant skills on skills.sh:

```
WebSearch("site:skills.sh {framework} best practices")
WebSearch("site:skills.sh {orm} optimization")
WebSearch("site:skills.sh {deployment-target} deployment")
WebSearch("site:skills.sh security owasp")
WebSearch("site:skills.sh {testing-framework} testing")
```

For each result, extract:
- **Name**: e.g., "vercel-react-best-practices"
- **Provider**: e.g., "vercel-labs/agent-skills"
- **Rule count**: e.g., 65
- **Categories**: e.g., ["bundle-size", "caching", "async-patterns"]
- **Relevance**: HIGH/MEDIUM/LOW based on stack match
- **Install command**: e.g., `npx skills add vercel-labs/agent-skills`

Also check these known high-quality skills:
- `vercel-labs/agent-skills` — React/Next.js best practices (65 rules)
- `prisma/skills` — Prisma ORM optimization
- `agamm/claude-code-owasp` — OWASP Top 10:2025 security

### Step 4: Evaluate Available MCPs

Check what's configured vs what's available:

| MCP | Purpose | Configured? | Recommended? |
|-----|---------|-------------|-------------|
| Linear | Task management | Check settings | Required |
| GitHub | PR & CI | Check settings | Required |
| Supabase | DB operations | Check settings | If using Supabase |
| Vercel | Deployment mgmt | Check settings | If deploying to Vercel |
| Playwright | E2E browser | Check settings | If using Playwright |
| Context7 | Library docs | Check settings | Recommended |

For unconfigured but recommended MCPs, provide setup instructions.

### Step 5: Identify Deployment Concerns

Based on the deployment target, enumerate known pitfalls:

#### Vercel
| ID | Concern | Severity | Description |
|----|---------|----------|-------------|
| DC-001 | Cold starts | HIGH | Serverless functions have cold start latency. Use edge runtime where possible. |
| DC-002 | Bundle size | HIGH | Functions >50MB fail. Minimize dependencies, use tree shaking. |
| DC-003 | Serverless timeout | MEDIUM | Default 10s (hobby), 60s (pro). Long DB queries fail silently. |
| DC-004 | Prisma connection pooling | HIGH | Each serverless invocation opens a new connection. Use Accelerate or PgBouncer. |
| DC-005 | ISR configuration | MEDIUM | Static pages need revalidation strategy. |
| DC-006 | Environment variables | LOW | Must be configured in Vercel dashboard, not .env files. |

#### Docker
| ID | Concern | Severity | Description |
|----|---------|----------|-------------|
| DC-001 | Multi-stage build | HIGH | Reduce image size with build/runtime separation. |
| DC-002 | Health checks | HIGH | Container orchestrators need /health endpoints. |
| DC-003 | Graceful shutdown | MEDIUM | Handle SIGTERM for zero-downtime deploys. |
| DC-004 | Secrets management | HIGH | Never bake secrets into images. Use runtime env vars. |

Cross-reference each concern with installed skills:
- If a skill addresses the concern → mark as "covered"
- If no skill addresses it → mark as "manual action required"

### Step 6: Produce Stack Research Report

Write two files:

**`docs/stack-research-report.json`** (machine-readable):
```json
{
  "version": 1,
  "generated_at": "ISO-8601",
  "project": "project-name",
  "stack": {
    "framework": { "name": "next", "version": "15.1.0", "features": ["app-router", "rsc"] },
    "runtime": { "name": "node", "version": ">=20" },
    "orm": { "name": "prisma", "version": "6.19.2" },
    "database": { "name": "postgresql", "provider": "supabase" },
    "bundler": { "name": "turborepo", "version": "2.3.0" },
    "testing": { "unit": "vitest", "e2e": "playwright" },
    "ui": { "css": "tailwind", "components": "shadcn" },
    "deployment_target": "vercel"
  },
  "recommended_skills": [
    {
      "name": "vercel-react-best-practices",
      "provider": "vercel-labs/agent-skills",
      "rule_count": 65,
      "categories": ["async-patterns", "bundle-size", "caching"],
      "relevance": "high",
      "addresses_concerns": ["DC-001", "DC-002"],
      "install_cmd": "npx skills add vercel-labs/agent-skills",
      "installed": false
    }
  ],
  "recommended_mcps": [
    {
      "name": "Vercel MCP",
      "provider": "vercel",
      "purpose": "deployment-management",
      "configured": false,
      "install_instructions": "See https://vercel.com/docs/agent-resources/vercel-mcp"
    }
  ],
  "deployment_concerns": [
    {
      "id": "DC-001",
      "category": "performance",
      "title": "Serverless cold starts",
      "severity": "high",
      "description": "Each function invocation may cold-start. Use edge runtime for latency-sensitive routes.",
      "addressed_by_skill": "vercel-react-best-practices",
      "manual_action_required": null
    }
  ],
  "skill_installation_status": {
    "verified": [],
    "pending": ["vercel-react-best-practices", "prisma/skills"]
  }
}
```

**`docs/stack-research-report.md`** (human-readable):
```markdown
# Stack Research Report — {project-name}
*Generated: {date} | Stack: {framework} {version} | Target: {deployment}*

## Stack Profile
| Category | Technology | Version |
|----------|-----------|---------|
| Framework | Next.js | 15.1.0 |
...

## Recommended Skills
| Skill | Provider | Rules | Relevance | Install |
|-------|----------|-------|-----------|---------|
| vercel-react-best-practices | vercel-labs | 65 | HIGH | `npx skills add vercel-labs/agent-skills` |
...

## Recommended MCPs
| MCP | Purpose | Status |
|-----|---------|--------|
| Vercel MCP | Deployment | Not configured |
...

## Deployment Concerns
| # | Concern | Severity | Covered By |
|---|---------|----------|-----------|
| DC-001 | Cold starts | HIGH | vercel-react-best-practices |
| DC-004 | Prisma pooling | HIGH | Manual action required |
...

## Next Steps
1. Install skills: `npx skills add vercel-labs/agent-skills && npx skills add prisma/skills`
2. Configure Vercel MCP: [instructions]
3. Address manual concerns: DC-004 (Prisma pooling)
4. Run: `/create-unit-tasks` — report will be auto-consumed
```

### Step 7: Summary Output

Present the report summary in chat:

```
## Stack Research Complete — {project}

Stack: {framework} {version} + {orm} + {db} → {deployment}
Skills found: {N} recommended ({M} high relevance)
MCPs: {configured}/{total} configured
Concerns: {N} total ({H} high, {M} medium, {L} low)

Report saved to: docs/stack-research-report.json
Next: install recommended skills, then /create-unit-tasks
```

---

## Degradation

- **No WebSearch**: Skip Steps 3-4, produce partial report with local analysis only
- **No package.json**: Ask user for stack details manually
- **No deployment target**: Flag as critical concern, list concerns for all common targets
