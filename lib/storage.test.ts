import { describe, it, expect } from 'vitest';
import { storageObjectPath, fileSrc } from './storage';

describe('storageObjectPath', () => {
  const path = 'company-1/job-2/photo.png';

  it('returns a bare path unchanged', () => {
    expect(storageObjectPath('job-photos', path)).toBe(path);
  });

  it('strips a leading slash from a bare path', () => {
    expect(storageObjectPath('job-photos', `/${path}`)).toBe(path);
  });

  it('extracts the path from a legacy public URL', () => {
    const url = `https://abc.supabase.co/storage/v1/object/public/job-photos/${path}`;
    expect(storageObjectPath('job-photos', url)).toBe(path);
  });

  it('extracts the path from a signed URL (drops the query)', () => {
    const url = `https://abc.supabase.co/storage/v1/object/sign/job-signatures/${path}?token=xyz`;
    expect(storageObjectPath('job-signatures', url)).toBe(path);
  });

  it('decodes percent-encoded path segments', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/job-photos/c/j/a%20b.png';
    expect(storageObjectPath('job-photos', url)).toBe('c/j/a b.png');
  });
});

describe('fileSrc', () => {
  it('returns null for empty input', () => {
    expect(fileSrc('job-photos', null)).toBeNull();
    expect(fileSrc('job-photos', undefined)).toBeNull();
    expect(fileSrc('job-photos', '')).toBeNull();
  });

  it('builds a proxy URL with encoded bucket + path', () => {
    expect(fileSrc('job-photos', 'c/j/p.png')).toBe(
      '/api/files?bucket=job-photos&path=c%2Fj%2Fp.png',
    );
  });

  it('routes a legacy public URL through the proxy by its path', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/job-signatures/c/j/s.png';
    expect(fileSrc('job-signatures', url)).toBe(
      '/api/files?bucket=job-signatures&path=c%2Fj%2Fs.png',
    );
  });
});
