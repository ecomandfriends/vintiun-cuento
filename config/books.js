// src/routes/books.js
// ─────────────────────────────────────────────────────────────
// Endpoints principales del flujo de creación de cuentos.
//
// POST /api/books/session          → Crear sesión nueva
// POST /api/books/analyze          → Subir fotos + analizar rasgos
// POST /api/books/preview          → Generar preview (4 páginas)
// GET  /api/books/session/:id      → Estado de la sesión
// POST /api/books/generate-full    → Generar libro completo (tras pago)
// POST /api/books/webhook/shopify  → Webhook de Shopify (pago confirmado)
// ─────────────────────────────────────────────────────────────

const express = require('express');
const multer  = require('multer');
const crypto  = require('crypto');
const router  = express.Router();

const { analyzeChildPhotos }          = require('../services/photoAnalysis');
const { generatePages, upscaleForPrint } = require('../services/imageGeneration');
const { generateBookPDF }             = require('../services/pdfGenerator');
const {
  createSession, updateSession, getSession,
  uploadChildPhotos, saveGeneratedImage, savePDF, deleteChildPhotos,
} = require('../services/storage');
const { BOOKS } = require('../../config/books');

// Multer en memoria — máx 4 fotos, 10MB cada una
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se aceptan imágenes'));
  },
});

// ── GET /api/books ────────────────────────────────────────────
// Lista los cuentos disponibles
router.get('/', (req, res) => {
  const books = Object.values(BOOKS).map(b => ({
    id: b.id,
    title: b.title,
    style: b.style,
    ageRange: b.ageRange,
    pageCount: b.pages.length,
  }));
  res.json({ books });
});

// ── POST /api/books/session ───────────────────────────────────
// Paso 1: Crear sesión antes de subir fotos
router.post('/session', async (req, res) => {
  try {
    const { bookId, childName, childAge, gender } = req.body;

    if (!bookId || !childName) {
      return res.status(400).json({ error: 'bookId y childName son obligatorios' });
    }

    if (!BOOKS[bookId]) {
      return res.status(404).json({ error: `Libro no encontrado: ${bookId}` });
    }

    const sessionId = await createSession({ bookId, childName: childName.trim(), childAge, gender });

    res.json({ sessionId, status: 'pending' });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: 'Error creando sesión' });
  }
});

// ── POST /api/books/analyze ───────────────────────────────────
// Paso 2: Subir fotos del niño y analizar sus rasgos con Claude Vision
router.post('/analyze', upload.array('photos', 4), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const files = req.files;

    if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });
    if (!files || files.length < 2) return res.status(400).json({ error: 'Se necesitan mínimo 2 fotos' });

    const session = await getSession(sessionId);
    await updateSession(sessionId, { status: 'analyzing' });

    // 1. Subir fotos originales a Supabase
    const photoBuffers = files.map(f => f.buffer);
    const photoUrls = await uploadChildPhotos(sessionId, photoBuffers);

    // 2. Analizar rasgos con Claude Vision
    const traits = await analyzeChildPhotos(photoBuffers);

    // 3. Guardar traits en la sesión
    await updateSession(sessionId, {
      traits: JSON.stringify(traits),
      photo_urls: JSON.stringify(photoUrls),
      face_image_url: photoUrls[0], // primera foto como referencia para IP-Adapter
      status: 'analyzed',
    });

    res.json({
      sessionId,
      traits,
      status: 'analyzed',
    });
  } catch (err) {
    console.error('Error analyzing photos:', err);
    res.status(500).json({ error: 'Error analizando las fotos' });
  }
});

// ── POST /api/books/preview ───────────────────────────────────
// Paso 3: Generar las páginas de preview (gratis, antes del pago)
router.post('/preview', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });

    const session = await getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const book = BOOKS[session.book_id];
    const traits = JSON.parse(session.traits || '{}');

    await updateSession(sessionId, { status: 'generating_preview' });

    // Generar solo las páginas de preview
    const generatedPages = await generatePages({
      bookId: session.book_id,
      pageNums: book.previewPages,
      childDesc: traits.childDesc,
      childName: session.child_name,
      faceImageUrl: session.face_image_url,
      concurrency: 2, // menos concurrencia para preview
    });

    // Guardar imágenes en Supabase (URLs permanentes)
    const savedPages = await Promise.all(
      generatedPages.map(async p => {
        if (!p.imageUrl) return p;
        const permanentUrl = await saveGeneratedImage(sessionId, p.pageNum, p.imageUrl);
        return { ...p, imageUrl: permanentUrl };
      })
    );

    // Eliminar fotos originales tras generar (GDPR)
    await deleteChildPhotos(sessionId);

    // Preparar respuesta con textos personalizados
    const pagesWithText = savedPages.map(p => ({
      pageNum: p.pageNum,
      imageUrl: p.imageUrl,
      text: book.pages
        .find(bp => bp.num === p.pageNum)
        ?.text.replace(/\[NOMBRE\]/g, session.child_name) || '',
    }));

    await updateSession(sessionId, {
      status: 'preview_ready',
      preview_pages: JSON.stringify(pagesWithText),
    });

    res.json({
      sessionId,
      childName: session.child_name,
      bookTitle: book.title.replace('[NOMBRE]', session.child_name),
      traits,
      pages: pagesWithText,
      totalPages: book.pages.length,
      previewPages: book.previewPages,
      status: 'preview_ready',
    });
  } catch (err) {
    console.error('Error generating preview:', err);
    res.status(500).json({ error: 'Error generando preview' });
  }
});

// ── GET /api/books/session/:id ────────────────────────────────
// Consultar estado de una sesión (polling desde el frontend)
router.get('/session/:id', async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    res.json({
      sessionId: session.id,
      status: session.status,
      childName: session.child_name,
      bookId: session.book_id,
      traits: session.traits ? JSON.parse(session.traits) : null,
      previewPages: session.preview_pages ? JSON.parse(session.preview_pages) : null,
      pdfUrl: session.pdf_url || null,
    });
  } catch (err) {
    res.status(404).json({ error: 'Sesión no encontrada' });
  }
});

// ── POST /api/books/webhook/shopify ──────────────────────────
// Shopify llama aquí cuando se confirma el pago.
// Inicia la generación completa del libro en background.
router.post('/webhook/shopify', express.raw({ type: 'application/json' }), async (req, res) => {
  // Verificar firma del webhook
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(req.body)
    .digest('base64');

  if (hash !== hmac) {
    return res.status(401).json({ error: 'Webhook signature invalid' });
  }

  res.status(200).send('OK'); // Responder inmediatamente a Shopify

  // Procesar en background
  try {
    const order = JSON.parse(req.body.toString());
    const sessionId = extractSessionIdFromOrder(order);

    if (sessionId) {
      generateFullBook(sessionId).catch(err => {
        console.error('Error in background generation:', err);
      });
    }
  } catch (err) {
    console.error('Error processing Shopify webhook:', err);
  }
});

// ── Generación completa del libro (background) ────────────────
async function generateFullBook(sessionId) {
  const session = await getSession(sessionId);
  const book = BOOKS[session.book_id];
  const traits = JSON.parse(session.traits || '{}');

  await updateSession(sessionId, { status: 'generating_full' });

  // Páginas que ya tenemos del preview
  const previewPageNums = book.previewPages;
  const remainingPageNums = book.pages
    .map(p => p.num)
    .filter(n => !previewPageNums.includes(n));

  // Generar páginas restantes
  const newPages = await generatePages({
    bookId: session.book_id,
    pageNums: remainingPageNums,
    childDesc: traits.childDesc,
    childName: session.child_name,
    faceImageUrl: session.face_image_url,
    concurrency: 3,
  });

  // Upscale TODAS las páginas para impresión (preview + nuevas)
  const previewPages = JSON.parse(session.preview_pages || '[]');
  const allPageData = [];

  // Upscale y guardar páginas de preview
  for (const p of previewPages) {
    const upscaledUrl = await upscaleForPrint(p.imageUrl);
    const finalUrl = await saveGeneratedImage(sessionId, p.pageNum, upscaledUrl);
    allPageData.push({ pageNum: p.pageNum, imageUrl: finalUrl });
  }

  // Upscale y guardar páginas nuevas
  for (const p of newPages) {
    if (!p.imageUrl) continue;
    const upscaledUrl = await upscaleForPrint(p.imageUrl);
    const finalUrl = await saveGeneratedImage(sessionId, p.pageNum, upscaledUrl);
    allPageData.push({ pageNum: p.pageNum, imageUrl: finalUrl });
  }

  // Generar PDF final
  const pdfBuffer = await generateBookPDF({
    childName: session.child_name,
    bookId: session.book_id,
    pages: allPageData,
    bookConfig: book,
  });

  const pdfUrl = await savePDF(sessionId, pdfBuffer);

  await updateSession(sessionId, {
    status: 'completed',
    pdf_url: pdfUrl,
    completed_at: new Date().toISOString(),
  });

  console.log(`Book completed for session ${sessionId}: ${pdfUrl}`);
}

function extractSessionIdFromOrder(order) {
  // El sessionId se pasa como line_item property en Shopify
  for (const item of order.line_items || []) {
    for (const prop of item.properties || []) {
      if (prop.name === '_session_id') return prop.value;
    }
  }
  return null;
}

module.exports = router;
