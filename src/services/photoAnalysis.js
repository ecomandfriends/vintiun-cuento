const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function analyzeChildPhotos(photoBuffers) {
  console.log('DEBUG analyze called, photos:', photoBuffers.length);
  
  const imageContents = photoBuffers.map((buf) => ({
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
            text: `Look at these portrait photos and describe the person's appearance.

Respond ONLY with a valid JSON object, no markdown, no explanation:
{
  "hairColor": "<e.g. 'dark brown', 'light blonde', 'black', 'auburn red'>",
  "hairStyle": "<e.g. 'short straight', 'curly medium length', 'long wavy'>",
  "eyeColor": "<e.g. 'dark brown', 'hazel', 'blue', 'green'>",
  "skinTone": "<e.g. 'fair', 'light warm', 'medium olive', 'medium brown', 'dark brown'>",
  "gender": "<'boy' or 'girl'>",
  "age": "<estimated age range, e.g. '2-3 years old'>",
  "childDesc": "<single descriptive string combining all traits, e.g. 'a 3 year old girl with dark brown curly hair, hazel eyes and light warm skin tone'>"
}`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0].text.trim().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  console.log('Claude response:', raw);

  try {
    const traits = JSON.parse(raw);
    return traits;
  } catch {
    console.error('Error parsing traits JSON:', raw);
    return fallbackTraits();
  }
}

function detectMimeType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
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
