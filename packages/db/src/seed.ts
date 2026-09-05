import { hash } from "argon2";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { loadRootEnv, requireDatabaseUrl } from "./env.js";
import * as s from "./schema/index.js";
import {
  AFTERNOON_SLOTS,
  APPRECIATIONS_AR,
  APPRECIATIONS_FR,
  ARABIC_MEDIUM_SUBJECTS,
  ASSESSMENT_TITLES,
  COEFFICIENTS,
  FEMALE_FIRST_NAMES,
  HOMEWORK_TITLES,
  LAST_NAMES,
  LEVELS,
  MALE_FIRST_NAMES,
  MORNING_SLOTS,
  SCHOOL,
  SUBJECTS,
  type SubjectCode,
} from "./seed-data.js";

/**
 * Seed a demo school.
 *
 * Idempotent: truncates every table and rebuilds from scratch, so it can be run
 * repeatedly against the same database. Deterministic: a fixed PRNG seed means
 * two runs produce identical data, which is what makes it usable as a test
 * fixture as well as a demo.
 *
 * Every person in here is invented. No real student data ever enters this repo.
 */

loadRootEnv();

const client = postgres(requireDatabaseUrl(), { max: 1 });
const db = drizzle(client, { schema: s });

// --- deterministic randomness -------------------------------------------

/** mulberry32 — small, fast, and reproducible across runs and machines. */
function makeRng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(20260904);

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick from empty array");
  return item;
}

function randInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Indexed access with a real check.
 *
 * `noUncheckedIndexedAccess` makes every `arr[i]` possibly-undefined, and the
 * seed indexes into parallel arrays constantly. A non-null assertion would
 * silence the compiler without checking anything; this throws with the name of
 * whatever went wrong, which is what you want when a seed misaligns.
 */
function at<T>(items: readonly T[], index: number, what: string): T {
  const item = items[index];
  if (item === undefined) throw new Error(`${what}: no element at index ${index}`);
  return item;
}

// --- dates ---------------------------------------------------------------

const DAY_MS = 86_400_000;

function iso(d: Date): string {
  const p = d.toISOString();
  const day = p.split("T")[0];
  if (!day) throw new Error("bad date");
  return day;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** 1 = Monday … 6 = Saturday, 7 = Sunday. */
function weekdayOf(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}

/**
 * Dates are anchored to today so the demo always has history behind it: the
 * academic year starts on a Monday at least four weeks back, which means
 * attendance, grades and averages are non-trivial the moment you log in.
 */
const today = new Date(`${iso(new Date())}T00:00:00.000Z`);
let yearStart = addDays(today, -28);
while (weekdayOf(yearStart) !== 1) yearStart = addDays(yearStart, -1);

const term1Start = yearStart;
const term1End = addDays(yearStart, 16 * 7 - 1);
const term2Start = addDays(term1End, 1);
const term2End = addDays(term2Start, 12 * 7 - 1);
const term3Start = addDays(term2End, 1);
const term3End = addDays(term3Start, 12 * 7 - 1);
const yearLabel = `${yearStart.getUTCFullYear()}-${yearStart.getUTCFullYear() + 1}`;

// --- helpers -------------------------------------------------------------

const DEMO_PASSWORD = "madrasti2026!";

function slugName(first: string, last: string): string {
  return (
    `${first}.${last}`
      .toLowerCase()
      .normalize("NFD")
      // Strip the combining marks NFD leaves behind, so an accented name and its
      // bare form produce the same handle. The Unicode mark property avoids
      // spelling the marks out as a character class — written literally they are
      // invisible in source and confuse readers and linters alike.
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z.]/g, "")
  );
}

function massarCode(index: number): string {
  return `R${String(130_000_000 + index * 7919).slice(0, 9)}`;
}

async function main(): Promise<void> {
  console.log(`seeding ${yearLabel} (anchored to ${iso(today)})…`);

  // Truncate everything. RESTART IDENTITY CASCADE keeps this runnable on a
  // database that already holds a previous seed.
  await db.execute(
    `truncate table
       audit_log, bulletin_lines, bulletins, subject_appreciations, grades,
       assessments, assignments,
       attendance, sessions, timetable_slots, enrolments, class_subjects,
       class_groups, subjects, levels, terms, academic_years, school,
       student_guardians, students, guardians, teachers, users
     restart identity cascade`
  );

  // Argon2 is deliberately slow, so hash the shared demo password once rather
  // than ~250 times. Every seeded account uses it.
  const passwordHash = await hash(DEMO_PASSWORD);

  // --- school, year, terms ----------------------------------------------
  await db.insert(s.school).values({ ...SCHOOL, defaultLocale: "fr", gradingMax: "20" });

  const [year] = await db
    .insert(s.academicYears)
    .values({
      label: yearLabel,
      startDate: iso(yearStart),
      endDate: iso(term3End),
      isCurrent: true,
    })
    .returning();
  if (!year) throw new Error("year insert failed");

  const termRows = await db
    .insert(s.terms)
    .values([
      {
        yearId: year.id,
        order: 1,
        isCurrent: true,
        labelFr: "1er trimestre",
        labelAr: "الدورة الأولى",
        labelEn: "First term",
        startDate: iso(term1Start),
        endDate: iso(term1End),
      },
      {
        yearId: year.id,
        order: 2,
        isCurrent: false,
        labelFr: "2ème trimestre",
        labelAr: "الدورة الثانية",
        labelEn: "Second term",
        startDate: iso(term2Start),
        endDate: iso(term2End),
      },
      {
        yearId: year.id,
        order: 3,
        isCurrent: false,
        labelFr: "3ème trimestre",
        labelAr: "الدورة الثالثة",
        labelEn: "Third term",
        startDate: iso(term3Start),
        endDate: iso(term3End),
      },
    ])
    .returning();
  const term1 = termRows.find((t) => t.order === 1);
  if (!term1) throw new Error("term1 insert failed");

  // --- levels & subjects -------------------------------------------------
  const levelRows = await db
    .insert(s.levels)
    .values(LEVELS.map((l) => ({ ...l })))
    .returning();
  const subjectRows = await db
    .insert(s.subjects)
    .values(SUBJECTS.map((x) => ({ ...x })))
    .returning();
  const subjectByCode = new Map(subjectRows.map((r) => [r.code as SubjectCode, r]));

  // --- users & teachers --------------------------------------------------
  const [adminUser] = await db
    .insert(s.users)
    .values({
      email: "admin@almassira.example.ma",
      passwordHash,
      role: "admin",
      locale: "fr",
      mustChangePassword: false,
    })
    .returning();
  if (!adminUser) throw new Error("admin insert failed");

  /**
   * Teaching staff. Core subjects get two teachers because five weekly hours
   * across eight classes will not fit in one person's week — the timetable
   * builder below would otherwise be unsolvable.
   */
  const staffPlan: { subjects: SubjectCode[]; classSlice: [number, number] }[] = [
    { subjects: ["ARA"], classSlice: [0, 4] },
    { subjects: ["ARA"], classSlice: [4, 8] },
    { subjects: ["FRA"], classSlice: [0, 4] },
    { subjects: ["FRA"], classSlice: [4, 8] },
    { subjects: ["MAT"], classSlice: [0, 4] },
    { subjects: ["MAT"], classSlice: [4, 8] },
    { subjects: ["SCI"], classSlice: [0, 8] },
    { subjects: ["HGE"], classSlice: [0, 8] },
    { subjects: ["EIS"], classSlice: [0, 8] },
    { subjects: ["ANG"], classSlice: [0, 8] },
    { subjects: ["EPS", "ART"], classSlice: [0, 8] },
    { subjects: ["INF"], classSlice: [0, 8] },
  ];

  const teacherUsers = await db
    .insert(s.users)
    .values(
      staffPlan.map((_, i) => ({
        email: `prof${i + 1}@almassira.example.ma`,
        passwordHash,
        role: "teacher" as const,
        locale: (i % 3 === 0 ? "ar" : "fr") as "ar" | "fr",
        mustChangePassword: false,
      }))
    )
    .returning();

  const teacherRows = await db
    .insert(s.teachers)
    .values(
      staffPlan.map((_, i) => {
        const male = i % 2 === 0;
        const first = male
          ? at(MALE_FIRST_NAMES, i % MALE_FIRST_NAMES.length, "male name")
          : at(FEMALE_FIRST_NAMES, i % FEMALE_FIRST_NAMES.length, "female name");
        const last = at(LAST_NAMES, (i * 3) % LAST_NAMES.length, "last name");
        const user = teacherUsers[i];
        if (!user) throw new Error("teacher user missing");
        return {
          userId: user.id,
          firstNameFr: first[0],
          firstNameAr: first[1],
          lastNameFr: last[0],
          lastNameAr: last[1],
          phone: `+2126${randInt(10_000_000, 99_999_999)}`,
        };
      })
    )
    .returning();

  // --- classes -----------------------------------------------------------
  // Two classes for each of the first two levels, one for the rest -> 8.
  const classPlan = [
    { levelIdx: 0, name: "CE1 A" },
    { levelIdx: 0, name: "CE1 B" },
    { levelIdx: 1, name: "CE2 A" },
    { levelIdx: 2, name: "CM1 A" },
    { levelIdx: 3, name: "CM2 A" },
    { levelIdx: 3, name: "CM2 B" },
    { levelIdx: 4, name: "1AC A" },
    { levelIdx: 5, name: "2AC A" },
  ];

  const classRows = await db
    .insert(s.classGroups)
    .values(
      classPlan.map((c, i) => {
        const level = levelRows[c.levelIdx];
        const mainTeacher = teacherRows[i % teacherRows.length];
        if (!level || !mainTeacher) throw new Error("class plan mismatch");
        return {
          yearId: year.id,
          levelId: level.id,
          name: c.name,
          mainTeacherId: mainTeacher.id,
          capacity: 35,
        };
      })
    )
    .returning();

  /** Levels 1–4 are primaire, 5–6 collège — and they carry different coefficients. */
  function bandFor(classIdx: number): "primaire" | "college" {
    const plan = classPlan[classIdx];
    if (!plan) throw new Error("bad class index");
    return plan.levelIdx <= 3 ? "primaire" : "college";
  }

  // --- class_subjects (teaching assignments + coefficients) --------------
  type CS = { id: string; classIdx: number; code: SubjectCode; teacherId: string };
  const classSubjectValues: {
    classGroupId: string;
    subjectId: string;
    teacherId: string;
    coefficient: string;
  }[] = [];
  const csMeta: { classIdx: number; code: SubjectCode; teacherId: string }[] = [];

  for (let classIdx = 0; classIdx < classRows.length; classIdx++) {
    const cls = at(classRows, classIdx, "class");
    const band = bandFor(classIdx);
    for (const code of SUBJECTS.map((x) => x.code)) {
      const planIdx = staffPlan.findIndex(
        (p) =>
          p.subjects.includes(code) && classIdx >= p.classSlice[0] && classIdx < p.classSlice[1]
      );
      const teacher = teacherRows[planIdx];
      const subject = subjectByCode.get(code);
      if (!teacher || !subject) throw new Error(`no teacher/subject for ${code} class ${classIdx}`);
      classSubjectValues.push({
        classGroupId: cls.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        coefficient: String(COEFFICIENTS[band][code]),
      });
      csMeta.push({ classIdx, code, teacherId: teacher.id });
    }
  }

  const csRows = await db.insert(s.classSubjects).values(classSubjectValues).returning();
  const classSubjects: CS[] = csRows.map((row, i) => {
    const meta = csMeta[i];
    if (!meta) throw new Error("cs meta mismatch");
    return { id: row.id, classIdx: meta.classIdx, code: meta.code, teacherId: meta.teacherId };
  });

  // --- students, guardians, enrolments -----------------------------------
  const studentsPerClass = 23;
  const studentValues: (typeof s.students.$inferInsert)[] = [];
  const studentMeta: {
    classIdx: number;
    male: boolean;
    first: readonly [string, string];
    last: readonly [string, string];
  }[] = [];

  let counter = 0;
  for (let classIdx = 0; classIdx < classRows.length; classIdx++) {
    for (let n = 0; n < studentsPerClass; n++) {
      const male = rng() < 0.5;
      const first = male ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const plan = at(classPlan, classIdx, "class plan");
      // Age tracks the level: CE1 ≈ 7 years old, rising by one per level.
      const age = 7 + plan.levelIdx + (plan.levelIdx >= 4 ? 3 : 0);
      const birth = addDays(yearStart, -(age * 365 + randInt(0, 364)));
      studentValues.push({
        massarCode: massarCode(counter),
        firstNameFr: first[0],
        firstNameAr: first[1],
        lastNameFr: last[0],
        lastNameAr: last[1],
        birthDate: iso(birth),
        gender: male ? "m" : "f",
        status: "active",
        enrolledAt: iso(yearStart),
      });
      studentMeta.push({ classIdx, male, first, last });
      counter++;
    }
  }

  // Families with two children at the school, which is common and which the
  // portal is shaped around — the parent home is a list of cards. Without a
  // single sibling in the fixture every guardian has exactly one child, that
  // list is always one long, and nothing ever exercises the multi-child case:
  // the same trap as the seed that carried three of four assessment types
  // (`.logs/issues.md`, 2026-09-05). The pairs are chosen in different classes
  // because siblings are in different years.
  const siblingPairs: readonly (readonly [number, number])[] = [
    [0, 92],
    [4, 115],
    [8, 140],
  ];
  /** younger student index -> elder student index they share a parent with */
  const siblingOf = new Map<number, number>();
  for (const [elder, younger] of siblingPairs) {
    if (elder >= studentValues.length || younger >= studentValues.length) continue;
    const elderMeta = at(studentMeta, elder, "sibling elder");
    // The younger takes the family name, in both scripts.
    const youngerValue = at(studentValues, younger, "sibling younger");
    youngerValue.lastNameFr = elderMeta.last[0];
    youngerValue.lastNameAr = elderMeta.last[1];
    at(studentMeta, younger, "sibling younger").last = elderMeta.last;
    siblingOf.set(younger, elder);
  }

  const studentRows = await db.insert(s.students).values(studentValues).returning();

  // Guardians: one per family, and every fourth gets a login so the parent
  // portal has something to demonstrate.
  const guardianValues: (typeof s.guardians.$inferInsert)[] = [];
  const guardianUserValues: (typeof s.users.$inferInsert)[] = [];
  const guardianWantsLogin: boolean[] = [];
  /** student index -> index into `guardianValues`. Siblings share an entry. */
  const guardianForStudent: number[] = new Array(studentRows.length).fill(-1);

  for (let i = 0; i < studentRows.length; i++) {
    // A younger sibling gets no guardian of their own; they are attached to
    // the one already created for the elder, below.
    if (siblingOf.has(i)) continue;

    const meta = at(studentMeta, i, "student meta");
    const male = rng() < 0.5;
    const first = male ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);
    // Every parent of two children gets a login, so the demo always has one.
    const wantsLogin = i % 4 === 0 || siblingPairs.some(([elder]) => elder === i);
    guardianWantsLogin.push(wantsLogin);
    if (wantsLogin) {
      guardianUserValues.push({
        email: `parent${i}.${slugName(first[0], meta.last[0])}@example.ma`,
        passwordHash,
        role: "parent",
        locale: i % 8 === 0 ? "ar" : "fr",
        mustChangePassword: false,
      });
    }
    guardianForStudent[i] = guardianValues.length;
    guardianValues.push({
      firstNameFr: first[0],
      firstNameAr: first[1],
      lastNameFr: meta.last[0],
      lastNameAr: meta.last[1],
      phone: `+2126${randInt(10_000_000, 99_999_999)}`,
      relation: male ? "father" : "mother",
    });
  }

  for (const [younger, elder] of siblingOf) {
    guardianForStudent[younger] = at(guardianForStudent, elder, "sibling guardian");
  }

  const guardianUsers = await db.insert(s.users).values(guardianUserValues).returning();
  let guardianUserCursor = 0;
  for (let i = 0; i < guardianValues.length; i++) {
    if (guardianWantsLogin[i]) {
      const u = guardianUsers[guardianUserCursor++];
      if (u) at(guardianValues, i, "guardian value").userId = u.id;
    }
  }
  const guardianRows = await db.insert(s.guardians).values(guardianValues).returning();

  await db.insert(s.studentGuardians).values(
    studentRows.map((st, i) => ({
      studentId: st.id,
      guardianId: at(guardianRows, at(guardianForStudent, i, "guardian index"), "guardian").id,
      isPrimary: true,
    }))
  );

  // A handful of students get their own login for the student portal.
  const studentLoginCount = 12;
  const studentUsers = await db
    .insert(s.users)
    .values(
      Array.from({ length: studentLoginCount }, (_, i) => ({
        email: `eleve${i + 1}@almassira.example.ma`,
        passwordHash,
        role: "student" as const,
        locale: (i % 3 === 0 ? "ar" : "fr") as "ar" | "fr",
        mustChangePassword: false,
      }))
    )
    .returning();

  for (let i = 0; i < studentLoginCount; i++) {
    const st = studentRows[i * 17];
    const u = studentUsers[i];
    if (st && u) {
      await db.update(s.students).set({ userId: u.id }).where(eq(s.students.id, st.id));
    }
  }

  await db.insert(s.enrolments).values(
    studentRows.map((st, i) => ({
      studentId: st.id,
      classGroupId: at(classRows, at(studentMeta, i, "student meta").classIdx, "class").id,
      yearId: year.id,
      enrolledOn: iso(yearStart),
    }))
  );

  const studentsByClass = new Map<number, string[]>();
  studentRows.forEach((st, i) => {
    const idx = at(studentMeta, i, "student meta").classIdx;
    const list = studentsByClass.get(idx) ?? [];
    list.push(st.id);
    studentsByClass.set(idx, list);
  });

  // --- timetable ---------------------------------------------------------
  const WEEKLY_HOURS: Record<SubjectCode, number> = {
    ARA: 5,
    FRA: 5,
    MAT: 5,
    SCI: 2,
    HGE: 2,
    EIS: 2,
    ANG: 2,
    EPS: 1,
    INF: 1,
    ART: 1,
  };

  /**
   * Mon–Fri run morning + afternoon; Saturday is a morning only.
   *
   * Ordered **period-major**: the 08:00 hour of every day, then the 09:00 hour
   * of every day, and so on. Placement below is greedy and stops once a class
   * owes no more hours, so a day-major order spends all 26 weekly hours on
   * Monday to Thursday and never reaches Saturday — which Moroccan schools
   * teach (CLAUDE.md §6) and which the register therefore has to cover. This
   * order fills the mornings of the whole week first, which is also what a
   * real primaire/collège timetable looks like.
   */
  const cells: { weekday: number; start: string; end: string }[] = [];
  [...MORNING_SLOTS, ...AFTERNOON_SLOTS].forEach(([start, end], period) => {
    for (let weekday = 1; weekday <= 6; weekday++) {
      if (weekday === 6 && period >= MORNING_SLOTS.length) continue;
      cells.push({ weekday, start, end });
    }
  });

  const remaining = new Map<string, number>();
  for (const cs of classSubjects) remaining.set(cs.id, WEEKLY_HOURS[cs.code]);

  const slotValues: (typeof s.timetableSlots.$inferInsert)[] = [];
  const slotMeta: { classSubjectId: string; classIdx: number; weekday: number; start: string }[] =
    [];

  for (const cell of cells) {
    const busyTeachers = new Set<string>();
    for (let classIdx = 0; classIdx < classRows.length; classIdx++) {
      // Candidates: this class's subjects that still owe hours and whose
      // teacher is free in this cell. Highest remaining first, so the
      // five-hour core subjects are placed before the one-hour ones.
      const candidates = classSubjects
        .filter(
          (cs) =>
            cs.classIdx === classIdx &&
            (remaining.get(cs.id) ?? 0) > 0 &&
            !busyTeachers.has(cs.teacherId)
        )
        .sort((a, b) => (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0));

      const chosen = candidates[0];
      if (!chosen) continue;

      busyTeachers.add(chosen.teacherId);
      remaining.set(chosen.id, (remaining.get(chosen.id) ?? 0) - 1);
      slotValues.push({
        classSubjectId: chosen.id,
        weekday: cell.weekday,
        startTime: cell.start,
        endTime: cell.end,
        room: `S${10 + classIdx}`,
      });
      slotMeta.push({
        classSubjectId: chosen.id,
        classIdx,
        weekday: cell.weekday,
        start: cell.start,
      });
    }
  }

  const unplaced = [...remaining.values()].reduce((a, b) => a + b, 0);
  if (unplaced > 0) console.warn(`  note: ${unplaced} weekly hours could not be placed`);

  const slotRows = await db.insert(s.timetableSlots).values(slotValues).returning();

  // --- sessions & attendance (three weeks back, up to yesterday) ---------
  //
  // Deliberately stopping at yesterday: today's registers are left untaken so
  // that whoever opens the demo has something to actually do, and the teacher
  // home has a lesson to promote rather than reading "all done".
  const teachingDays: Date[] = [];
  for (let d = addDays(today, -20); d < today; d = addDays(d, 1)) {
    if (weekdayOf(d) <= 6 && d >= yearStart) teachingDays.push(d);
  }

  const sessionValues: (typeof s.sessions.$inferInsert)[] = [];
  const sessionMeta: { classIdx: number }[] = [];
  for (const day of teachingDays) {
    const wd = weekdayOf(day);
    slotRows.forEach((slot, i) => {
      if (slot.weekday !== wd) return;
      sessionValues.push({ slotId: slot.id, date: iso(day), status: "held" });
      sessionMeta.push({ classIdx: at(slotMeta, i, "slot meta").classIdx });
    });
  }

  const sessionRows = await insertInChunks<typeof s.sessions, typeof s.sessions.$inferSelect>(
    s.sessions,
    sessionValues,
    1000
  );

  const attendanceValues: (typeof s.attendance.$inferInsert)[] = [];
  sessionRows.forEach((session, i) => {
    const roster = studentsByClass.get(at(sessionMeta, i, "session meta").classIdx) ?? [];
    for (const studentId of roster) {
      const r = rng();
      // ~92% present. Deliberately not 100%: absence totals, late minutes and
      // the bulletin's absence count all need something to count.
      const status = r < 0.92 ? "present" : r < 0.96 ? "absent" : r < 0.985 ? "late" : "excused";
      attendanceValues.push({
        sessionId: session.id,
        studentId,
        status,
        minutesLate: status === "late" ? randInt(3, 20) : null,
        recordedBy: adminUser.id,
      });
    }
  });

  await insertOnly(s.attendance, attendanceValues, 2000);

  // --- assessments & grades (term 1) -------------------------------------
  const assessmentValues: (typeof s.assessments.$inferInsert)[] = [];
  const assessmentMeta: { classIdx: number; maxScore: number; graded: boolean }[] = [];

  for (const cs of classSubjects) {
    // Three assessments per subject so subject averages are meaningful.
    for (let a = 0; a < 3; a++) {
      const tpl = at(ASSESSMENT_TITLES, a % ASSESSMENT_TITLES.length, "assessment title");
      // An oral is marked out of 10 in most Moroccan schools. Keeping one
      // assessment off /20 means the demo exercises normalisation for real,
      // not only in the grading package's unit tests.
      const maxScore = tpl.type === "oral" ? 10 : 20;
      assessmentValues.push({
        classSubjectId: cs.id,
        termId: term1.id,
        title: tpl.title,
        type: tpl.type,
        maxScore: String(maxScore),
        coefficient: String(tpl.coefficient),
        date: iso(addDays(today, -(18 - a * 7))),
        createdBy: adminUser.id,
      });
      // The most recent one is deliberately left unmarked, exactly as today's
      // registers are: whoever opens the demo has marks to actually enter.
      assessmentMeta.push({ classIdx: cs.classIdx, maxScore, graded: a < 2 });
    }
  }

  const assessmentRows = await insertInChunks<
    typeof s.assessments,
    typeof s.assessments.$inferSelect
  >(s.assessments, assessmentValues, 1000);

  const gradeValues: (typeof s.grades.$inferInsert)[] = [];
  assessmentRows.forEach((assessment, i) => {
    const meta = at(assessmentMeta, i, "assessment meta");
    if (!meta.graded) return;
    const roster = studentsByClass.get(meta.classIdx) ?? [];
    for (const studentId of roster) {
      // ~4% absent for the assessment. These carry a NULL score and are
      // excluded from averages — they are emphatically not zeros, and the
      // grading package's tests depend on this fixture containing some.
      const roll = rng();
      const isAbsent = roll < 0.04;
      // ~2% score a genuine zero. This matters: the fixture must contain both
      // a real zero (included in the average, pulls it down) and an absence
      // (excluded entirely). A dataset with only one of the two lets a wrong
      // implementation pass (`docs/test-strategy-madrasti.md` §3).
      const isZero = !isAbsent && roll < 0.06;
      // Scaled to this assessment's own maximum, so a /10 oral never produces
      // an 18 that the normalisation would then turn into a 36.
      const score = isZero ? 0 : meta.maxScore * (0.4 + rng() * 0.5);
      gradeValues.push({
        assessmentId: assessment.id,
        studentId,
        score: isAbsent ? null : (Math.round(score * 4) / 4).toFixed(2),
        isAbsent,
        recordedBy: adminUser.id,
      });
    }
  });

  await insertOnly(s.grades, gradeValues, 2000);

  // --- homework ----------------------------------------------------------
  const assignmentValues: (typeof s.assignments.$inferInsert)[] = [];
  for (const cs of classSubjects) {
    const titles = HOMEWORK_TITLES[cs.code] ?? [];
    if (titles.length === 0) continue;
    // A couple per subject, spread either side of today so the "upcoming
    // homework" list on the parent and student screens is never empty.
    for (let k = 0; k < 2; k++) {
      const assigned = addDays(today, randInt(-10, 2));
      assignmentValues.push({
        classSubjectId: cs.id,
        title: pick(titles),
        description: null,
        assignedOn: iso(assigned),
        dueOn: iso(addDays(assigned, randInt(2, 9))),
        createdBy: adminUser.id,
      });
    }
  }
  await insertOnly(s.assignments, assignmentValues, 1000);

  // --- subject appreciations (term 1) ------------------------------------
  // Written by the subject's own teacher, in the language they teach in, so
  // the seeded bulletin is mixed-script from the start (see seed-data.ts).
  const teacherUserByTeacherId = new Map(
    teacherRows.map((row, i) => [row.id, teacherUsers[i]?.id ?? adminUser.id])
  );

  const appreciationValues: (typeof s.subjectAppreciations.$inferInsert)[] = [];
  for (const cs of classSubjects) {
    const arabicMedium = ARABIC_MEDIUM_SUBJECTS.includes(cs.code);
    const phrases = arabicMedium ? APPRECIATIONS_AR : APPRECIATIONS_FR;
    const roster = studentsByClass.get(cs.classIdx) ?? [];
    for (const studentId of roster) {
      // ~70% written. The rest are blank on purpose: a bulletin where every
      // subject has a remark never shows what an empty one looks like, and
      // that is the row the print stylesheet gets wrong.
      if (rng() > 0.7) continue;
      appreciationValues.push({
        classSubjectId: cs.id,
        studentId,
        termId: term1.id,
        text: pick(phrases),
        recordedBy: teacherUserByTeacherId.get(cs.teacherId) ?? adminUser.id,
      });
    }
  }
  await insertOnly(s.subjectAppreciations, appreciationValues, 2000);

  // --- summary -----------------------------------------------------------
  const sampleParent = guardianUsers[0];
  const sampleStudent = studentUsers[0];
  const sampleTeacher = teacherUsers[0];

  console.log(`
  seeded ${yearLabel}
  ─────────────────────────────────────────────
  ${classRows.length} classes · ${studentRows.length} students · ${teacherRows.length} teachers
  ${slotRows.length} timetable slots · ${sessionRows.length} sessions
  ${attendanceValues.length} attendance marks
  ${assessmentRows.length} assessments · ${gradeValues.length} grades
  ${assignmentValues.length} homework items · ${appreciationValues.length} appreciations

  logins — password for all: ${DEMO_PASSWORD}
  ─────────────────────────────────────────────
  admin    ${adminUser.email}
  teacher  ${sampleTeacher?.email ?? "-"}
  parent   ${sampleParent?.email ?? "-"}
  student  ${sampleStudent?.email ?? "-"}
`);
}

// --- small utilities -----------------------------------------------------

/**
 * Insert in chunks, returning the inserted rows.
 *
 * Postgres caps a statement at 65535 bind parameters, and the attendance and
 * grade tables run to tens of thousands of rows — a single `values()` call
 * would be rejected outright.
 */
async function insertInChunks<TTable extends PgTable, TRow>(
  table: TTable,
  values: TTable["$inferInsert"][],
  size: number
): Promise<TRow[]> {
  const out: TRow[] = [];
  for (let i = 0; i < values.length; i += size) {
    const chunk = values.slice(i, i + size);
    if (chunk.length === 0) continue;
    const rows = await db.insert(table).values(chunk).returning();
    out.push(...(rows as TRow[]));
  }
  return out;
}

/** As above, for tables whose inserted ids are never needed afterwards. */
async function insertOnly<TTable extends PgTable>(
  table: TTable,
  values: TTable["$inferInsert"][],
  size: number
): Promise<number> {
  let written = 0;
  for (let i = 0; i < values.length; i += size) {
    const chunk = values.slice(i, i + size);
    if (chunk.length === 0) continue;
    await db.insert(table).values(chunk);
    written += chunk.length;
  }
  return written;
}

await main();
await client.end();
