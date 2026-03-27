import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { fetchGachonSources, GACHON_CATALOG_URL } from '../services/gachonScraper.js';
import { analyzeCompletedImages, analyzeCurriculumImages, type AiImageInput } from '../services/openaiOcr.js';
import { getUsageSummary } from '../services/usageMeter.js';
import {
  compareCourses,
  type CourseInput,
  type GraduationRequirementInput
} from '../utils/compareCourses.js';
import { toBoolean, toInt } from '../utils/normalize.js';
import { requireAuth } from '../auth/requireAuth.js';

const router = Router();

type RequiredCourseCreateInput = {
  courseCode: string | null;
  name: string;
  credit: number | null;
  classification: string | null;
  classification1: string | null;
  classification2: string | null;
  isRequired: boolean;
  semesterText: string | null;
  yearLevel: number | null;
  semesterOrder: number | null;
  sourceImageLabel: string | null;
};

type GraduationRequirementCreateInput = {
  section: string;
  label: string;
  credits: number | null;
  theory: number | null;
  practice: number | null;
  sortOrder: number;
};

type CompletedCourseCreateInput = {
  yearTaken: number | null;
  termText: string | null;
  courseCode: string | null;
  name: string;
  classification: string | null;
  classification1: string | null;
  classification2: string | null;
  credit: number | null;
  gradeText: string | null;
  professor: string | null;
  sourceImageLabel: string | null;
  rawText: string | null;
};

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'gachon-course-checker-api' });
});

router.get('/sources/gachon', async (req, res, next) => {
  try {
    const category = getCategoryFilter(req.query.category);
    const sources = await fetchGachonSources();
    const filtered = category ? sources.filter((item) => item.category === category) : sources;

    res.json({
      sourcePage: GACHON_CATALOG_URL,
      category: category ?? 'all',
      count: filtered.length,
      items: filtered
    });
  } catch (error) {
    next(error);
  }
});

router.post('/sources/gachon/refresh', async (req, res, next) => {
  try {
    const category = getCategoryFilter(req.query.category);
    const scraped = await fetchGachonSources();
    const filtered = category ? scraped.filter((item) => item.category === category) : scraped;

    const results = [];
    for (const item of filtered) {
      const saved = await prisma.curriculumSource.upsert({
        where: { sourceUrl: item.sourceUrl },
        update: {
          title: item.title,
          category: item.category,
          year: item.year,
          publishedAt: item.publishedAt
        },
        create: {
          title: item.title,
          category: item.category,
          year: item.year,
          publishedAt: item.publishedAt,
          sourceUrl: item.sourceUrl
        }
      });
      results.push(saved);
    }

    res.json({ category: category ?? 'all', count: results.length, items: results });
  } catch (error) {
    next(error);
  }
});

router.post('/ai-ocr/curriculum', requireAuth, async (req, res, next) => {
  try {
    const { images, year, major, mode } = req.body as {
      images?: AiImageInput[];
      year?: string | number;
      major?: string;
      mode?: 'courses' | 'graduation' | 'both';
    };

    const normalizedImages = normalizeAiImages(images);
    if (normalizedImages.length === 0) {
      res.status(400).json({ message: '이미지를 1개 이상 보내주세요.' });
      return;
    }

    const result = await analyzeCurriculumImages({
      images: normalizedImages,
      year: toInt(year),
      major: stringOrNull(major),
      mode: mode === 'courses' || mode === 'graduation' || mode === 'both' ? mode : 'both'
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/ai-ocr/completed', requireAuth, async (req, res, next) => {
  try {
    const { images } = req.body as { images?: AiImageInput[] };
    const normalizedImages = normalizeAiImages(images);

    if (normalizedImages.length === 0) {
      res.status(400).json({ message: '이미지를 1개 이상 보내주세요.' });
      return;
    }

    const result = await analyzeCompletedImages({ images: normalizedImages });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/catalogs', requireAuth, async (req, res, next) => {
  try {
    const catalogs = await prisma.curriculumCatalog.findMany({
      where: { userId: req.user!.id },
      orderBy: [{ year: 'desc' }, { major: 'asc' }],
      include: {
        source: true,
        courses: {
          orderBy: [{ yearLevel: 'asc' }, { semesterOrder: 'asc' }, { name: 'asc' }]
        },
        graduationRequirements: {
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }]
        }
      }
    });

    res.json({ count: catalogs.length, items: catalogs });
  } catch (error) {
    next(error);
  }
});

router.get('/catalogs/:catalogId', requireAuth, async (req, res, next) => {
  try {
    const catalog = await prisma.curriculumCatalog.findFirst({
      where: {
        id: String (req.params.catalogId),
        userId: req.user!.id
      },
      include: {
        source: true,
        courses: {
          orderBy: [{ yearLevel: 'asc' }, { semesterOrder: 'asc' }, { name: 'asc' }]
        },
        graduationRequirements: {
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }]
        }
      }
    });

    if (!catalog) {
      res.status(404).json({ message: '해당 교과과정을 찾을 수 없습니다.' });
      return;
    }

    res.json(catalog);
  } catch (error) {
    next(error);
  }
});

router.post('/catalogs/import', requireAuth, async (req, res, next) => {
  try {
    const { year, major, notes, sourceId, sourceUrl, courses, graduationRequirements } = req.body as {
      year?: number | string;
      major?: string;
      notes?: string;
      sourceId?: string;
      sourceUrl?: string;
      courses?: Array<Record<string, unknown>>;
      graduationRequirements?: Array<Record<string, unknown>>;
    };

    if (!year || !major || !Array.isArray(courses) || courses.length === 0) {
      res.status(400).json({ message: 'year, major, courses는 필수입니다.' });
      return;
    }

    const normalizedCourses = courses
      .map((course) => normalizeRequiredCourse(course))
      .filter((course) => course.name);

    const normalizedRequirements = Array.isArray(graduationRequirements)
      ? graduationRequirements
          .map((item, index) => normalizeGraduationRequirement(item, index))
          .filter((item) => item.label)
      : [];

    if (normalizedCourses.length === 0) {
      res.status(400).json({ message: '저장할 전공 과목이 없습니다.' });
      return;
    }

    const catalog = await prisma.curriculumCatalog.create({
      data: {
        userId: req.user!.id,
        year: Number(year),
        major: major.trim(),
        notes: notes?.trim() || null,
        sourceId: sourceId || null,
        sourceUrl: sourceUrl?.trim() || null,
        courses: { create: normalizedCourses },
        graduationRequirements: { create: normalizedRequirements }
      },
      include: {
        source: true,
        courses: {
          orderBy: [{ yearLevel: 'asc' }, { semesterOrder: 'asc' }, { name: 'asc' }]
        },
        graduationRequirements: {
          orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }]
        }
      }
    });

    res.status(201).json(catalog);
  } catch (error) {
    next(error);
  }
});

router.delete('/catalogs/:catalogId', requireAuth, async (req, res, next) => {
  try {
    const catalog = await prisma.curriculumCatalog.findFirst({
      where: {
        id: String (req.params.catalogId),
        userId: req.user!.id
      }
    });

    if (!catalog) {
      res.status(404).json({ message: '삭제할 전공교육과정을 찾을 수 없습니다.' });
      return;
    }

    await prisma.curriculumCatalog.delete({
      where: { id: catalog.id }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/completed-sets', requireAuth, async (_req, res, next) => {
  try {
    const items = await prisma.completedCourseSet.findMany({
      where: { userId: _req.user!.id },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        courses: {
          orderBy: [{ yearTaken: 'desc' }, { termText: 'asc' }, { name: 'asc' }]
        }
      }
    });

    res.json({ count: items.length, items });
  } catch (error) {
    next(error);
  }
});

router.get('/completed-sets/:setId', requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.completedCourseSet.findFirst({
      where: {
        id: String(req.params.setId),
        userId: req.user!.id
      },
      include: {
        courses: {
          orderBy: [{ yearTaken: 'desc' }, { termText: 'asc' }, { name: 'asc' }]
        }
      }
    });

    if (!item) {
      res.status(404).json({ message: '해당 이수내역을 찾을 수 없습니다.' });
      return;
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.post('/completed-sets/import', requireAuth, async (req, res, next) => {
  try {
    const { title, studentName, studentNo, notes, courses } = req.body as {
      title?: string;
      studentName?: string;
      studentNo?: string;
      notes?: string;
      courses?: Array<Record<string, unknown>>;
    };

    if (!title || !Array.isArray(courses) || courses.length === 0) {
      res.status(400).json({ message: 'title과 courses는 필수입니다.' });
      return;
    }

    const normalizedCourses = courses
      .map((course) => normalizeCompletedCourse(course))
      .filter((course) => course.name);

    if (normalizedCourses.length === 0) {
      res.status(400).json({ message: '저장할 이수 과목이 없습니다.' });
      return;
    }

    const saved = await prisma.completedCourseSet.create({
      data: {
        userId: req.user!.id,
        title: title.trim(),
        studentName: studentName?.trim() || null,
        studentNo: studentNo?.trim() || null,
        notes: notes?.trim() || null,
        courses: { create: normalizedCourses }
      },
      include: {
        courses: {
          orderBy: [{ yearTaken: 'desc' }, { termText: 'asc' }, { name: 'asc' }]
        }
      }
    });

    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

router.delete('/completed-sets/:setId', requireAuth, async (req, res, next) => {
  try {
    const item = await prisma.completedCourseSet.findFirst({
      where: {
        id: String (req.params.setId),
        userId: req.user!.id
      }
    });

    if (!item) {
      res.status(404).json({ message: '삭제할 이수내역을 찾을 수 없습니다.' });
      return;
    }

    await prisma.completedCourseSet.delete({
      where: { id: item.id }
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post('/compare', requireAuth, async (req, res, next) => {
  try {
    const { catalogId, completedSetId, requiredCourses, completedCourses } = req.body as {
      catalogId?: string;
      completedSetId?: string;
      requiredCourses?: Array<Record<string, unknown>>;
      completedCourses?: Array<Record<string, unknown>>;
    };

    let normalizedRequired: CourseInput[] = [];
    let normalizedGraduationRequirements: GraduationRequirementInput[] = [];

    if (catalogId) {
      const catalog = await prisma.curriculumCatalog.findFirst({
        where: {
          id: catalogId,
          userId: req.user!.id
        },
        include: {
          courses: true,
          graduationRequirements: true
        }
      });

      if (!catalog) {
        res.status(404).json({ message: '선택한 교과과정을 찾을 수 없습니다.' });
        return;
      }

      normalizedRequired = catalog.courses.map((course) => ({
        id: course.id,
        courseCode: course.courseCode,
        name: course.name,
        credit: course.credit,
        classification: combineClassificationParts(course.classification1, course.classification2, course.classification),
        classification1: course.classification1,
        classification2: course.classification2,
        yearLevel: course.yearLevel,
        semesterOrder: course.semesterOrder
      }));

      normalizedGraduationRequirements = catalog.graduationRequirements.map((item) => ({
        label: item.label,
        credits: item.credits
      }));
    } else if (Array.isArray(requiredCourses)) {
      normalizedRequired = requiredCourses
        .map((course) => {
          const normalized = normalizeRequiredCourse(course);
          return {
            courseCode: normalized.courseCode,
            name: normalized.name,
            credit: normalized.credit,
            classification: normalized.classification,
            classification1: normalized.classification1,
            classification2: normalized.classification2,
            yearLevel: normalized.yearLevel,
            semesterOrder: normalized.semesterOrder
          } satisfies CourseInput;
        })
        .filter((course) => course.name);
    }

    let normalizedCompleted: CourseInput[] = [];

    if (completedSetId) {
      const completedSet = await prisma.completedCourseSet.findFirst({
        where: {
          id: completedSetId,
          userId: req.user!.id
        },
        include: { courses: true }
      });

      if (!completedSet) {
        res.status(404).json({ message: '선택한 이수내역 세트를 찾을 수 없습니다.' });
        return;
      }

      normalizedCompleted = completedSet.courses.map((course) => ({
        id: course.id,
        courseCode: course.courseCode,
        name: course.name,
        credit: course.credit,
        classification: combineClassificationParts(course.classification1, course.classification2, course.classification),
        classification1: course.classification1,
        classification2: course.classification2,
        yearTaken: course.yearTaken,
        termText: course.termText,
        gradeText: course.gradeText,
        professor: course.professor
      }));
    } else if (Array.isArray(completedCourses)) {
      normalizedCompleted = completedCourses
        .map((course) => {
          const normalized = normalizeCompletedCourse(course);
          return {
            yearTaken: normalized.yearTaken,
            termText: normalized.termText,
            courseCode: normalized.courseCode,
            name: normalized.name,
            classification: normalized.classification,
            classification1: normalized.classification1,
            classification2: normalized.classification2,
            credit: normalized.credit,
            gradeText: normalized.gradeText,
            professor: normalized.professor
          } satisfies CourseInput;
        })
        .filter((course) => course.name);
    }

    if (normalizedRequired.length === 0) {
      res.status(400).json({ message: '비교할 교과과정이 없습니다.' });
      return;
    }

    if (normalizedCompleted.length === 0) {
      res.status(400).json({ message: '비교할 이수내역이 없습니다.' });
      return;
    }

    res.json(compareCourses(normalizedRequired, normalizedCompleted, normalizedGraduationRequirements));
  } catch (error) {
    next(error);
  }
});

router.get('/usage-summary', requireAuth, (_req, res) => {
  const summary = getUsageSummary();
  res.json(summary);
});

function normalizeAiImages(images: AiImageInput[] | undefined): AiImageInput[] {
  if (!Array.isArray(images)) return [];

  return images
    .map((image) => ({
      fileName: typeof image?.fileName === 'string' ? image.fileName.trim() : 'image',
      dataUrl: typeof image?.dataUrl === 'string' ? image.dataUrl.trim() : ''
    }))
    .filter((image) => image.dataUrl.startsWith('data:image/'));
}

function normalizeRequiredCourse(course: Record<string, unknown>): RequiredCourseCreateInput {
  const classification1 = stringOrNull(course.classification1);
  const classification2 = stringOrNull(course.classification2);
  const classification = combineClassificationParts(
    classification1,
    classification2,
    stringOrNull(course.classification ?? course.type)
  );

  return {
    courseCode: stringOrNull(course.courseCode ?? course.code),
    name: String(course.name ?? '').trim(),
    credit: toInt(course.credit),
    classification,
    classification1,
    classification2,
    isRequired: toBoolean(course.isRequired, true),
    semesterText: stringOrNull(course.semesterText ?? course.semester),
    yearLevel: toInt(course.yearLevel),
    semesterOrder: toInt(course.semesterOrder),
    sourceImageLabel: stringOrNull(course.sourceImageLabel)
  };
}

function normalizeGraduationRequirement(item: Record<string, unknown>, index: number): GraduationRequirementCreateInput {
  return {
    section: stringOrNull(item.section) ?? '졸업이수학점',
    label: String(item.label ?? '').trim(),
    credits: toInt(item.credits),
    theory: toInt(item.theory),
    practice: toInt(item.practice),
    sortOrder: toInt(item.sortOrder) ?? index
  };
}

function normalizeCompletedCourse(course: Record<string, unknown>): CompletedCourseCreateInput {
  const classification1 = stringOrNull(course.classification1);
  const classification2 = stringOrNull(course.classification2);
  const classification = combineClassificationParts(
    classification1,
    classification2,
    stringOrNull(course.classification ?? course.type)
  );

  return {
    yearTaken: toInt(course.yearTaken),
    termText: stringOrNull(course.termText ?? course.semesterText ?? course.semester),
    courseCode: stringOrNull(course.courseCode ?? course.code),
    name: String(course.name ?? '').trim(),
    classification,
    classification1,
    classification2,
    credit: toInt(course.credit),
    gradeText: stringOrNull(course.gradeText ?? course.grade),
    professor: stringOrNull(course.professor),
    sourceImageLabel: stringOrNull(course.sourceImageLabel),
    rawText: stringOrNull(course.rawText)
  };
}

function combineClassificationParts(
  part1: string | null | undefined,
  part2: string | null | undefined,
  fallback?: string | null
): string | null {
  const a = typeof part1 === 'string' ? part1.trim() : '';
  const b = typeof part2 === 'string' ? part2.trim() : '';

  if (a && b) return `${a}/${b}`;
  if (a) return a;

  if (typeof fallback === 'string') {
    const trimmed = fallback.trim();
    return trimmed || null;
  }

  return null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getCategoryFilter(value: unknown): 'major' | 'general' | null {
  if (typeof value !== 'string') return null;
  if (value === 'major' || value === 'general') return value;
  return null;
}

export default router;