-- Extensions. drizzle-kit does not emit these; they must exist before any
-- table that uses them is created.
--   citext   -> case-insensitive email columns (users.email, guardians.email).
--               School staff will not be careful about capitalisation, and
--               `Fatima@...` must be the same account as `fatima@...`.
--   pgcrypto -> gen_random_uuid(). Core since PG13, but declared explicitly so
--               the migration is not silently coupled to the server version.
CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('controle', 'devoir_surveille', 'oral', 'participation');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'late', 'excused');--> statement-breakpoint
CREATE TYPE "public"."bulletin_decision" AS ENUM('admis', 'admis_avec_felicitations', 'encouragements', 'avertissement', 'redouble');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('m', 'f');--> statement-breakpoint
CREATE TYPE "public"."guardian_relation" AS ENUM('father', 'mother', 'tutor');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('ar', 'fr', 'en');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'held', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'transferred', 'graduated', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'teacher', 'parent', 'student');--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"first_name_fr" text NOT NULL,
	"last_name_fr" text NOT NULL,
	"first_name_ar" text NOT NULL,
	"last_name_ar" text NOT NULL,
	"phone" varchar(30) NOT NULL,
	"email" "citext",
	"relation" "guardian_relation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardians_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "student_guardians" (
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardians_student_id_guardian_id_pk" PRIMARY KEY("student_id","guardian_id")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"massar_code" varchar(16),
	"first_name_fr" text NOT NULL,
	"last_name_fr" text NOT NULL,
	"first_name_ar" text NOT NULL,
	"last_name_ar" text NOT NULL,
	"birth_date" date NOT NULL,
	"gender" "gender" NOT NULL,
	"photo_key" text,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"enrolled_at" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"first_name_fr" text NOT NULL,
	"last_name_fr" text NOT NULL,
	"first_name_ar" text NOT NULL,
	"last_name_ar" text NOT NULL,
	"phone" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teachers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"locale" "locale" DEFAULT 'fr' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(20) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_years_label_unique" UNIQUE("label"),
	CONSTRAINT "academic_years_dates_ordered" CHECK ("academic_years"."end_date" > "academic_years"."start_date")
);
--> statement-breakpoint
CREATE TABLE "class_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"level_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"main_teacher_id" uuid,
	"capacity" smallint DEFAULT 35 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_groups_year_name_unique" UNIQUE("year_id","name")
);
--> statement-breakpoint
CREATE TABLE "class_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_group_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"coefficient" numeric(3, 1) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_subjects_class_subject_unique" UNIQUE("class_group_id","subject_id"),
	CONSTRAINT "class_subjects_coefficient_positive" CHECK ("class_subjects"."coefficient" > 0)
);
--> statement-breakpoint
CREATE TABLE "enrolments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_group_id" uuid NOT NULL,
	"year_id" uuid NOT NULL,
	"enrolled_on" date NOT NULL,
	"left_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_fr" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "levels_order_unique" UNIQUE("order")
);
--> statement-breakpoint
CREATE TABLE "school" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_fr" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"logo_key" text,
	"address" text,
	"phone" varchar(30),
	"email" text,
	"default_locale" "locale" DEFAULT 'fr' NOT NULL,
	"grading_max" numeric(4, 2) DEFAULT '20' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_fr" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"code" varchar(20) NOT NULL,
	"color" varchar(7) DEFAULT '#2F6B43' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_id" uuid NOT NULL,
	"label_fr" text NOT NULL,
	"label_ar" text NOT NULL,
	"label_en" text NOT NULL,
	"order" smallint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_year_order_unique" UNIQUE("year_id","order"),
	CONSTRAINT "terms_order_range" CHECK ("terms"."order" between 1 and 3),
	CONSTRAINT "terms_dates_ordered" CHECK ("terms"."end_date" > "terms"."start_date")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "session_status" DEFAULT 'scheduled' NOT NULL,
	"actual_teacher_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_slot_date_unique" UNIQUE("slot_id","date")
);
--> statement-breakpoint
CREATE TABLE "timetable_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "timetable_slots_weekday_range" CHECK ("timetable_slots"."weekday" between 1 and 6),
	CONSTRAINT "timetable_slots_times_ordered" CHECK ("timetable_slots"."end_time" > "timetable_slots"."start_time")
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" "assessment_type" NOT NULL,
	"max_score" numeric(5, 2) DEFAULT '20' NOT NULL,
	"coefficient" numeric(3, 1) DEFAULT '1' NOT NULL,
	"date" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessments_max_score_positive" CHECK ("assessments"."max_score" > 0),
	CONSTRAINT "assessments_coefficient_positive" CHECK ("assessments"."coefficient" > 0)
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assigned_on" date NOT NULL,
	"due_on" date NOT NULL,
	"attachment_key" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_due_after_assigned" CHECK ("assignments"."due_on" >= "assignments"."assigned_on")
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" NOT NULL,
	"minutes_late" smallint,
	"note" text,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_session_student_unique" UNIQUE("session_id","student_id"),
	CONSTRAINT "attendance_minutes_only_when_late" CHECK ("attendance"."minutes_late" is null or "attendance"."status" = 'late')
);
--> statement-breakpoint
CREATE TABLE "bulletin_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bulletin_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"average" numeric(5, 2),
	"coefficient" numeric(3, 1) NOT NULL,
	"weighted_points" numeric(6, 2),
	"rank" smallint,
	"appreciation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bulletin_lines_bulletin_subject_unique" UNIQUE("bulletin_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "bulletins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"general_average" numeric(5, 2),
	"rank" smallint,
	"class_size" smallint,
	"absence_count" smallint DEFAULT 0 NOT NULL,
	"appreciation" text,
	"decision" "bulletin_decision",
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bulletins_student_term_unique" UNIQUE("student_id","term_id")
);
--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"score" numeric(5, 2),
	"is_absent" boolean DEFAULT false NOT NULL,
	"comment" text,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grades_assessment_student_unique" UNIQUE("assessment_id","student_id"),
	CONSTRAINT "grades_absent_xor_score" CHECK (("grades"."is_absent" = true and "grades"."score" is null) or ("grades"."is_absent" = false and "grades"."score" is not null)),
	CONSTRAINT "grades_score_non_negative" CHECK ("grades"."score" is null or "grades"."score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"payload" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_guardians_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."levels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_groups" ADD CONSTRAINT "class_groups_main_teacher_id_teachers_id_fk" FOREIGN KEY ("main_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_group_id_class_groups_id_fk" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_class_group_id_class_groups_id_fk" FOREIGN KEY ("class_group_id") REFERENCES "public"."class_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrolments" ADD CONSTRAINT "enrolments_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_year_id_academic_years_id_fk" FOREIGN KEY ("year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_slot_id_timetable_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."timetable_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_actual_teacher_id_teachers_id_fk" FOREIGN KEY ("actual_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_lines" ADD CONSTRAINT "bulletin_lines_bulletin_id_bulletins_id_fk" FOREIGN KEY ("bulletin_id") REFERENCES "public"."bulletins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_lines" ADD CONSTRAINT "bulletin_lines_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletins" ADD CONSTRAINT "bulletins_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "student_guardians_guardian_idx" ON "student_guardians" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_massar_unique" ON "students" USING btree ("massar_code");--> statement-breakpoint
CREATE INDEX "students_status_idx" ON "students" USING btree ("status");--> statement-breakpoint
CREATE INDEX "students_name_idx" ON "students" USING btree ("last_name_fr","first_name_fr");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_active_role_idx" ON "users" USING btree ("role") WHERE "users"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "academic_years_one_current" ON "academic_years" USING btree ((true)) WHERE "academic_years"."is_current";--> statement-breakpoint
CREATE INDEX "class_groups_year_idx" ON "class_groups" USING btree ("year_id");--> statement-breakpoint
CREATE INDEX "class_subjects_teacher_idx" ON "class_subjects" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrolments_one_active_per_year" ON "enrolments" USING btree ("student_id","year_id") WHERE "enrolments"."left_on" is null;--> statement-breakpoint
CREATE INDEX "enrolments_active_class_idx" ON "enrolments" USING btree ("class_group_id") WHERE "enrolments"."left_on" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "terms_one_current" ON "terms" USING btree ((true)) WHERE "terms"."is_current";--> statement-breakpoint
CREATE INDEX "sessions_date_idx" ON "sessions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "timetable_slots_class_subject_idx" ON "timetable_slots" USING btree ("class_subject_id");--> statement-breakpoint
CREATE INDEX "timetable_slots_weekday_idx" ON "timetable_slots" USING btree ("weekday") WHERE "timetable_slots"."is_active";--> statement-breakpoint
CREATE INDEX "assessments_class_subject_term_idx" ON "assessments" USING btree ("class_subject_id","term_id");--> statement-breakpoint
CREATE INDEX "assignments_class_subject_due_idx" ON "assignments" USING btree ("class_subject_id","due_on");--> statement-breakpoint
CREATE INDEX "attendance_student_idx" ON "attendance" USING btree ("student_id","recorded_at");--> statement-breakpoint
CREATE INDEX "attendance_status_idx" ON "attendance" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bulletins_published_idx" ON "bulletins" USING btree ("term_id") WHERE "bulletins"."published_at" is not null;--> statement-breakpoint
CREATE INDEX "grades_student_idx" ON "grades" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");