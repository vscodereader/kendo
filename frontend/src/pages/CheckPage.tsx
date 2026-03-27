import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import {
  combineClassification,
  completedClassification1Options,
  completedClassification2Options,
  curriculumClassification1Options,
  curriculumClassification2Options,
  emptyCompletedCourseRow,
  emptyGraduationCredits,
  emptyRequiredCourseRow,
  formatCompletedText,
  formatCourseText,
  formatGraduationText,
  graduationLabels,
  normalizeClassification1,
  normalizeClassification2,
  numberOrUndefined,
  parseCompletedText,
  parseCourseText,
  parseGraduationText,
  prepareImagesForUpload,
  splitFreeClassification,
  toNumberOrEmpty,
  type CompletedCourseRow,
  type GraduationCredits,
  type RequiredCourseRow
} from '../ocrUtils';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:4000/api';
const SOURCE_PAGE_SIZE = 5;

type SourceItem = {
  id: string;
  title: string;
  category: string;
  year: number | null;
  sourceUrl: string;
};

type CatalogItem = {
  id: string;
  year: number;
  major: string;
};

type CompletedSetItem = {
  id: string;
  title: string;
  studentName?: string | null;
};

type CatalogDetailResponse = {
  id: string;
  year: number;
  major: string;
  sourceId?: string | null;
  sourceUrl?: string | null;
  courses: Array<{
    yearLevel: number | null;
    semesterOrder: number | null;
    classification1?: string | null;
    classification2?: string | null;
    name: string;
    credit: number | null;
  }>;
  graduationRequirements: Array<{
    label: string;
    credits: number | null;
  }>;
};

type CompletedSetDetailResponse = {
  id: string;
  title: string;
  studentName?: string | null;
  studentNo?: string | null;
  courses: Array<{
    yearTaken: number | null;
    termText: string;
    classification1?: string | null;
    classification2?: string | null;
    name: string;
    credit: number | null;
    gradeText: string;
    professor: string;
  }>;
};

type CompareTableRow = {
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

type CompareBucket = {
  title: string;
  headline: string;
  subline: string;
  earnedCredits: number;
  requiredCredits: number | null;
  remainingCredits: number | null;
  rows: CompareTableRow[];
};

type CompareResponse = {
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

type CurriculumAiResponse = {
  courses: Array<{
    yearLevel: number | null;
    semesterOrder: number | null;
    classification?: string;
    classification1?: string;
    classification2?: string;
    name: string;
    credit: number | null;
  }>;
  graduationCredits: Record<string, number | null>;
  rawText: string;
};

type CompletedAiResponse = {
  courses: Array<{
    yearTaken: number | null;
    termText: string;
    classification?: string;
    classification1?: string;
    classification2?: string;
    name: string;
    credit: number | null;
    gradeText: string;
    professor: string;
  }>;
  rawText: string;
};

type GridColumn<Row extends Record<string, unknown>> = {
  key: Extract<keyof Row, string>;
  label: string;
  type: 'int' | 'text' | 'select';
  options?: string[];
  width?: string;
  filterable?: boolean;
};

type CellCoord<Row extends Record<string, unknown>> = {
  rowIndex: number;
  key: Extract<keyof Row, string>;
};

function requiredRowSortValue(row: RequiredCourseRow): [number, number, string, string] {
  const year = typeof row.yearLevel === 'number' ? row.yearLevel : 99;
  const semester = typeof row.semesterOrder === 'number' ? row.semesterOrder : 99;
  return [year, semester, row.classification1 ?? '', row.name ?? ''];
}

function completedTermSortValue(termText: string): number {
  const text = String(termText ?? '').replace(/\s+/g, '');
  if (!text) return 99;
  if (text.includes('1학기')) return 1;
  if (text.includes('여름')) return 2;
  if (text.includes('2학기')) return 3;
  if (text.includes('겨울')) return 4;

  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : 99;
}

function sortRequiredRows(rows: RequiredCourseRow[]): RequiredCourseRow[] {
  return [...rows].sort((a, b) => {
    const [ay, as, ac, an] = requiredRowSortValue(a);
    const [by, bs, bc, bn] = requiredRowSortValue(b);

    if (ay !== by) return ay - by;
    if (as !== bs) return as - bs;

    const classDiff = ac.localeCompare(bc, 'ko');
    if (classDiff !== 0) return classDiff;

    return an.localeCompare(bn, 'ko');
  });
}

function sortCompletedRows(rows: CompletedCourseRow[]): CompletedCourseRow[] {
  return [...rows].sort((a, b) => {
    const ay = typeof a.yearTaken === 'number' ? a.yearTaken : 9999;
    const by = typeof b.yearTaken === 'number' ? b.yearTaken : 9999;
    if (ay !== by) return ay - by;

    const at = completedTermSortValue(a.termText);
    const bt = completedTermSortValue(b.termText);
    if (at !== bt) return at - bt;

    return a.name.localeCompare(b.name, 'ko');
  });
}

function CheckPage() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [sourcePage, setSourcePage] = useState(1);

  const [sources, setSources] = useState<SourceItem[]>([]);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);
  const [completedSets, setCompletedSets] = useState<CompletedSetItem[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');
  const [selectedCompletedSetId, setSelectedCompletedSetId] = useState('');
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);

  const [curriculumYear, setCurriculumYear] = useState('2025');
  const [curriculumMajor, setCurriculumMajor] = useState('컴퓨터공학전공');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [selectedSourceUrl, setSelectedSourceUrl] = useState('');
  const [curriculumCourseFiles, setCurriculumCourseFiles] = useState<File[]>([]);
  const [curriculumGraduationFiles, setCurriculumGraduationFiles] = useState<File[]>([]);
  const [courseText, setCourseText] = useState('');
  const [graduationText, setGraduationText] = useState('');
  const [courseRows, setCourseRows] = useState<RequiredCourseRow[]>([]);
  const [graduationValues, setGraduationValues] = useState<GraduationCredits>(emptyGraduationCredits());

  const [completedTitle, setCompletedTitle] = useState('내 이수내역');
  const [studentName, setStudentName] = useState('');
  const [studentNo, setStudentNo] = useState('');
  const [completedFiles, setCompletedFiles] = useState<File[]>([]);
  const [completedText, setCompletedText] = useState('');
  const [completedRows, setCompletedRows] = useState<CompletedCourseRow[]>([]);
  const [loadedCatalogId, setLoadedCatalogId] = useState('');
  const [loadedCompletedSetId, setLoadedCompletedSetId] = useState('');
  const majorSources = useMemo(() => sources.filter((item) => item.category === 'major'), [sources]);

  const pagedMajorSources = useMemo(() => {
    const start = (sourcePage - 1) * SOURCE_PAGE_SIZE;
    return majorSources.slice(start, start + SOURCE_PAGE_SIZE);
  }, [majorSources, sourcePage]);

  const totalSourcePages = Math.max(1, Math.ceil(majorSources.length / SOURCE_PAGE_SIZE));

  useEffect(() => {
    void refreshCatalogs();
    void refreshCompletedSets();
  }, []);

  const courseColumns: GridColumn<RequiredCourseRow>[] = [
    { key: 'yearLevel', label: '학년', type: 'int', width: '90px' },
    { key: 'semesterOrder', label: '학기', type: 'int', width: '90px' },
    {
      key: 'classification1',
      label: '이수구분1',
      type: 'select',
      width: '150px',
      options: [...curriculumClassification1Options],
      filterable: true
    },
    {
      key: 'classification2',
      label: '이수구분2',
      type: 'select',
      width: '120px',
      options: ['', ...curriculumClassification2Options],
      filterable: true
    },
    { key: 'name', label: '교과목명', type: 'text', width: '320px' },
    { key: 'credit', label: '학점', type: 'int', width: '90px' }
  ];

  const completedColumns: GridColumn<CompletedCourseRow>[] = [
    { key: 'yearTaken', label: '연도', type: 'int', width: '100px' },
    { key: 'termText', label: '학기', type: 'text', width: '120px', filterable: true },
    {
      key: 'classification1',
      label: '이수구분1',
      type: 'select',
      width: '150px',
      options: ['', ...completedClassification1Options],
      filterable: true
    },
    {
      key: 'classification2',
      label: '이수구분2',
      type: 'select',
      width: '120px',
      options: ['', ...completedClassification2Options],
      filterable: true
    },
    { key: 'name', label: '교과목명', type: 'text', width: '260px' },
    { key: 'credit', label: '학점', type: 'int', width: '90px' },
    { key: 'gradeText', label: '성적', type: 'text', width: '90px', filterable: true },
    { key: 'professor', label: '교수명', type: 'text', width: '150px' }
  ];

  const compareColumns: GridColumn<CompareTableRow>[] = [
    { key: 'yearText', label: '학년/연도', type: 'text', width: '100px', filterable: true },
    { key: 'termText', label: '학기', type: 'text', width: '110px', filterable: true },
    { key: 'classification1', label: '이수구분1', type: 'text', width: '150px', filterable: true },
    { key: 'classification2', label: '이수구분2', type: 'text', width: '120px', filterable: true },
    { key: 'name', label: '교과목명', type: 'text', width: '280px' },
    { key: 'credit', label: '학점', type: 'text', width: '90px' },
    { key: 'gradeText', label: '성적', type: 'text', width: '90px', filterable: true },
    { key: 'professor', label: '교수명', type: 'text', width: '150px' }
  ];

  async function refreshSources() {
    setBusy('sources');
    try {
      const data = await requestJson<{ items: SourceItem[] }>(`${API_BASE}/sources/gachon/refresh?category=major`, {
        method: 'POST'
      });
      setSources(data.items);
      setSourcePage(1);
      setMessage('전공교육과정 링크를 새로 가져왔습니다.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function refreshCatalogs() {
    const data = await requestJson<{ items: CatalogItem[] }>(`${API_BASE}/catalogs`);
    setCatalogs(data.items);
  }

  async function refreshCompletedSets() {
    const data = await requestJson<{ items: CompletedSetItem[] }>(`${API_BASE}/completed-sets`);
    setCompletedSets(data.items);
  }

    async function loadCatalogIntoEditor(catalogId: string) {
    if (!catalogId) {
      setLoadedCatalogId('');
      setCourseRows([]);
      setCourseText('');
      const emptyValues = emptyGraduationCredits();
      setGraduationValues(emptyValues);
      setGraduationText(formatGraduationText(emptyValues));
      return;
    }

    setBusy('load-catalog');
    try {
      const data = await requestJson<CatalogDetailResponse>(`${API_BASE}/catalogs/${catalogId}`);

      const rows: RequiredCourseRow[] = data.courses.map((course) => ({
        yearLevel: course.yearLevel ?? '',
        semesterOrder: course.semesterOrder ?? '',
        classification1: normalizeClassification1(course.classification1 ?? ''),
        classification2: normalizeClassification2(course.classification2 ?? ''),
        name: course.name ?? '',
        credit: course.credit ?? ''
      }));

      const sortedRows = sortRequiredCourseRows(rows);

      const nextGraduation = emptyGraduationCredits();
      data.graduationRequirements.forEach((item) => {
        const label = item.label as keyof GraduationCredits;
        if (graduationLabels.includes(label)) {
          nextGraduation[label] = item.credits ?? '';
        }
      });

      setLoadedCatalogId(catalogId);

      setCurriculumYear(String(data.year ?? ''));
      setCurriculumMajor(data.major ?? '');
      setSelectedSourceId(data.sourceId ?? '');
      setSelectedSourceUrl(data.sourceUrl ?? '');

      setCourseRows(sortedRows);
      setCourseText(formatCourseText(sortedRows));

      setGraduationValues(nextGraduation);
      setGraduationText(formatGraduationText(nextGraduation));

      setMessage('저장된 전공교육과정을 불러왔습니다.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function deleteLoadedCatalog() {
    if (!loadedCatalogId) return;

    const ok = window.confirm('선택한 전공교육과정을 삭제할까요?');
    if (!ok) return;

    setBusy('delete-catalog');
    try {
      await requestJson<{ ok: boolean; id: string }>(`${API_BASE}/catalogs/${loadedCatalogId}`, {
        method: 'DELETE'
      });

      if (selectedCatalogId === loadedCatalogId) {
        setSelectedCatalogId('');
        setCompareResult(null);
      }

      setLoadedCatalogId('');
      setCourseRows([]);
      setCourseText('');
      const emptyValues = emptyGraduationCredits();
      setGraduationValues(emptyValues);
      setGraduationText(formatGraduationText(emptyValues));

      await refreshCatalogs();

      setMessage('전공교육과정을 삭제했습니다.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function loadCompletedSetIntoEditor(setId: string) {
    if (!setId) {
      setLoadedCompletedSetId('');
      setCompletedTitle('내 이수내역');
      setStudentName('');
      setStudentNo('');
      setCompletedRows([]);
      setCompletedText('');
      return;
    }

    setBusy('load-completed');
    try {
      const data = await requestJson<CompletedSetDetailResponse>(`${API_BASE}/completed-sets/${setId}`);

      const rows: CompletedCourseRow[] = data.courses.map((course) => ({
        yearTaken: course.yearTaken ?? '',
        termText: course.termText ?? '',
        classification1: normalizeClassification1(course.classification1 ?? ''),
        classification2: normalizeClassification2(course.classification2 ?? ''),
        name: course.name ?? '',
        credit: course.credit ?? '',
        gradeText: course.gradeText ?? '',
        professor: course.professor ?? ''
      }));

      const sortedRows = sortCompletedRows(rows);

      setLoadedCompletedSetId(setId);

      setCompletedTitle(data.title ?? '내 이수내역');
      setStudentName(data.studentName ?? '');
      setStudentNo(data.studentNo ?? '');

      setCompletedRows(sortedRows);
      setCompletedText(formatCompletedText(sortedRows));

      setMessage('저장된 이수내역 세트를 불러왔습니다.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function deleteLoadedCompletedSet() {
    if (!loadedCompletedSetId) return;

    const ok = window.confirm('선택한 이수내역 세트를 삭제할까요?');
    if (!ok) return;

    setBusy('delete-completed');
    try {
      await requestJson<{ ok: boolean; id: string }>(`${API_BASE}/completed-sets/${loadedCompletedSetId}`, {
        method: 'DELETE'
      });

      if (selectedCompletedSetId === loadedCompletedSetId) {
        setSelectedCompletedSetId('');
        setCompareResult(null);
      }

      setLoadedCompletedSetId('');
      setCompletedTitle('내 이수내역');
      setStudentName('');
      setStudentNo('');
      setCompletedRows([]);
      setCompletedText('');

      await refreshCompletedSets();

      setMessage('이수내역 세트를 삭제했습니다.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function onChangeSource(sourceId: string) {
    setSelectedSourceId(sourceId);
    if (!sourceId) {
      setSelectedSourceUrl('');
      return;
    }
    const found = majorSources.find((item) => item.id === sourceId);
    if (!found) return;
    setSelectedSourceUrl(found.sourceUrl);
    if (found.year) setCurriculumYear(String(found.year));
  }

  async function runCurriculumAi(mode: 'courses' | 'graduation') {
    const files =
      mode === 'graduation'
        ? curriculumGraduationFiles.length > 0
          ? curriculumGraduationFiles
          : curriculumCourseFiles
        : curriculumCourseFiles;

    if (files.length === 0) {
      setMessage(mode === 'graduation' ? '졸업이수학점 스크린샷을 먼저 선택하세요.' : '전공교육과정 스크린샷을 먼저 선택하세요.');
      return;
    }

    setBusy(`curriculum-${mode}`);
    try {
      const images = await prepareImagesForUpload(files, false);
      const data = await requestJson<CurriculumAiResponse>(`${API_BASE}/ai-ocr/curriculum`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          year: curriculumYear,
          major: curriculumMajor,
          mode
        })
      });

      if (mode === 'courses') {
        const rows: RequiredCourseRow[] = data.courses.map((course) => {
          const class1 = normalizeClassification1(course.classification1 ?? '');
          const class2 = normalizeClassification2(course.classification2 ?? '');

          return {
            yearLevel: course.yearLevel ?? '',
            semesterOrder: course.semesterOrder ?? '',
            classification1: class1,
            classification2: class2,
            name: course.name ?? '',
            credit: course.credit ?? ''
          };
        });

        const sortedRows = sortRequiredCourseRows(rows);

        setCourseRows(sortedRows);
        setCourseText(formatCourseText(sortedRows));
        setMessage('AI가 전공 과목을 추출했습니다. 텍스트를 검수한 뒤 표에 반영하거나 표에서 직접 수정하세요.');
      }
        else {
        const values = emptyGraduationCredits();
        graduationLabels.forEach((label) => {
          values[label] = data.graduationCredits[label] ?? '';
        });
        setGraduationValues(values);
        setGraduationText(formatGraduationText(values));
        setMessage('AI가 졸업이수학점을 추출했습니다. 텍스트를 검수한 뒤 표에 반영하거나 표에서 직접 수정하세요.');
      }
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function reflectCourseText() {
  const rows = parseCourseText(courseText);
  const sortedRows = sortRequiredCourseRows(rows);
  setCourseRows(sortedRows);
  setCourseText(formatCourseText(sortedRows));
  setMessage(`과목 OCR 텍스트를 표에 반영했습니다. (${sortedRows.length}개)`);
}

  function reflectGraduationText() {
    const values = parseGraduationText(graduationText);
    setGraduationValues(values);
    setMessage('졸업이수학점 OCR 텍스트를 표에 반영했습니다.');
  }

  async function saveCatalog() {
    const validCourses = courseRows.filter((row) => row.name.trim());
    if (!curriculumYear.trim() || !curriculumMajor.trim() || validCourses.length === 0) {
      setMessage('연도, 전공명, 전공 과목 표를 확인하세요.');
      return;
    }

    setBusy('save-catalog');
    try {
      const saved = await requestJson<{ id: string }>(`${API_BASE}/catalogs/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: curriculumYear,
          major: curriculumMajor,
          sourceId: selectedSourceId || undefined,
          sourceUrl: selectedSourceUrl || undefined,
          courses: validCourses.map((row) => ({
            yearLevel: numberOrUndefined(row.yearLevel),
            semesterOrder: numberOrUndefined(row.semesterOrder),
            semesterText:
              row.yearLevel !== '' && row.semesterOrder !== '' ? `${row.yearLevel}-${row.semesterOrder}` : undefined,
            classification1: normalizeClassification1(row.classification1),
            classification2: normalizeClassification2(row.classification2),
            classification: combineClassification(row.classification1, row.classification2),
            name: row.name,
            credit: numberOrUndefined(row.credit)
          })),
          graduationRequirements: graduationLabels.map((label, index) => ({
            section: '졸업이수학점',
            label,
            credits: graduationValues[label] === '' ? undefined : graduationValues[label],
            sortOrder: index
          }))
        })
      });

      await refreshCatalogs();
      setSelectedCatalogId(saved.id);
      setMessage('전공교육과정을 DB에 저장했습니다.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function runCompletedAi() {
    if (completedFiles.length === 0) {
      setMessage('이수내역 스크린샷을 먼저 선택하세요.');
      return;
    }

    setBusy('completed-ocr');
    try {
      const images = await prepareImagesForUpload(completedFiles, false);
      const data = await requestJson<CompletedAiResponse>(`${API_BASE}/ai-ocr/completed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images })
      });

      const rows: CompletedCourseRow[] = data.courses.map((course) => {
        const parts =
          course.classification1 || course.classification2
            ? {
                classification1: normalizeClassification1(course.classification1 ?? ''),
                classification2: normalizeClassification2(course.classification2 ?? '')
              }
            : splitFreeClassification(course.classification ?? '');

        return {
          yearTaken: course.yearTaken ?? '',
          termText: course.termText ?? '',
          classification1: parts.classification1,
          classification2: parts.classification2,
          name: course.name ?? '',
          credit: course.credit ?? '',
          gradeText: course.gradeText ?? '',
          professor: course.professor ?? ''
        };
      });

      const sortedRows = sortCompletedRows(rows);
      setCompletedRows(sortedRows);
      setCompletedText(formatCompletedText(sortedRows));
      setMessage('AI가 이수내역을 추출했습니다. 텍스트를 검수한 뒤 표에 반영하거나 표에서 직접 수정하세요.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function reflectCompletedText() {
  const rows = sortCompletedRows(parseCompletedText(completedText));
  setCompletedRows(rows);
  setMessage(`이수내역 OCR 텍스트를 표에 반영했습니다. (${rows.length}개)`);
}

  async function saveCompletedSet() {
    const validCourses = completedRows.filter((row) => row.name.trim());
    if (!completedTitle.trim() || validCourses.length === 0) {
      setMessage('이수내역 이름과 과목 표를 확인하세요.');
      return;
    }

    setBusy('save-completed');
    try {
      const saved = await requestJson<{ id: string }>(`${API_BASE}/completed-sets/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: completedTitle,
          studentName,
          studentNo,
          courses: validCourses.map((row) => ({
            yearTaken: numberOrUndefined(row.yearTaken),
            termText: row.termText,
            classification1: normalizeClassification1(row.classification1),
            classification2: normalizeClassification2(row.classification2),
            classification: combineClassification(row.classification1, row.classification2),
            name: row.name,
            credit: numberOrUndefined(row.credit),
            gradeText: row.gradeText,
            professor: row.professor
          }))
        })
      });

      await refreshCompletedSets();
      setSelectedCompletedSetId(saved.id);
      setMessage('이수내역을 DB에 저장했습니다.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function compareSelected() {
    if (!selectedCatalogId || !selectedCompletedSetId) {
      setMessage('비교할 전공교육과정과 이수내역을 모두 선택하세요.');
      return;
    }

    setBusy('compare');
    try {
      const data = await requestJson<CompareResponse>(`${API_BASE}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalogId: selectedCatalogId, completedSetId: selectedCompletedSetId })
      });
      setCompareResult(data);
      setMessage('비교를 완료했습니다.');
    } catch (error) {
      setMessage(getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function markMissingAsCompleted(rowId?: string) {
    if (!rowId) return;

    setCompareResult((prev) => {
      if (!prev) return prev;

      const target = prev.buckets.missing.rows.find((row) => row.id === rowId);
      if (!target) return prev;

      const destinationKey: keyof CompareResponse['buckets'] =
        target.classification1 === '계열교양'
          ? 'majorCoreLiberal'
          : target.classification1 === '전공필수'
            ? 'majorRequired'
            : target.classification1 === '전공선택'
              ? 'majorSelective'
              : target.classification1 === '기초교양'
                ? 'basicLiberal'
                : target.classification1 === '융합교양'
                  ? 'fusionLiberal'
                  : 'extraOther';

      const movedRow: CompareTableRow = {
        ...target,
        gradeText: target.gradeText || '수동이수'
      };

      const nextMissingRows = prev.buckets.missing.rows.filter((row) => row.id !== rowId);
      const nextDestinationRows = [...prev.buckets[destinationKey].rows, movedRow].sort(sortCompareRows);

      const nextBuckets: CompareResponse['buckets'] = {
        ...prev.buckets,
        missing: rebuildCompareBucket(prev.buckets.missing, nextMissingRows),
        [destinationKey]: rebuildCompareBucket(prev.buckets[destinationKey], nextDestinationRows)
      };

      const nextEarnedCredits =
        nextBuckets.majorCoreLiberal.earnedCredits +
        nextBuckets.majorRequired.earnedCredits +
        nextBuckets.majorSelective.earnedCredits +
        nextBuckets.basicLiberal.earnedCredits +
        nextBuckets.fusionLiberal.earnedCredits +
        nextBuckets.extraLiberal.earnedCredits +
        nextBuckets.extraMajorRequired.earnedCredits +
        nextBuckets.extraMajorSelective.earnedCredits +
        nextBuckets.extraOther.earnedCredits;

      return {
        summary: {
          earnedCredits: nextEarnedCredits,
          requiredCredits: prev.summary.requiredCredits,
          headline:
            prev.summary.requiredCredits === null
              ? `${nextEarnedCredits} / -`
              : `${nextEarnedCredits} / ${prev.summary.requiredCredits}`,
          expressionText: buildSummaryExpression(nextBuckets)
        },
        buckets: nextBuckets
      };
    });

    setMessage('선택한 미이수 과목을 이수 처리했습니다.');
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <div className="eyebrow">Gachon OpenAI OCR Compare</div>
          <h1>가천대 전공교육과정 AI OCR 비교기</h1>
          <p>AI OCR 결과를 텍스트로 검수하고, 엑셀 같은 표에서 직접 수정한 뒤 DB에 저장하고 비교한다.</p>
        </div>
      </header>

      {message ? <div className="message">{message}</div> : null}

      <section className="card">
        <div className="section-head">
          <div>
            <h2>1. 전공교육과정 링크</h2>
            <p> </p>
          </div>
          <button className="primary" onClick={() => void refreshSources()} disabled={busy === 'sources'}>
            {busy === 'sources' ? '가져오는 중...' : '전공 링크 가져오기'}
          </button>
        </div>

        <div className="table-wrap">
          <table className="simple-table">
            <thead>
              <tr>
                <th>연도</th>
                <th>제목</th>
                <th>링크</th>
              </tr>
            </thead>
            <tbody>
              {majorSources.length === 0 ? (
                <tr>
                  <td colSpan={3}>아직 링크가 없습니다.</td>
                </tr>
              ) : (
                pagedMajorSources.map((item) => (
                  <tr key={item.id}>
                    <td>{item.year ?? '-'}</td>
                    <td>{item.title}</td>
                    <td>
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                        열기
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <button
            className="ghost"
            onClick={() => setSourcePage((prev) => Math.max(1, prev - 1))}
            disabled={sourcePage === 1}
          >
            이전
          </button>
          <span>
            {sourcePage} / {totalSourcePages}
          </span>
          <button
            className="ghost"
            onClick={() => setSourcePage((prev) => Math.min(totalSourcePages, prev + 1))}
            disabled={sourcePage === totalSourcePages}
          >
            다음
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>2. 전공교육과정</h2>
            <p>직접 행 추가를 누르고 작성하거나, 표의 셀을 더블클릭해서 직접 수정할 수 있습니다~</p>
          </div>
        </div>

        <div className="grid three compact-grid">
          <label>
            <span>요람 링크</span>
            <select value={selectedSourceId} onChange={(event) => onChangeSource(event.target.value)}>
              <option value="">직접 입력</option>
              {majorSources.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.year ?? '-'} / {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>연도</span>
            <input value={curriculumYear} onChange={(event) => setCurriculumYear(event.target.value)} />
          </label>
          <label>
            <span>전공명</span>
            <input value={curriculumMajor} onChange={(event) => setCurriculumMajor(event.target.value)} />
          </label>
        </div>

        <div className="grid two top-gap">
          <div className="upload-box">
            <div className="upload-title">과목표 스크린샷</div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setCurriculumCourseFiles(Array.from(event.target.files ?? []))}
            />
            <div className="file-count">{curriculumCourseFiles.length}개 선택됨</div>
           
            <button
              className="primary ocr-run-button"
              onClick={() => void runCurriculumAi('courses')}
              disabled={busy === 'curriculum-courses'}
            >
              {busy === 'curriculum-courses' ? '잠시만 기다려주세요 ~' : '과목 텍스트 추출 실행!'}
            </button>
          </div>

          <div className="upload-box">
            <div className="upload-title">졸업이수학점 스크린샷</div>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => setCurriculumGraduationFiles(Array.from(event.target.files ?? []))}
            />
            <div className="file-count">
              {curriculumGraduationFiles.length > 0
                ? `${curriculumGraduationFiles.length}개 선택됨`
                : '없으면 과목표 스크린샷을 그대로 사용'}
            </div>
            <button
              className="primary ocr-run-button"
              onClick={() => void runCurriculumAi('graduation')}
              disabled={busy === 'curriculum-graduation'}
            >
              {busy === 'curriculum-graduation' ? '잠시만 기다려주세요 ~' : '졸업이수학점 텍스트 추출 실행!'}
            </button>
          </div>
        </div>

        <div className="grid two top-gap">
          <div>
            <div className="subhead-row">
              <h3>과목 OCR 결과</h3>
              <button className="ghost reflect-button" onClick={reflectCourseText}>
                과목표에 반영
              </button>
            </div>
            <p className="hint">한 줄에 과목 1개씩. 형식: 학년 / 학기 / 이수구분1/이수구분2 / 교과목명 / 학점</p>
            <textarea value={courseText} onChange={(event) => setCourseText(event.target.value)} rows={12} />
          </div>

          <div>
            <div className="subhead-row">
              <h3>졸업이수학점 OCR 결과</h3>
              <button className="ghost reflect-button" onClick={reflectGraduationText}>
                이수학점표에 반영
              </button>
            </div>
            <p className="hint">
              형식: 기초교양 / 17 / 융합교양 / 11 / 계열교양 / 24 / 전공필수 / 21 / 전공선택 / 51 /
              총학점 / 130
            </p>
            <textarea value={graduationText} onChange={(event) => setGraduationText(event.target.value)} rows={12} />
          </div>
        </div>

        <div className="subhead-row top-gap table-toolbar-row">
          <h3 className="table-toolbar-title">전공 과목 표</h3>
          <div className="table-head-tools single-line-tools">
            <select
              className="saved-load-select"
              value={loadedCatalogId}
              onChange={(event) => void loadCatalogIntoEditor(event.target.value)}
            >
              <option value="">시간표를 선택하세요</option>
              {catalogs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.year} / {item.major}
                </option>
              ))}
            </select>

            <button
              className="danger delete-inline-button"
              onClick={() => void deleteLoadedCatalog()}
              disabled={!loadedCatalogId || busy === 'delete-catalog'}
            >
              {busy === 'delete-catalog' ? '삭제 중...' : '삭제'}
            </button>

            <span className="hint no-margin total-count-inline">
              총 과목 수 : {courseRows.filter((row) => row.name.trim()).length}
            </span>

            <button
              className="ghost"
              onClick={() => setCourseRows((prev) => [...prev, emptyRequiredCourseRow()])}
            >
              행 추가
            </button>
          </div>
        </div>

        <SpreadsheetTable
          columns={courseColumns}
          rows={courseRows}
          setRows={setCourseRows}
          emptyText="과목 AI OCR을 실행한 뒤 텍스트를 검수하고 반영하세요."
          visibleRowCount={10}
          filterable
        />

        <h3 className="top-gap">졸업이수학점 표</h3>
        <GraduationSheet values={graduationValues} onChange={setGraduationValues} />

        <div className="actions top-gap">
          <button className="primary save-button" onClick={() => void saveCatalog()} disabled={busy === 'save-catalog'}>
            {busy === 'save-catalog' ? '저장 중...' : '전공교육과정 저장'}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>3. 이수내역 AI OCR</h2>
            <p> </p>
          </div>
        </div>

        <div className="grid three compact-grid">
          <label>
            <span>이수내역 이름</span>
            <input value={completedTitle} onChange={(event) => setCompletedTitle(event.target.value)} />
          </label>
          <label>
            <span>학생 이름</span>
            <input value={studentName} onChange={(event) => setStudentName(event.target.value)} />
          </label>
          <label>
            <span>학번</span>
            <input value={studentNo} onChange={(event) => setStudentNo(event.target.value)} />
          </label>
        </div>

        <div className="upload-box top-gap">
          <div className="upload-title">이수내역 스크린샷</div>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => setCompletedFiles(Array.from(event.target.files ?? []))}
          />
          <div className="file-count">{completedFiles.length}개 선택됨</div>
          <button className="primary" onClick={() => void runCompletedAi()} disabled={busy === 'completed-ocr'}>
            {busy === 'completed-ocr' ? 'AI 분석 중...' : '이수내역 AI OCR 실행'}
          </button>
        </div>

        <div className="subhead-row top-gap table-toolbar-row">
          <h3>이수내역 OCR 결과</h3>
          <button className="ghost" onClick={reflectCompletedText}>
            이수내역표에 저장
          </button>
        </div>
        <p className="hint">한 줄에 과목 1개씩. 형식: 연도 / 학기 / 이수구분1/이수구분2 / 교과목명 / 학점 / 성적 / 교수명</p>
        <textarea value={completedText} onChange={(event) => setCompletedText(event.target.value)} rows={12} />

        <div className="subhead-row top-gap table-toolbar-row">
          <h3 className="table-toolbar-title">이수내역 표</h3>
          <div className="table-head-tools single-line-tools">
            <select
              className="saved-load-select"
              value={loadedCompletedSetId}
              onChange={(event) => void loadCompletedSetIntoEditor(event.target.value)}
            >
              <option value="">이수내역을 선택하세요</option>
              {completedSets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {item.studentName ? ` / ${item.studentName}` : ''}
                </option>
              ))}
            </select>

            <button
              className="danger delete-inline-button"
              onClick={() => void deleteLoadedCompletedSet()}
              disabled={!loadedCompletedSetId || busy === 'delete-completed'}
            >
              {busy === 'delete-completed' ? '삭제 중...' : '삭제'}
            </button>

            <span className="hint no-margin total-count-inline">
              총 과목 수 : {completedRows.filter((row) => row.name.trim()).length}
            </span>

            <button
              className="ghost"
              onClick={() => setCompletedRows((prev) => [...prev, emptyCompletedCourseRow()])}
            >
              행 추가
            </button>
          </div>
        </div>

        <SpreadsheetTable
          columns={completedColumns}
          rows={completedRows}
          setRows={setCompletedRows}
          emptyText="이수내역 AI OCR을 실행한 뒤 텍스트를 검수하고 반영하세요."
          visibleRowCount={10}
          filterable
        />

        <div className="actions top-gap">
          <button className="primary save-button" onClick={() => void saveCompletedSet()} disabled={busy === 'save-completed'}>
            {busy === 'save-completed' ? '저장 중...' : '이수내역 저장'}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <div>
            <h2>4. 저장된 데이터 비교</h2>
            <p> </p>
          </div>
          <button className="primary" onClick={() => void compareSelected()} disabled={busy === 'compare'}>
            {busy === 'compare' ? '비교 중...' : '비교 실행'}
          </button>
        </div>

        <div className="grid two compact-grid">
          <label>
            <span>전공교육과정</span>
            <select value={selectedCatalogId} onChange={(event) => setSelectedCatalogId(event.target.value)}>
              <option value="">선택하세요</option>
              {catalogs.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.year} / {item.major}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>이수내역 세트</span>
            <select value={selectedCompletedSetId} onChange={(event) => setSelectedCompletedSetId(event.target.value)}>
              <option value="">선택하세요</option>
              {completedSets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {item.studentName ? ` / ${item.studentName}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        {compareResult ? (
          <div className="compare-box top-gap">
            <div className="compare-summary compare-summary--4">
              <div>{compareResult.summary.headline}</div>
              <div>{compareResult.summary.expressionText}</div>
              <div>미이수 과목 수 : {compareResult.buckets.missing.rows.length}</div>
              <div>
                추가 이수 과목 수 :{' '}
                {compareResult.buckets.extraLiberal.rows.length +
                  compareResult.buckets.extraMajorRequired.rows.length +
                  compareResult.buckets.extraMajorSelective.rows.length +
                  compareResult.buckets.extraOther.rows.length}
              </div>
            </div>

            <CompareBucketSection
              bucket={compareResult.buckets.majorCoreLiberal}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="계열교양(제1학과) 이수 과목이 없습니다."
            />

            <CompareBucketSection
              bucket={compareResult.buckets.majorRequired}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="전공필수(제1학과) 이수 과목이 없습니다."
            />

            <CompareBucketSection
              bucket={compareResult.buckets.majorSelective}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="전공선택(제1학과) 이수 과목이 없습니다."
            />

            <CompareBucketSection
              bucket={compareResult.buckets.basicLiberal}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="기초교양 이수 과목이 없습니다."
            />

            <CompareBucketSection
              bucket={compareResult.buckets.fusionLiberal}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="융합교양 이수 과목이 없습니다."
            />

            <CompareBucketSection
              bucket={compareResult.buckets.missing}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="미이수 과목이 없습니다."
              actionLabel="이수"
              onAction={(row) => {
                const rowId = String((row as { id?: string }).id ?? '');
                if (rowId) markMissingAsCompleted(rowId);
              }}
            />

            <CompareBucketSection
              bucket={compareResult.buckets.extraLiberal}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="추가이수교양 과목이 없습니다."
            />

            <CompareBucketSection
              bucket={compareResult.buckets.extraMajorRequired}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="추가 이수 전공(전공필수) 과목이 없습니다."
            />

            <CompareBucketSection
              bucket={compareResult.buckets.extraMajorSelective}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="추가 이수 전공(전공선택) 과목이 없습니다."
            />

            <CompareBucketSection
              bucket={compareResult.buckets.extraOther}
              columns={compareColumns}
              visibleRowCount={10}
              emptyText="그외 추가이수과목이 없습니다."
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

type CompareBucketLike<Row extends Record<string, unknown>> = {
  title: string;
  headline: string;
  subline: string;
  earnedCredits: number;
  requiredCredits: number | null;
  remainingCredits: number | null;
  rows: Row[];
};

function CompareBucketSection<Row extends Record<string, unknown>>({
  bucket,
  columns,
  visibleRowCount,
  emptyText,
  actionLabel,
  onAction
}: {
  bucket: CompareBucketLike<Row>;
  columns: GridColumn<Row>[];
  visibleRowCount: number;
  emptyText: string;
  actionLabel?: string;
  onAction?: (row: Row) => void;
}) {
  return (
    <div className="compare-section">
      <div className="compare-section-head">
        <h3 className="compare-section-title">{bucket.title}</h3>
        <CompareProgressCard
          headline={bucket.headline}
          subline={bucket.subline}
          remainingCredits={bucket.remainingCredits}
        />
      </div>

      <ReadonlySpreadsheetTable
        columns={columns}
        rows={bucket.rows}
        visibleRowCount={visibleRowCount}
        emptyText={emptyText}
        filterable
        actionLabel={actionLabel}
        onAction={onAction}
      />
    </div>
  );
}

function CompareProgressCard({
  headline,
  subline,
  remainingCredits
}: {
  headline: string;
  subline: string;
  remainingCredits: number | null;
}) {
  const parsed = parseProgressSubline(subline, remainingCredits);

  return (
    <div className="compare-progress-card">
      <div className="compare-progress-headline">{headline}</div>
      {parsed}
    </div>
  );
}

function parseProgressSubline(subline: string, remainingCredits: number | null) {
  if (remainingCredits === 0) {
    return (
      <div className="compare-progress-subline compare-progress-subline--done">
        <strong>다 들으셨어요!</strong>
      </div>
    );
  }

  if (!subline) return null;

  const match = subline.match(/^(.+?)\s+(\d+)학점 더 들으셔야 해요!?$/);

  if (match) {
    const shortLabel = match[1];
    const remain = match[2];

    return (
      <div className="compare-progress-subline compare-progress-subline--danger">
        <strong>
          <span className="compare-progress-emphasis">
            {shortLabel} {remain}
          </span>
          학점 더 들으셔야 해요!
        </strong>
      </div>
    );
  }

  return (
    <div className="compare-progress-subline">
      <strong>{subline}</strong>
    </div>
  );
}

function GraduationSheet({
  values,
  onChange
}: {
  values: GraduationCredits;
  onChange: (next: GraduationCredits) => void;
}) {
  const columns = graduationLabels.map((label) => ({
    key: label,
    label,
    type: 'int' as const,
    width: '140px'
  }));

  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);

  function commit(key: keyof GraduationCredits, value: string) {
    onChange({ ...values, [key]: toNumberOrEmpty(value) });
    setEditingCell(null);
  }

  return (
    <div className="sheet-shell sheet-shell--graduation">
      <div className="sheet-scroll graduation-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {columns.map((column) => {
                const key = column.key as keyof GraduationCredits;
                const cellId = `graduation-${column.key}`;
                const value = values[key];
                const isSelected = selectedCell === cellId;
                const isEditing = editingCell === cellId;

                return (
                  <td key={column.key} style={{ minWidth: column.width }}>
                    {isEditing ? (
                      <input
                        className="cell-input"
                        type="number"
                        step="1"
                        autoFocus
                        defaultValue={value === '' ? '' : String(value)}
                        onBlur={(event) => commit(key, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commit(key, (event.target as HTMLInputElement).value);
                          if (event.key === 'Escape') setEditingCell(null);
                        }}
                      />
                    ) : (
                      <div
                        className={`sheet-cell ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedCell(cellId)}
                        onDoubleClick={() => {
                          setSelectedCell(cellId);
                          setEditingCell(cellId);
                        }}
                      >
                        {value === '' ? '' : value}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpreadsheetTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  setRows,
  emptyText,
  visibleRowCount,
  filterable
}: {
  columns: GridColumn<Row>[];
  rows: Row[];
  setRows: Dispatch<SetStateAction<Row[]>>;
  emptyText: string;
  visibleRowCount: number;
  filterable?: boolean;
}) {
  const [selectedCell, setSelectedCell] = useState<CellCoord<Row> | null>(null);
  const [editingCell, setEditingCell] = useState<CellCoord<Row> | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filteredRows = useMemo(() => {
    return rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter(({ row }) =>
        columns.every((column) => {
          const filterValue = filters[column.key] ?? '';
          if (!filterValue) return true;
          return String(row[column.key] ?? '') === filterValue;
        })
      );
  }, [columns, filters, rows]);

  function updateRow(rowIndex: number, key: Extract<keyof Row, string>, nextValue: unknown) {
    setRows((prev) => prev.map((row, index) => (index === rowIndex ? { ...row, [key]: nextValue } : row)));
  }

  function removeRow(rowIndex: number) {
    setRows((prev) => prev.filter((_, index) => index !== rowIndex));
  }

  return (
    <div className="sheet-shell">
      {filterable ? <FilterBar columns={columns} rows={rows} filters={filters} onChange={setFilters} /> : null}

      <div className="sheet-scroll" style={{ maxHeight: `${visibleRowCount * 56 + 52}px` }}>
        <table className="sheet-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={{ minWidth: column.width }}>
                  {column.label}
                </th>
              ))}
              <th style={{ width: '86px' }}>삭제</th>
            </tr>
          </thead>

          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="empty-cell">
                  {emptyText}
                </td>
              </tr>
            ) : (
              filteredRows.map(({ row, rowIndex }) => (
                <tr key={rowIndex}>
                  {columns.map((column) => {
                    const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell.key === column.key;
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell.key === column.key;
                    const cellValue = row[column.key];

                    return (
                      <td key={column.key} style={{ minWidth: column.width }}>
                        {isEditing ? (
                          <EditableCell
                            column={column}
                            value={cellValue}
                            onCommit={(value) => updateRow(rowIndex, column.key, value)}
                            onCancel={() => setEditingCell(null)}
                          />
                        ) : (
                          <div
                            className={`sheet-cell ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedCell({ rowIndex, key: column.key })}
                            onDoubleClick={() => {
                              setSelectedCell({ rowIndex, key: column.key });
                              setEditingCell({ rowIndex, key: column.key });
                            }}
                          >
                            {String(cellValue ?? '')}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  <td>
                    <button className="danger action-button" onClick={() => removeRow(rowIndex)}>
                      삭제
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReadonlySpreadsheetTable<Row extends Record<string, unknown>>({
  columns,
  rows,
  visibleRowCount,
  emptyText,
  filterable,
  actionLabel,
  onAction
}: {
  columns: GridColumn<Row>[];
  rows: Row[];
  visibleRowCount: number;
  emptyText: string;
  filterable?: boolean;
  actionLabel?: string;
  onAction?: (row: Row) => void;
}) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const resizeStateRef = useRef<{
    index: number;
    startX: number;
    startCurrentWidth: number;
    startNextWidth: number;
  } | null>(null);

  const initialColumnWidths = useMemo(() => {
    const result: Record<string, number> = {};
    columns.forEach((column) => {
      result[column.key] = widthStringToNumber(column.width, 160);
    });
    return result;
  }, [columns]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(initialColumnWidths);

  useEffect(() => {
    setColumnWidths(initialColumnWidths);
  }, [initialColumnWidths]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) =>
      columns.every((column) => {
        const filterValue = filters[column.key] ?? '';
        if (!filterValue) return true;
        return String(row[column.key] ?? '') === filterValue;
      })
    );
  }, [columns, filters, rows]);

  function startResize(
    event: { clientX: number; preventDefault: () => void },
    index: number
  ) {
    if (index >= columns.length - 1) return;

    const currentKey = columns[index].key;
    const nextKey = columns[index + 1].key;

    const currentWidth = columnWidths[currentKey] ?? widthStringToNumber(columns[index].width, 160);
    const nextWidth = columnWidths[nextKey] ?? widthStringToNumber(columns[index + 1].width, 160);

    resizeStateRef.current = {
      index,
      startX: event.clientX,
      startCurrentWidth: currentWidth,
      startNextWidth: nextWidth
    };

    event.preventDefault();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const active = resizeStateRef.current;
      if (!active) return;

      const delta = moveEvent.clientX - active.startX;
      const minWidth = 80;

      let nextCurrent = active.startCurrentWidth + delta;
      let nextNeighbor = active.startNextWidth - delta;

      if (nextCurrent < minWidth) {
        const shortage = minWidth - nextCurrent;
        nextCurrent = minWidth;
        nextNeighbor -= shortage;
      }

      if (nextNeighbor < minWidth) {
        const shortage = minWidth - nextNeighbor;
        nextNeighbor = minWidth;
        nextCurrent -= shortage;
      }

      if (nextCurrent < minWidth || nextNeighbor < minWidth) return;

      const leftKey = columns[active.index].key;
      const rightKey = columns[active.index + 1].key;

      setColumnWidths((prev) => ({
        ...prev,
        [leftKey]: nextCurrent,
        [rightKey]: nextNeighbor
      }));
    };

    const handleMouseUp = () => {
      resizeStateRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }

  const actionColumnWidth = actionLabel ? 120 : 0;

  const tablePixelWidth =
    columns.reduce((sum, column) => sum + (columnWidths[column.key] ?? widthStringToNumber(column.width, 160)), 0) +
    actionColumnWidth;

  return (
    <div className="sheet-shell">
      {filterable ? <FilterBar columns={columns} rows={rows} filters={filters} onChange={setFilters} /> : null}

      <div className="sheet-scroll" style={{ maxHeight: `${visibleRowCount * 56 + 52}px` }}>
        <table
          className="sheet-table"
          style={{
            width: `${tablePixelWidth}px`,
            minWidth: '100%'
          }}
        >
          <colgroup>
            {columns.map((column) => (
              <col
                key={column.key}
                style={{
                  width: `${columnWidths[column.key] ?? widthStringToNumber(column.width, 160)}px`
                }}
              />
            ))}
            {actionLabel ? <col style={{ width: `${actionColumnWidth}px` }} /> : null}
          </colgroup>

          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column.key} className="resizable-th">
                  <div className="th-content">{column.label}</div>
                  {index < columns.length - 1 ? (
                    <div
                      className="col-resizer"
                      onMouseDown={(event) => startResize(event, index)}
                    />
                  ) : null}
                </th>
              ))}
              {actionLabel ? <th>이수선택</th> : null}
            </tr>
          </thead>

          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actionLabel ? 1 : 0)} className="empty-cell">
                  {emptyText}
                </td>
              </tr>
            ) : (
              filteredRows.map((row, index) => (
                <tr key={(row as { id?: string }).id ?? index}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      <div className="sheet-cell" title={String(row[column.key] ?? '')}>
                        {String(row[column.key] ?? '')}
                      </div>
                    </td>
                  ))}

                  {actionLabel ? (
                    <td className="row-action-cell">
                      <button
                        className="secondary action-button row-action-button"
                        onClick={() => onAction?.(row)}
                      >
                        {actionLabel}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterBar<Row extends Record<string, unknown>>({
  columns,
  rows,
  filters,
  onChange
}: {
  columns: GridColumn<Row>[];
  rows: Row[];
  filters: Record<string, string>;
  onChange: Dispatch<SetStateAction<Record<string, string>>>;
}) {
  return (
    <div className="sheet-filters">
      {columns
        .filter((column) => column.filterable)
        .map((column) => {
          const values = column.options?.filter((value) => value !== '') ?? uniqueColumnValues(rows, column.key);
          return (
            <label key={column.key} className="filter-box">
              <span>{column.label} 필터</span>
              <select
                value={filters[column.key] ?? ''}
                onChange={(event) => onChange((prev) => ({ ...prev, [column.key]: event.target.value }))}
              >
                <option value="">전체</option>
                {values.map((value) => (
                  <option key={value} value={value}>
                    {value || '(빈값)'}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
    </div>
  );
}

function EditableCell<Row extends Record<string, unknown>>({
  column,
  value,
  onCommit,
  onCancel
}: {
  column: GridColumn<Row>;
  value: unknown;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
}) {
  if (column.type === 'select') {
    return (
      <select
        className="cell-input"
        autoFocus
        defaultValue={String(value ?? '')}
        onBlur={(event) => onCommit(event.target.value)}
        onChange={(event) => onCommit(event.target.value)}
      >
        {(column.options ?? []).map((option) => (
          <option key={option || '__blank'} value={option}>
            {option || '(빈값)'}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="cell-input"
      type={column.type === 'int' ? 'number' : 'text'}
      step={column.type === 'int' ? '1' : undefined}
      autoFocus
      defaultValue={String(value ?? '')}
      onBlur={(event) => onCommit(column.type === 'int' ? toNumberOrEmpty(event.target.value) : event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          const input = event.target as HTMLInputElement;
          onCommit(column.type === 'int' ? toNumberOrEmpty(input.value) : input.value);
        }
        if (event.key === 'Escape') onCancel();
      }}
    />
  );
}

function uniqueColumnValues<Row extends Record<string, unknown>>(rows: Row[], key: Extract<keyof Row, string>): string[] {
  const values = new Set<string>();
  rows.forEach((row) => {
    const value = String(row[key] ?? '').trim();
    if (value) values.add(value);
  });
  return Array.from(values).sort((a, b) => a.localeCompare(b, 'ko'));
}

function sortCompareRows(a: CompareTableRow, b: CompareTableRow): number {
  const yearA = parseInt(a.yearText, 10);
  const yearB = parseInt(b.yearText, 10);
  const yearDiff = (Number.isFinite(yearA) ? yearA : 9999) - (Number.isFinite(yearB) ? yearB : 9999);
  if (yearDiff !== 0) return yearDiff;

  const termA = parseInt(a.termText, 10);
  const termB = parseInt(b.termText, 10);
  const termDiff = (Number.isFinite(termA) ? termA : 9999) - (Number.isFinite(termB) ? termB : 9999);
  if (termDiff !== 0) return termDiff;

  return a.name.localeCompare(b.name, 'ko');
}

function sortRequiredCourseRows(rows: RequiredCourseRow[]): RequiredCourseRow[] {
  return [...rows].sort((a, b) => {
    const yearDiff = compareNumberCell(a.yearLevel, b.yearLevel);
    if (yearDiff !== 0) return yearDiff;

    const semesterDiff = compareNumberCell(a.semesterOrder, b.semesterOrder);
    if (semesterDiff !== 0) return semesterDiff;

    return 0;
  });
}

function compareNumberCell(a: number | '', b: number | ''): number {
  const av = a === '' ? 999 : a;
  const bv = b === '' ? 999 : b;
  return av - bv;
}

function sumCompareRowCredits(rows: CompareTableRow[]): number {
  return rows.reduce((sum, row) => sum + (typeof row.credit === 'number' ? row.credit : 0), 0);
}

function getBucketShortLabel(title: string): string {
  if (title.includes('계열교양')) return '계교';
  if (title.includes('전공필수')) return '전필';
  if (title.includes('전공선택')) return '전선';
  if (title === '기초교양') return '기초';
  if (title === '융합교양') return '융합';
  return '';
}

function rebuildCompareBucket(bucket: CompareBucket, rows: CompareTableRow[]): CompareBucket {
  const earnedCredits = sumCompareRowCredits(rows);
  const requiredCredits = bucket.requiredCredits ?? null;
  const remainingCredits = requiredCredits === null ? null : Math.max(0, requiredCredits - earnedCredits);
  const shortLabel = getBucketShortLabel(bucket.title);

  let headline = '';
  let subline = '';

  if (bucket.title === '미이수') {
    headline = `과목 수 : ${rows.length}`;
  } else if (requiredCredits === null) {
    headline = `들은 학점 총합 : ${earnedCredits}`;
  } else {
    headline = `${earnedCredits} / ${requiredCredits}`;

    if (remainingCredits !== null && remainingCredits > 0) {
      subline = `${shortLabel} ${remainingCredits}학점 더 들으셔야 해요!`;
    } else {
      subline = `${shortLabel} 충족 완료!`;
    }
  }

  return {
    ...bucket,
    rows,
    earnedCredits,
    requiredCredits,
    remainingCredits,
    headline,
    subline
  };
}

function buildSummaryExpression(buckets: CompareResponse['buckets']): string {
  const majorCore = buckets.majorCoreLiberal.earnedCredits;
  const majorRequired = buckets.majorRequired.earnedCredits;
  const majorSelective = buckets.majorSelective.earnedCredits;
  const basic = buckets.basicLiberal.earnedCredits;
  const fusion = buckets.fusionLiberal.earnedCredits;
  const missing = 0;
  const extraLiberal = buckets.extraLiberal.earnedCredits;
  const extraMajorRequired = buckets.extraMajorRequired.earnedCredits;
  const extraMajorSelective = buckets.extraMajorSelective.earnedCredits;
  const extraOther = buckets.extraOther.earnedCredits;

  return `(${majorCore} + ${majorRequired} + ${majorSelective}) + ${basic} + ${fusion} + ${missing} + ${extraLiberal} + ${extraMajorRequired} + ${extraMajorSelective} + ${extraOther}`;
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, credentials: 'include' });
  const json = (await response.json().catch(() => ({}))) as { message?: string } & T;
  if (!response.ok) {
    throw new Error(json.message ?? '요청에 실패했습니다.');
  }
  return json;
}

function widthStringToNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const matched = String(value).match(/\d+/);
  if (!matched) return fallback;

  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
}

export default CheckPage;