-- Repair: push_tokens may be missing if 0001 was marked applied without the table.
CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "platform" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_user_token_idx" ON "push_tokens" USING btree ("user_id","token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");
