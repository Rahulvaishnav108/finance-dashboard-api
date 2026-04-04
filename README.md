# Finance Dashboard API 🚀

Hey! This is my take on a solid finance tracking backend. Built it over a weekend because I needed something robust for personal finance + sharing with team. Uses Node/Express/SQLite - zero deps hassle, runs anywhere.

## What's Inside
- JWT auth with refresh tokens (no session BS)
- RBAC: viewer/analyst/admin roles with granular perms
- Financial records CRUD (income/expense, categories, tags, soft delete)
- Dashboard analytics (summary, trends, insights)
- Audit trail for everything
- Pagination, filtering, sorting on records
- Rate limiting, helmet, all the security basics
- JSON logging, request tracing

## Quick Start 
```bash
cd finance-api
npm i
npm run seed  # demo data + users
npm run dev   # http://localhost:3000
```

Test health: `curl localhost:3000/health`

Login as admin:
```bash
curl -X POST localhost:3000/api/v1/auth/login \\
  -d '{\"email\":\"admin@finance.dev\",\"password\":\"Admin@1234\"}'
```

Users:
- admin@finance.dev:Admin@1234 (full access)
- analyst@finance.dev:Analyst@1234 
- viewer@finance.dev:Viewer@1234

## Key Endpoints
**Auth:** `/api/v1/auth/login`, `/me`, `/refresh`, `/logout`
**Records:** `/api/v1/records` (GET w/ filters: ?type=income&date_from=2024-01-01&page=1)
**Dashboard:** `/api/v1/dashboard/summary` (income/expense totals)
**Users/Categories/Audit:** admin only

All return `{success: true, data: {...}}` or `{success: false, errors: [...]}`

Filters rock: amount_min/max, search, sort_by=amount desc, etc.

## Folder Layout
```
src/
├── server.js     # entry point
├── app.js        # express setup
├── config/       # db, perms, env
├── middleware/   # auth, validate, etc
├── services/     # business logic (tests depend on these)
├── controllers/  # thin
├── routes/       # /api/v1/*
└── utils/        # logger, seed, etc
tests/            # full coverage
```

## Tech Notes
- **SQLite** cuz simple, fast enough (WAL mode, indexes). Swap to PG easy.
- **better-sqlite3** sync - no async hell.
- **Permissions matrix** in config/permissions.js - change once, works everywhere.
- **Soft delete** records (finance history sacred).
- **JWT refresh rotation** - secure logout/multi-device.
- Tests: npm test (in-memory DB, 100% coverage basically)

## Dev Commands
```bash
npm run dev     # watch mode
npm start       # prod
npm run seed    # demo data
npm test        # all tests
npm run db:reset # wipe DB
```

## .env (optional, defaults ok)
```
PORT=3000
JWT_SECRET=your-super-secret-key
DB_PATH=./data/finance.db
```

## Why This Way?
Wanted production-ready without Docker/K8s overkill. SQLite perfect for dashboard (not high TPS). RBAC matrix beats role if-statements. Audit logs append-only for compliance.

Hit issues? Logs are JSON, DB in ./data/finance.db. 

Enjoy! 🚀
