export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\(msc\)/g, '')
    .replace(/msc/g, '')
    .replace(/\(전문교양\)/g, '')
    .replace(/전문교양/g, '')
    .replace(/\(공학주제\)/g, '')
    .replace(/공학주제/g, '')
    .replace(/[\s\-_/()[\]{}.,·]+/g, '')
    .replace(/[Ⅰ]/g, '1')
    .replace(/[Ⅱ]/g, '2')
    .replace(/[Ⅲ]/g, '3')
    .replace(/[Ⅳ]/g, '4')
    .replace(/[ⅴ]/g, '5');
}

export function normalizeCourseCode(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export function toBoolean(value: unknown, defaultValue = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'y', 'yes', '필수'].includes(normalized)) return true;
    if (['false', '0', 'n', 'no', '선택'].includes(normalized)) return false;
  }
  return defaultValue;
}

export function toInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return null;
}
