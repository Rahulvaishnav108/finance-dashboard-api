# Finance API - Run & Debug Status

## Completed ✅
- [x] Fixed database.js (real SQLite instead of stub)
- [x] Installed better-sqlite3 (Node v24 compatible)
- [x] Dependencies ready

## In Progress / Next Steps 📋
- [x] Run `cd finance-api; npm run seed` - Load demo users/data
- [x] Run `cd finance-api; node --inspect-brk src/server.js` - Debug mode (port 9229)
- [x] Test `http://localhost:3000/health` 
- [x] Login: POST /api/v1/auth/login with admin@finance.dev / Admin@1234


## Debug Notes
- Server runs on port 3000
- Debugger on 9229 (Chrome DevTools: chrome://inspect or VSCode attach)
- DB file: ./data/finance.db (created auto)

Updated automatically as steps complete.
