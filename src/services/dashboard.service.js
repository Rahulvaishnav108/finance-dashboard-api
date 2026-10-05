'use strict';

const { getDb } = require('../config/database');

const DashboardService = {

  /**
   * Top-level summary: total income, expenses, net balance, record count
   */
  getSummary({ date_from, date_to } = {}) {
    const db = getDb();
    const { where, params } = buildDateFilter(date_from, date_to);

    const row = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expenses,
        COUNT(*) AS total_records,
        COUNT(CASE WHEN type = 'income'  THEN 1 END) AS income_count,
        COUNT(CASE WHEN type = 'expense' THEN 1 END) AS expense_count
      FROM financial_records
      WHERE status = 'active' ${where}
    `).get(params);

    return {
      total_income:    round(row.total_income),
      total_expenses:  round(row.total_expenses),
      net_balance:     round(row.total_income - row.total_expenses),
      total_records:   row.total_records,
      income_count:    row.income_count,
      expense_count:   row.expense_count,
    };
  },

  /**
   * Category-wise totals broken down by income/expense
   */
  getCategoryBreakdown({ date_from, date_to, type } = {}) {
    const db = getDb();
    const conditions = ["fr.status = 'active'"];
    const params     = {};

    if (date_from) { conditions.push('fr.date >= @date_from'); params.date_from = date_from; }
    if (date_to)   { conditions.push('fr.date <= @date_to');   params.date_to   = date_to;   }
    if (type)      { conditions.push('fr.type = @type');       params.type      = type;       }

    const where = `WHERE ${conditions.join(' AND ')}`;

    return db.prepare(`
      SELECT
        COALESCE(c.id,   'uncategorized') AS category_id,
        COALESCE(c.name, 'Uncategorized') AS category_name,
        c.color,
        c.icon,
        fr.type,
        ROUND(SUM(fr.amount), 2) AS total,
        COUNT(*)                 AS count
      FROM financial_records fr
      LEFT JOIN categories c ON fr.category_id = c.id
      ${where}
      GROUP BY category_id, category_name, fr.type
      ORDER BY total DESC
    `).all(params);
  },

  /**
   * Monthly trends for the past N months (default 12)
   */
  getMonthlyTrends({ months = 12, date_from, date_to } = {}) {
    const db = getDb();
    const conditions = ["status = 'active'"];
    const params     = {};

    if (date_from) { conditions.push('date >= @date_from'); params.date_from = date_from; }
    if (date_to)   { conditions.push('date <= @date_to');   params.date_to   = date_to;   }

    if (!date_from && !date_to) {
      // Default: last N months
      const from = new Date();
      from.setMonth(from.getMonth() - (months - 1));
      from.setDate(1);
      conditions.push('date >= @date_from');
      params.date_from = from.toISOString().slice(0, 10);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = db.prepare(`
      SELECT
        strftime('%Y-%m', date) AS month,
        type,
        ROUND(SUM(amount), 2)  AS total,
        COUNT(*)               AS count
      FROM financial_records
      ${where}
      GROUP BY month, type
      ORDER BY month ASC
    `).all(params);

    // Pivot into { month, income, expense, net }
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.month)) map.set(row.month, { month: row.month, income: 0, expense: 0, count: 0 });
      const m = map.get(row.month);
      m[row.type] = row.total;
      m.count    += row.count;
    }

    return Array.from(map.values()).map(m => ({
      month:   m.month,
      income:  round(m.income),
      expense: round(m.expense),
      net:     round(m.income - m.expense),
      count:   m.count,
    }));
  },

  /**
   * Weekly trends for the past N weeks (default 8)
   */
  getWeeklyTrends({ weeks = 8 } = {}) {
    const db   = getDb();
    const from = new Date();
    from.setDate(from.getDate() - weeks * 7);
    const date_from = from.toISOString().slice(0, 10);

    const rows = db.prepare(`
      SELECT
        strftime('%Y-W%W', date) AS week,
        type,
        ROUND(SUM(amount), 2)   AS total,
        COUNT(*)                AS count
      FROM financial_records
      WHERE status = 'active' AND date >= @date_from
      GROUP BY week, type
      ORDER BY week ASC
    `).all({ date_from });

    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.week)) map.set(row.week, { week: row.week, income: 0, expense: 0, count: 0 });
      const w = map.get(row.week);
      w[row.type] = row.total;
      w.count    += row.count;
    }

    return Array.from(map.values()).map(w => ({
      week:    w.week,
      income:  round(w.income),
      expense: round(w.expense),
      net:     round(w.income - w.expense),
      count:   w.count,
    }));
  },

  /**
   * Recent activity: last N records with full detail
   */
  getRecentActivity({ limit = 10 } = {}) {
    const db = getDb();
    const safeLimit = Math.min(parseInt(limit, 10) || 10, 50);

    return db.prepare(`
      SELECT
        fr.id, fr.amount, fr.type, fr.date, fr.description, fr.created_at,
        c.name  AS category_name,
        c.color AS category_color,
        c.icon  AS category_icon,
        u.full_name AS created_by_name
      FROM financial_records fr
      LEFT JOIN categories c ON fr.category_id = c.id
      LEFT JOIN users      u ON fr.created_by  = u.id
      WHERE fr.status = 'active'
      ORDER BY fr.created_at DESC
      LIMIT ?
    `).all(safeLimit);
  },

  /**
   * Full overview: all sections combined in one call
   */
  getOverview({ date_from, date_to } = {}) {
    return {
      summary:          this.getSummary({ date_from, date_to }),
      category_totals:  this.getCategoryBreakdown({ date_from, date_to }),
      monthly_trends:   this.getMonthlyTrends({ date_from, date_to }),
      recent_activity:  this.getRecentActivity({ limit: 5 }),
    };
  },

  /**
   * Income vs Expense ratio and top spending categories (analyst insight)
   */
  getInsights({ date_from, date_to } = {}) {
    const db = getDb();
    const { where, params } = buildDateFilter(date_from, date_to);

    const summary = this.getSummary({ date_from, date_to });

    const topExpenseCategories = db.prepare(`
      SELECT
        COALESCE(c.name, 'Uncategorized') AS category,
        ROUND(SUM(fr.amount), 2) AS total,
        COUNT(*) AS count,
        ROUND(SUM(fr.amount) * 100.0 / NULLIF((
          SELECT SUM(amount) FROM financial_records
          WHERE type = 'expense' AND status = 'active' ${where}
        ), 0), 2) AS percentage
      FROM financial_records fr
      LEFT JOIN categories c ON fr.category_id = c.id
      WHERE fr.type = 'expense' AND fr.status = 'active' ${where}
      GROUP BY category
      ORDER BY total DESC
      LIMIT 5
    `).all(params);

    const topIncomeCategories = db.prepare(`
      SELECT
        COALESCE(c.name, 'Uncategorized') AS category,
        ROUND(SUM(fr.amount), 2) AS total,
        COUNT(*) AS count,
        ROUND(SUM(fr.amount) * 100.0 / NULLIF((
          SELECT SUM(amount) FROM financial_records
          WHERE type = 'income' AND status = 'active' ${where}
        ), 0), 2) AS percentage
      FROM financial_records fr
      LEFT JOIN categories c ON fr.category_id = c.id
      WHERE fr.type = 'income' AND fr.status = 'active' ${where}
      GROUP BY category
      ORDER BY total DESC
      LIMIT 5
    `).all(params);

    const savingsRate = summary.total_income > 0
      ? round((summary.net_balance / summary.total_income) * 100)
      : 0;

    const expenseRatio = summary.total_income > 0
      ? round((summary.total_expenses / summary.total_income) * 100)
      : null;

    return {
      summary,
      savings_rate:           savingsRate,
      expense_to_income_ratio: expenseRatio,
      top_expense_categories: topExpenseCategories,
      top_income_categories:  topIncomeCategories,
    };
  },
};

// ─── helpers ────────────────────────────────────────────────────────────────

function buildDateFilter(date_from, date_to) {
  const parts  = [];
  const params = {};
  if (date_from) { parts.push('AND date >= @date_from'); params.date_from = date_from; }
  if (date_to)   { parts.push('AND date <= @date_to');   params.date_to   = date_to;   }
  return { where: parts.join(' '), params };
}

function round(n) {
  return Math.round((n || 0) * 100) / 100;
}

module.exports = DashboardService;
