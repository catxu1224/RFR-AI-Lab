import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';
import { pool, query, withTransaction } from './db.js';
import {
  asyncHandler,
  buildSetClause,
  canMaintainAsset,
  canMaintainRequest,
  newToken,
  normalizeSearch,
  requireAdmin,
  toInt
} from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const sessions = new Map();

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/vendor/echarts', express.static(path.join(__dirname, '..', 'node_modules', 'echarts', 'dist')));

app.use(asyncHandler(async (req, _res, next) => {
  req.cookies = parseCookies(req.headers.cookie || '');
  const token = req.cookies.rfr_session;
  const userId = sessions.get(token) || toInt(process.env.SESSION_USER_ID, 1);
  const result = await query(
    'SELECT id, username, chinese_name, english_name, email, level, role, status FROM users WHERE id = $1 AND status = $2',
    [userId, 'active']
  );
  req.user = result.rows[0] || null;
  next();
}));

app.get('/api/health', asyncHandler(async (_req, res) => {
  const db = await query('SELECT NOW() AS now');
  res.json({ ok: true, dbTime: db.rows[0].now });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await query('SELECT * FROM users WHERE email = $1 AND status = $2', [email, 'active']);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ error: '邮箱或密码不正确' });
  }
  const token = newToken();
  sessions.set(token, user.id);
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  res.setHeader('Set-Cookie', `rfr_session=${token}; HttpOnly; Path=/; SameSite=Lax`);
  res.json({ user: publicUser(user) });
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { chinese_name, english_name, email, password, level = 'A1' } = req.body;
  if (!email || !password || !chinese_name || !english_name) {
    return res.status(400).json({ error: '请填写姓名、邮箱和密码' });
  }
  const username = usernameFromEmail(email);
  if (!username) return res.status(400).json({ error: '邮箱格式不正确' });
  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO users (username, chinese_name, english_name, email, password_hash, level, role)
     VALUES ($1, $2, $3, $4, $5, $6, 'user')
     RETURNING id, username, chinese_name, english_name, email, level, role, status`,
    [username, chinese_name, english_name, email, hash, level]
  );
  res.status(201).json({ user: result.rows[0] });
}));

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies.rfr_session;
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', 'rfr_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/meta', asyncHandler(async (_req, res) => {
  const [users, projectCategories, assetCategories, assetTags, tags, projects] = await Promise.all([
    query('SELECT id, chinese_name, english_name, email, level, role FROM users WHERE status = $1 ORDER BY id', ['active']),
    query('SELECT id, name FROM project_categories ORDER BY sort_order, id'),
    query('SELECT id, name FROM asset_categories ORDER BY sort_order, id'),
    query('SELECT id, name FROM asset_tags ORDER BY sort_order, id'),
    query('SELECT id, name, description FROM request_tags ORDER BY sort_order, id'),
    query('SELECT id, o2e_code, wbs_code, customer_name, project_name FROM projects ORDER BY id')
  ]);
  res.json({
    users: users.rows,
    projectCategories: projectCategories.rows,
    assetCategories: assetCategories.rows,
    assetTags: assetTags.rows,
    tags: tags.rows,
    projects: projects.rows
  });
}));

app.get('/api/dashboard', asyncHandler(async (_req, res) => {
  const [
    topStats,
    projectTypes,
    assetTypes,
    requestStatus,
    hotAssets
  ] = await Promise.all([
    query(`SELECT
      (SELECT COUNT(*) FROM ai_assets WHERE status = 'online')::INT AS online_assets,
      (SELECT COUNT(*) FROM ai_assets WHERE status = 'retired')::INT AS retired_assets,
      (SELECT COUNT(*) FROM ai_assets)::INT AS total_assets,
      (SELECT COUNT(*) FROM ai_requests WHERE status IN ('提出', '受理', '开发'))::INT AS active_requests,
      (SELECT COUNT(*) FROM ai_requests)::INT AS total_requests,
      (SELECT COUNT(*) FROM projects)::INT AS projects,
      (SELECT COUNT(*) FROM users)::INT AS users`),
    query(`SELECT pc.name, COUNT(a.id)::INT AS count
      FROM project_categories pc
      LEFT JOIN projects p ON p.category_id = pc.id
      LEFT JOIN ai_assets a ON a.project_id = p.id AND a.status = 'online'
      GROUP BY pc.id, pc.name, pc.sort_order
      ORDER BY pc.sort_order`),
    query(`SELECT ac.name, COUNT(a.id)::INT AS count
      FROM asset_categories ac
      LEFT JOIN ai_assets a ON a.category_id = ac.id AND a.status = 'online'
      GROUP BY ac.id, ac.name, ac.sort_order
      ORDER BY ac.sort_order`),
    query(`SELECT status AS name, COUNT(*)::INT AS count FROM ai_requests GROUP BY status
      ORDER BY ARRAY_POSITION(ARRAY['提出','受理','开发','上线','注销'], status)`),
    query(assetListSql('WHERE a.status = $1', 'ORDER BY views DESC, a.id LIMIT 8'), ['online'])
  ]);
  res.json({
    stats: topStats.rows[0],
    projectTypes: projectTypes.rows,
    assetTypes: assetTypes.rows,
    requestStatus: requestStatus.rows,
    hotAssets: hotAssets.rows
  });
}));

app.get('/api/requests', asyncHandler(async (req, res) => {
  const search = normalizeSearch(req.query.search);
  const status = req.query.status || '';
  const handlerId = toInt(req.query.handlerId);
  const tagId = toInt(req.query.tagId);
  const params = [search];
  const filters = [`(r.request_code ILIKE $1 OR r.title ILIKE $1 OR COALESCE(p.customer_name, '') ILIKE $1 OR COALESCE(p.project_name, '') ILIKE $1 OR COALESCE(p.wbs_code, '') ILIKE $1 OR COALESCE(p.o2e_code, '') ILIKE $1)`];
  if (status) {
    params.push(status);
    filters.push(`r.status = $${params.length}`);
  }
  if (handlerId) {
    params.push(handlerId);
    filters.push(`r.handler_id = $${params.length}`);
  }
  if (tagId) {
    params.push(tagId);
    filters.push(`EXISTS (SELECT 1 FROM ai_request_tag_relations rel WHERE rel.request_id = r.id AND rel.tag_id = $${params.length})`);
  }
  const result = await query(requestListSql(`WHERE ${filters.join(' AND ')}`, 'ORDER BY r.id DESC'), params);
  res.json({ requests: result.rows });
}));

app.get('/api/requests/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const detail = await query(requestListSql('WHERE r.id = $1'), [id]);
  if (!detail.rowCount) return res.status(404).json({ error: '需求不存在' });
  const logs = await query(
    `SELECT l.*, u.chinese_name AS actor_name
     FROM ai_request_logs l
     LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.request_id = $1
     ORDER BY l.created_at DESC`,
    [id]
  );
  res.json({ request: detail.rows[0], logs: logs.rows });
}));

app.post('/api/requests', asyncHandler(async (req, res) => {
  const created = await withTransaction(async (client) => {
    const code = await nextRequestCode(client);
    const body = req.body;
    const result = await client.query(
      `INSERT INTO ai_requests (request_code, title, description, requester_id, handler_id, project_id, no_project, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '提出')
       RETURNING *`,
      [code, body.title, body.description || '', req.user.id, toInt(body.handler_id), toInt(body.project_id), Boolean(body.no_project)]
    );
    await syncRequestTags(client, result.rows[0].id, body.tag_ids || []);
    await logRequest(client, result.rows[0].id, '需求创建', `${req.user.chinese_name} 创建需求。`, req.user.id);
    return result.rows[0];
  });
  res.status(201).json({ request: created });
}));

app.patch('/api/requests/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const current = await query('SELECT * FROM ai_requests WHERE id = $1', [id]);
  if (!current.rowCount) return res.status(404).json({ error: '需求不存在' });
  if (!canMaintainRequest(req.user, current.rows[0])) return res.status(403).json({ error: '不能维护非本人提出或受理的需求' });

  const updated = await withTransaction(async (client) => {
    const allowed = ['title', 'description', 'handler_id', 'project_id', 'no_project', 'status'];
    const { sets, values } = buildSetClause(allowed, req.body);
    if (sets.length) {
      values.push(id);
      await client.query(`UPDATE ai_requests SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    }
    if (Array.isArray(req.body.tag_ids)) await syncRequestTags(client, id, req.body.tag_ids);
    if (req.body.status && req.body.status !== current.rows[0].status) {
      await logRequest(client, id, '状态变更', `${current.rows[0].status} -> ${req.body.status}`, req.user.id);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'handler_id') && req.body.handler_id !== current.rows[0].handler_id) {
      await logRequest(client, id, '受理人变更', `受理人 ID ${current.rows[0].handler_id || '未认领'} -> ${req.body.handler_id || '未认领'}`, req.user.id);
    }
    const result = await client.query(requestListSql('WHERE r.id = $1'), [id]);
    return result.rows[0];
  });
  res.json({ request: updated });
}));

app.post('/api/requests/:id/claim', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const current = await query('SELECT * FROM ai_requests WHERE id = $1', [id]);
  if (!current.rowCount) return res.status(404).json({ error: '需求不存在' });
  await withTransaction(async (client) => {
    await client.query('UPDATE ai_requests SET handler_id = $1, status = $2, updated_at = NOW() WHERE id = $3', [req.user.id, '受理', id]);
    await logRequest(client, id, '需求认领', `${req.user.chinese_name} 认领需求。`, req.user.id);
  });
  res.json({ ok: true });
}));

app.delete('/api/requests/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const current = await query('SELECT * FROM ai_requests WHERE id = $1', [id]);
  if (!current.rowCount) return res.status(404).json({ error: '需求不存在' });
  if (!canMaintainRequest(req.user, current.rows[0])) return res.status(403).json({ error: '不能删除非本人提出或受理的需求' });
  await query('DELETE FROM ai_requests WHERE id = $1', [id]);
  res.json({ ok: true });
}));

app.get('/api/assets', asyncHandler(async (req, res) => {
  const search = normalizeSearch(req.query.search);
  const visibility = req.query.visibility || '';
  const status = req.query.status || 'online';
  const categoryId = toInt(req.query.categoryId);
  const tagId = toInt(req.query.tagId);
  const params = [search];
  const filters = [`(a.asset_name ILIKE $1 OR a.description ILIKE $1 OR u.chinese_name ILIKE $1 OR u.english_name ILIKE $1)`];
  if (visibility) {
    params.push(visibility);
    filters.push(`a.visibility = $${params.length}`);
  }
  if (status) {
    params.push(status);
    filters.push(`a.status = $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    filters.push(`a.category_id = $${params.length}`);
  }
  if (tagId) {
    params.push(tagId);
    filters.push(`EXISTS (SELECT 1 FROM ai_asset_tag_relations atr WHERE atr.asset_id = a.id AND atr.tag_id = $${params.length})`);
  }
  const result = await query(assetListSql(`WHERE ${filters.join(' AND ')}`, 'ORDER BY views DESC, a.id'), params);
  res.json({ assets: result.rows });
}));

app.get('/api/assets/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const result = await query(assetListSql('WHERE a.id = $1', '', true), [id]);
  if (!result.rowCount) return res.status(404).json({ error: '资产不存在' });
  res.json({ asset: result.rows[0] });
}));

app.post('/api/assets', asyncHandler(async (req, res) => {
  const body = req.body;
  const created = await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO ai_assets (asset_name, owner_id, request_id, category_id, project_id, description, access_url, download_url, logo_image_data, logo_image_name, preview_image_data, preview_image_name, visibility, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'online')
       RETURNING *`,
      [
        body.asset_name,
        req.user.id,
        toInt(body.request_id),
        toInt(body.category_id),
        toInt(body.project_id),
        body.description || '',
        body.access_url || null,
        body.download_url || null,
        body.logo_image_data || null,
        body.logo_image_name || null,
        body.preview_image_data || null,
        body.preview_image_name || null,
        body.visibility || 'public'
      ]
    );
    await syncAssetTags(client, result.rows[0].id, body.tag_ids || []);
    await syncAssetPreviewImages(client, result.rows[0].id, body.preview_images || []);
    await client.query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1, $2, $3, $4, $5)', ['asset', result.rows[0].id, '发布资产', body.asset_name, req.user.id]);
    const detail = await client.query(assetListSql('WHERE a.id = $1'), [result.rows[0].id]);
    return detail.rows[0];
  });
  res.status(201).json({ asset: created });
}));

app.patch('/api/assets/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const current = await query('SELECT * FROM ai_assets WHERE id = $1', [id]);
  if (!current.rowCount) return res.status(404).json({ error: '资产不存在' });
  if (!canMaintainAsset(req.user, current.rows[0])) return res.status(403).json({ error: '不能维护非本人负责的资产' });
  const allowed = ['asset_name', 'description', 'access_url', 'download_url', 'logo_image_data', 'logo_image_name', 'preview_image_data', 'preview_image_name', 'visibility', 'status', 'category_id', 'project_id', 'version'];
  const { sets, values } = buildSetClause(allowed, req.body);
  const updated = await withTransaction(async (client) => {
    if (sets.length) {
      values.push(id);
      await client.query(`UPDATE ai_assets SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
    }
    if (Array.isArray(req.body.tag_ids)) await syncAssetTags(client, id, req.body.tag_ids);
    if (Array.isArray(req.body.preview_images)) await syncAssetPreviewImages(client, id, req.body.preview_images);
    await client.query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1, $2, $3, $4, $5)', ['asset', id, '资产维护', JSON.stringify(req.body), req.user.id]);
    const result = await client.query(assetListSql('WHERE a.id = $1'), [id]);
    return result.rows[0] || current.rows[0];
  });
  res.json({ asset: updated });
}));

app.post('/api/assets/:id/view', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  await query('INSERT INTO ai_asset_view_logs (asset_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, req.user.id]);
  res.json({ ok: true });
}));

app.post('/api/assets/:id/access-requests', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const result = await withTransaction(async (client) => {
    const access = await client.query(
      `INSERT INTO ai_asset_access_requests (asset_id, requester_id, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (asset_id, requester_id) DO UPDATE SET status = 'pending', reason = EXCLUDED.reason, created_at = NOW()
       RETURNING *`,
      [id, req.user.id, req.body.reason || '申请查看资产']
    );
    const asset = await client.query('SELECT asset_name, owner_id FROM ai_assets WHERE id = $1', [id]);
    if (asset.rowCount && asset.rows[0].owner_id !== req.user.id) {
      await client.query(
        `INSERT INTO notifications (recipient_id, actor_id, entity_type, entity_id, title, message, target_route)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          asset.rows[0].owner_id,
          req.user.id,
          'asset_access_request',
          access.rows[0].id,
          '新的资产访问申请',
          `${req.user.chinese_name}申请查看 ${asset.rows[0].asset_name}，请进行授权审批。`,
          '#approvals'
        ]
      );
    }
    return access.rows[0];
  });
  res.status(201).json({ accessRequest: result });
}));

app.get('/api/asset-access-requests', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT ar.*, a.asset_name, a.owner_id, u.chinese_name AS requester_name, u.english_name AS requester_english_name,
      reviewer.chinese_name AS reviewer_name
     FROM ai_asset_access_requests ar
     JOIN ai_assets a ON a.id = ar.asset_id
     JOIN users u ON u.id = ar.requester_id
     LEFT JOIN users reviewer ON reviewer.id = ar.reviewed_by
     WHERE a.owner_id = $1 OR $2 = 'admin'
     ORDER BY ar.created_at DESC`,
    [req.user.id, req.user.role]
  );
  res.json({ accessRequests: result.rows });
}));

app.patch('/api/asset-access-requests/:id', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const current = await query(
    `SELECT ar.*, a.asset_name, a.owner_id
     FROM ai_asset_access_requests ar
     JOIN ai_assets a ON a.id = ar.asset_id
     WHERE ar.id = $1`,
    [id]
  );
  if (!current.rowCount) return res.status(404).json({ error: '访问申请不存在' });
  if (req.user.role !== 'admin' && current.rows[0].owner_id !== req.user.id) {
    return res.status(403).json({ error: '只能审批自己负责资产的访问申请' });
  }
  const status = req.body.status;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: '审批状态不正确' });
  }
  const result = await withTransaction(async (client) => {
    const updated = await client.query(
      `UPDATE ai_asset_access_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, req.user.id, id]
    );
    await client.query(
      `INSERT INTO notifications (recipient_id, actor_id, entity_type, entity_id, title, message, target_route)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        current.rows[0].requester_id,
        req.user.id,
        'asset_access_request',
        id,
        status === 'approved' ? '资产访问申请已通过' : '资产访问申请已拒绝',
        `${current.rows[0].asset_name} 的访问申请${status === 'approved' ? '已通过' : '已拒绝'}。`,
        '#assets'
      ]
    );
    await client.query(
      'INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1,$2,$3,$4,$5)',
      ['asset_access_request', id, '访问授权审批', `${current.rows[0].asset_name}: ${status}`, req.user.id]
    );
    return updated.rows[0];
  });
  res.json({ accessRequest: result });
}));

app.get('/api/messages', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT n.*, actor.chinese_name AS actor_name
     FROM notifications n
     LEFT JOIN users actor ON actor.id = n.actor_id
     WHERE n.recipient_id = $1
     ORDER BY n.created_at DESC
     LIMIT 100`,
    [req.user.id]
  );
  const unread = result.rows.filter((row) => !row.read_at).length;
  res.json({ messages: result.rows, unread });
}));

app.post('/api/messages/:id/read', asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  await query('UPDATE notifications SET read_at = NOW() WHERE id = $1 AND recipient_id = $2', [id, req.user.id]);
  res.json({ ok: true });
}));

app.get('/api/learning-materials', asyncHandler(async (req, res) => {
  const search = normalizeSearch(req.query.search);
  const category = req.query.category || '';
  const params = [search];
  const filters = [`(title ILIKE $1 OR description ILIKE $1 OR content_text ILIKE $1)`];
  if (category) {
    params.push(category);
    filters.push(`category = $${params.length}`);
  }
  const result = await query(`SELECT * FROM learning_materials WHERE ${filters.join(' AND ')} ORDER BY updated_at DESC`, params);
  res.json({ materials: result.rows });
}));

app.post('/api/learning-materials/search', asyncHandler(async (req, res) => {
  const q = normalizeSearch(req.body.question);
  const result = await query(
    `SELECT title, description, content_text, url
     FROM learning_materials
     WHERE title ILIKE $1 OR description ILIKE $1 OR content_text ILIKE $1
     ORDER BY updated_at DESC
     LIMIT 5`,
    [q]
  );
  res.json({ answer: summarizeKnowledge(req.body.question, result.rows), sources: result.rows });
}));

app.post('/api/learning-materials', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const body = req.body;
  const result = await query(
    `INSERT INTO learning_materials (title, description, category, material_type, url, content_text, maintained_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [body.title, body.description || '', body.category || 'AI工具', body.material_type || 'Link', body.url || '', body.content_text || '', req.user.id]
  );
  res.status(201).json({ material: result.rows[0] });
}));

app.get('/api/projects', asyncHandler(async (req, res) => {
  const search = normalizeSearch(req.query.search);
  const categoryId = toInt(req.query.categoryId);
  const params = [search];
  const filters = [`(p.o2e_code ILIKE $1 OR p.wbs_code ILIKE $1 OR p.customer_name ILIKE $1 OR p.project_name ILIKE $1 OR p.pic ILIKE $1 OR p.mic ILIKE $1)`];
  if (categoryId) {
    params.push(categoryId);
    filters.push(`p.category_id = $${params.length}`);
  }
  const result = await query(projectListSql(`WHERE ${filters.join(' AND ')}`, 'ORDER BY p.id'), params);
  res.json({ projects: result.rows });
}));

app.get('/api/projects/:id', asyncHandler(async (req, res) => {
  const result = await query(projectListSql('WHERE p.id = $1'), [toInt(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: '项目不存在' });
  res.json({ project: result.rows[0] });
}));

app.post('/api/projects', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const b = req.body;
  const result = await query(
    `INSERT INTO projects (o2e_code, wbs_code, customer_name, project_name, pic, mic, description, category_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [b.o2e_code || null, b.wbs_code || null, b.customer_name, b.project_name, b.pic, b.mic, b.description || '', toInt(b.category_id), b.status || 'active']
  );
  res.status(201).json({ project: result.rows[0] });
}));

app.patch('/api/projects/:id', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const id = toInt(req.params.id);
  const allowed = ['o2e_code', 'wbs_code', 'customer_name', 'project_name', 'pic', 'mic', 'description', 'category_id', 'status'];
  const { sets, values } = buildSetClause(allowed, req.body);
  if (!sets.length) return res.json({ ok: true });
  values.push(id);
  const result = await query(`UPDATE projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
  res.json({ project: result.rows[0] });
}));

app.get('/api/users', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const search = normalizeSearch(req.query.search);
  const result = await query(
    `SELECT u.id, u.username, u.chinese_name, u.english_name, u.email, u.level, u.role, u.status,
      COUNT(DISTINCT req.id)::INT AS requested_count,
      COUNT(DISTINCT handled.id)::INT AS handled_count,
      COUNT(DISTINCT a.id)::INT AS asset_count
     FROM users u
     LEFT JOIN ai_requests req ON req.requester_id = u.id
     LEFT JOIN ai_requests handled ON handled.handler_id = u.id
     LEFT JOIN ai_assets a ON a.owner_id = u.id
     WHERE u.status <> $2
       AND (u.username ILIKE $1 OR u.chinese_name ILIKE $1 OR u.english_name ILIKE $1 OR u.email ILIKE $1)
     GROUP BY u.id
     ORDER BY u.id`,
    [search, 'inactive']
  );
  res.json({ users: result.rows });
}));

app.get('/api/users/:id', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const result = await query('SELECT id, username, chinese_name, english_name, email, level, role, status, last_login_at FROM users WHERE id = $1', [toInt(req.params.id)]);
  if (!result.rowCount) return res.status(404).json({ error: '用户不存在' });
  res.json({ user: result.rows[0] });
}));

app.post('/api/users', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const body = req.body;
  if (!body.email || !body.password || !body.chinese_name || !body.english_name) {
    return res.status(400).json({ error: '请填写姓名、邮箱和初始密码' });
  }
  const username = usernameFromEmail(body.email);
  if (!username) return res.status(400).json({ error: '邮箱格式不正确' });
  const hash = await bcrypt.hash(body.password, 10);
  const result = await query(
    `INSERT INTO users (username, chinese_name, english_name, email, password_hash, level, role, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, username, chinese_name, english_name, email, level, role, status`,
    [username, body.chinese_name, body.english_name, body.email, hash, body.level || 'A1', body.role || 'user', body.status || 'active']
  );
  await query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1,$2,$3,$4,$5)', ['user', result.rows[0].id, '新增用户', body.email, req.user.id]);
  res.status(201).json({ user: result.rows[0] });
}));

app.patch('/api/users/:id', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const id = toInt(req.params.id);
  const allowed = ['chinese_name', 'english_name', 'email', 'level', 'role', 'status'];
  const { sets, values } = buildSetClause(allowed, req.body);
  if (req.body.email) {
    const username = usernameFromEmail(req.body.email);
    if (!username) return res.status(400).json({ error: '邮箱格式不正确' });
    values.push(username);
    sets.push(`username = $${values.length}`);
  }
  if (req.body.password) {
    values.push(await bcrypt.hash(req.body.password, 10));
    sets.push(`password_hash = $${values.length}`);
  }
  if (!sets.length) return res.json({ ok: true });
  values.push(id);
  const result = await query(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, username, chinese_name, english_name, email, level, role, status`, values);
  await query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1,$2,$3,$4,$5)', ['user', id, '用户信息维护', JSON.stringify(req.body), req.user.id]);
  res.json({ user: result.rows[0] });
}));

app.delete('/api/users/:id', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const id = toInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: '不能删除当前登录用户' });
  const result = await query(
    `UPDATE users SET status = $1, updated_at = NOW()
     WHERE id = $2 AND status <> $1
     RETURNING id, username, chinese_name, english_name, email, level, role, status`,
    ['inactive', id]
  );
  if (!result.rowCount) return res.status(404).json({ error: '用户不存在或已删除' });
  await query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1,$2,$3,$4,$5)', ['user', id, '删除用户', result.rows[0].email, req.user.id]);
  res.json({ user: result.rows[0] });
}));

app.post('/api/parameters/:kind', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const config = parameterCategoryConfig(req.params.kind);
  if (!config) return res.status(404).json({ error: '参数类型不存在' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '请填写参数名称' });
  const nextOrder = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS sort_order FROM ${config.table}`);
  const result = await query(`INSERT INTO ${config.table} (name, sort_order) VALUES ($1, $2) RETURNING id, name, sort_order`, [name, nextOrder.rows[0].sort_order]);
  await query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1,$2,$3,$4,$5)', [config.entity, result.rows[0].id, '新增参数', name, req.user.id]);
  res.status(201).json({ parameter: result.rows[0] });
}));

app.patch('/api/parameters/:kind/:id', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const config = parameterCategoryConfig(req.params.kind);
  if (!config) return res.status(404).json({ error: '参数类型不存在' });
  const id = toInt(req.params.id);
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: '请填写参数名称' });
  const result = await query(`UPDATE ${config.table} SET name = $1 WHERE id = $2 RETURNING id, name, sort_order`, [name, id]);
  if (!result.rowCount) return res.status(404).json({ error: '参数不存在' });
  await query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1,$2,$3,$4,$5)', [config.entity, id, '参数信息维护', name, req.user.id]);
  res.json({ parameter: result.rows[0] });
}));

app.delete('/api/parameters/:kind/:id', asyncHandler(async (req, res) => {
  requireAdmin(req.user);
  const config = parameterCategoryConfig(req.params.kind);
  if (!config) return res.status(404).json({ error: '参数类型不存在' });
  const id = toInt(req.params.id);
  const usage = await query(config.usageSql, [id]);
  if (usage.rows[0].count > 0) {
    return res.status(400).json({ error: `该参数已被${config.usageLabel}使用，不能删除` });
  }
  const result = await query(`DELETE FROM ${config.table} WHERE id = $1 RETURNING id, name`, [id]);
  if (!result.rowCount) return res.status(404).json({ error: '参数不存在或已删除' });
  await query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1,$2,$3,$4,$5)', [config.entity, id, '删除参数', result.rows[0].name, req.user.id]);
  res.json({ parameter: result.rows[0] });
}));

app.get('/api/audit-logs', asyncHandler(async (_req, res) => {
  requireAdmin(_req.user);
  const result = await query(
    `SELECT l.*, u.chinese_name AS actor_name
     FROM audit_logs l
     LEFT JOIN users u ON u.id = l.actor_id
     ORDER BY l.created_at DESC
     LIMIT 50`
  );
  res.json({ logs: result.rows });
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || '服务器错误' });
});

const port = Number(process.env.PORT || 3100);
app.listen(port, () => {
  console.log(`RFR AI Lab running at http://localhost:${port}`);
});

function parseCookies(cookieHeader) {
  return Object.fromEntries(cookieHeader.split(';').filter(Boolean).map((item) => {
    const index = item.indexOf('=');
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    chinese_name: user.chinese_name,
    english_name: user.english_name,
    email: user.email,
    level: user.level,
    role: user.role,
    status: user.status
  };
}

function usernameFromEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return '';
  return value.slice(0, atIndex);
}

function parameterCategoryConfig(kind) {
  const configs = {
    project: {
      table: 'project_categories',
      entity: 'project_category',
      usageSql: 'SELECT COUNT(*)::INT AS count FROM projects WHERE category_id = $1',
      usageLabel: '项目'
    },
    asset: {
      table: 'asset_categories',
      entity: 'asset_category',
      usageSql: 'SELECT COUNT(*)::INT AS count FROM ai_assets WHERE category_id = $1',
      usageLabel: '资产'
    },
    assetTag: {
      table: 'asset_tags',
      entity: 'asset_tag',
      usageSql: 'SELECT COUNT(*)::INT AS count FROM ai_asset_tag_relations WHERE tag_id = $1',
      usageLabel: '资产'
    }
  };
  return configs[kind] || null;
}

function requestListSql(whereClause = '', orderClause = '') {
  return `SELECT r.*,
    requester.chinese_name AS requester_name,
    handler.chinese_name AS handler_name,
    p.customer_name,
    p.project_name,
    p.wbs_code,
    p.o2e_code,
    pc.name AS project_category,
    COALESCE(JSON_AGG(JSON_BUILD_OBJECT('id', t.id, 'name', t.name, 'description', t.description) ORDER BY t.sort_order) FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
   FROM ai_requests r
   LEFT JOIN users requester ON requester.id = r.requester_id
   LEFT JOIN users handler ON handler.id = r.handler_id
   LEFT JOIN projects p ON p.id = r.project_id
   LEFT JOIN project_categories pc ON pc.id = p.category_id
   LEFT JOIN ai_request_tag_relations rel ON rel.request_id = r.id
   LEFT JOIN request_tags t ON t.id = rel.tag_id
   ${whereClause}
   GROUP BY r.id, requester.chinese_name, handler.chinese_name, p.id, pc.name
   ${orderClause}`;
}

function assetListSql(whereClause = '', orderClause = '', includePreview = false) {
  return `SELECT
    a.id,
    a.asset_name,
    a.owner_id,
    a.request_id,
    a.category_id,
    a.project_id,
    a.description,
    a.access_url,
    a.download_url,
    a.logo_image_data,
    a.logo_image_name,
    ${includePreview ? 'a.preview_image_data,' : ''}
    a.preview_image_name,
    a.visibility,
    a.status,
    a.version,
    a.created_at,
    a.updated_at,
    u.chinese_name AS owner_name,
    ac.name AS category_name,
    p.customer_name,
    p.project_name,
    r.request_code,
    r.title AS request_title,
    previews.preview_images,
    tags.tags,
    asset_views.views
   FROM ai_assets a
   LEFT JOIN users u ON u.id = a.owner_id
   LEFT JOIN asset_categories ac ON ac.id = a.category_id
   LEFT JOIN projects p ON p.id = a.project_id
   LEFT JOIN ai_requests r ON r.id = a.request_id
   LEFT JOIN LATERAL (
     SELECT COUNT(*)::INT AS views
     FROM ai_asset_view_logs v
     WHERE v.asset_id = a.id
   ) asset_views ON TRUE
   LEFT JOIN LATERAL (
     SELECT COALESCE(
       JSON_AGG(JSON_BUILD_OBJECT('id', t.id, 'name', t.name) ORDER BY t.sort_order, t.id),
       '[]'
     ) AS tags
     FROM ai_asset_tag_relations rel
     JOIN asset_tags t ON t.id = rel.tag_id
     WHERE rel.asset_id = a.id
   ) tags ON TRUE
   LEFT JOIN LATERAL (
     SELECT COALESCE(
       JSON_AGG(
         JSON_BUILD_OBJECT(
           'id', p.id,
           'name', p.image_name${includePreview ? ", 'data', p.image_data" : ''}
         )
         ORDER BY LOWER(p.image_name), p.image_name, p.id
       ),
       '[]'
     ) AS preview_images
     FROM ai_asset_preview_images p
     WHERE p.asset_id = a.id
   ) previews ON TRUE
   ${whereClause}
   ${orderClause}`;
}

function projectListSql(whereClause = '', orderClause = '') {
  return `SELECT p.*, pc.name AS category_name,
    COUNT(DISTINCT r.id)::INT AS request_count,
    COUNT(DISTINCT a.id)::INT AS asset_count
   FROM projects p
   LEFT JOIN project_categories pc ON pc.id = p.category_id
   LEFT JOIN ai_requests r ON r.project_id = p.id
   LEFT JOIN ai_assets a ON a.project_id = p.id
   ${whereClause}
   GROUP BY p.id, pc.name
   ${orderClause}`;
}

async function nextRequestCode(client) {
  const result = await client.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ai_requests`);
  return `REQ-2026-${String(result.rows[0].next_id).padStart(3, '0')}`;
}

async function syncRequestTags(client, requestId, tagIds) {
  await client.query('DELETE FROM ai_request_tag_relations WHERE request_id = $1', [requestId]);
  for (const tagId of tagIds.map((id) => toInt(id)).filter(Boolean)) {
    await client.query('INSERT INTO ai_request_tag_relations (request_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [requestId, tagId]);
  }
}

async function syncAssetTags(client, assetId, tagIds = []) {
  await client.query('DELETE FROM ai_asset_tag_relations WHERE asset_id = $1', [assetId]);
  const uniqueTagIds = [...new Set(tagIds.map((id) => toInt(id)).filter(Boolean))];
  for (const tagId of uniqueTagIds) {
    await client.query('INSERT INTO ai_asset_tag_relations (asset_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [assetId, tagId]);
  }
}

async function syncAssetPreviewImages(client, assetId, images = []) {
  await client.query('DELETE FROM ai_asset_preview_images WHERE asset_id = $1', [assetId]);
  const sortedImages = [...images]
    .filter((image) => image?.data)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN', { numeric: false, sensitivity: 'base' }));
  for (const [index, image] of sortedImages.entries()) {
    await client.query(
      `INSERT INTO ai_asset_preview_images (asset_id, image_data, image_name, sort_order)
       VALUES ($1, $2, $3, $4)`,
      [assetId, image.data, image.name || `预览图-${index + 1}`, index + 1]
    );
  }
}

async function logRequest(client, requestId, action, detail, actorId) {
  await client.query('INSERT INTO ai_request_logs (request_id, action, detail, actor_id) VALUES ($1, $2, $3, $4)', [requestId, action, detail, actorId]);
  await client.query('INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES ($1, $2, $3, $4, $5)', ['request', requestId, action, detail, actorId]);
}

function summarizeKnowledge(question, rows) {
  if (!rows.length) return '暂未在学习资料中找到直接匹配的内容，可以换一个关键词试试。';
  const lines = rows.map((row) => `《${row.title}》：${row.content_text || row.description}`).join('\n');
  return `根据当前学习资料，和“${question || '你的问题'}”相关的内容如下：\n${lines}`;
}
