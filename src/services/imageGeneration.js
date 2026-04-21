const { BOOKS } = require('../../config/books');

const FAL_BASE = 'https://fal.run';

async function generatePage({ bookId, pageNum, childDesc, childName }) {
  const book = BOOKS[bookId];
  if (!book) throw new Error('Book not found: ' + bookId);

  const page = book.pages.find(p => p.num === pageNum);
  if (!page) throw new Error('Page ' + pageNum + ' not found');

  // Exactamente como en fal.ai playground que funcionó
  const fullPrompt = 'ESTILO_01, ' + page.promptScene.replace('[CHILD_DESC]', childDesc) + ', named ' + childName + ', children picture book illustration, vibrant colors, bold outlines, no text';

  console.log('Generating page', pageNum, '| prompt:', fullPrompt.substring(0, 120));

  const payload = {
    prompt: fullPrompt,
    negative_prompt: 'realistic, photo, 3d render, ugly, text, watermark, blurry, dark, scary, adult content',
    loras: [{ path: 'https://v3b.fal.media/files/b/0a969e5d/5N4qPnpIGHkzao7nvWYdM_pytorch_lora_weights.safetensors', scale: 0.8 }],
    seed: page.seed,
    num_inference_steps: 28,
    guidance_scale: 3.5,
    image_size: { width: 1024, height: 1024 },
    num_images: 1,
    enable_safety_checker: false,
  };

  const res = await falRequest(`${FAL_BASE}/fal-ai/flux/dev`, payload);

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
    const res = await falRequest(`${FAL_BASE}/fal-ai/esrgan`, { image_url: imageUrl, scale: 2 });
    return res.image?.url || imageUrl;
  } catch { return imageUrl; }
}

async function falRequest(url, payload) {
  console.log('fal.ai request to:', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Key ' + process.env.FAL_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) { const err = await res.text(); throw new Error('fal.ai error ' + res.status + ': ' + err); }
  return res.json();
}

module.exports = { generatePage, generatePages, upscaleForPrint };
