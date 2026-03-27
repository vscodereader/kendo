import { appendUsageRecord, buildUsageRecord } from './usageMeter.js';
import OpenAI from 'openai';

export type AiImageInput = {
  fileName: string;
  dataUrl: string;
};

export type CurriculumCourse = {
  imageIndex: number | null;
  appearanceOrder: number | null;
  yearLevel: number | null;
  semesterOrder: number | null;
  classification: string;
  classification1: string;
  classification2: string;
  name: string;
  credit: number | null;
};

export type GraduationCredits = {
  기초교양: number | null;
  융합교양: number | null;
  계열교양: number | null;
  전공필수: number | null;
  전공선택: number | null;
  총학점: number | null;
};

export type CompletedCourseAi = {
  yearTaken: number | null;
  termText: string;
  classification: string;
  classification1: string;
  classification2: string;
  name: string;
  credit: number | null;
  gradeText: string;
  professor: string;
};

const defaultGraduationCredits = (): GraduationCredits => ({
  기초교양: null,
  융합교양: null,
  계열교양: null,
  전공필수: null,
  전공선택: null,
  총학점: null
});

const curriculumClass1Options = ['기초교양', '융합교양', '계열교양', '전공필수', '전공선택'] as const;
const curriculumClass2Options = ['인필', '인선'] as const;

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

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 없습니다. backend/.env에 API 키를 넣어주세요.');
  }
  return new OpenAI({ apiKey });
}

function getModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-5.4-mini';
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('AI 응답이 비어 있습니다.');

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced =
      trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1] ??
      trimmed.match(/```\s*([\s\S]*?)```/i)?.[1];

    if (fenced) {
      return JSON.parse(fenced.trim());
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }

    throw new Error('AI 응답에서 JSON을 찾지 못했습니다.');
  }
}

function toIntOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);

  if (typeof value === 'string' && value.trim() !== '') {
    const cleaned = value.replace(/[^\d-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeClassification1(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  return classification1Aliases[raw] ?? raw;
}

function normalizeClassification2(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  return classification2Aliases[raw] ?? raw;
}

function combineClassification(classification1: string, classification2: string, fallback = ''): string {
  const first = normalizeClassification1(classification1);
  const second = normalizeClassification2(classification2);
  if (first && second) return `${first}/${second}`;
  if (first) return first;
  return fallback.trim();
}

function extractCurriculumClass1(value: string): string {
  const normalized = normalizeClassification1(value);
  for (const option of curriculumClass1Options) {
    if (normalized.includes(option)) return option;
  }
  return normalized;
}

function extractCurriculumClass2(value: string): string {
  const normalized = normalizeClassification2(value);
  for (const option of curriculumClass2Options) {
    if (normalized.includes(option)) return option;
  }
  return normalized;
}

function splitClassification(value: string, mode: 'curriculum' | 'completed' = 'curriculum'): {
  classification1: string;
  classification2: string;
} {
  const raw = value.trim();
  if (!raw) return { classification1: '', classification2: '' };

  const slashParts = raw.split('/').map((part) => part.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    return {
      classification1:
        mode === 'curriculum'
          ? extractCurriculumClass1(slashParts[0])
          : normalizeClassification1(slashParts[0]),
      classification2: normalizeClassification2(slashParts[1])
    };
  }

  return {
    classification1:
      mode === 'curriculum'
        ? extractCurriculumClass1(raw)
        : normalizeClassification1(raw),
    classification2: ''
  };
}

function sortCurriculumCourses(courses: CurriculumCourse[]): CurriculumCourse[] {
  return [...courses].sort((a, b) => {
    const aYear = a.yearLevel ?? 999;
    const bYear = b.yearLevel ?? 999;
    if (aYear !== bYear) return aYear - bYear;

    const aSemester = a.semesterOrder ?? 999;
    const bSemester = b.semesterOrder ?? 999;
    if (aSemester !== bSemester) return aSemester - bSemester;

    const aImage = a.imageIndex ?? 999;
    const bImage = b.imageIndex ?? 999;
    if (aImage !== bImage) return aImage - bImage;

    const aOrder = a.appearanceOrder ?? 9999;
    const bOrder = b.appearanceOrder ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;

    return a.name.localeCompare(b.name, 'ko');
  });
}

function normalizeCurriculumPayload(value: unknown): { courses: CurriculumCourse[]; graduationCredits: GraduationCredits } {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawCourses = Array.isArray(obj.courses) ? obj.courses : [];

  const mappedCourses: Array<CurriculumCourse | null> = rawCourses.map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;

      const classification = stringValue(row.classification);
      const parts = splitClassification(classification, 'curriculum');

      const classification1 = normalizeClassification1(
        stringValue(row.classification1) || parts.classification1
      );
      const classification2 = normalizeClassification2(
        stringValue(row.classification2) || parts.classification2
      );

      const name = stringValue(row.name);
      if (!name) return null;

      const course: CurriculumCourse = {
        imageIndex: toIntOrNull(row.imageIndex),
        appearanceOrder: toIntOrNull(row.appearanceOrder),
        yearLevel: toIntOrNull(row.yearLevel),
        semesterOrder: toIntOrNull(row.semesterOrder),
        classification: combineClassification(classification1, classification2, classification),
        classification1,
        classification2,
        name,
        credit: toIntOrNull(row.credit)
      };

      return course;
    });

    const courses: CurriculumCourse[] = mappedCourses.filter(
      (row): row is CurriculumCourse => row !== null
    );

  const rawGrad = (obj.graduationCredits && typeof obj.graduationCredits === 'object'
    ? obj.graduationCredits
    : {}) as Record<string, unknown>;

  const graduationCredits: GraduationCredits = {
    기초교양: toIntOrNull(rawGrad['기초교양']),
    융합교양: toIntOrNull(rawGrad['융합교양']),
    계열교양: toIntOrNull(rawGrad['계열교양']),
    전공필수: toIntOrNull(rawGrad['전공필수']),
    전공선택: toIntOrNull(rawGrad['전공선택']),
    총학점: toIntOrNull(rawGrad['총학점'] ?? rawGrad['총졸업학점'])
  };

  return { courses, graduationCredits };
}

function normalizeCompletedPayload(value: unknown): { courses: CompletedCourseAi[] } {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawCourses = Array.isArray(obj.courses) ? obj.courses : [];

    const mappedCourses: Array<CompletedCourseAi | null> = rawCourses.map((item) => {
      const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;

      const classification = stringValue(row.classification);
      const parts = splitClassification(classification, 'completed');

      const classification1 = normalizeClassification1(
        stringValue(row.classification1) || parts.classification1
      );
      const classification2 = normalizeClassification2(
        stringValue(row.classification2) || parts.classification2
      );

      const name = stringValue(row.name);
      if (!name) return null;

      const course: CompletedCourseAi = {
        yearTaken: toIntOrNull(row.yearTaken),
        termText: stringValue(row.termText),
        classification: combineClassification(classification1, classification2, classification),
        classification1,
        classification2,
        name,
        credit: toIntOrNull(row.credit),
        gradeText: stringValue(row.gradeText),
        professor: stringValue(row.professor)
      };

      return course;
    });

    const courses: CompletedCourseAi[] = mappedCourses.filter(
      (row): row is CompletedCourseAi => row !== null
    );

  return { courses };
}

async function runVisionPrompt(route: string, prompt: string, images: AiImageInput[]): Promise<string> {
  const client = getClient();
  const model = getModel();

  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          ...images.map((image) => ({
            type: 'input_image' as const,
            image_url: image.dataUrl,
            detail: 'high' as const
          }))
        ]
      }
    ]
  });

  const usageRecord = buildUsageRecord({
    route,
    model,
    usage: response.usage
  });

  appendUsageRecord(usageRecord);

  console.log(
    `[OpenAI Usage] route=${usageRecord.route} model=${usageRecord.model} input=${usageRecord.inputTokens} output=${usageRecord.outputTokens} total=${usageRecord.totalTokens} estimatedUsd=$${usageRecord.estimatedUsd.toFixed(6)}`
  );

  return response.output_text ?? '';
}

function buildCurriculumCoursePrompt(args: {
  year?: number | null;
  major?: string | null;
  imageIndex: number;
}): string {
  const context = `${args.year ? `기준 연도: ${args.year}\n` : ''}${args.major ? `전공명: ${args.major}\n` : ''}`;

  return `${context}
너는 가천대학교 전공교육과정표 1장만 읽는 구조화 추출기다.
반드시 유효한 JSON만 출력하고 설명 문장, 코드펜스, 주석은 절대 넣지 마라.

이 이미지는 "한 장"이다.
다른 이미지와 절대 섞지 마라.
파일 업로드 순서나 다른 이미지의 학년/학기를 절대 참고하지 마라.
오직 현재 이미지 안에서만 판단하라.

현재 이미지 번호:
${args.imageIndex}

이 표의 구조는 아래와 같다.
- 1열: 학년
- 2열: 왼쪽 블록 학기
- 3열: 왼쪽 블록 이수구분
- 4열: 왼쪽 블록 교과목명
- 5열: 왼쪽 블록 학점
- 6열, 7열: 이론/실습 → 무시
- 8열: 오른쪽 블록 학기
- 9열: 오른쪽 블록 이수구분
- 10열: 오른쪽 블록 교과목명
- 11열: 오른쪽 블록 학점
- 12열, 13열: 이론/실습 → 무시

중요 규칙:
1. 반드시 1열의 학년은 "현재 이미지 안의 값만" 사용한다.
2. 오른쪽 블록(8~11열)의 학년은 반드시 같은 이미지의 1열 학년을 사용한다.
3. 왼쪽 블록은 2열 학기, 오른쪽 블록은 8열 학기를 사용한다.
4. 학년/학기 셀이 병합되어 비어 보이면, 같은 이미지 같은 블록에서 위의 값을 이어받아 채운다.
5. 소계 행은 절대 courses에 넣지 마라.
6. 사진에 없는 과목을 상상해서 만들지 마라.
7. 같은 이름이 실제 사진에 두 번 있으면 두 줄 모두 남겨라. 중복 제거하지 마라.
8. 출력 순서는 사진에 보이는 순서 그대로 유지하라.
   - 먼저 왼쪽 블록 위에서 아래로
   - 그 다음 오른쪽 블록 위에서 아래로
9. 학점은 반드시 학점 열(5열 또는 11열)만 사용하고, 이론/실습 숫자는 버려라.
10. 이수구분은 아래처럼 분리하라.
   - classification1: 기초교양, 융합교양, 계열교양, 전공필수, 전공선택 중 하나
   - classification2: 인필, 인선 또는 빈 문자열
11. 예시:
   - 계열교양/인필 → classification1=계열교양, classification2=인필
   - 기초교양 → classification1=기초교양, classification2=""
12. 교과목명은 가능한 원문 그대로 적어라.

출력 형식:
{
  "courses": [
    {
      "imageIndex": ${args.imageIndex},
      "appearanceOrder": 1,
      "yearLevel": 1,
      "semesterOrder": 1,
      "classification": "계열교양/인필",
      "classification1": "계열교양",
      "classification2": "인필",
      "name": "수학 1(MSC)",
      "credit": 3
    }
  ],
  "graduationCredits": {
    "기초교양": null,
    "융합교양": null,
    "계열교양": null,
    "전공필수": null,
    "전공선택": null,
    "총학점": null
  }
}`.trim();
}

function buildGraduationPrompt(args: {
  year?: number | null;
  major?: string | null;
}): string {
  const context = `${args.year ? `기준 연도: ${args.year}\n` : ''}${args.major ? `전공명: ${args.major}\n` : ''}`;

  return `${context}
너는 가천대학교 졸업이수학점 표를 읽는 구조화 추출기다.
반드시 유효한 JSON만 출력하고 설명 문장, 코드펜스, 주석은 절대 넣지 마라.

규칙:
1. 읽어야 하는 항목은 아래 6개뿐이다.
   - 기초교양
   - 융합교양
   - 계열교양
   - 전공필수
   - 전공선택
   - 총학점
2. 표의 병합 셀, 제목 셀, "졸업이수학점" 같은 큰 제목은 무시해라.
3. "총 졸업학점"이라고 적혀 있어도 결과 키는 반드시 "총학점"으로 넣어라.
4. 숫자가 안 보이면 null로 넣어라.
5. 과목 정보는 절대 추출하지 마라.

출력 형식:
{
  "courses": [],
  "graduationCredits": {
    "기초교양": 17,
    "융합교양": 11,
    "계열교양": 24,
    "전공필수": 21,
    "전공선택": 51,
    "총학점": 130
  }
}`.trim();
}

export async function analyzeCurriculumImages(args: {
  images: AiImageInput[];
  year?: number | null;
  major?: string | null;
  mode: 'courses' | 'graduation' | 'both';
}): Promise<{ courses: CurriculumCourse[]; graduationCredits: GraduationCredits; rawText: string }> {
  if (args.mode === 'courses') {
    const allCourses: CurriculumCourse[] = [];
    const rawTexts: string[] = [];

    for (let i = 0; i < args.images.length; i += 1) {
      const image = args.images[i];
      const prompt = buildCurriculumCoursePrompt({
        year: args.year,
        major: args.major,
        imageIndex: i + 1
      });

      const rawText = await runVisionPrompt('/api/ai-ocr/curriculum', prompt, [image]);
      rawTexts.push(`### ${image.fileName}\n${rawText}`);

      const parsed = normalizeCurriculumPayload(extractJson(rawText));
      allCourses.push(...parsed.courses);
    }

    return {
      courses: sortCurriculumCourses(allCourses),
      graduationCredits: defaultGraduationCredits(),
      rawText: rawTexts.join('\n\n')
    };
  }

  if (args.mode === 'graduation') {
    let merged = defaultGraduationCredits();
    const rawTexts: string[] = [];

    for (const image of args.images) {
      const prompt = buildGraduationPrompt({
        year: args.year,
        major: args.major
      });

      const rawText = await runVisionPrompt('/api/ai-ocr/curriculum', prompt, [image]);
      rawTexts.push(`### ${image.fileName}\n${rawText}`);

      const parsed = normalizeCurriculumPayload(extractJson(rawText));
      merged = {
        기초교양: merged.기초교양 ?? parsed.graduationCredits.기초교양,
        융합교양: merged.융합교양 ?? parsed.graduationCredits.융합교양,
        계열교양: merged.계열교양 ?? parsed.graduationCredits.계열교양,
        전공필수: merged.전공필수 ?? parsed.graduationCredits.전공필수,
        전공선택: merged.전공선택 ?? parsed.graduationCredits.전공선택,
        총학점: merged.총학점 ?? parsed.graduationCredits.총학점
      };
    }

    return {
      courses: [],
      graduationCredits: merged,
      rawText: rawTexts.join('\n\n')
    };
  }

  const coursePart = await analyzeCurriculumImages({
    images: args.images,
    year: args.year,
    major: args.major,
    mode: 'courses'
  });

  const graduationPart = await analyzeCurriculumImages({
    images: args.images,
    year: args.year,
    major: args.major,
    mode: 'graduation'
  });

  return {
    courses: coursePart.courses,
    graduationCredits: graduationPart.graduationCredits,
    rawText: `${coursePart.rawText}\n\n${graduationPart.rawText}`
  };
}

export async function analyzeCompletedImages(args: {
  images: AiImageInput[];
}): Promise<{ courses: CompletedCourseAi[]; rawText: string }> {
  const prompt = `너는 한국 대학교 수강내역표를 구조화하는 추출기다.
입력은 학생의 성적/이수내역 스크린샷이다.
반드시 유효한 JSON만 출력하고, 설명 문장이나 코드펜스는 절대 넣지 마라.

규칙:
- 과목 하나당 배열 원소 하나로 출력하라.
- 연도, 학기, 이수구분, 교과목명, 학점, 성적, 교수명을 읽어라.
- 이수구분이 계열교양/인필 같은 형태면 classification1, classification2로 나눠라.
- 줄임말을 보면 반드시 전체 이름으로 바꿔라.
  예: 교필→교양필수, 교선→교양선택, 일선→일반선택, 전선→전공선택, 전필→전공필수, 융교→융합교양, 기초→기초교양, 계교→계열교양
- 값이 보이지 않으면 추측하지 말고 null 또는 빈 문자열로 남겨라.
- 성적은 A+, A0, B+, B0, C+, C0, D+, D0, F, P, NP 등 원문에 가깝게 적어라.
- 중복 제거하지 마라.

출력 형식:
{
  "courses": [
    {
      "yearTaken": 2025,
      "termText": "1학기",
      "classification": "전공선택/인선",
      "classification1": "전공선택",
      "classification2": "인선",
      "name": "알고리즘",
      "credit": 3,
      "gradeText": "A0",
      "professor": "윤유림"
    }
  ]
}`.trim();

  const rawText = await runVisionPrompt('/api/ai-ocr/completed', prompt, args.images);
  const parsed = normalizeCompletedPayload(extractJson(rawText));
  return { ...parsed, rawText };
}