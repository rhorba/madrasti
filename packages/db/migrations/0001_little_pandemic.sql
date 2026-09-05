ALTER TABLE "assessments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "deleted_at" timestamp with time zone;