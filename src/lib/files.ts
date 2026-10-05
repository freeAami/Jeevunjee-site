/** Phone photos are often 4–8 MB. Shrink them so uploads work on slow mobile data. */
export async function shrinkImage(file: File, maxSide = 2000, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return out && out.size < file.size ? out : file;
  } catch {
    return file; // a format the browser can't decode — send as-is
  }
}

/** Passport-style photos only need to be small. */
export const shrinkPhoto = (file: File) => shrinkImage(file, 900, 0.85);

/** Name after shrinking: a converted photo gets a .jpg extension. */
export function finalName(original: File, blob: Blob) {
  return blob !== original && blob.type === 'image/jpeg' ? original.name.replace(/\.[^.]+$/, '') + '.jpg' : original.name;
}

/** Storage-safe file name: letters, digits, dot, dash, underscore. */
export function safeFileName(name: string) {
  const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return (cleaned || 'file').slice(-80);
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Photos are shrunk before upload, so larger originals are fine. */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

export function fileTooLarge(f: File) {
  return f.size > (f.type.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_FILE_BYTES);
}

export function acceptsFile(f: File) {
  return f.type.startsWith('image/') || f.type === 'application/pdf';
}
