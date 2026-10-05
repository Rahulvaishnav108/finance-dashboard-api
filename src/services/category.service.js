'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb }      = require('../config/database');
const { audit }      = require('../utils/audit');

const CategoryService = {

  list() {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, u.full_name as created_by_name
      FROM categories c
      LEFT JOIN users u ON c.created_by = u.id
      ORDER BY c.name ASC
    `).all();
  },

  getById(id) {
    const db  = getDb();
    const cat = db.prepare(`
      SELECT c.*, u.full_name as created_by_name
      FROM categories c
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = ?
    `).get(id);
    if (!cat) {
      const err = new Error('Category not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }
    return cat;
  },

  create({ name, type, color, icon, description }, userId, req) {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
    if (existing) {
      const err = new Error(`Category '${name}' already exists`); err.statusCode = 409; err.isOperational = true;
      throw err;
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO categories (id, name, type, color, icon, description, created_by)
      VALUES (@id, @name, @type, @color, @icon, @description, @created_by)
    `).run({ id, name, type, color: color || null, icon: icon || null, description: description || null, created_by: userId });

    const cat = this.getById(id);
    audit({ userId, action: 'category.create', resource: 'categories', resourceId: id, newData: cat, req });
    return cat;
  },

  update(id, updates, userId, req) {
    const db  = getDb();
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error('Category not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }

    // Check name uniqueness if being changed
    if (updates.name && updates.name !== existing.name) {
      const dup = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(updates.name, id);
      if (dup) {
        const err = new Error(`Category '${updates.name}' already exists`); err.statusCode = 409; err.isOperational = true;
        throw err;
      }
    }

    const allowed   = ['name', 'type', 'color', 'icon', 'description'];
    const setClause = [];
    const params    = { id };

    for (const field of allowed) {
      if (updates[field] !== undefined) {
        setClause.push(`${field} = @${field}`);
        params[field] = updates[field];
      }
    }

    if (!setClause.length) {
      const err = new Error('No updatable fields provided'); err.statusCode = 400; err.isOperational = true;
      throw err;
    }

    db.prepare(`UPDATE categories SET ${setClause.join(', ')} WHERE id = @id`).run(params);
    const updated = this.getById(id);
    audit({ userId, action: 'category.update', resource: 'categories', resourceId: id, oldData: existing, newData: updated, req });
    return updated;
  },

  delete(id, userId, req) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!existing) {
      const err = new Error('Category not found'); err.statusCode = 404; err.isOperational = true;
      throw err;
    }

    // Guard: are there active records using this category?
    const usageCount = db.prepare(
      "SELECT COUNT(*) as n FROM financial_records WHERE category_id = ? AND status = 'active'"
    ).get(id).n;
    if (usageCount > 0) {
      const err = new Error(`Cannot delete category: ${usageCount} active record(s) are using it`);
      err.statusCode = 409; err.isOperational = true;
      throw err;
    }

    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    audit({ userId, action: 'category.delete', resource: 'categories', resourceId: id, oldData: existing, req });
  },
};

module.exports = CategoryService;
