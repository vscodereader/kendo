export type CourseInput = {
  id?: string;
  courseCode?: string | null;
  name: string;
  credit?: number | null;
  classification?: string | null;
  classification1?: string | null;
  classification2?: string | null;
  isRequired?: boolean | null;
  yearLevel?: number | null;
  semesterOrder?: number | null;
  yearTaken?: number | null;
  termText?: string | null;
  gradeText?: string | null;
  professor?: string | null;
};

export type GraduationRequirementInput = {
  label: string;
  credits?: number | null;
};

export type CompareTableRow = {
  id?: string;
  yearText: string;
  termText: string;
  classification1: string;
  classification2: string;
  name: string;
  credit: number | null;
  gradeText: string;
  professor: string;
};

export type CompareBucket = {
  title: string;
  headline: string;
  subline: string;
  earnedCredits: number;
  requiredCredits: number | null;
  remainingCredits: number | null;
  rows: CompareTableRow[];
};

export type CompareResult = {
  summary: {
    earnedCredits: number;
    requiredCredits: number | null;
    headline: string;
    expressionText: string;
  };
  buckets: {
    majorCoreLiberal: CompareBucket;
    majorRequired: CompareBucket;
    majorSelective: CompareBucket;
    basicLiberal: CompareBucket;
    fusionLiberal: CompareBucket;
    missing: CompareBucket;
    extraLiberal: CompareBucket;
    extraMajorRequired: CompareBucket;
    extraMajorSelective: CompareBucket;
    extraOther: CompareBucket;
  };
};

type CompletedItem = CourseInput & {
  _normalizedName: string;
  _used: boolean;
  _classification1: string;
  _classification2: string;
};

type RequiredItem = CourseInput & {
  _normalizedName: string;
  _classification1: string;
  _classification2: string;
};

const MAJOR_BUCKET_CLASSIFICATIONS = ['기초교양', '융합교양', '계열교양', '전공필수', '전공선택'] as const;

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[·•ㆍ]/g, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"?\\|[\]\s]/g, '')
    .trim();
}

function cleanClassification1(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function cleanClassification2(value: string | null | undefined): string {
  const v = String(value ?? '').trim();
  return v === '인필' || v === '인선' ? v : '';
}

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function termRank(value: string): number {
  const text = String(value ?? '').replace(/\s+/g, '');
  if (!text) return 99;
  if (text.includes('1학기')) return 1;
  if (text.includes('여름')) return 2;
  if (text.includes('2학기')) return 3;
  if (text.includes('겨울')) return 4;

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 99;
}

function sortRows(rows: CompareTableRow[]): CompareTableRow[] {
  return [...rows].sort((a, b) => {
    const yearA = Number(a.yearText);
    const yearB = Number(b.yearText);
    const yearDiff = (Number.isFinite(yearA) ? yearA : 9999) - (Number.isFinite(yearB) ? yearB : 9999);
    if (yearDiff !== 0) return yearDiff;

    const termDiff = termRank(a.termText) - termRank(b.termText);
    if (termDiff !== 0) return termDiff;

    return a.name.localeCompare(b.name, 'ko');
  });
}

function uniqueRows(rows: CompareTableRow[]): CompareTableRow[] {
  const seen = new Set<string>();
  const result: CompareTableRow[] = [];

  for (const row of rows) {
    const key = [
      row.yearText,
      row.termText,
      row.classification1,
      row.classification2,
      normalizeText(row.name),
      row.credit ?? '',
      row.gradeText,
      row.professor
    ].join('|');

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }

  return sortRows(result);
}

function sumCredits(rows: CompareTableRow[]): number {
  return rows.reduce((sum, row) => sum + toNumber(row.credit), 0);
}

function isGenericPlaceholder(course: RequiredItem): boolean {
  if (!MAJOR_BUCKET_CLASSIFICATIONS.includes(course._classification1 as (typeof MAJOR_BUCKET_CLASSIFICATIONS)[number])) {
    return false;
  }

  if (!course._normalizedName) return false;
  return course._normalizedName === normalizeText(course._classification1);
}

function uniqueRequiredComparableCourses(courses: RequiredItem[]): RequiredItem[] {
  const seen = new Set<string>();
  const result: RequiredItem[] = [];

  for (const course of courses) {
    if (!course._normalizedName) continue;
    if (isGenericPlaceholder(course)) continue;

    const key = [course._classification1, course._classification2, course._normalizedName].join('|');
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(course);
  }

  return result;
}

function buildRequiredRow(course: RequiredItem): CompareTableRow {
  return {
    id: course.id,
    yearText: course.yearLevel ? String(course.yearLevel) : '',
    termText: course.semesterOrder ? `${course.semesterOrder}` : '',
    classification1: course._classification1,
    classification2: course._classification2,
    name: course.name,
    credit: course.credit ?? null,
    gradeText: '',
    professor: ''
  };
}

function buildMatchedRow(required: RequiredItem, completed: CompletedItem): CompareTableRow {
  return {
    id: required.id ?? completed.id,
    yearText: completed.yearTaken ? String(completed.yearTaken) : '',
    termText: String(completed.termText ?? '').trim(),
    classification1: required._classification1,
    classification2: required._classification2,
    name: required.name,
    credit: required.credit ?? completed.credit ?? null,
    gradeText: String(completed.gradeText ?? '').trim(),
    professor: String(completed.professor ?? '').trim()
  };
}

function buildCompletedRow(course: CompletedItem): CompareTableRow {
  return {
    id: course.id,
    yearText: course.yearTaken ? String(course.yearTaken) : '',
    termText: String(course.termText ?? '').trim(),
    classification1: course._classification1,
    classification2: course._classification2,
    name: course.name,
    credit: course.credit ?? null,
    gradeText: String(course.gradeText ?? '').trim(),
    professor: String(course.professor ?? '').trim()
  };
}

function findRequirementCredit(
  requirements: GraduationRequirementInput[],
  label: '기초교양' | '융합교양' | '계열교양' | '전공필수' | '전공선택' | '총학점'
): number | null {
  const found = requirements.find((item) => item.label === label);
  if (!found) return null;
  return typeof found.credits === 'number' && Number.isFinite(found.credits) ? found.credits : null;
}

function buildProgressBucket(args: {
  title: string;
  shortLabel: string;
  rows: CompareTableRow[];
  requiredCredits: number | null;
  isExtra?: boolean;
}): CompareBucket {
  const rows = uniqueRows(args.rows);
  const earnedCredits = sumCredits(rows);
  const requiredCredits = args.requiredCredits ?? null;
  const remainingCredits = requiredCredits === null ? null : Math.max(0, requiredCredits - earnedCredits);

  let headline = '';
  let subline = '';

  if (args.title === '미이수') {
    headline = `과목 수 : ${rows.length}`;
  } else if (args.isExtra) {
    headline = `들은 학점 총합 : ${earnedCredits}`;
  } else if (requiredCredits === null) {
    headline = `${earnedCredits} / -`;
  } else {
    headline = `${earnedCredits} / ${requiredCredits}`;
    if (remainingCredits !== null && remainingCredits > 0) {
    subline = `${args.shortLabel} ${remainingCredits}학점 더 들으셔야 해요!`;
    } else {
      subline = `${args.shortLabel} 충족 완료!`;
    }
  }

  return {
    title: args.title,
    headline,
    subline,
    earnedCredits,
    requiredCredits,
    remainingCredits,
    rows
  };
}

function makeCompletedItems(courses: CourseInput[]): CompletedItem[] {
  return courses.map((course) => ({
    ...course,
    _classification1: cleanClassification1(course.classification1),
    _classification2: cleanClassification2(course.classification2),
    _normalizedName: normalizeText(course.name),
    _used: false
  }));
}

function makeRequiredItems(courses: CourseInput[]): RequiredItem[] {
  return courses.map((course) => ({
    ...course,
    _classification1: cleanClassification1(course.classification1),
    _classification2: cleanClassification2(course.classification2),
    _normalizedName: normalizeText(course.name)
  }));
}

function matchRequiredCourses(
  requiredCourses: RequiredItem[],
  completedCourses: CompletedItem[]
): {
  matchedRows: CompareTableRow[];
  missingRows: CompareTableRow[];
} {
  const matchedRows: CompareTableRow[] = [];
  const missingRows: CompareTableRow[] = [];

  for (const required of requiredCourses) {
    const match = completedCourses.find(
      (completed) => !completed._used && completed._normalizedName !== '' && completed._normalizedName === required._normalizedName
    );

    if (match) {
      match._used = true;
      matchedRows.push(buildMatchedRow(required, match));
    } else {
      missingRows.push(buildRequiredRow(required));
    }
  }

  return {
    matchedRows: uniqueRows(matchedRows),
    missingRows: uniqueRows(missingRows)
  };
}

function takeRemainingByPredicate(
  completedCourses: CompletedItem[],
  predicate: (course: CompletedItem) => boolean
): CompareTableRow[] {
  const rows: CompareTableRow[] = [];

  for (const course of completedCourses) {
    if (course._used) continue;
    if (!predicate(course)) continue;

    course._used = true;
    rows.push(buildCompletedRow(course));
  }

  return uniqueRows(rows);
}

function isLiberalCourse(classification1: string): boolean {
  return classification1.includes('교양');
}

function buildExpression(values: {
  majorCoreLiberal: number;
  majorRequired: number;
  majorSelective: number;
  basicLiberal: number;
  fusionLiberal: number;
  extraLiberal: number;
  extraMajorRequired: number;
  extraMajorSelective: number;
  extraOther: number;
}): string {
  const missing = 0;

  return `(${values.majorCoreLiberal} + ${values.majorRequired} + ${values.majorSelective}) + ${values.basicLiberal} + ${values.fusionLiberal} + ${missing} + ${values.extraLiberal} + ${values.extraMajorRequired} + ${values.extraMajorSelective} + ${values.extraOther}`;
}

export function compareCourses(
  requiredCoursesInput: CourseInput[],
  completedCoursesInput: CourseInput[],
  graduationRequirements: GraduationRequirementInput[] = []
): CompareResult {
  const requiredCourses = makeRequiredItems(requiredCoursesInput);
  const completedCourses = makeCompletedItems(completedCoursesInput);

  const requiredMajorCore = uniqueRequiredComparableCourses(requiredCourses.filter((course) => course._classification1 === '계열교양'));
  const requiredMajorRequired = uniqueRequiredComparableCourses(requiredCourses.filter((course) => course._classification1 === '전공필수'));
  const requiredMajorSelective = uniqueRequiredComparableCourses(requiredCourses.filter((course) => course._classification1 === '전공선택'));
  const requiredBasic = uniqueRequiredComparableCourses(requiredCourses.filter((course) => course._classification1 === '기초교양'));
  const requiredFusion = uniqueRequiredComparableCourses(requiredCourses.filter((course) => course._classification1 === '융합교양'));

  const majorCoreMatch = matchRequiredCourses(requiredMajorCore, completedCourses);
  const majorRequiredMatch = matchRequiredCourses(requiredMajorRequired, completedCourses);
  const majorSelectiveMatch = matchRequiredCourses(requiredMajorSelective, completedCourses);
  const basicMatch = matchRequiredCourses(requiredBasic, completedCourses);
  const fusionMatch = matchRequiredCourses(requiredFusion, completedCourses);

  const extraBasicRows = takeRemainingByPredicate(completedCourses, (course) => course._classification1 === '기초교양');
  const extraFusionRows = takeRemainingByPredicate(completedCourses, (course) => course._classification1 === '융합교양');

  const basicRows = uniqueRows([...basicMatch.matchedRows, ...extraBasicRows]);
  const fusionRows = uniqueRows([...fusionMatch.matchedRows, ...extraFusionRows]);

  const majorCoreRequiredCredits = findRequirementCredit(graduationRequirements, '계열교양');
  const majorRequiredCredits = findRequirementCredit(graduationRequirements, '전공필수');
  const majorSelectiveCredits = findRequirementCredit(graduationRequirements, '전공선택');
  const basicRequiredCredits = findRequirementCredit(graduationRequirements, '기초교양');
  const fusionRequiredCredits = findRequirementCredit(graduationRequirements, '융합교양');
  const totalRequiredCredits = findRequirementCredit(graduationRequirements, '총학점');

  const majorCoreBucket = buildProgressBucket({
    title: '이수과목 - 계열교양 (제1학과)',
    shortLabel: '계교',
    rows: majorCoreMatch.matchedRows,
    requiredCredits: majorCoreRequiredCredits
  });

  const majorRequiredBucket = buildProgressBucket({
    title: '이수과목 - 전공필수 (제1학과)',
    shortLabel: '전필',
    rows: majorRequiredMatch.matchedRows,
    requiredCredits: majorRequiredCredits
  });

  const majorSelectiveBucket = buildProgressBucket({
    title: '이수과목 - 전공선택 (제1학과)',
    shortLabel: '전선',
    rows: majorSelectiveMatch.matchedRows,
    requiredCredits: majorSelectiveCredits
  });

  const basicBucket = buildProgressBucket({
    title: '기초교양',
    shortLabel: '기초',
    rows: basicRows,
    requiredCredits: basicRequiredCredits
  });

  const fusionBucket = buildProgressBucket({
    title: '융합교양',
    shortLabel: '융합',
    rows: fusionRows,
    requiredCredits: fusionRequiredCredits
  });

  const missingRows: CompareTableRow[] = [];

  if ((majorCoreBucket.remainingCredits ?? 0) > 0) {
    missingRows.push(...majorCoreMatch.missingRows);
  }
  if ((majorRequiredBucket.remainingCredits ?? 0) > 0) {
    missingRows.push(...majorRequiredMatch.missingRows);
  }
  if ((majorSelectiveBucket.remainingCredits ?? 0) > 0) {
    missingRows.push(...majorSelectiveMatch.missingRows);
  }
  if ((basicBucket.remainingCredits ?? 0) > 0) {
    missingRows.push(...basicMatch.missingRows);
  }
  if ((fusionBucket.remainingCredits ?? 0) > 0) {
    missingRows.push(...fusionMatch.missingRows);
  }

  const extraLiberalRows = takeRemainingByPredicate(
    completedCourses,
    (course) => isLiberalCourse(course._classification1)
  );

  const extraMajorRequiredRows = takeRemainingByPredicate(
    completedCourses,
    (course) => course._classification1 === '전공필수'
  );

  const extraMajorSelectiveRows = takeRemainingByPredicate(
    completedCourses,
    (course) => course._classification1 === '전공선택'
  );

  const extraOtherRows = takeRemainingByPredicate(
    completedCourses,
    () => true
  );

  const missingBucket = buildProgressBucket({
    title: '미이수',
    shortLabel: '미이수',
    rows: missingRows,
    requiredCredits: null,
    isExtra: true
  });

  const extraLiberalBucket = buildProgressBucket({
    title: '추가이수교양',
    shortLabel: '추가교양',
    rows: extraLiberalRows,
    requiredCredits: null,
    isExtra: true
  });

  const extraMajorRequiredBucket = buildProgressBucket({
    title: '추가 이수 전공(전공필수)',
    shortLabel: '추가전필',
    rows: extraMajorRequiredRows,
    requiredCredits: null,
    isExtra: true
  });

  const extraMajorSelectiveBucket = buildProgressBucket({
    title: '추가 이수 전공(전공선택)',
    shortLabel: '추가전선',
    rows: extraMajorSelectiveRows,
    requiredCredits: null,
    isExtra: true
  });

  const extraOtherBucket = buildProgressBucket({
    title: '그외 추가이수과목',
    shortLabel: '기타',
    rows: extraOtherRows,
    requiredCredits: null,
    isExtra: true
  });

  const earnedCredits =
    majorCoreBucket.earnedCredits +
    majorRequiredBucket.earnedCredits +
    majorSelectiveBucket.earnedCredits +
    basicBucket.earnedCredits +
    fusionBucket.earnedCredits +
    extraLiberalBucket.earnedCredits +
    extraMajorRequiredBucket.earnedCredits +
    extraMajorSelectiveBucket.earnedCredits +
    extraOtherBucket.earnedCredits;

  const expressionText = buildExpression({
    majorCoreLiberal: majorCoreBucket.earnedCredits,
    majorRequired: majorRequiredBucket.earnedCredits,
    majorSelective: majorSelectiveBucket.earnedCredits,
    basicLiberal: basicBucket.earnedCredits,
    fusionLiberal: fusionBucket.earnedCredits,
    extraLiberal: extraLiberalBucket.earnedCredits,
    extraMajorRequired: extraMajorRequiredBucket.earnedCredits,
    extraMajorSelective: extraMajorSelectiveBucket.earnedCredits,
    extraOther: extraOtherBucket.earnedCredits
  });

  return {
    summary: {
      earnedCredits,
      requiredCredits: totalRequiredCredits,
      headline: totalRequiredCredits === null ? `${earnedCredits} / -` : `${earnedCredits} / ${totalRequiredCredits}`,
      expressionText
    },
    buckets: {
      majorCoreLiberal: majorCoreBucket,
      majorRequired: majorRequiredBucket,
      majorSelective: majorSelectiveBucket,
      basicLiberal: basicBucket,
      fusionLiberal: fusionBucket,
      missing: missingBucket,
      extraLiberal: extraLiberalBucket,
      extraMajorRequired: extraMajorRequiredBucket,
      extraMajorSelective: extraMajorSelectiveBucket,
      extraOther: extraOtherBucket
    }
  };
}