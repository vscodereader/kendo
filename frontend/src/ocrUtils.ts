export type AiUploadImage = {
  fileName: string;
  dataUrl: string;
};

export const curriculumClassification1Options = ['기초교양', '융합교양', '계열교양', '전공필수', '전공선택'] as const;
export const curriculumClassification2Options = ['인필', '인선'] as const;
export const completedClassification1Options = ['교양필수', '교양선택', '일반선택', '기초교양', '융합교양', '계열교양', '전공필수', '전공선택'] as const;
export const completedClassification2Options = ['인필', '인선'] as const;

const classification1Aliases: Record<string, string> = {
  기초: '기초교양',
  기초교양: '기초교양',
  융교: '융합교양',
  융합: '융합교양',
  융합교양: '융합교양',
  계교: '계열교양',
  계열: '계열교양',
  계열교양: '계열교양',
  전필: '전공필수',
  전공필수: '전공필수',
  전선: '전공선택',
  전공선택: '전공선택',
  교필: '교양필수',
  교양필수: '교양필수',
  교선: '교양선택',
  교양선택: '교양선택',
  일선: '일반선택',
  일반선택: '일반선택'
};

const classification2Aliases: Record<string, string> = {
  인필: '인필',
  인선: '인선'
};

export type RequiredCourseRow = {
  yearLevel: number | '';
  semesterOrder: number | '';
  classification1: string;
  classification2: string;
  name: string;
  credit: number | '';
};

export type GraduationCredits = {
  기초교양: number | '';
  융합교양: number | '';
  계열교양: number | '';
  전공필수: number | '';
  전공선택: number | '';
  총학점: number | '';
};

export type CompletedCourseRow = {
  yearTaken: number | '';
  termText: string;
  classification1: string;
  classification2: string;
  name: string;
  credit: number | '';
  gradeText: string;
  professor: string;
};

export const graduationLabels = ['기초교양', '융합교양', '계열교양', '전공필수', '전공선택', '총학점'] as const;

export function emptyGraduationCredits(): GraduationCredits {
  return {
    기초교양: '',
    융합교양: '',
    계열교양: '',
    전공필수: '',
    전공선택: '',
    총학점: ''
  };
}

export function emptyRequiredCourseRow(): RequiredCourseRow {
  return { yearLevel: '', semesterOrder: '', classification1: '', classification2: '', name: '', credit: '' };
}

export function emptyCompletedCourseRow(): CompletedCourseRow {
  return {
    yearTaken: '',
    termText: '',
    classification1: '',
    classification2: '',
    name: '',
    credit: '',
    gradeText: '',
    professor: ''
  };
}

export function normalizeClassification1(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  return classification1Aliases[raw] ?? raw;
}

export function normalizeClassification2(value: string): string {
  const raw = value.trim();
  if (raw === '인필') return '인필';
  if (raw === '인선') return '인선';
  return '';
}

export function combineClassification(classification1: string, classification2: string): string {
  const first = normalizeClassification1(classification1);
  const second = normalizeClassification2(classification2);
  if (first && second) return `${first}/${second}`;
  return first;
}

export function splitCurriculumClassification(rawValue: string): {
  classification1: string;
  classification2: string;
} {
  const raw = rawValue.trim();
  if (!raw) return { classification1: '', classification2: '' };

  const slashParts = raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (slashParts.length >= 2) {
    return {
      classification1: normalizeCurriculumClassification1(slashParts[0]),
      classification2: normalizeClassification2(slashParts[1])
    };
  }

  return {
    classification1: normalizeCurriculumClassification1(raw),
    classification2: ''
  };
}

export function splitFreeClassification(value: string): {
  classification1: string;
  classification2: string;
} {
  const raw = value.trim();
  if (!raw) {
    return { classification1: '', classification2: '' };
  }

  const parts = raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  const classification1 = parts[0] ?? raw;
  const classification2Raw = parts[1] ?? '';

  const normalizedClass1 = normalizeClassification1(classification1);
  const normalizedClass2 =
    classification2Raw === '인필' || classification2Raw === '인선'
      ? classification2Raw
      : '';

  return {
    classification1: normalizedClass1,
    classification2: normalizedClass2
  };
}

export function formatCourseText(rows: RequiredCourseRow[]): string {
  return rows
    .filter((row) => row.name.trim())
    .map(
      (row) =>
        `${row.yearLevel === '' ? '' : row.yearLevel} / ${row.semesterOrder === '' ? '' : row.semesterOrder} / ${combineClassification(
          row.classification1,
          row.classification2
        )} / ${row.name.trim()} / ${row.credit === '' ? '' : row.credit}`
    )
    .join('\n');
}

export function parseCourseText(text: string): RequiredCourseRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCourseLine)
    .filter((row): row is RequiredCourseRow => Boolean(row && row.name.trim()));
}

function parseCourseLine(line: string): RequiredCourseRow | null {
  const parts = line.split('/').map((part) => part.trim());
  if (parts.length < 5) return null;

  if (parts.length === 5) {
    const classification = splitCurriculumClassification(parts[2] ?? '');
    return {
      yearLevel: toNumberOrEmpty(parts[0]),
      semesterOrder: toNumberOrEmpty(parts[1]),
      classification1: classification.classification1,
      classification2: classification.classification2,
      name: parts[3] ?? '',
      credit: toNumberOrEmpty(parts[4])
    };
  }

  const classification1 = normalizeCurriculumClassification1(parts[2] ?? '');
  const classification2 = normalizeClassification2(parts[3] ?? '');
  return {
    yearLevel: toNumberOrEmpty(parts[0]),
    semesterOrder: toNumberOrEmpty(parts[1]),
    classification1,
    classification2,
    name: parts.slice(4, -1).join(' / ').trim(),
    credit: toNumberOrEmpty(parts.at(-1) ?? '')
  };
}

export function formatGraduationText(values: GraduationCredits): string {
  return graduationLabels.map((label) => `${label} / ${values[label] === '' ? '' : values[label]}`).join(' / ');
}

export function parseGraduationText(text: string): GraduationCredits {
  const tokens = text
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' / ')
    .split('/')
    .map((token) => token.trim())
    .filter(Boolean);

  const result = emptyGraduationCredits();
  for (let i = 0; i < tokens.length; i += 2) {
    const label = tokens[i] as keyof GraduationCredits;
    const value = tokens[i + 1] ?? '';
    if (graduationLabels.includes(label)) {
      result[label] = toNumberOrEmpty(value);
    }
  }
  return result;
}

export function formatCompletedText(rows: CompletedCourseRow[]): string {
  return rows
    .filter((row) => row.name.trim())
    .map(
      (row) =>
        `${row.yearTaken === '' ? '' : row.yearTaken} / ${row.termText.trim()} / ${combineClassification(
          row.classification1,
          row.classification2
        )} / ${row.name.trim()} / ${row.credit === '' ? '' : row.credit} / ${row.gradeText.trim()} / ${row.professor.trim()}`
    )
    .join('\n');
}

export function parseCompletedText(text: string): CompletedCourseRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCompletedLine)
    .filter((row): row is CompletedCourseRow => Boolean(row && row.name.trim()));
}

function parseCompletedLine(line: string): CompletedCourseRow | null {
  const parts = line.split('/').map((part) => part.trim());
  if (parts.length < 7) return null;

  if (parts.length === 7) {
    const classification = splitFreeClassification(parts[2] ?? '');
    return {
      yearTaken: toNumberOrEmpty(parts[0]),
      termText: parts[1] ?? '',
      classification1: classification.classification1,
      classification2: classification.classification2,
      name: parts[3] ?? '',
      credit: toNumberOrEmpty(parts[4]),
      gradeText: parts[5] ?? '',
      professor: parts[6] ?? ''
    };
  }

  return {
    yearTaken: toNumberOrEmpty(parts[0]),
    termText: parts[1] ?? '',
    classification1: normalizeClassification1(parts[2] ?? ''),
    classification2: normalizeClassification2(parts[3] ?? ''),
    name: parts.slice(4, -3).join(' / ').trim(),
    credit: toNumberOrEmpty(parts.at(-3) ?? ''),
    gradeText: parts.at(-2) ?? '',
    professor: parts.at(-1) ?? ''
  };
}

export async function prepareImagesForUpload(files: File[], splitWide = true): Promise<AiUploadImage[]> {
  const results: AiUploadImage[] = [];

  for (const file of files) {
    const image = await loadFileAsImage(file);
    if (!splitWide || image.width < image.height * 1.2) {
      results.push({ fileName: file.name, dataUrl: renderCanvasToDataUrl(image, 0, 0, image.width, image.height) });
      continue;
    }

    const halfWidth = Math.floor(image.width / 2);
    results.push({
      fileName: `${file.name}__left`,
      dataUrl: renderCanvasToDataUrl(image, 0, 0, halfWidth, image.height)
    });
    results.push({
      fileName: `${file.name}__right`,
      dataUrl: renderCanvasToDataUrl(image, halfWidth, 0, image.width - halfWidth, image.height)
    });
  }

  return results;
}

function renderCanvasToDataUrl(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number): string {
  const scale = 1.5;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(sw * scale));
  canvas.height = Math.max(1, Math.floor(sh * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('캔버스 컨텍스트를 만들 수 없습니다.');

  context.imageSmoothingEnabled = true;
  context.filter = 'contrast(1.15) brightness(1.03)';
  context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function loadFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 열지 못했습니다.'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function numberOrUndefined(value: number | ''): number | undefined {
  return value === '' ? undefined : value;
}

export function toNumberOrEmpty(value: unknown): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d-]/g, '');
    if (!cleaned) return '';
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : '';
  }
  return '';
}

function normalizeCurriculumClassification1(value: string): string {
  const normalized = normalizeClassification1(value);
  return curriculumClassification1Options.includes(normalized as (typeof curriculumClassification1Options)[number]) ? normalized : normalized;
}
