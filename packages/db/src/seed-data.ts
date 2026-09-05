/**
 * Static reference data for the seed.
 *
 * Every person here is **invented**. No real student, guardian or teacher data
 * ever enters this repository, a fixture, or a test
 * (`docs/test-strategy-madrasti.md` §8).
 */

export const SCHOOL = {
  nameFr: "Groupe Scolaire Al Massira",
  nameAr: "مجموعة مدارس المسيرة",
  nameEn: "Al Massira School Group",
  address: "12, rue Ibn Sina, Hay Riad, Rabat",
  phone: "+212537123456",
  email: "contact@almassira.example.ma",
};

export const LEVELS = [
  { order: 1, nameFr: "CE1", nameAr: "السنة الثانية ابتدائي", nameEn: "Grade 2" },
  { order: 2, nameFr: "CE2", nameAr: "السنة الثالثة ابتدائي", nameEn: "Grade 3" },
  { order: 3, nameFr: "CM1", nameAr: "السنة الرابعة ابتدائي", nameEn: "Grade 4" },
  { order: 4, nameFr: "CM2", nameAr: "السنة الخامسة ابتدائي", nameEn: "Grade 5" },
  { order: 5, nameFr: "1ère année collège", nameAr: "الأولى إعدادي", nameEn: "Grade 7" },
  { order: 6, nameFr: "2ème année collège", nameAr: "الثانية إعدادي", nameEn: "Grade 8" },
] as const;

export const SUBJECTS = [
  { code: "ARA", nameFr: "Arabe", nameAr: "اللغة العربية", nameEn: "Arabic", color: "#2F6B43" },
  { code: "FRA", nameFr: "Français", nameAr: "اللغة الفرنسية", nameEn: "French", color: "#2F6690" },
  {
    code: "MAT",
    nameFr: "Mathématiques",
    nameAr: "الرياضيات",
    nameEn: "Mathematics",
    color: "#B3392B",
  },
  {
    code: "SCI",
    nameFr: "Éveil scientifique",
    nameAr: "النشاط العلمي",
    nameEn: "Science",
    color: "#4E9061",
  },
  {
    code: "HGE",
    nameFr: "Histoire-Géographie",
    nameAr: "التاريخ والجغرافيا",
    nameEn: "History & Geography",
    color: "#8A5A0F",
  },
  {
    code: "EIS",
    nameFr: "Éducation islamique",
    nameAr: "التربية الإسلامية",
    nameEn: "Islamic Education",
    color: "#245334",
  },
  {
    code: "ANG",
    nameFr: "Anglais",
    nameAr: "اللغة الإنجليزية",
    nameEn: "English",
    color: "#1F4460",
  },
  {
    code: "EPS",
    nameFr: "Éducation physique",
    nameAr: "التربية البدنية",
    nameEn: "Physical Education",
    color: "#C9821A",
  },
  {
    code: "INF",
    nameFr: "Informatique",
    nameAr: "المعلوميات",
    nameEn: "Computing",
    color: "#4A463D",
  },
  {
    code: "ART",
    nameFr: "Éducation artistique",
    nameAr: "التربية الفنية",
    nameEn: "Arts",
    color: "#7E2419",
  },
] as const;

export type SubjectCode = (typeof SUBJECTS)[number]["code"];

/**
 * Coefficients **per level band**, not per subject.
 *
 * This is the seed's most important property: the same subject deliberately
 * carries different weights in primaire and collège. It is what proves the
 * coefficient belongs on `class_subjects` — a fixture where every level shared
 * a coefficient would let the wrong model pass its tests
 * (`docs/test-strategy-madrasti.md` §8).
 */
export const COEFFICIENTS: Record<"primaire" | "college", Record<SubjectCode, number>> = {
  // Levels 1–4
  primaire: {
    ARA: 4,
    FRA: 4,
    MAT: 4,
    SCI: 2,
    HGE: 1,
    EIS: 2,
    ANG: 1,
    EPS: 1,
    INF: 1,
    ART: 1,
  },
  // Levels 5–6 — maths and languages weigh more, and science splits out
  college: {
    ARA: 4,
    FRA: 4,
    MAT: 5,
    SCI: 3,
    HGE: 2,
    EIS: 2,
    ANG: 3,
    EPS: 1,
    INF: 1,
    ART: 1,
  },
};

/** Invented Moroccan names, in both scripts. */
export const MALE_FIRST_NAMES = [
  ["Amine", "أمين"],
  ["Youssef", "يوسف"],
  ["Mehdi", "مهدي"],
  ["Omar", "عمر"],
  ["Reda", "رضى"],
  ["Ayoub", "أيوب"],
  ["Hamza", "حمزة"],
  ["Bilal", "بلال"],
  ["Anas", "أنس"],
  ["Ilyas", "إلياس"],
  ["Zakaria", "زكرياء"],
  ["Adam", "آدم"],
  ["Nabil", "نبيل"],
  ["Karim", "كريم"],
  ["Soufiane", "سفيان"],
  ["Marouane", "مروان"],
] as const;

export const FEMALE_FIRST_NAMES = [
  ["Salma", "سلمى"],
  ["Nour", "نور"],
  ["Ines", "إيناس"],
  ["Aya", "آية"],
  ["Khadija", "خديجة"],
  ["Fatima Zahra", "فاطمة الزهراء"],
  ["Lina", "لينا"],
  ["Sara", "سارة"],
  ["Meryem", "مريم"],
  ["Hiba", "هبة"],
  ["Rim", "ريم"],
  ["Ghita", "غيثة"],
  ["Imane", "إيمان"],
  ["Wiam", "وئام"],
  ["Douae", "دعاء"],
  ["Chaimae", "شيماء"],
] as const;

export const LAST_NAMES = [
  ["Kabbaj", "قباج"],
  ["Rami", "رامي"],
  ["Tazi", "التازي"],
  ["El Amrani", "العمراني"],
  ["Bennani", "بناني"],
  ["Alaoui", "العلوي"],
  ["Idrissi", "الإدريسي"],
  ["Sabri", "صبري"],
  ["Haddad", "الحداد"],
  ["Chraibi", "الشرايبي"],
  ["Berrada", "بردة"],
  ["Fassi", "الفاسي"],
  ["Naciri", "الناصري"],
  ["Ouazzani", "الوزاني"],
  ["Sekkat", "السكات"],
  ["Lahlou", "لحلو"],
  ["Benjelloun", "بنجلون"],
  ["Cherkaoui", "الشرقاوي"],
  ["Mansouri", "المنصوري"],
  ["Zouhair", "زهير"],
] as const;

/** Assessment titles, cycled per subject per term. */
/**
 * The seed writes the first three of these per subject.
 *
 * Ordered deliberately: an oral sits second so it is one of the two that get
 * marked, which is what puts a /10 assessment into the seeded averages and
 * makes normalisation visible in the demo rather than only in unit tests. The
 * devoir surveillé sits third — the one left unmarked — because a heavy
 * coefficient still to be entered is exactly what a teacher opens the app to do.
 */
export const ASSESSMENT_TITLES = [
  { title: "Contrôle continu n°1", type: "controle", coefficient: 1 },
  { title: "Contrôle oral", type: "oral", coefficient: 1 },
  { title: "Devoir surveillé n°1", type: "devoir_surveille", coefficient: 2 },
  { title: "Participation", type: "participation", coefficient: 1 },
] as const;

export const HOMEWORK_TITLES: Record<string, string[]> = {
  ARA: ["إنشاء: وصف رحلة", "تحليل نص شعري", "تمارين في الصرف والتحويل"],
  FRA: [
    "Rédaction : une journée mémorable",
    "Exercices de conjugaison",
    "Lecture suivie, chapitre 3",
  ],
  MAT: ["Exercices 12 à 18, page 45", "Problèmes de proportionnalité", "Révision : fractions"],
  SCI: ["Schéma du cycle de l'eau", "Exposé : les états de la matière"],
  HGE: ["Carte du Maroc : les régions", "Résumé du chapitre 2"],
  EIS: ["حفظ سورة الملك", "بحث حول أركان الإسلام"],
  ANG: ["Vocabulary list, unit 4", "Write a short paragraph about your family"],
  INF: ["Exercice : tableur, première feuille"],
  EPS: [],
  ART: ["Dessin : nature morte"],
};

/**
 * Subject appreciations, in the language the subject is taught in.
 *
 * Arabic for Arabic and Éducation islamique, French for the rest — which is
 * how a Moroccan private school actually writes them, and it means the seeded
 * bulletin is a **mixed-script document** from the first day of the demo. That
 * is the case the A4 print stylesheet has to survive (story 8.4): an Arabic
 * bulletin carrying French remarks, and a French one carrying Arabic. A seed
 * written entirely in one language would let a broken layout ship.
 *
 * Deliberately banal. These are the sentences that appear on real bulletins,
 * and the demo is more convincing for a head teacher when they read like his
 * staff's than when they read like copy.
 */
export const APPRECIATIONS_FR = [
  "Élève sérieux, en progrès constant ce trimestre.",
  "Résultats satisfaisants. Doit participer davantage à l'oral.",
  "Trimestre difficile. Un travail plus régulier à la maison est nécessaire.",
  "Très bon niveau, continue ainsi.",
  "Des capacités réelles, mais un manque d'attention en classe.",
  "Ensemble correct. Doit soigner la présentation des devoirs.",
];

export const APPRECIATIONS_AR = [
  "تلميذ مجتهد، مستواه في تحسن مستمر.",
  "نتائج مرضية. عليه المشاركة أكثر داخل القسم.",
  "أسدس صعب. يتطلب عملاً أكثر انتظاماً في البيت.",
  "مستوى جيد جداً، واصل على هذا المنوال.",
  "قدرات حقيقية، لكن ينقصه التركيز أثناء الدرس.",
  "عمل مقبول. عليه الاعتناء بتقديم الواجبات.",
];

/** Subjects taught in Arabic — their remarks are written in Arabic. */
export const ARABIC_MEDIUM_SUBJECTS = ["ARA", "EIS"];

/**
 * The teaching day, Monday–Saturday. Saturday is a half day.
 * Times are the standard Moroccan school rhythm with a long midday break.
 */
export const MORNING_SLOTS = [
  ["08:00", "09:00"],
  ["09:00", "10:00"],
  ["10:15", "11:15"],
  ["11:15", "12:15"],
] as const;

export const AFTERNOON_SLOTS = [
  ["14:00", "15:00"],
  ["15:00", "16:00"],
] as const;
