'use strict';

const { getDb }      = require('../config/database');
const { parsePagination } = require('../utils/pagination');

const AuditService = {
  list({ action, resource, user_id, date_from, date_to, ...query }) {
    const db = getDb();
    const { page, limit, offset } = parsePagination(query);

    const conditions = [];
    const params     = {};

    if (action)    { conditions.push('al.action LIKE @action');      params.action    = `%${action}%`; }
    if (resource)  { conditions.push('al.resource = @resource');     params.resource  = resource; }
    if (user_id)   { conditions.push('al.user_id = @user_id');       params.user_id   = user_id; }
    if (date_from) { conditions.push('al.created_at >= @date_from'); params.date_from = date_from; }
    if (date_to)   { conditions.push('al.created_at <= @date_to');   params.date_to   = date_to + 'T23:59:59Z'; }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = db.prepare(`SELECT COUNT(*) as n FROM audit_logs al ${where}`).get(params).n;
    const rows  = db.prepare(`
      SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${where}
      ORDER BY al.created_at DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset });

    return {
      data: rows.map(r => ({
        ...r,
        old_data: r.old_data ? JSON.parse(r.old_data) : null,
        new_data: r.new_data ? JSON.parse(r.new_data) : null,
      })),
      pagination: { page, limit, total },
    };
  },
};

module.exports = AuditService;
