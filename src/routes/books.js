const express = require('express');
const multer  = require('multer');
const crypto  = require('crypto');
const router  = express.Router();

const { analyzeChildPhotos }             = require('../services/photoAnalysis');
const { generatePages, upscaleForPrint } = require('../services/imageGeneration');
const { generateBookPDF }               = require('../services/pdfGenerator');
const {
  createSession, updateSession, getSession,
  uploadChildPhotos, saveGeneratedImage, savePDF, deleteChildPhotos,
} = require('../services/storage');
const { BOOKS } = require('../../config/books');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Solo se aceptan imagenes'));
  },
});

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

router.post('/session', async (req, res) => {
  try {
    const { bookId, childName, childAge, gender } = req.body;
    if (!bookId || !childName) return res.status(400).json({ error: 'bookId y childName son obligatorios' });
    if (!BOOKS[bookId]) return res.status(404).json({ error: 'Libro no encontrado: ' + bookId });
    const sessionId = await createSession({ bookId, childName: childName.trim(), childAge, gender });
    res.json({ sessionId, status: 'pending' });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: 'Error creando sesion' });
  }
});

router.post('/analyze', upload.array('photos', 4), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const files = req.files;
    if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });
    if (!files || files.length < 2) return res.status(400).json({ error: 'Se necesitan minimo 2 fotos' });
    await updateSession(sessionId, { status: 'analyzing' });
    const photoBuffers = files.map(f => f.buffer);
    const photoUrls = await uploadChildPhotos(sessionId, photoBuffers);
    const traits = await analyzeChildPhotos(photoBuffers);
    await updateSession(sessionId, {
      traits: JSON.stringify(traits),
      photo_urls: JSON.stringify(photoUrls),
      face_image_url: photoUrls[0],
      status: 'analyzed',
    });
    res.json({ sessionId, traits, status: 'analyzed' });
  } catch (err) {
    console.error('Error analyzing photos:', err);
    res.status(500).json({ error: 'Error analizando las fotos' });
  }
});

router.post('/preview', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId requerido' });
    const session = await getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Sesion no encontrada' });
    const book = BOOKS[session.book_id];
    const traits = JSON.parse(session.traits || '{}');
    await updateSession(sessionId, { status: 'generating_preview' });
    const generatedPages = await generatePages({
      bookId: session.book_id,
      pageNums: book.previewPages,
      childDesc: traits.childDesc,
      childName: session.child_name,
      faceImageUrl: session.face_image_url,
      concurrency: 2,
    });
    const savedPages = await Promise.all(
      generatedPages.map(async p => {
        if (!p.imageUrl) return p;
        const permanentUrl = await saveGeneratedImage(sessionId, p.pageNum, p.imageUrl);
        return { ...p, imageUrl: permanentUrl };
      })
    );
    await deleteChildPhotos(sessionId);
    const pagesWithText = savedPages.map(p => ({
      pageNum: p.pageNum,
      imageUrl: p.imageUrl,
      text: book.pages.find(bp => bp.num === p.pageNum)?.text.replace(/\[NOMBRE\]/g, session.child_name) || '',
    }));
    await updateSession(sessionId, { status: 'preview_ready', preview_pages: JSON.stringify(pagesWithText) });
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
    res.status(404).json({ error: 'Sesion no encontrada' });
  }
});

router.post('/webhook/shopify', express.raw({ type: 'application/json' }), async (req, res) => {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const hash = crypto.createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET).update(req.body).digest('base64');
  if (hash !== hmac) return res.status(401).json({ error: 'Webhook signature invalid' });
  res.status(200).send('OK');
  try {
    const order = JSON.parse(req.body.toString());
    const sessionId = extractSessionIdFromOrder(order);
    if (sessionId) generateFullBook(sessionId).catch(err => console.error('Background generation error:', err));
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

async function generateFullBook(sessionId) {
  const session = await getSession(sessionId);
  const book = BOOKS[session.book_id];
  const traits = JSON.parse(session.traits || '{}');
  await updateSession(sessionId, { status: 'generating_full' });
  const previewPageNums = book.previewPages;
  const remainingPageNums = book.pages.map(p => p.num).filter(n => !previewPageNums.includes(n));
  const newPages = await generatePages({
    bookId: session.book_id,
    pageNums: remainingPageNums,
    childDesc: traits.childDesc,
    childName: session.child_name,
    faceImageUrl: session.face_image_url,
    concurrency: 3,
  });
  const previewPages = JSON.parse(session.preview_pages || '[]');
  const allPageData = [];
  for (const p of previewPages) {
    const upscaledUrl = await upscaleForPrint(p.imageUrl);
    const finalUrl = await saveGeneratedImage(sessionId, p.pageNum, upscaledUrl);
    allPageData.push({ pageNum: p.pageNum, imageUrl: finalUrl });
  }
  for (const p of newPages) {
    if (!p.imageUrl) continue;
    const upscaledUrl = await upscaleForPrint(p.imageUrl);
    const finalUrl = await saveGeneratedImage(sessionId, p.pageNum, upscaledUrl);
    allPageData.push({ pageNum: p.pageNum, imageUrl: finalUrl });
  }
  const pdfBuffer = await generateBookPDF({ childName: session.child_name, bookId: session.book_id, pages: allPageData, bookConfig: book });
  const pdfUrl = await savePDF(sessionId, pdfBuffer);
  await updateSession(sessionId, { status: 'completed', pdf_url: pdfUrl, completed_at: new Date().toISOString() });
  console.log('Book completed:', pdfUrl);
}

function extractSessionIdFromOrder(order) {
  for (const item of order.line_items || []) {
    for (const prop of item.properties || []) {
      if (prop.name === '_session_id') return prop.value;
    }
  }
  return null;
}

module.exports = router;
