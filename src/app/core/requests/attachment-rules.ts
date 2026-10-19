import { AttachmentMeta } from '../../domain/models/request';

export const MAX_FILES = 5;
export const MAX_IMAGE_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export interface FileCheck {
  accepted: FileLike[];
  /** Arabic reasons for every rejected file. */
  errors: string[];
}

const isImage = (t: string) => t.startsWith('image/');
const isVideo = (t: string) => t.startsWith('video/');
const isPdf = (t: string) => t === 'application/pdf';
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

/**
 * Client-side attachment rules: images & PDF up to 10 MB, video up to 50 MB, at most 5 files per request.
 * `existing` is how many files are already attached.
 */
export function checkFiles(files: readonly FileLike[], existing = 0): FileCheck {
  const accepted: FileLike[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (existing + accepted.length >= MAX_FILES) {
      errors.push(`تجاوزت الحد الأقصى (${MAX_FILES} ملفات): ${file.name}`);
      continue;
    }
    if (!isImage(file.type) && !isPdf(file.type) && !isVideo(file.type)) {
      errors.push(`نوع الملف غير مدعوم (صور وPDF وفيديو فقط): ${file.name}`);
    } else if (isVideo(file.type) ? file.size > MAX_VIDEO_BYTES : file.size > MAX_IMAGE_PDF_BYTES) {
      errors.push(`حجم الملف أكبر من المسموح (${mb(isVideo(file.type) ? MAX_VIDEO_BYTES : MAX_IMAGE_PDF_BYTES)} ميجابايت): ${file.name}`);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, errors };
}

/** Only metadata is kept; no file content is stored anywhere. */
export function toMeta(file: FileLike, uploadedBy: string, at: Date, index: number): AttachmentMeta {
  return {
    id: `f-${at.getTime()}-${index}`,
    name: file.name,
    sizeBytes: file.size,
    mime: file.type,
    uploadedBy,
    at: at.toISOString(),
  };
}
