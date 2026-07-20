INSERT INTO project_categories (name, sort_order) VALUES
  ('风险管理类', 1),
  ('合规内控类', 2),
  ('文本处理类', 3),
  ('数据治理类', 4),
  ('其他类', 5)
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order;

UPDATE asset_categories
SET name = 'Agent'
WHERE name = 'Demo';

INSERT INTO asset_categories (name, sort_order) VALUES
  ('Agent', 1),
  ('Skills', 2),
  ('其他', 3)
ON CONFLICT (name) DO UPDATE SET sort_order = EXCLUDED.sort_order;

UPDATE request_tags
SET name = 'AI资产',
    description = '开发可复用 AI 工具、AI Agent 或资产，并通过资产形式交付给客户或组内使用。'
WHERE name = 'AI Agent资产';

INSERT INTO request_tags (name, description, sort_order) VALUES
  ('AI咨询项目', '面向客户的 AI 咨询项目，例如 AI 规划、AI 治理、AI 风险管理等。', 1),
  ('AI交付加速', '项目内部使用 AI 工具加速交付，例如用 Codex 制作 PPT、原型、分析脚本等。', 2),
  ('AI资产', '开发可复用 AI 工具、AI Agent 或资产，并通过资产形式交付给客户或组内使用。', 3)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order;

INSERT INTO users (id, username, chinese_name, english_name, email, password_hash, level, role, status, last_login_at) VALUES
  (1, 'admin', '系统管理员', 'System, Admin', 'admin@deloittecn.com.cn', '$2b$10$qS9KYmqEJr/QXrAcvS6APukjUIdquXISgz4KWNBEoprGIn98ErXam', 'M', 'admin', 'active', NOW()),
  (2, 'catherinexu', '徐佳悦', 'Xu, Catherine Jia Yue', 'catherinexu@deloittecn.com.cn', '$2b$10$qS9KYmqEJr/QXrAcvS6APukjUIdquXISgz4KWNBEoprGIn98ErXam', 'M', 'admin', 'active', NOW()),
  (3, 'michaelwang', '王明', 'Wang, Michael', 'michaelwang@deloittecn.com.cn', '$2b$10$qS9KYmqEJr/QXrAcvS6APukjUIdquXISgz4KWNBEoprGIn98ErXam', 'SM', 'user', 'active', NOW()),
  (4, 'rachelli', '李若晨', 'Li, Rachel', 'rachelli@deloittecn.com.cn', '$2b$10$qS9KYmqEJr/QXrAcvS6APukjUIdquXISgz4KWNBEoprGIn98ErXam', 'C2', 'user', 'active', NOW()),
  (5, 'amychen', '陈安', 'Chen, Amy', 'amychen@deloittecn.com.cn', '$2b$10$qS9KYmqEJr/QXrAcvS6APukjUIdquXISgz4KWNBEoprGIn98ErXam', 'S1', 'admin', 'active', NOW()),
  (6, 'ninazhang', '张宁', 'Zhang, Nina', 'ninazhang@deloittecn.com.cn', '$2b$10$qS9KYmqEJr/QXrAcvS6APukjUIdquXISgz4KWNBEoprGIn98ErXam', 'C1', 'user', 'active', NOW())
ON CONFLICT (id) DO UPDATE SET
  chinese_name = EXCLUDED.chinese_name,
  english_name = EXCLUDED.english_name,
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  level = EXCLUDED.level,
  role = EXCLUDED.role,
  status = EXCLUDED.status;

SELECT SETVAL('users_id_seq', (SELECT MAX(id) FROM users));

INSERT INTO projects (id, o2e_code, wbs_code, customer_name, project_name, pic, mic, description, category_id, status) VALUES
  (1, 'O2E-9831', 'WBS-24031', '森屿科技', '内控数字化', 'Partner A', 'Manager B', '围绕客户内控流程、风险指标和数据治理进行数字化升级。', 1, 'active'),
  (2, 'O2E-9912', 'WBS-24042', '云禾集团', '风险建模', 'Partner C', 'Manager D', '建设风险指标体系和趋势监测能力。', 1, 'active'),
  (3, 'O2E-9960', 'WBS-24055', '北辰制造', '合规体系优化', 'Partner E', 'Manager F', '优化合规制度、内控流程和证据链。', 2, 'active'),
  (4, 'O2E-9971', 'WBS-24067', '星航资本', '合同风控', 'Partner G', 'Manager H', '识别合同条款差异和潜在风险。', 3, 'potential'),
  (5, 'O2E-9984', 'WBS-24071', '松石能源', '数据治理蓝图', 'Partner I', 'Manager J', '梳理数据治理规则和质量检查策略。', 4, 'active')
ON CONFLICT (id) DO UPDATE SET
  o2e_code = EXCLUDED.o2e_code,
  wbs_code = EXCLUDED.wbs_code,
  customer_name = EXCLUDED.customer_name,
  project_name = EXCLUDED.project_name,
  pic = EXCLUDED.pic,
  mic = EXCLUDED.mic,
  description = EXCLUDED.description,
  category_id = EXCLUDED.category_id,
  status = EXCLUDED.status;

SELECT SETVAL('projects_id_seq', (SELECT MAX(id) FROM projects));

INSERT INTO ai_requests (id, request_code, title, description, requester_id, handler_id, project_id, no_project, status) VALUES
  (1, 'REQ-2026-001', '客户访谈纪要总结 Agent', '上传访谈纪要后，自动提取客户痛点、风险事项、行动项和待确认问题。', 2, 3, 1, FALSE, '开发'),
  (2, 'REQ-2026-002', '风险指标自动解读', '对风险指标趋势进行自动解读，生成管理层摘要。', 4, NULL, 2, FALSE, '提出'),
  (3, 'REQ-2026-003', '制度知识库问答接口', '针对制度文件建立检索和问答接口。', 4, 4, 3, FALSE, '上线'),
  (4, 'REQ-2026-004', 'PPT 原型生成助手', '根据粗略需求快速生成咨询风格 PPT 页面和 UI 原型。', 2, 2, NULL, TRUE, '受理'),
  (5, 'REQ-2026-005', '合同条款差异识别', '识别合同文本中的差异条款和风险提示。', 6, 5, 4, FALSE, '开发'),
  (6, 'REQ-2026-006', '数据治理规则生成器', '根据数据表结构和业务场景生成质量检查规则。', 6, NULL, 5, FALSE, '提出')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  requester_id = EXCLUDED.requester_id,
  handler_id = EXCLUDED.handler_id,
  project_id = EXCLUDED.project_id,
  no_project = EXCLUDED.no_project,
  status = EXCLUDED.status;

SELECT SETVAL('ai_requests_id_seq', (SELECT MAX(id) FROM ai_requests));

INSERT INTO ai_request_tag_relations (request_id, tag_id) VALUES
  (1, 2), (1, 3),
  (2, 1),
  (3, 3),
  (4, 2),
  (5, 1),
  (6, 3)
ON CONFLICT DO NOTHING;

INSERT INTO ai_assets (id, asset_name, owner_id, request_id, category_id, project_id, description, access_url, download_url, visibility, status, version) VALUES
  (1, 'Report Agent', 3, 1, 1, 1, '自动生成项目周报、风险摘要和行动项。', 'https://lab.example.com/report-agent', NULL, 'public', 'online', 'v1.2'),
  (2, 'Policy Reader', 4, 3, 1, 3, '制度文件检索、条款解释和引用定位。', 'https://lab.example.com/policy-reader', NULL, 'public', 'online', 'v1.0'),
  (3, 'Risk Radar', 5, 2, 1, 2, '项目风险信号识别与趋势提醒。', 'https://lab.example.com/risk-radar', NULL, 'public', 'online', 'v1.1'),
  (4, 'Data Check', 6, 6, 2, 5, '数据治理检查规则辅助生成。', NULL, 'https://lab.example.com/data-check.zip', 'private', 'online', 'v0.9'),
  (5, 'BRD Assistant', 4, NULL, 1, NULL, '需求文档结构化分析和页面拆解。', 'https://lab.example.com/brd-assistant', NULL, 'public', 'online', 'v1.0'),
  (6, 'Contract Diff', 5, 5, 3, 4, '合同条款差异识别和风险提示。', NULL, 'https://lab.example.com/contract-diff.zip', 'private', 'online', 'v0.8')
ON CONFLICT (id) DO UPDATE SET
  asset_name = EXCLUDED.asset_name,
  owner_id = EXCLUDED.owner_id,
  request_id = EXCLUDED.request_id,
  category_id = EXCLUDED.category_id,
  project_id = EXCLUDED.project_id,
  description = EXCLUDED.description,
  access_url = EXCLUDED.access_url,
  download_url = EXCLUDED.download_url,
  visibility = EXCLUDED.visibility,
  status = EXCLUDED.status,
  version = EXCLUDED.version;

SELECT SETVAL('ai_assets_id_seq', (SELECT MAX(id) FROM ai_assets));

INSERT INTO ai_asset_access_requests (asset_id, requester_id, status, reason, reviewed_by, reviewed_at) VALUES
  (4, 2, 'approved', '用于数据治理蓝图项目复用。', 6, NOW()),
  (6, 2, 'pending', '希望查看合同差异识别能力。', NULL, NULL)
ON CONFLICT (asset_id, requester_id) DO UPDATE SET
  status = EXCLUDED.status,
  reason = EXCLUDED.reason,
  reviewed_by = EXCLUDED.reviewed_by,
  reviewed_at = EXCLUDED.reviewed_at;

INSERT INTO ai_asset_view_logs (asset_id, user_id, viewed_on)
SELECT a, u, CURRENT_DATE - (n % 21)
FROM GENERATE_SERIES(1, 6) AS a
CROSS JOIN GENERATE_SERIES(1, 6) AS u
CROSS JOIN GENERATE_SERIES(1, 18) AS n
WHERE (a * u + n) % 3 <> 0
ON CONFLICT DO NOTHING;

INSERT INTO learning_materials (id, title, description, category, material_type, url, content_text, maintained_by) VALUES
  (1, 'AI 项目交付方法论', '沉淀项目启动、访谈、原型和交付流程。', 'AI工具', 'Word', 'https://docs.example.com/ai-delivery', 'AI 项目交付包括需求澄清、数据盘点、原型验证、用户测试、上线运营和资产沉淀。', 2),
  (2, 'Prompt 编写规范', '常用提示词结构和质量检查清单。', 'AI工具', 'Markdown', 'https://docs.example.com/prompt-guide', '高质量 Prompt 需要明确角色、任务、上下文、输出格式和检查标准。', 2),
  (3, '数据治理案例库', '按行业、场景和规则类型维护。', '数据治理', 'Excel', 'https://docs.example.com/data-governance', '数据治理资料包含数据质量、主数据、指标口径、血缘关系和规则管理案例。', 6),
  (4, '合规内控知识手册', '支持在系统框架中在线阅读。', '合规内控', 'PDF', 'https://docs.example.com/compliance-handbook', '合规内控知识包括制度管理、流程控制、风险矩阵、证据留痕和整改追踪。', 4),
  (5, '飞书云文档：资产发布流程', '资产发布和公开设置流程。', 'AI工具', 'Link', 'https://docs.example.com/asset-publish', 'AI 资产发布需要填写资产名称、描述、链接、负责人、公开状态和关联需求。', 3),
  (6, '腾讯文档：需求标签说明', '维护三类 AI 需求标签定义和扩展规则。', 'AI工具', 'Link', 'https://docs.example.com/request-tags', 'AI 需求标签包括 AI咨询项目、AI交付加速、AI资产。', 5)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  material_type = EXCLUDED.material_type,
  url = EXCLUDED.url,
  content_text = EXCLUDED.content_text,
  maintained_by = EXCLUDED.maintained_by,
  updated_at = NOW();

SELECT SETVAL('learning_materials_id_seq', (SELECT MAX(id) FROM learning_materials));

INSERT INTO ai_request_logs (request_id, action, detail, actor_id) VALUES
  (1, '需求创建', 'Catherine 创建需求。', 2),
  (1, '受理人变更', '未认领 -> Michael Wang。', 2),
  (1, '状态变更', '受理 -> 开发。', 3),
  (3, '状态变更', '开发 -> 上线。', 4)
ON CONFLICT DO NOTHING;

INSERT INTO audit_logs (entity_type, entity_id, action, detail, actor_id) VALUES
  ('request', 1, '状态变更', 'REQ-2026-001 状态变更为开发。', 3),
  ('asset', 1, '发布版本', 'Report Agent 发布 v1.2。', 3),
  ('user', 5, '角色变更', 'Amy Chen 角色设置为管理员。', 1)
ON CONFLICT DO NOTHING;

INSERT INTO notifications (recipient_id, actor_id, entity_type, entity_id, title, message, target_route)
SELECT 5, 2, 'asset_access_request', ar.id, '新的资产访问申请', '徐佳悦申请查看 Contract Diff，请进行授权审批。', '#approvals'
FROM ai_asset_access_requests ar
WHERE ar.asset_id = 6 AND ar.requester_id = 2
  AND NOT EXISTS (
    SELECT 1 FROM notifications n
    WHERE n.entity_type = 'asset_access_request' AND n.entity_id = ar.id
  );
