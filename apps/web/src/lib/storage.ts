import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  PRESIGNED_URL_TTL_SECONDS,
} from "@madrasti/core";

/**
 * Private object storage (Cloudflare R2).
 *
 * Three rules, all of them because the objects are records about minors
 * (`docs/security-madrasti.md` §5):
 *
 * 1. **The bucket is private and stays private.** Nothing is ever served from
 *    a public URL. Every read is a presigned GET that expires in minutes.
 * 2. **The application never proxies the bytes.** A teacher's phone uploads
 *    straight to R2 with a presigned PUT, so a 10MB PDF never occupies a
 *    server request.
 * 3. **The key is generated here, never taken from the client.** A filename
 *    from a browser is attacker-controlled and would otherwise decide where
 *    the object lands.
 *
 * Credentials are optional in development. With none configured the feature
 * reports itself unavailable and the UI hides the control rather than offering
 * an upload that cannot work.
 */

const accountId = process.env["R2_ACCOUNT_ID"];
const accessKeyId = process.env["R2_ACCESS_KEY_ID"];
const secretAccessKey = process.env["R2_SECRET_ACCESS_KEY"];
const bucket = process.env["R2_BUCKET"];

/** True when uploads can actually work. Every caller checks this first. */
export function isStorageConfigured(): boolean {
  return Boolean(accountId && accessKeyId && secretAccessKey && bucket);
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!isStorageConfigured()) throw new Error("errors.uploadsUnavailable");
  if (client) return client;

  client = new S3Client({
    // R2 is S3-compatible but has no regions; "auto" is what it expects.
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
    },
  });
  return client;
}

export type AttachmentType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

function isAllowedType(contentType: string): contentType is AttachmentType {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(contentType);
}

const EXTENSIONS: Record<AttachmentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

/**
 * A presigned PUT for one homework attachment.
 *
 * The content type and the exact byte length are **signed**, so the browser
 * cannot upload a 900MB file or an executable against a URL issued for a
 * 200KB PDF: changing either invalidates the signature. Checking the size in
 * the client alone would be advisory, and this is a public-facing write.
 */
export async function presignAttachmentUpload(options: {
  classSubjectId: string;
  contentType: string;
  contentLength: number;
}): Promise<{ url: string; key: string }> {
  if (!isAllowedType(options.contentType)) throw new Error("errors.attachmentType");
  if (!Number.isInteger(options.contentLength) || options.contentLength <= 0) {
    throw new Error("errors.attachmentEmpty");
  }
  if (options.contentLength > MAX_ATTACHMENT_BYTES) throw new Error("errors.attachmentTooLarge");

  // Generated here, never derived from the uploaded filename.
  const key = `homework/${options.classSubjectId}/${randomUUID()}.${EXTENSIONS[options.contentType]}`;

  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.contentLength,
    }),
    {
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    }
  );

  return { url, key };
}

/** A short-lived GET for one object. Minutes, not hours — see rule 1 above. */
export async function presignAttachmentDownload(key: string): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRESIGNED_URL_TTL_SECONDS,
  });
}
