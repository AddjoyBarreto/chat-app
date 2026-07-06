CREATE TABLE IF NOT EXISTS "conversations" (
  "user_id" uuid NOT NULL,
  "peer_id" uuid NOT NULL,
  "last_message_id" uuid,
  "last_message_at" timestamp with time zone NOT NULL,
  CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversations_peer_id_users_id_fk" FOREIGN KEY ("peer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "conversations_last_message_id_messages_id_fk" FOREIGN KEY ("last_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_user_peer_idx" ON "conversations" USING btree ("user_id","peer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_user_last_at_idx" ON "conversations" USING btree ("user_id","last_message_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_sender_idx" ON "messages" USING btree ("sender_id","recipient_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_recipient_idx" ON "messages" USING btree ("recipient_id","sender_id","created_at");
--> statement-breakpoint
INSERT INTO "conversations" ("user_id", "peer_id", "last_message_id", "last_message_at")
SELECT "user_id", "peer_id", "id", "created_at"
FROM (
  SELECT DISTINCT ON ("user_id", "peer_id")
    "user_id",
    "peer_id",
    "id",
    "created_at"
  FROM (
    SELECT "sender_id" AS "user_id", "recipient_id" AS "peer_id", "id", "created_at" FROM "messages"
    UNION ALL
    SELECT "recipient_id" AS "user_id", "sender_id" AS "peer_id", "id", "created_at" FROM "messages"
  ) AS "pairs"
  ORDER BY "user_id", "peer_id", "created_at" DESC
) AS "latest"
ON CONFLICT ("user_id", "peer_id") DO UPDATE
SET
  "last_message_id" = EXCLUDED."last_message_id",
  "last_message_at" = EXCLUDED."last_message_at"
WHERE "conversations"."last_message_at" < EXCLUDED."last_message_at";
