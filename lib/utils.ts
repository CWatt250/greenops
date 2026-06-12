import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatDate(dateStr: string): string {
  // Date-only strings ("2026-06-11") parse as UTC MIDNIGHT, which
  // toLocaleDateString then renders as the PREVIOUS day anywhere west of
  // Greenwich. Pin them to local noon so the calendar date survives;
  // full timestamps already carry their own time and pass through.
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  const d = new Date(isDateOnly ? `${dateStr}T12:00:00` : dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
