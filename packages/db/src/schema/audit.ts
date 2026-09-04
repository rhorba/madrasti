import { sql } from "drizzle-orm";
import { index, inet, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Append-only audit trail. Every grade and attendance write lands here.
 *
 * Deliberately **no foreign key** to `users`: the log must outlive the account
 * it refers to. Deactivating or removing a teacher must not erase the record of
 * who entered a mark.
 *
 * `payload` carries changed field names with old/new values for *academic*
 * fields only — a mark moving from 12 to 14 is exactly what an audit needs. It
 * must never hold identity or contact fields, a password, or a token
 * (`docs/security-madrasti.md` §7).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    payload: jsonb("payload"),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byEntity: index("audit_log_entity_idx").on(t.entity, t.entityId),
    byCreatedAt: index("audit_log_created_at_idx").on(t.createdAt.desc()),
    byActor: index("audit_log_actor_idx").on(t.actorId),
  })
);
