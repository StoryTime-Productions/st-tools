# StoryTime Tools

Internal productivity web app for the StoryTime Productions team.

> See [FEATURE_SET.md](./FEATURE_SET.md) for the full feature specification and tech stack rationale.

## Stack

| Layer                      | Technology                           |
| -------------------------- | ------------------------------------ |
| Framework                  | Next.js 16 (App Router) + TypeScript |
| Styling                    | Tailwind CSS + shadcn/ui             |
| Database / Auth / Realtime | Supabase (PostgreSQL)                |
| ORM                        | Prisma                               |
| Rich text editor           | TipTap                               |
| Drag & drop                | dnd-kit                              |
| Calendar                   | FullCalendar                         |
| Server state               | TanStack Query                       |
| Client state               | Zustand                              |
| Deployment                 | Vercel                               |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- A [Supabase](https://supabase.com) project

### Setup

```bash
# 1. Clone and install
git clone https://github.com/StoryTime-Productions/st-tools.git
cd st-tools
pnpm install

# 2. Set up environment
cp .env.example .env
# Fill in your Supabase credentials in .env

# 3. Generate Prisma client and push schema
pnpm db:generate
pnpm db:push

# 4. Run development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command             | Description            |
| ------------------- | ---------------------- |
| `pnpm dev`          | Start dev server       |
| `pnpm build`        | Production build       |
| `pnpm lint`         | ESLint (zero warnings) |
| `pnpm format`       | Prettier write         |
| `pnpm format:check` | Prettier check         |
| `pnpm typecheck`    | TypeScript type check  |
| `pnpm test`         | Vitest watch mode      |
| `pnpm test:ci`      | Vitest run + coverage  |
| `pnpm db:migrate`   | Run Prisma migrations  |
| `pnpm db:studio`    | Open Prisma Studio     |

## Deployment Environments

Two separate Supabase projects are used to isolate production from preview:

| Environment    | Trigger                     | Database                    |
| -------------- | --------------------------- | --------------------------- |
| **Production** | Push to `master`/`main`     | Production Supabase project |
| **Preview**    | Pull request opened/updated | Preview Supabase project    |

Migrations run automatically via GitHub Actions before each deploy.

### Required external setup

1. Create two Supabase projects — one for production, one for preview.
2. Add production credentials as Vercel **Production** environment variables and as GitHub Actions secrets (`DATABASE_URL`, `DIRECT_URL`).
3. Add preview credentials as Vercel **Preview** environment variables and as GitHub Actions secrets (`PREVIEW_DATABASE_URL`, `PREVIEW_DIRECT_URL`).
4. Add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub Actions secrets.
5. Add allowed redirect URLs for each Supabase project (production URL and Vercel preview URL pattern).

## Contributing

See [FEATURE_SET.md](./FEATURE_SET.md) for branch naming, commit format, and quality gate requirements.

All contributions must:

- Be linked to an existing GitHub issue
- Follow `<type>/<issue-number>-<description>` branch naming
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.4/) with a `Refs: #N` or `Closes: #N` footer
- Pass all three CI checks: `validate`, `quality`, `test`
