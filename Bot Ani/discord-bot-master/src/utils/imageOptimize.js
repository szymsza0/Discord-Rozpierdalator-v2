/**
 * Konwersja zdjec do WebP + ograniczenie wymiarow, tuz przed wgraniem do
 * WP Media Library. Cel: landing page ma byc jak najszybszy - webp + rozsadny
 * max width to najwiekszy zysk na wadze.
 *
 * sharp jest ladowany dynamicznie i w try/catch: jesli natywna zaleznosc nie
 * zbuduje sie na danym hoscie, pipeline po prostu wgrywa oryginal zamiast
 * wywalac bota.
 */

const RASTER = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff", "image/avif"]);

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/tiff": "tif",
  "image/avif": "avif",
};

export function extForMime(mimeType) {
  return EXT_BY_MIME[(mimeType || "").toLowerCase()] || "bin";
}

let _sharp; // undefined = nie probowano, null = niedostepny
async function getSharp() {
  if (_sharp !== undefined) return _sharp;
  try {
    _sharp = (await import("sharp")).default;
  } catch (err) {
    console.warn("[imageOptimize] sharp niedostepny, pomijam konwersje do webp:", err.message);
    _sharp = null;
  }
  return _sharp;
}

/**
 * @param {Buffer} buffer
 * @param {string} contentType
 * @param {{ maxWidth?: number, quality?: number }} [opts]
 * @returns {Promise<{ buffer: Buffer, contentType: string, ext: string, converted: boolean }>}
 */
export async function optimizeToWebp(buffer, contentType, { maxWidth = 1800, quality = 80 } = {}) {
  const type = (contentType || "").toLowerCase();
  const passthrough = { buffer, contentType: type || "application/octet-stream", ext: extForMime(type), converted: false };

  // SVG / GIF / nieznany typ - nie konwertujemy (wektor / animacja / ryzyko).
  if (!RASTER.has(type)) return passthrough;

  const sharp = await getSharp();
  if (!sharp) return passthrough;

  try {
    let img = sharp(buffer, { failOn: "none" }).rotate(); // wypal orientacje EXIF
    const meta = await img.metadata();

    // animowany webp / wielostronicowy - zostaw
    if (meta.pages && meta.pages > 1) return passthrough;

    if (meta.width && meta.width > maxWidth) {
      img = img.resize({ width: maxWidth, withoutEnlargement: true });
    }

    const out = await img.webp({ quality, effort: 4 }).toBuffer();

    // jesli "optymalizacja" webp->webp urosla, nie ma sensu
    if (type === "image/webp" && out.length >= buffer.length && !(meta.width > maxWidth)) {
      return { buffer, contentType: "image/webp", ext: "webp", converted: false };
    }
    return { buffer: out, contentType: "image/webp", ext: "webp", converted: true };
  } catch (err) {
    console.warn("[imageOptimize] blad konwersji, wgrywam oryginal:", err.message);
    return passthrough;
  }
}
