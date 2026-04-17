# Vintiun Cuentos Mágicos — Backend

Backend Node/Express para Railway. Gestiona el flujo completo de creación de cuentos personalizados con IA.

## Stack

- **Runtime**: Node 18+ / Express
- **IA imágenes**: fal.ai (Flux + LoRA + IP-Adapter)
- **IA análisis**: Claude Vision (Haiku)
- **Storage + DB**: Supabase
- **PDF**: pdf-lib
- **Deploy**: Railway

## Estructura

```
src/
  index.js                  → Entry point, middlewares
  routes/
    books.js                → Todos los endpoints /api/books/*
  services/
    photoAnalysis.js        → Claude Vision → extrae rasgos del niño
    imageGeneration.js      → fal.ai → genera páginas con LoRA + IP-Adapter
    pdfGenerator.js         → pdf-lib → PDF 21x21cm print-ready con sangría
    storage.js              → Supabase → fotos, imágenes, PDFs, sesiones
config/
  books.js                  → Fuente de verdad de cuentos, páginas y prompts
supabase-schema.sql         → Tablas y políticas RLS
```

## Setup

### 1. Supabase
```sql
-- Ejecutar supabase-schema.sql en SQL Editor de Supabase
-- Crear buckets: child-photos (private), book-pages (public), book-pdfs (private)
```

### 2. Variables de entorno en Railway
Copiar `.env.example` y rellenar todos los valores.

### 3. Deploy en Railway
```bash
# Conectar repo en Railway > New Project > Deploy from GitHub
# Railway detecta automáticamente Node.js y usa npm start
```

### 4. Entrenar LoRA para cada cuento
```bash
# En fal.ai dashboard > Fine-tuning
# 1. Subir 15-20 imágenes del estilo deseado (acuarela, etc.)
# 2. Entrenar con modelo Flux Dev (~30 min, ~2€)
# 3. Copiar el path del LoRA entrenado
# 4. Actualizar LORAS_CONFIG en Railway env vars:
#    {"selva_acuarela": {"path": "tu-usuario/nombre-lora", "scale": 0.85}}
```

### 5. Webhook de Shopify
```
Railway URL: https://tu-app.railway.app/api/books/webhook/shopify
Eventos: orders/paid
```

## Flujo completo

```
Frontend                    Backend Railway              Servicios externos
────────                    ───────────────              ──────────────────
POST /session           →   createSession()          →   Supabase (insert)
POST /analyze + fotos   →   analyzeChildPhotos()     →   Claude Vision
                            uploadChildPhotos()       →   Supabase Storage
POST /preview           →   generatePages([1,3,5,8]) →   fal.ai Flux+LoRA
                            saveGeneratedImage()      →   Supabase Storage
                            deleteChildPhotos()       →   Supabase (GDPR)
GET  /session/:id       →   getSession()             →   Supabase

[Usuario paga en Shopify]
Shopify webhook         →   generateFullBook()       →   fal.ai (8 páginas)
                            upscaleForPrint()         →   fal.ai ESRGAN
                            generateBookPDF()         →   pdf-lib (local)
                            savePDF()                →   Supabase Storage
                            updateSession(completed)  →   Supabase
```

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/books` | Lista cuentos disponibles |
| POST | `/api/books/session` | Crear sesión |
| POST | `/api/books/analyze` | Subir fotos + analizar rasgos |
| POST | `/api/books/preview` | Generar preview gratis (4 páginas) |
| GET | `/api/books/session/:id` | Estado de sesión |
| POST | `/api/books/webhook/shopify` | Webhook pago confirmado |

## Añadir un nuevo cuento

1. Crear 15–20 ilustraciones del estilo deseado
2. Entrenar LoRA en fal.ai
3. Añadir la entrada en `config/books.js` siguiendo la plantilla comentada
4. Actualizar `LORAS_CONFIG` en Railway
5. Listo — el nuevo cuento aparece automáticamente en `/api/books`

## Consistencia de estilo garantizada

Cada página usa:
- **LoRA propio del libro** (scale 0.85) → estilo visual idéntico
- **IP-Adapter con foto del niño** (scale 0.60) → rasgos faciales consistentes  
- **Seed fijo por número de página** → composición reproducible
- **Prompt base de estilo** antepuesto siempre → paleta y técnica fijas
- **Negative prompt estándar** → evita elementos no deseados
