// src/services/imageGeneration.js
// ─────────────────────────────────────────────────────────────
// Genera ilustraciones para cada página usando fal.ai.
// Garantiza consistencia de estilo mediante:
//   1. LoRA propio por libro (estilo visual fijo)
//   2. IP-Adapter (identidad facial del niño)
//   3. Seed fijo por página (composición reproducible)
//   4. Prompt base de estilo antepuesto siempre
// ─────────────────────────────────────────────────────────────

const { BOOKS } = require('../../config/books');

const FAL_BASE = 'https://fal.run';

/**
 * Genera UNA página del cuento.
 *
 * @param {object} opts
 * @param {string} opts.bookId       - ID del libro (ej: 'selva_acuarela')
 * @param {number} opts.pageNum      - Número de página
 * @param {string} opts.childDesc    - Descripción del niño extraída por Claude
 * @param {string} opts.childName    - Nombre del niño
 * @param {string|null} opts.faceImageUrl - URL de la foto del niño en Supabase (para IP-Adapter)
 * @returns {Promise<{imageUrl: string, pageNum: number}>}
 */
async function generatePage({ bookId, pageNum, childDesc, childName, faceImageUrl }) {
  const book = BOOKS[bookId];
  if (!book) throw new Error(`Book not found: ${bookId}`);

  const page = book.pages.find(p => p.num === pageNum);
  if (!page) throw new Error(`Page ${pageNum} not found in book ${bookId}`);

  const loras = getLoras(book.loraKey);

  // Construir prompt completo
  // Orden: estilo base → escena → descripción del niño → refuerzos
  const fullPrompt = [
    book.stylePrompt,
    page.promptScene.replace('[CHILD_DESC]', childDesc),
    `character named ${childName}`,
    'detailed face, expressive eyes, cute and friendly',
  ].join(', ');

  const payload = {
    prompt: fullPrompt,
    negative_prompt: book.negativePrompt,
    seed: page.seed,
    num_inference_steps: 30,
    guidance_scale: 7.5,
    image_size: { width: 1024, height: 1024 },
    num_images: 1,
    ...(loras.length > 0 && { loras }),
    ...(faceImageUrl && {
      ip_adapter_image_url: faceImageUrl,
      ip_adapter_scale: 0.6,
    }),
  };

  const endpoint = faceImageUrl
    ? `${FAL_BASE}/fal-ai/flux/dev/image-to-image`  // con IP-Adapter
    : `${FAL_BASE}/fal-ai/flux/dev`;                 // sin IP-Adapter (fallback)

  const res = await falRequest(endpoint, payload);

  if (!res.images?.[0]?.url) {
    throw new Error(`fal.ai returned no image for page ${pageNum}`);
  }

  return {
    pageNum,
    imageUrl: res.images[0].url,
    seed: page.seed,
  };
}

/**
 * Genera varias páginas en paralelo (con límite de concurrencia).
 *
 * @param {object} opts
 * @param {string} opts.bookId
 * @param {number[]} opts.pageNums   - Qué páginas generar
 * @param {string} opts.childDesc
 * @param {string} opts.childName
 * @param {string|null} opts.faceImageUrl
 * @param {number} opts.concurrency  - Máx peticiones simultáneas a fal.ai
 * @returns {Promise<Array<{pageNum, imageUrl}>>}
 */
async function generatePages({ bookId, pageNums, childDesc, childName, faceImageUrl, concurrency = 3 }) {
  const results = [];

  // Procesamos en chunks para no saturar fal.ai
  for (let i = 0; i < pageNums.length; i += concurrency) {
    const chunk = pageNums.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(pageNum =>
        generatePage({ bookId, pageNum, childDesc, childName, faceImageUrl })
          .catch(err => {
            console.error(`Error generating page ${pageNum}:`, err.message);
            return { pageNum, imageUrl: null, error: err.message };
          })
      )
    );
    results.push(...chunkResults);
  }

  return results;
}

/**
 * Upscale de imagen para impresión (2x, 300dpi equivalent).
 * Usamos fal-ai/esrgan para calidad de impresión.
 */
async function upscaleForPrint(imageUrl) {
  const res = await falRequest(`${FAL_BASE}/fal-ai/esrgan`, {
    image_url: imageUrl,
    scale: 2,
    face_enhance: true,
  });

  return res.image?.url || imageUrl;
}

// ── Helpers ───────────────────────────────────────────────────

function getLoras(loraKey) {
  try {
    const lorasConfig = JSON.parse(process.env.LORAS_CONFIG || '{}');
    const lora = lorasConfig[loraKey];
    if (!lora) return [];
    return [{ path: lora.path, scale: lora.scale }];
  } catch {
    return [];
  }
}

async function falRequest(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`fal.ai error ${res.status}: ${err}`);
  }

  return res.json();
}

module.exports = { generatePage, generatePages, upscaleForPrint };
