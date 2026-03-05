# StoryTime Tools

Internal productivity web app for the StoryTime Productions team.

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

## Contributing

All contributions must:

- Be linked to an existing GitHub issue
- Follow `<type>/<issue-number>-<description>` branch naming
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0-beta.4/) with a `Refs: #N` or `Closes: #N` footer
- Pass all three CI checks: `validate`, `quality`, `test`
