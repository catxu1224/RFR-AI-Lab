CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  chinese_name TEXT NOT NULL,
  english_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  level TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_tags (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  o2e_code TEXT UNIQUE,
  wbs_code TEXT UNIQUE,
  customer_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  pic TEXT NOT NULL,
  mic TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES project_categories(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'potential')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_requests (
  id SERIAL PRIMARY KEY,
  request_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  requester_id INTEGER NOT NULL REFERENCES users(id),
  handler_id INTEGER REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id),
  no_project BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT '提出' CHECK (status IN ('提出', '受理', '开发', '上线', '注销')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_request_tag_relations (
  request_id INTEGER NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES request_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, tag_id)
);

CREATE TABLE IF NOT EXISTS ai_request_logs (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES ai_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_assets (
  id SERIAL PRIMARY KEY,
  asset_name TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  request_id INTEGER REFERENCES ai_requests(id),
  category_id INTEGER REFERENCES asset_categories(id),
  project_id INTEGER REFERENCES projects(id),
  description TEXT NOT NULL DEFAULT '',
  access_url TEXT,
  download_url TEXT,
  preview_image_data TEXT,
  preview_image_name TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'retired')),
  version TEXT NOT NULL DEFAULT 'v1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_asset_access_requests (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES ai_assets(id) ON DELETE CASCADE,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT NOT NULL DEFAULT '',
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, requester_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id INTEGER REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  target_route TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_asset_view_logs (
  id SERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES ai_assets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  viewed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, user_id, viewed_on)
);

CREATE TABLE IF NOT EXISTS learning_materials (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'AI工具',
  material_type TEXT NOT NULL DEFAULT 'Link',
  url TEXT NOT NULL DEFAULT '',
  content_text TEXT NOT NULL DEFAULT '',
  maintained_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_code ON ai_requests(request_code);
CREATE INDEX IF NOT EXISTS idx_requests_status ON ai_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_project ON ai_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_wbs ON projects(wbs_code);
CREATE INDEX IF NOT EXISTS idx_projects_o2e ON projects(o2e_code);
CREATE INDEX IF NOT EXISTS idx_assets_status ON ai_assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_visibility ON ai_assets(visibility);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, read_at, created_at);

ALTER TABLE ai_assets ADD COLUMN IF NOT EXISTS preview_image_data TEXT;
ALTER TABLE ai_assets ADD COLUMN IF NOT EXISTS preview_image_name TEXT;
