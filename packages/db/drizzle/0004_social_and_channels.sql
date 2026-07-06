ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "icon_url" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_privacy_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "dm_policy" text DEFAULT 'everyone' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_privacy_settings" ADD CONSTRAINT "user_privacy_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friend_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sender_id" uuid NOT NULL,
  "recipient_id" uuid NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "friend_requests" ADD CONSTRAINT "friend_requests_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "friend_requests_pair_idx" ON "friend_requests" USING btree ("sender_id","recipient_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friend_requests_recipient_idx" ON "friend_requests" USING btree ("recipient_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friendships" (
  "user_id" uuid NOT NULL,
  "friend_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_friend_id_users_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "friendships_pair_idx" ON "friendships" USING btree ("user_id","friend_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_user_idx" ON "friendships" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blocks" (
  "user_id" uuid NOT NULL,
  "blocked_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "blocks_pair_idx" ON "blocks" USING btree ("user_id","blocked_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "community_id" uuid NOT NULL,
  "created_by" uuid NOT NULL,
  "max_uses" integer,
  "use_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_community_id_groups_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invites_code_idx" ON "invites" USING btree ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invites_community_idx" ON "invites" USING btree ("community_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" uuid NOT NULL,
  "name" text NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_categories" ADD CONSTRAINT "channel_categories_community_id_groups_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_categories_community_idx" ON "channel_categories" USING btree ("community_id","position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "community_id" uuid NOT NULL,
  "category_id" uuid,
  "name" text NOT NULL,
  "type" text DEFAULT 'text' NOT NULL,
  "topic" text,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_community_id_groups_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_category_id_channel_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."channel_categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channels_community_idx" ON "channels" USING btree ("community_id","position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "sender_device_id" integer NOT NULL,
  "ciphertext" text NOT NULL,
  "message_type" text DEFAULT 'text' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_messages_channel_created_idx" ON "channel_messages" USING btree ("channel_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "channel_read_state" (
  "user_id" uuid NOT NULL,
  "channel_id" uuid NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_read_state" ADD CONSTRAINT "channel_read_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "channel_read_state" ADD CONSTRAINT "channel_read_state_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "channel_read_state_user_channel_idx" ON "channel_read_state" USING btree ("user_id","channel_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_presence" (
  "channel_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_presence" ADD CONSTRAINT "voice_presence_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "voice_presence" ADD CONSTRAINT "voice_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "voice_presence_channel_user_idx" ON "voice_presence" USING btree ("channel_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "voice_presence_channel_idx" ON "voice_presence" USING btree ("channel_id");
--> statement-breakpoint
INSERT INTO "channel_categories" ("id", "community_id", "name", "position")
SELECT gen_random_uuid(), g."id", 'Text Channels', 0
FROM "groups" g
WHERE NOT EXISTS (
  SELECT 1 FROM "channel_categories" cc WHERE cc."community_id" = g."id"
);
--> statement-breakpoint
INSERT INTO "channels" ("id", "community_id", "category_id", "name", "type", "position")
SELECT gen_random_uuid(), g."id", cc."id", 'general', 'text', 0
FROM "groups" g
INNER JOIN "channel_categories" cc ON cc."community_id" = g."id" AND cc."name" = 'Text Channels'
WHERE NOT EXISTS (
  SELECT 1 FROM "channels" ch WHERE ch."community_id" = g."id" AND ch."name" = 'general'
);
