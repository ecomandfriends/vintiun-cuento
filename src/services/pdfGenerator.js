// src/services/pdfGenerator.js
// ─────────────────────────────────────────────────────────────
// Genera el PDF final del cuento listo para imprenta.
// Especificaciones:
//   - Tamaño: 21x21cm (libro cuadrado infantil)
//   - Resolución: 300dpi
//   - Sangría: 3mm en todos los lados
//   - Color: sRGB (la imprenta convierte a CMYK)
//   - Fuentes embebidas
// ─────────────────────────────────────────────────────────────

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// Medidas en puntos PDF (1 punto = 1/72 pulgada)
// 21cm = 595.28pt, sangría 3mm = 8.50pt
const PAGE_SIZE_PT = 595.28;       // 21cm × 21cm cuadrado
const BLEED_PT = 8.50;             // 3mm sangría
const FULL_PT = PAGE_SIZE_PT + (BLEED_PT * 2);  // con sangría

/**
 * Genera el PDF completo del cuento.
 *
 * @param {object} opts
 * @param {string} opts.childName
 * @param {string} opts.bookId
 * @param {Array<{pageNum, imageUrl}>} opts.pages - Imágenes ya upscaleadas
 * @param {object} opts.bookConfig - Config del libro (de books.js)
 * @returns {Promise<Buffer>} PDF como Buffer
 */
async function generateBookPDF({ childName, bookId, pages, bookConfig }) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`${bookConfig.title.replace('[NOMBRE]', childName)}`);
  pdfDoc.setAuthor('Vintiun Cuentos Mágicos');
  pdfDoc.setCreator('vintiun.com');

  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Ordenar páginas
  const sortedPages = [...pages].sort((a, b) => a.pageNum - b.pageNum);

  for (const pageData of sortedPages) {
    const pdfPage = pdfDoc.addPage([FULL_PT, FULL_PT]);

    // ── 1. Imagen de fondo (a sangría completa) ───────────────
    if (pageData.imageUrl) {
      try {
        const imgBytes = await fetchImageBuffer(pageData.imageUrl);
        const img = await embedImage(pdfDoc, imgBytes);

        // Imagen ocupa toda la página incluida sangría
        pdfPage.drawImage(img, {
          x: 0,
          y: 0,
          width: FULL_PT,
          height: FULL_PT,
        });
      } catch (err) {
        console.error(`Error embedding image for page ${pageData.pageNum}:`, err.message);
        // Fondo de color si falla la imagen
        pdfPage.drawRectangle({
          x: 0, y: 0,
          width: FULL_PT, height: FULL_PT,
          color: rgb(0.95, 0.92, 0.86),
        });
      }
    }

    // ── 2. Banda de texto en la parte inferior ────────────────
    const bookPage = bookConfig.pages.find(p => p.num === pageData.pageNum);
    if (bookPage && pageData.pageNum > 1) {
      const storyText = bookPage.text.replace(/\[NOMBRE\]/g, childName);
      drawTextBand(pdfPage, storyText, helvetica, helveticaBold);
    }

    // ── 3. Marcas de sangría (esquinas) ──────────────────────
    drawBleedMarks(pdfPage);

    // ── 4. Número de página (pequeño, en sangría) ─────────────
    if (pageData.pageNum > 1) {
      pdfPage.drawText(`${pageData.pageNum - 1}`, {
        x: FULL_PT / 2 - 5,
        y: 4,
        size: 7,
        font: helvetica,
        color: rgb(0.6, 0.6, 0.6),
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ── Helpers ───────────────────────────────────────────────────

function drawTextBand(page, text, fontRegular, fontBold) {
  const bandHeight = 72;
  const bandY = BLEED_PT;
  const textAreaWidth = PAGE_SIZE_PT - 40;

  // Fondo semitransparente blanco
  page.drawRectangle({
    x: BLEED_PT,
    y: bandY,
    width: PAGE_SIZE_PT,
    height: bandHeight,
    color: rgb(1, 1, 1),
    opacity: 0.88,
  });

  // Texto centrado, con wrapping manual
  const lines = wrapText(text, fontRegular, 15, textAreaWidth);
  const lineHeight = 20;
  const totalTextHeight = lines.length * lineHeight;
  const startY = bandY + (bandHeight - totalTextHeight) / 2 + lineHeight - 4;

  lines.forEach((line, i) => {
    const lineWidth = fontRegular.widthOfTextAtSize(line, 15);
    page.drawText(line, {
      x: BLEED_PT + (PAGE_SIZE_PT - lineWidth) / 2,
      y: startY - i * lineHeight,
      size: 15,
      font: fontRegular,
      color: rgb(0.1, 0.07, 0.03),
    });
  });
}

function drawBleedMarks(page) {
  // Marcas de corte en las 4 esquinas (5mm fuera del área de corte)
  const marks = [
    // Top-left
    { x1: 0, y1: BLEED_PT, x2: 5, y2: BLEED_PT },
    { x1: BLEED_PT, y1: FULL_PT, x2: BLEED_PT, y2: FULL_PT - 5 },
    // Top-right
    { x1: FULL_PT, y1: BLEED_PT, x2: FULL_PT - 5, y2: BLEED_PT },
    { x1: FULL_PT - BLEED_PT, y1: FULL_PT, x2: FULL_PT - BLEED_PT, y2: FULL_PT - 5 },
    // Bottom-left
    { x1: 0, y1: FULL_PT - BLEED_PT, x2: 5, y2: FULL_PT - BLEED_PT },
    { x1: BLEED_PT, y1: 0, x2: BLEED_PT, y2: 5 },
    // Bottom-right
    { x1: FULL_PT, y1: FULL_PT - BLEED_PT, x2: FULL_PT - 5, y2: FULL_PT - BLEED_PT },
    { x1: FULL_PT - BLEED_PT, y1: 0, x2: FULL_PT - BLEED_PT, y2: 5 },
  ];

  marks.forEach(({ x1, y1, x2, y2 }) => {
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 0.5,
      color: rgb(0, 0, 0),
      opacity: 0.4,
    });
  });
}

function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function fetchImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function embedImage(pdfDoc, buffer) {
  // Detectar formato por magic bytes
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return pdfDoc.embedJpg(buffer);
  }
  return pdfDoc.embedPng(buffer);
}

module.exports = { generateBookPDF };
