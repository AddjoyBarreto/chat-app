CREATE TABLE IF NOT EXISTS "account_key_backups" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "encrypted_blob" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "account_key_backups" ADD CONSTRAINT "account_key_backups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
