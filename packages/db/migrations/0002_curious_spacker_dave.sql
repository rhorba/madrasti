CREATE TABLE "subject_appreciations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_subject_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"text" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_appreciations_unique" UNIQUE("class_subject_id","student_id","term_id"),
	CONSTRAINT "subject_appreciations_not_blank" CHECK (length(btrim("subject_appreciations"."text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "subject_appreciations" ADD CONSTRAINT "subject_appreciations_class_subject_id_class_subjects_id_fk" FOREIGN KEY ("class_subject_id") REFERENCES "public"."class_subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_appreciations" ADD CONSTRAINT "subject_appreciations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_appreciations" ADD CONSTRAINT "subject_appreciations_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_appreciations" ADD CONSTRAINT "subject_appreciations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subject_appreciations_sheet_idx" ON "subject_appreciations" USING btree ("class_subject_id","term_id");--> statement-breakpoint
CREATE INDEX "subject_appreciations_student_term_idx" ON "subject_appreciations" USING btree ("student_id","term_id");