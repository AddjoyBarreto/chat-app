CREATE TABLE IF NOT EXISTS "conversation_read_state" (
  "user_id" uuid NOT NULL,
  "peer_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "conversation_read_state" ADD CONSTRAINT "conversation_read_state_peer_id_users_id_fk" FOREIGN KEY ("peer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_read_state_user_peer_idx" ON "conversation_read_state" USING btree ("user_id","peer_id");
