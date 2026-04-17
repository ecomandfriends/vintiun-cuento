// src/services/storage.js
// ─────────────────────────────────────────────────────────────
// Gestiona todo el ciclo de vida de archivos y datos en Supabase:
//   - Subida de fotos del niño
//   - Guardado de imágenes generadas
//   - Guardado del PDF final
//   - CRUD de sesiones/pedidos
// ─────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Buckets ───────────────────────────────────────────────────
const BUCKET_PHOTOS   = 'child-photos';    // fotos originales del niño
const BUCKET_PAGES    = 'book-pages';      // imágenes generadas por página
const BUCKET_PDFS     = 'book-pdfs';       // PDFs finales print-ready

// ── Sesiones / Pedidos ────────────────────────────────────────

/**
 * Crea una nueva sesión de cuento.
 * Una sesión agrupa todo lo de un pedido: fotos, traits, páginas, PDF.
 */
async function createSession({ bookId, childName, childAge, gender }) {
  const sessionId = uuidv4();

  const { error } = await supabase.from('book_sessions').insert({
    id: sessionId,
    book_id: bookId,
    child_name: childName,
    child_age: childAge,
    gender,
    status: 'pending',       // pending → analyzing → preview_ready → paid → generating → completed
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
  });

  if (error) throw error;
  return sessionId;
}

async function updateSession(sessionId, data) {
  const { error } = await supabase
    .from('book_sessions')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

async function getSession(sessionId) {
  const { data, error } = await supabase
    .from('book_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  return data;
}

// ── Fotos del niño ────────────────────────────────────────────

/**
 * Sube las fotos del niño a Supabase Storage.
 * Las fotos se guardan en una carpeta por sesión.
 * @returns {Promise<string[]>} URLs públicas de las fotos
 */
async function uploadChildPhotos(sessionId, photoBuffers) {
  const urls = [];

  for (let i = 0; i < photoBuffers.length; i++) {
    const filename = `${sessionId}/photo_${i + 1}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET_PHOTOS)
      .upload(filename, photoBuffers[i], {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET_PHOTOS).getPublicUrl(filename);
    urls.push(data.publicUrl);
  }

  return urls;
}

// ── Imágenes generadas ────────────────────────────────────────

/**
 * Descarga una imagen de fal.ai y la guarda en Supabase
 * (evitamos depender de URLs temporales de fal.ai).
 */
async function saveGeneratedImage(sessionId, pageNum, imageUrl) {
  const imgRes = await fetch(imageUrl);
  const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

  const filename = `${sessionId}/page_${String(pageNum).padStart(2, '0')}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET_PAGES)
    .upload(filename, imgBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_PAGES).getPublicUrl(filename);
  return data.publicUrl;
}

// ── PDF final ─────────────────────────────────────────────────

async function savePDF(sessionId, pdfBuffer) {
  const filename = `${sessionId}/book_print_ready.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET_PDFS)
    .upload(filename, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET_PDFS).getPublicUrl(filename);
  return data.publicUrl;
}

// ── Limpieza (GDPR) ───────────────────────────────────────────

/**
 * Elimina todas las fotos originales del niño tras generar el PDF.
 * Las fotos nunca se guardan más tiempo del necesario.
 */
async function deleteChildPhotos(sessionId) {
  const { data: files } = await supabase.storage
    .from(BUCKET_PHOTOS)
    .list(sessionId);

  if (files?.length) {
    const paths = files.map(f => `${sessionId}/${f.name}`);
    await supabase.storage.from(BUCKET_PHOTOS).remove(paths);
  }
}

module.exports = {
  createSession,
  updateSession,
  getSession,
  uploadChildPhotos,
  saveGeneratedImage,
  savePDF,
  deleteChildPhotos,
};
