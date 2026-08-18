import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

const mode = (process.env.ATTACHMENT_STORAGE_MODE ?? "database").toLowerCase();
const bucket = process.env.ATTACHMENT_S3_BUCKET;
const region = process.env.ATTACHMENT_S3_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const endpoint = process.env.ATTACHMENT_S3_ENDPOINT;

const client = mode === "s3" && bucket
  ? new S3Client({
      region,
      endpoint,
      forcePathStyle: process.env.ATTACHMENT_S3_FORCE_PATH_STYLE === "true",
    })
  : null;

export function isExternalAttachmentStorageEnabled() {
  return Boolean(client && bucket);
}

function safeFileName(fileName: string) {
  const normalized = fileName.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 100);
  return normalized || "attachment";
}

function attachmentKey(entityType: string, entityId: string, fileName: string) {
  return `family-attachments/${entityType}/${entityId}/${randomUUID()}-${safeFileName(fileName)}`;
}

export async function putAttachmentObject(params: {
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  body: Buffer;
}) {
  if (!client || !bucket) return null;

  const key = attachmentKey(params.entityType, params.entityId, params.fileName);
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: params.body,
    ContentType: params.mimeType,
    ContentLength: params.body.length,
    Metadata: {
      entitytype: params.entityType,
      entityid: params.entityId,
    },
  }));

  return { key };
}

export async function getAttachmentObject(key: string) {
  if (!client || !bucket) return null;
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error("لم يُرجع التخزين الخارجي محتوى الملف");

  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}
