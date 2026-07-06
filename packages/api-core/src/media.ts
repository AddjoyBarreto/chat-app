import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { mediaFiles } from "@vaultchat/db";
import type { MediaDownloadUrlResponse, MediaUploadUrlResponse } from "@vaultchat/protocol";
import { eq } from "drizzle-orm";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import type { ApiContext } from "./context.js";
import { ApiCoreError } from "./errors.js";

const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const URL_TTL_SECONDS = 3600;

export interface MediaStorageConfig {
  r2AccountId?: string;
  r2AccessKeyId?: string;
  r2SecretAccessKey?: string;
  r2Bucket?: string;
  localMediaPath?: string;
  apiBaseUrl?: string;
}

let mediaConfig: MediaStorageConfig = {};

export function setMediaConfig(config: MediaStorageConfig) {
  mediaConfig = config;
}

function getS3Client(): S3Client | null {
  if (
    !mediaConfig.r2AccountId ||
    !mediaConfig.r2AccessKeyId ||
    !mediaConfig.r2SecretAccessKey ||
    !mediaConfig.r2Bucket
  ) {
    return null;
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${mediaConfig.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: mediaConfig.r2AccessKeyId,
      secretAccessKey: mediaConfig.r2SecretAccessKey,
    },
  });
}

function localDir() {
  return mediaConfig.localMediaPath ?? path.join(process.cwd(), ".data", "media");
}

export async function createMediaUploadUrl(
  ctx: ApiContext,
  userId: string,
  mimeType: string,
  sizeBytes: number
): Promise<MediaUploadUrlResponse> {
  if (sizeBytes <= 0 || sizeBytes > MAX_MEDIA_BYTES) {
    throw new ApiCoreError("Invalid file size (max 50 MB)", 400, "INVALID_SIZE");
  }

  const [row] = await ctx.db
    .insert(mediaFiles)
    .values({
      ownerId: userId,
      mimeType,
      sizeBytes,
      storageKey: `pending-${crypto.randomUUID()}`,
    })
    .returning({ id: mediaFiles.id });

  const storageKey = `media/${userId}/${row.id}`;
  await ctx.db
    .update(mediaFiles)
    .set({ storageKey })
    .where(eq(mediaFiles.id, row.id));

  const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString();
  const s3 = getS3Client();

  if (s3 && mediaConfig.r2Bucket) {
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: mediaConfig.r2Bucket,
        Key: storageKey,
        ContentType: mimeType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: URL_TTL_SECONDS }
    );
    return { mediaId: row.id, uploadUrl, expiresAt };
  }

  const base = mediaConfig.apiBaseUrl ?? "http://localhost:3000";
  return {
    mediaId: row.id,
    uploadUrl: `${base}/api/v1/media/${row.id}/upload`,
    expiresAt,
  };
}

export async function createMediaDownloadUrl(
  ctx: ApiContext,
  userId: string,
  mediaId: string
): Promise<MediaDownloadUrlResponse> {
  const [file] = await ctx.db
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.id, mediaId))
    .limit(1);
  if (!file) throw new ApiCoreError("Media not found", 404, "NOT_FOUND");

  const expiresAt = new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString();
  const s3 = getS3Client();

  if (s3 && mediaConfig.r2Bucket) {
    const downloadUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: mediaConfig.r2Bucket, Key: file.storageKey }),
      { expiresIn: URL_TTL_SECONDS }
    );
    return { downloadUrl, expiresAt };
  }

  const base = mediaConfig.apiBaseUrl ?? "http://localhost:3000";
  return {
    downloadUrl: `${base}/api/v1/media/${mediaId}/blob`,
    expiresAt,
  };
}

export async function storeLocalMedia(mediaId: string, data: Buffer): Promise<void> {
  const dir = localDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, mediaId), data);
}

export async function readLocalMedia(mediaId: string): Promise<Buffer> {
  return readFile(path.join(localDir(), mediaId));
}
