-- ─────────────────────────────────────────────────────────────
-- Supabase SQL — Vintiun Cuentos Mágicos
-- Ejecutar en Supabase > SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Tabla principal de sesiones / pedidos
CREATE TABLE IF NOT EXISTS book_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id         TEXT NOT NULL,
  child_name      TEXT NOT NULL,
  child_age       TEXT,
  gender          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  -- pending → analyzing → analyzed → generating_preview → preview_ready
  -- → paid → generating_full → completed | failed

  traits          JSONB,           -- rasgos extraídos por Claude Vision
  photo_urls      JSONB,           -- URLs fotos originales (se borran tras generar)
  face_image_url  TEXT,            -- URL primera foto para IP-Adapter

  preview_pages   JSONB,           -- páginas del preview con imageUrl y text
  pdf_url         TEXT,            -- URL PDF final print-ready

  shopify_order_id TEXT,           -- ID pedido Shopify (llega por webhook)
  shopify_variant  TEXT,           -- tapa_blanda | tapa_dura

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,     -- 24h si no se paga
  completed_at    TIMESTAMPTZ
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sessions_status     ON book_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON book_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_shopify    ON book_sessions(shopify_order_id);

-- RLS — solo el service key puede leer/escribir (backend Railway)
ALTER TABLE book_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service key full access" ON book_sessions
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- Storage buckets (crear en Supabase > Storage > New bucket)
-- ─────────────────────────────────────────────────────────────
-- child-photos  → private, 24h TTL (se borran tras generar)
-- book-pages    → public,  1 year TTL
-- book-pdfs     → private, acceso solo con URL firmada

-- Limpiar sesiones expiradas (ejecutar como cron job o pg_cron)
-- DELETE FROM book_sessions
-- WHERE expires_at < now() AND status NOT IN ('completed', 'paid');
