/**
 * Client-side photo downscaling before upload. Phone cameras produce 4–12 MB
 * files; proof-of-work and receipt shots read identically at ~2,000 px on the
 * long edge and weigh 5–8× less, which is what actually drives the storage
 * bill. EXIF orientation is honored via createImageBitmap. Anything that
 * can't be decoded (HEIC on some browsers, SVG, GIF) is returned untouched so
 * the upload never fails because of this step.
 */
export const PHOTO_MAX_EDGE = 2000;
export const PHOTO_JPEG_QUALITY = 0.85;

export async function downscaleImage(
  file: File,
  { maxEdge = PHOTO_MAX_EDGE, quality = PHOTO_JPEG_QUALITY }: { maxEdge?: number; quality?: number } = {},
): Promise<File> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file;
  if (/gif|svg/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const { width, height } = bitmap;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    // Small already and JPEG: nothing to gain, keep the original bytes.
    if (scale === 1 && file.type === 'image/jpeg' && file.size < 1_500_000) {
      bitmap.close();
      return file;
    }
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}
