# Sukh Sagar MIS & Operations System

A role-aware textile operations dashboard for production, inventory, sales, orders, purchases, quality control, MIS reports, audit history, and CSV import/export.

## Local Demo

Requires Node.js 20 or newer.

```sh
npm install
npm start
```

Open `http://127.0.0.1:3000`. Express serves the MIS UI and API. SQLite stores user accounts and shared MIS state in `data/finance.db`, generated on first startup and excluded from Git.

| Username | Password | Role |
| --- | --- | --- |
| admin | admin123 | Admin |
| management | manage123 | Management |
| mis | mis123 | MIS Executive |
| production | prod123 | Production |
| finance | finance123 | Finance |
| sales | sales123 | Sales |
| store | store123 | Store |

## API

The upstream finance API contributes JWT access/refresh authentication, RBAC, financial records, categories, analytics, and audit routes. MIS shared-state persistence is at `/api/mis/state` and requires a bearer token.

```sh
npm test
```

The test suite covers auth, finance API routes, and MIS persistence/authorization.

## GitHub Pages Demo

The Actions workflow publishes the standalone HTML at the repository's Pages URL. Pages cannot run Node.js or SQLite, so this public demo uses the in-browser demo accounts and browser-local storage; data is isolated to each browser. Use the local Node server for shared SQLite-backed data.
