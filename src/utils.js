import crypto from 'node:crypto';

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

export function toInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeSearch(value) {
  return `%${String(value || '').trim()}%`;
}

export function buildSetClause(fields, body, startIndex = 1) {
  const sets = [];
  const values = [];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      values.push(body[field]);
      sets.push(`${field} = $${startIndex + values.length - 1}`);
    }
  }
  return { sets, values };
}

export function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function canMaintainRequest(user, request) {
  return user?.role === 'admin' || request.requester_id === user?.id || request.handler_id === user?.id;
}

export function canMaintainAsset(user, asset) {
  return user?.role === 'admin' || asset.owner_id === user?.id;
}

export function requireAdmin(user) {
  if (user?.role !== 'admin') {
    const error = new Error('需要管理员权限');
    error.status = 403;
    throw error;
  }
}
