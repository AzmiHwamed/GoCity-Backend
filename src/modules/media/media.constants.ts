import { join } from 'path';

/** Where uploaded files are stored on disk. Served statically under MEDIA_URL_PREFIX. */
export const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
export const UPLOAD_DIR_TOKEN = 'MEDIA_UPLOAD_DIR';

/** Public URL prefix for files, e.g. /files/3f2a...c1.png (not affected by API_PREFIX). */
export const MEDIA_URL_PREFIX = '/files';

/** Allowed image types and the extension each is stored with. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Short travel clips supported in a trip gallery. */
export const ALLOWED_VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};
export const ALLOWED_TRIP_MEDIA_TYPES = { ...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES };

/**
 * Detects the real image type from the file's first bytes, so a renamed or
 * mislabelled file can't get through on its Content-Type alone.
 */
export function detectImageType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
