const { BOOKS } = require('../../config/books');

const FAL_BASE = 'https://fal.run';

async function generatePage({ bookId, pageNum, childDesc, childName }) {
  const book = BOOKS[bookId];
  if (!book) throw new Error('Book not found: ' + bookId);

  const page = book.pages.find(p => p.num === pageNum);
  if (!page) throw new Error('Page ' + pageNum + ' not found');

  const fullPrompt = [
    'ESTILO_01',
    page.promptScene.replace('[CHILD_DESC]', childDesc),
    'character named ' + childName,
    'children book illustration, cute child character, rosy cheeks, warm colors, soft lines',
    'no garden, no sunflowers, no planting',
  ].join(', ');

  console.log('Generating page', pageNum, 'prompt:', fullPrompt.substring(0, 100));

  const loras = getLoras(book.loraKey);

  const payload = {
    prompt: fullPrompt,
    negative_prompt: book.negativePrompt + ', garden, sunflowers, planting, digging, flowers bed',
    image_url: book.styleReferenceUrl,
    strength: 0.35,
    seed: page.seed,
    num_inference_steps: 28,
    guidance_scale: 7.5,
    image_size: { width: 1024, height: 1024 },
    num_images: 1,
    enable_safety_checker: false,
    ...(loras.length > 0 && { loras }),
  };

  const res = await falRequest(`${FAL_BASE}/fal-ai/flux-pro/v1/redux`, payload);

  if (!res.images?.[0]?.url) {
    throw new Error('fal.ai returned no image for page ' + pageNum);
  }

  return { pageNum, imageUrl: res.images[0].url, seed: page.seed };
}

async function generatePages({ bookId, pageNums, childDesc, childName, concurrency = 2 }) {
  const results = [];
  for (let i = 0; i < pageNums.length; i += concurrency) {
    const chunk = pageNums.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(pageNum =>
        generatePage({ bookId, pageNum, childDesc, childName })
          .catch(err => {
            console.error('Error generating page ' + pageNum + ':', err.message);
            return { pageNum, imageUrl: null, error: err.message };
          })
      )
    );
    results.push(...chunkResults);
  }
  return results;
}

async function upscaleForPrint(imageUrl) {
  try {
    const res = await falRequest(`${FAL_BASE}/fal-ai/esrgan`, {
      image_url: imageUrl,
      scale: 2,
    });
    return res.image?.url || imageUrl;
  } catch {
    return imageUrl;
  }
}

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
  console.log('fal.ai request to:', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Key ' + process.env.FAL_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('fal.ai error ' + res.status + ': ' + err);
  }

  return res.json();
}

module.exports = { generatePage, generatePages, upscaleForPrint };
