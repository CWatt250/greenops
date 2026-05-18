const DRAFT_TTL_MS = 60 * 60 * 1000; // 1 hour

export function draftStorageKey(clientId: string | undefined): string {
  return `client_form_draft_${clientId ?? 'new'}`;
}

export const PENDING_MEASUREMENT_KEY = 'client_form_pending_measurement';

export function saveFormDraft(
  clientId: string | undefined,
  formData: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    draftStorageKey(clientId),
    JSON.stringify({ savedAt: Date.now(), formData })
  );
}

export function loadFormDraft(
  clientId: string | undefined
): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftStorageKey(clientId));
    if (!raw) return null;
    const { savedAt, formData } = JSON.parse(raw) as {
      savedAt: number;
      formData: Record<string, unknown>;
    };
    if (Date.now() - savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(draftStorageKey(clientId));
      return null;
    }
    return formData;
  } catch {
    return null;
  }
}

export function clearFormDraft(clientId: string | undefined): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(draftStorageKey(clientId));
}

export function loadPendingMeasurement(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_MEASUREMENT_KEY);
    if (!raw) return null;
    const { sqft } = JSON.parse(raw) as { sqft?: number };
    return typeof sqft === 'number' && !isNaN(sqft) ? sqft : null;
  } catch {
    return null;
  }
}

export function clearPendingMeasurement(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PENDING_MEASUREMENT_KEY);
}
