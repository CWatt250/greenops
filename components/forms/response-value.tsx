/* eslint-disable @next/next/no-img-element */
'use client';

/** Renders one form-submission response value. Signature fields store a
 *  PNG data URL inline in the responses JSONB — show those as an image. */
export function ResponseValue({ value }: { value: unknown }) {
  if (typeof value === 'string' && value.startsWith('data:image/')) {
    return (
      <img
        src={value}
        alt="Signature"
        className="mt-0.5 max-h-16 w-auto rounded border bg-white p-1"
      />
    );
  }
  return <>{Array.isArray(value) ? value.join(', ') : String(value)}</>;
}
