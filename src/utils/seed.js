'use strict';

/**
 * Seed script — populates the database with demo users, categories, and records.
 * Run: node src/utils/seed.js
 * Reset first: node src/utils/resetDb.js
 */

const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');

// Bootstrap env
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const { getDb, closeDb } = require('../config/database');
const config = require('../config');

const SALT_ROUNDS = 12;

async function seed() {
  const db = getDb();
  console.log('🌱 Starting seed…\n');

  // ─── Users ────────────────────────────────────────────────────────────────
  const users = [
    { id: uuidv4(), email: 'admin@finance.dev',   full_name: 'Alice Admin',    role: 'admin',   password: 'Admin@1234' },
    { id: uuidv4(), email: 'analyst@finance.dev', full_name: 'Bob Analyst',    role: 'analyst', password: 'Analyst@1234' },
    { id: uuidv4(), email: 'viewer@finance.dev',  full_name: 'Carol Viewer',   role: 'viewer',  password: 'Viewer@1234' },
    { id: uuidv4(), email: 'analyst2@finance.dev',full_name: 'David Analyst',  role: 'analyst', password: 'Analyst@5678' },
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, password_hash, full_name, role)
    VALUES (@id, @email, @password_hash, @full_name, @role)
  `);

  for (const u of users) {
    const password_hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    insertUser.run({ id: u.id, email: u.email, password_hash, full_name: u.full_name, role: u.role });
    console.log(`  ✓ User: ${u.email} / ${u.password} [${u.role}]`);
  }

  // ─── Categories ───────────────────────────────────────────────────────────
  const adminId = users[0].id;
  const categories = [
    { id: uuidv4(), name: 'Salary',          type: 'income',  color: '#22C55E', icon: 'briefcase' },
    { id: uuidv4(), name: 'Freelance',        type: 'income',  color: '#10B981', icon: 'laptop' },
    { id: uuidv4(), name: 'Investment',       type: 'income',  color: '#06B6D4', icon: 'trending-up' },
    { id: uuidv4(), name: 'Rent',             type: 'expense', color: '#EF4444', icon: 'home' },
    { id: uuidv4(), name: 'Groceries',        type: 'expense', color: '#F97316', icon: 'shopping-cart' },
    { id: uuidv4(), name: 'Utilities',        type: 'expense', color: '#F59E0B', icon: 'zap' },
    { id: uuidv4(), name: 'Transport',        type: 'expense', color: '#8B5CF6', icon: 'truck' },
    { id: uuidv4(), name: 'Entertainment',   type: 'expense', color: '#EC4899', icon: 'film' },
    { id: uuidv4(), name: 'Healthcare',       type: 'expense', color: '#14B8A6', icon: 'heart' },
    { id: uuidv4(), name: 'Education',        type: 'expense', color: '#6366F1', icon: 'book' },
    { id: uuidv4(), name: 'Miscellaneous',    type: 'both',    color: '#94A3B8', icon: 'more-horizontal' },
  ];

  const insertCat = db.prepare(`
    INSERT OR IGNORE INTO categories (id, name, type, color, icon, created_by)
    VALUES (@id, @name, @type, @color, @icon, @created_by)
  `);

  for (const c of categories) {
    insertCat.run({ ...c, created_by: adminId });
  }
  console.log(`\n  ✓ ${categories.length} categories seeded`);

  // ─── Financial Records ────────────────────────────────────────────────────
  const catMap  = Object.fromEntries(categories.map(c => [c.name, c.id]));
  const analystId = users[1].id;

  // Generate 12 months of realistic data
  const records = [];
  const now = new Date();

  for (let m = 11; m >= 0; m--) {
    const month = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const yr    = month.getFullYear();
    const mo    = String(month.getMonth() + 1).padStart(2, '0');

    // Monthly salary (1st)
    records.push({ amount: 85000, type: 'income',  category_id: catMap['Salary'],        date: `${yr}-${mo}-01`, description: `Monthly salary – ${yr}-${mo}`,      created_by: analystId });
    // Rent (2nd)
    records.push({ amount: 22000, type: 'expense', category_id: catMap['Rent'],          date: `${yr}-${mo}-02`, description: 'Monthly rent',                       created_by: analystId });
    // Groceries (multiple)
    records.push({ amount: 4200,  type: 'expense', category_id: catMap['Groceries'],     date: `${yr}-${mo}-05`, description: 'Weekly grocery run',                  created_by: analystId });
    records.push({ amount: 3800,  type: 'expense', category_id: catMap['Groceries'],     date: `${yr}-${mo}-12`, description: 'Mid-month groceries',                 created_by: analystId });
    // Utilities
    records.push({ amount: 2800,  type: 'expense', category_id: catMap['Utilities'],     date: `${yr}-${mo}-08`, description: 'Electricity & internet',              created_by: analystId });
    // Transport
    records.push({ amount: 1500,  type: 'expense', category_id: catMap['Transport'],     date: `${yr}-${mo}-10`, description: 'Fuel & commute',                     created_by: analystId });
    // Entertainment
    records.push({ amount: 2000,  type: 'expense', category_id: catMap['Entertainment'], date: `${yr}-${mo}-15`, description: 'OTT subscriptions & dining',          created_by: analystId });

    // Freelance (every other month)
    if (m % 2 === 0) {
      records.push({ amount: 18000 + Math.floor(Math.random() * 10000), type: 'income', category_id: catMap['Freelance'], date: `${yr}-${mo}-18`, description: 'Freelance project payment', created_by: analystId });
    }

    // Investment returns (quarterly)
    if (m % 3 === 0) {
      records.push({ amount: 5000 + Math.floor(Math.random() * 3000), type: 'income', category_id: catMap['Investment'], date: `${yr}-${mo}-20`, description: 'Mutual fund dividend', created_by: adminId });
    }

    // Healthcare (occasional)
    if (m % 4 === 0) {
      records.push({ amount: 3500, type: 'expense', category_id: catMap['Healthcare'], date: `${yr}-${mo}-22`, description: 'Doctor consultation & medicines', created_by: analystId });
    }

    // Education (once in 6 months)
    if (m % 6 === 0) {
      records.push({ amount: 9999, type: 'expense', category_id: catMap['Education'], date: `${yr}-${mo}-25`, description: 'Online course subscription', created_by: adminId });
    }
  }

  const insertRecord = db.prepare(`
    INSERT OR IGNORE INTO financial_records (id, amount, type, category_id, date, description, created_by)
    VALUES (@id, @amount, @type, @category_id, @date, @description, @created_by)
  `);

  const insertMany = db.transaction((recs) => {
    for (const r of recs) insertRecord.run({ id: uuidv4(), ...r });
  });
  insertMany(records);
  console.log(`  ✓ ${records.length} financial records seeded\n`);

  console.log('─────────────────────────────────────');
  console.log('✅ Seed complete!\n');
  console.log('Test credentials:');
  for (const u of users) {
    console.log(`  ${u.role.padEnd(8)} │ ${u.email.padEnd(30)} │ ${u.password}`);
  }
  console.log('─────────────────────────────────────');
}

seed()
  .catch(err => { console.error('Seed failed:', err); process.exit(1); })
  .finally(closeDb);
