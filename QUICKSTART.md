# Claude Team — Quick Reference Card

## How to Start a Session

Just describe what you need. The orchestrator figures out the rest.

### Example Prompts

**Features:**
```
"I need to add user authentication to my app"
"Build a dashboard that shows sales metrics"
"Add a payment flow with Stripe"
"Create a REST API for managing blog posts"
```

**Bug Fixes:**
```
"Users are getting a 500 error when they try to log in"
"The search results are returning duplicates"
"Password reset emails aren't being sent"
"The page crashes when the cart is empty"
```

**Database:**
```
"Design the schema for a multi-tenant SaaS app"
"My user query is taking 3 seconds, help me optimize"
"I need to add a comments feature — what tables do I need?"
"Help me write a migration to add soft deletes"
```

**Design:**
```
"Design the user flow for our onboarding experience"
"I need a color scheme and typography for my app"
"Wireframe the settings page"
"Review this page for usability issues"
```

**Security:**
```
"Review my auth implementation for vulnerabilities"
"Do a security audit of this codebase"
"Help me set up rate limiting and input validation"
"What compliance requirements do I need for handling health data?"
```

**DevOps:**
```
"Set up a CI/CD pipeline with GitHub Actions"
"Dockerize this application"
"Help me configure staging and production environments"
"Add security scanning to my pipeline"
```

**Marketing:**
```
"Write a launch blog post for our new feature"
"Create an email sequence for new signups"
"Help me optimize this landing page for conversions"
"Build a content calendar for the next month"
```

**Planning:**
```
"Let's plan the next sprint"
"Break this epic into manageable stories"
"Create a project charter for our new product"
"What should we prioritize — here's our backlog..."
```

---

## Quick Commands During a Session

| Say this... | To do this... |
|---|---|
| "simpler" | Switch to a less complex approach |
| "skip this" | Move to the next task/batch |
| "go back" | Revisit a previous decision |
| "what's the plan?" | See the current batch/task list |
| "option A/B/C" | Pick from presented options |
| "ship it" | Move to deployment |
| "test this" | Run tests on current work |
| "secure this" | Run security review |
| "good, next" | Approve current task, move on |
| "stop" | Pause and discuss |
| "YAGNI" | Remind to keep it simple |
| "status report" | Generate project status with KPIs |
| "what did we do?" | Show activity log |
| "what's broken?" | Show open issues/blockers |
| "what did we decide?" | Show decision log |
| "what changed?" | Show plan corrections |
| "retro" | Generate retrospective from logs |
| "KPIs" | Show project metrics |

---

## Team Roster (23 specialists)

| # | Specialist | One-liner |
|---|---|---|
| 1 | Orchestrator | Routes your request to the right specialist |
| 2 | Project Manager | Scope, timeline, risk, charter |
| 3 | Scrum Master | Sprints, stories, backlog, ceremonies |
| 4 | Tech Lead | Architecture decisions, code standards |
| 5 | System Designer | Topology, NFRs, scalability, capacity planning |
| 6 | Software Architect | Clean/hexagonal/DDD, design patterns, module boundaries |
| 7 | Security Engineer | Threat models, auth design, compliance |
| 8 | DBA | Schema, queries, migrations, indexes |
| 9 | UX Designer | User flows, wireframes, usability |
| 10 | UI Designer | Colors, typography, design tokens, anti-slop aesthetic |
| 11 | Motion Designer | Animation, transitions, scroll choreography, promo video, generative backgrounds |
| 12 | Design Loop | One-shot design quality via independent fresh-context critics |
| 13 | Backend Dev | APIs, services, server logic |
| 14 | Frontend Dev | Components, state, accessibility |
| 15 | Tester | Unit/integration/e2e tests, QA |
| 16 | Test Architect | Test strategy, ATDD, adversarial review, edge cases |
| 17 | Deployment | Release, rollback, environments |
| 18 | DevOps/DevSecOps | CI/CD, Docker, K8s, infra, scanning |
| 19 | Creative Intelligence | Brainstorming, design thinking, storytelling, innovation |
| 20 | Digital Marketer | SEO, campaigns, funnels, analytics |
| 21 | Copywriter | Headlines, CTAs, email copy, UX writing |
| 22 | Content Marketer | Blog posts, social media, content strategy |
| 23 | Project Monitor | Activity logs, KPIs, status reports, retrospectives |

---

## Workflow Shortcuts

| Workflow | Trigger phrases |
|---|---|
| 🐛 Bug Fix | "bug", "error", "broken", "crash", "not working" |
| ✨ New Feature | "add", "build", "create", "implement", "new feature" |
| 📝 Documentation | "document", "README", "API docs", "write docs" |
| 🚀 New Project | "new project", "start from scratch", "scaffold" |
| 📢 Marketing | "launch", "announce", "promote", "blog post" |
| 🔒 Security Audit | "audit", "security review", "vulnerabilities" |
| 🔄 Refactor | "refactor", "clean up", "tech debt", "improve" |
| 🎨 UX/UI Design | "design", "wireframe", "user flow", "look and feel" |
| 🗄️ Database | "schema", "migration", "slow query", "database" |
| 🔐 Security Review | "threat model", "auth design", "compliance" |
