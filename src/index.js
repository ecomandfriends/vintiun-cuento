// src/index.js
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const booksRouter = require('./routes/books');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ── Seguridad básica ──────────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    `https://${process.env.SHOPIFY_STORE_DOMAIN}`,
    'http://localhost:3000',
    'http://localhost:5500',
    'https://www.vintiun.com',
    'https://vintiun.com',
  ],
  credentials: true,
}));

// Rate limiting — evitar abuso del endpoint de generación
const previewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // máx 10 previews por IP por hora
  message: { error: 'Demasiadas solicitudes. Inténtalo en una hora.' },
});

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Demasiadas solicitudes.' },
});

// ── Body parsing ──────────────────────────────────────────────
// Nota: el webhook de Shopify necesita raw body, lo maneja en su propia ruta
app.use((req, res, next) => {
  if (req.path === '/api/books/webhook/shopify') return next();
  express.json({ limit: '1mb' })(req, res, next);
});

// ── Rutas ─────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/books', analyzeLimiter, booksRouter);
app.use('/api/books/preview', previewLimiter);

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Archivo demasiado grande (máx 10MB)' });
  }
  if (err.message === 'Solo se aceptan imágenes') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, () => {
  console.log(`✓ Vintiun Cuentos Backend running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV}`);
});
