'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb }      = require('../config/database');
const { audit }      = require('../utils/audit');
const { parsePagination, parseSort } = require('../utils/pagination');

const SORT_WHITELIST = ['amount', 'date', 'created_at', 'type'];

const RecordService = {

  list(filters, query) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);
    const { sortBy, sortDir }     = parseSort(query, SORT_WHITELIST, 'date');

    const conditions = ["fr.status = 'active'"];
    const params     = {};

    if (filters.type) {
      conditions.push('fr.type = @type');
      params.type = filters.type;
    }
    if (filters.category_id) {
      conditions.push('fr.category_id = @category_id');
      params.category_id = filters.category_id;
    }
    if (filters.date_from) {
      conditions.push('fr.date >= @date_from');
      params.date_from = filters.date_from;
    }
    if (filters.date_to) {
      conditions.push('fr.date <= @date_to');
      params.date_to = filters.date_to;
    }
    if (filters.amount_min !== undefined) {
      conditions.push('fr.amount >= @amount_min');
      params.amount_min = filters.amount_min;
    }
    if (filters.amount_max !== undefined) {
      conditions.push('fr.amount <= @amount_max');
      params.amount_max = filters.amount_max;
    }
    if (filters.search) {
      conditions.push('(fr.description LIKE @search OR fr.notes LIKE @search OR fr.reference_no LIKE @search)');
      params.search = `%${filters.search}%`;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const total = db.prepare(`SELECT COUNT(*) as n FROM financial_records fr ${where}`).get(params).n;
    const rows  = db.prepare(`
      SELECT
        fr.id, fr.amount, fr.type, fr.date, fr.description, fr.notes, fr.tags,
        fr.reference_no, fr.created_at, fr.updated_at,
        c.id   as category_id,
        c.name as category_name,
        c.color as category_color,
        c.icon  as category_icon,
        u.id   as created_by_id,
        u.full_name as created_by_name
      FROM financial_records fr
      LEFT JOIN categories c ON fr.category_id = c.id
      LEFT JOIN users      u ON fr.created_by  = u.id
      ${where}
      ORDER BY fr.${sortBy} ${sortDir}
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });

    const records = rows.map(this._formatRow);
    return { data: records, pagination: { page, limit, total } };
  },

  getById(id) {
    const db  = getDb();
    const row = db.prepare(`
      SELECT
        fr.id, fr.amount, fr.type, fr.date, fr.description, fr.notes, fr.tags,
        fr.reference_no, fr.status, fr.created_at, fr.updated_at, fr.deleted_at,
        c.id   as category_id,
        c.name as category_name,
        c.color as category_color,
        c.icon  as category_icon,
        u.id   as created_by_id,
        u.full_name as created_by_name,
        ub.full_name as updated_by_name
      FROM financial_records fr
      LEFT JOIN categories c  ON fr.category_id = c.id
      LEFT JOIN users      u  ON fr.created_by  = u.id
      LEFT JOIN users      ub ON fr.updated_by  = ub.id
      WHERE fr.id = ? AND fr.status = 'active'
    `).get(id);

    if (!row) {
      const err = new Error('Financial record not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }
    return this._formatRow(row);
  },

  create(data, userId, req) {
    const db = getDb();

    // Validate category exists and is compatible with record type
    if (data.category_id) {
      const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(data.category_id);
      if (!cat) {
        const err = new Error('Category not found'); err.statusCode = 422; err.isOperational = true;
        throw err;
      }
      if (cat.type !== 'both' && cat.type !== data.type) {
        const err = new Error(`Category '${cat.name}' is for ${cat.type} records only`);
        err.statusCode = 422; err.isOperational = true;
        throw err;
      }
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO financial_records
        (id, amount, type, category_id, date, description, notes, tags, reference_no, created_by)
      VALUES
        (@id, @amount, @type, @category_id, @date, @description, @notes, @tags, @reference_no, @created_by)
    `).run({
      id,
      amount:       data.amount,
      type:         data.type,
      category_id:  data.category_id  || null,
      date:         data.date,
      description:  data.description  || null,
      notes:        data.notes        || null,
      tags:         data.tags         ? JSON.stringify(data.tags) : null,
      reference_no: data.reference_no || null,
      created_by:   userId,
    });

    const record = this.getById(id);
    audit({ userId, action: 'record.create', resource: 'financial_records', resourceId: id, newData: record, req });
    return record;
  },

  update(id, data, userId, req) {
    const db       = getDb();
    const existing = db.prepare("SELECT * FROM financial_records WHERE id = ? AND status = 'active'").get(id);
    if (!existing) {
      const err = new Error('Financial record not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }

    // Category-type compatibility check when either is being changed
    const effectiveType       = data.type        || existing.type;
    const effectiveCategoryId = data.category_id !== undefined ? data.category_id : existing.category_id;

    if (effectiveCategoryId) {
      const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(effectiveCategoryId);
      if (!cat) {
        const err = new Error('Category not found'); err.statusCode = 422; err.isOperational = true;
        throw err;
      }
      if (cat.type !== 'both' && cat.type !== effectiveType) {
        const err = new Error(`Category '${cat.name}' is for ${cat.type} records only`);
        err.statusCode = 422; err.isOperational = true;
        throw err;
      }
    }

    const allowed   = ['amount', 'type', 'category_id', 'date', 'description', 'notes', 'reference_no'];
    const setClause = [];
    const params    = { id, updated_by: userId };

    for (const field of allowed) {
      if (data[field] !== undefined) {
        setClause.push(`${field} = @${field}`);
        params[field] = data[field] !== null ? data[field] : null;
      }
    }
    if (data.tags !== undefined) {
      setClause.push('tags = @tags');
      params.tags = data.tags ? JSON.stringify(data.tags) : null;
    }

    if (!setClause.length) {
      const err = new Error('No updatable fields provided'); err.statusCode = 400; err.isOperational = true;
      throw err;
    }

    setClause.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')");
    setClause.push('updated_by = @updated_by');

    db.prepare(`UPDATE financial_records SET ${setClause.join(', ')} WHERE id = @id`).run(params);

    const updated = this.getById(id);
    audit({ userId, action: 'record.update', resource: 'financial_records', resourceId: id,
      oldData: this._formatRow(existing), newData: updated, req });
    return updated;
  },

  /**
   * Soft delete: mark status = 'deleted', set deleted_at timestamp
   */
  delete(id, userId, req) {
    const db       = getDb();
    const existing = db.prepare("SELECT * FROM financial_records WHERE id = ? AND status = 'active'").get(id);
    if (!existing) {
      const err = new Error('Financial record not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }

    db.prepare(`
      UPDATE financial_records
      SET status = 'deleted',
          deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
          updated_by = @updated_by,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = @id
    `).run({ id, updated_by: userId });

    audit({ userId, action: 'record.delete', resource: 'financial_records', resourceId: id,
      oldData: this._formatRow(existing), req });
  },

  _formatRow(row) {
    return {
      id:           row.id,
      amount:       row.amount,
      type:         row.type,
      date:         row.date,
      description:  row.description,
      notes:        row.notes,
      tags:         row.tags ? JSON.parse(row.tags) : [],
      reference_no: row.reference_no,
      created_at:   row.created_at,
      updated_at:   row.updated_at,
      category: row.category_id ? {
        id:    row.category_id,
        name:  row.category_name,
        color: row.category_color,
        icon:  row.category_icon,
      } : null,
      created_by: row.created_by_id ? {
        id:        row.created_by_id,
        full_name: row.created_by_name,
      } : null,
    };
  },
};

module.exports = RecordService;
