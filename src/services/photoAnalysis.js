// src/services/photoAnalysis.js
// ─────────────────────────────────────────────────────────────
// Analiza las fotos del niño con Claude Vision y extrae los
// rasgos físicos en formato listo para inyectar en los prompts.
// ─────────────────────────────────────────────────────────────

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Analiza 2–4 fotos del niño y devuelve sus rasgos físicos
 * en inglés descriptivo optimizado para prompts de imagen IA.
 *
 * @param {Buffer[]} photoBuffers - Array de buffers de imagen
 * @returns {Promise<ChildTraits>}
 */
async function analyzeChildPhotos(photoBuffers) {
  console.log("DEBUG analyze called, photos:", photoBuffers.length);
  // Convertir buffers a base64
  const imageContents = photoBuffers.map((buf, i) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: detectMimeType(buf),
      data: buf.toString('base64'),
    },
  }));

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContents,
          {
            type: 'text',
            text: `Analyze these photos of a child and extract their physical traits for use in AI image generation prompts.

Respond ONLY with a valid JSON object, no markdown, no explanation:
{
  "hairColor": "<descriptive english, e.g. 'dark brown', 'light blonde', 'black', 'auburn red'>",
  "hairStyle": "<e.g. 'short straight', 'curly medium length', 'long wavy'>",
  "eyeColor": "<e.g. 'dark brown', 'hazel', 'blue', 'green'>",
  "skinTone": "<e.g. 'fair', 'light warm', 'medium olive', 'medium brown', 'dark brown'>",
  "gender": "<'boy' or 'girl' based on appearance>",
  "age": "<estimated age range, e.g. '2-3 years old', '4-5 years old'>",
  "childDesc": "<single optimized string combining all traits for prompt injection, e.g. 'a 3 year old girl with dark brown curly hair, hazel eyes and light warm skin tone'>"
}`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0].text.trim();

  try {
    const traits = JSON.parse(raw);
    return traits;
  } catch {
    // Si Claude devuelve algo inesperado, parseamos manualmente
    console.error('Error parsing traits JSON:', raw);
    return fallbackTraits();
  }
}

function detectMimeType(buf) {
  // Detectar por magic bytes
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg'; // fallback
}

function fallbackTraits() {
  return {
    hairColor: 'brown',
    hairStyle: 'short',
    eyeColor: 'brown',
    skinTone: 'light',
    gender: 'child',
    age: '3-4 years old',
    childDesc: 'a young child with brown hair and brown eyes',
  };
}

module.exports = { analyzeChildPhotos };
