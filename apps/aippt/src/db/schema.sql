-- aippt decks 表
-- outline 阶段与完整 deck 用同一 id（统一生命周期，便于历史/继续编辑）
CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'corporate',
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('outline', 'ready')),
  outline_json JSONB,
  deck_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS decks_created_at_idx ON decks (created_at DESC);

-- 自定义主题（品牌模板）
CREATE TABLE IF NOT EXISTS themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  colors JSONB NOT NULL,
  logo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
