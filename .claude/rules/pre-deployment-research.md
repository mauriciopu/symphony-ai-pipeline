# Pre-Deployment Stack Research (RECOMMENDED)

## Run /research-stack before creating deployment tasks
Before provisioning tasks for units that involve deployment, infrastructure, or performance optimization, run `/research-stack` to:
1. Analyze the project's tech stack and identify deployment concerns
2. Search for relevant external skills (from skills.sh) and MCPs
3. Produce a Stack Research Report that enriches downstream task descriptions

## When to run
- **First time**: Before the first `/create-unit-tasks` call for the project
- **Stack changes**: When major dependencies change (framework upgrade, new ORM, deployment target change)
- **New deployment target**: When deploying to a new platform (Vercel, Docker, AWS, etc.)

## How the report is consumed
- `/create-unit-tasks` reads `docs/stack-research-report.json` and adds a "Stack Best Practices" section to each task description with relevant deployment concerns and skill rules
- The coordinator reads high-severity concerns and includes them in coder agent prompts
- The report JSON serves as an audit trail of what was researched

## This is NOT a hard gate
Unlike `aidlc-linear-gate.md`, this rule is advisory:
- The pipeline functions normally without the research report
- `/create-unit-tasks` gracefully skips the "Stack Best Practices" section if no report exists
- The coordinator's Phase 0.5 is a no-op without the report

## Why
On the Montpark PMS project, several deployment issues could have been prevented with upfront research:
- Prisma on serverless without connection pooling caused connection exhaustion
- No deployment configuration existed (no vercel.json) until late in the project
- External skills with 65+ best-practice rules were available but not discovered
- MCPs for deployment management were not configured

The cost of running `/research-stack` once is trivial; the cost of discovering deployment issues during E2E testing is significant.
