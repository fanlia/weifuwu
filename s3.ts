/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Middleware } from './types.ts'
import type { Readable } from 'node:stream'

// Augment Context with s3 property
declare module './types.ts' {
  interface Context {
    s3: S3Module
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface S3Options {
  /** S3 bucket name. Required. */
  bucket: string
  /** AWS region. Default: 'us-east-1'. */
  region?: string
  /** Custom endpoint (MinIO, Cloudflare R2, Backblaze B2, etc.). */
  endpoint?: string
  /** Force path-style addressing (required for MinIO, some private clouds). */
  forcePathStyle?: boolean
  /** AWS credentials. Falls back to AWS env vars / IAM role if omitted. */
  credentials?: {
    accessKeyId: string
    secretAccessKey: string
  }
  /**
   * Base public URL for unsigned URLs.
   * When set, `s3.url(key, { expiresIn: 0 })` returns a public URL.
   * Example: 'https://cdn.example.com' or 'https://pub-xxx.r2.dev'
   */
  publicUrl?: string
}

export interface S3PutOptions {
  /** Content-Type of the object. */
  contentType?: string
  /** Cache-Control header value. */
  cacheControl?: string
  /** User-defined metadata (prefix x-amz-meta-). */
  metadata?: Record<string, string>
}

export interface S3UrlOptions {
  /**
   * Signed URL expiry in seconds.
   * Default: 3600 (1 hour).
   * Set to 0 to return an unsigned public URL (requires `publicUrl` option).
   */
  expiresIn?: number
}

export interface S3Module {
  /** Upload a file. Returns the key. */
  put(key: string, body: S3Body, options?: S3PutOptions): Promise<string>
  /** Download a file. Returns the body as Buffer, or null if not found. */
  get(key: string): Promise<Buffer | null>
  /** Delete a file. */
  delete(key: string): Promise<void>
  /** Check if a file exists. */
  exists(key: string): Promise<boolean>
  /**
   * Generate a URL for an object.
   * - If `expiresIn` > 0 (default): returns a signed URL with that expiry.
   * - If `expiresIn` === 0 and `publicUrl` is configured: returns an unsigned
   *   public URL. Throws if `publicUrl` is not set.
   */
  url(key: string, options?: S3UrlOptions): Promise<string>
  /** List object keys under a prefix. */
  list(prefix?: string): Promise<string[]>
  /** The underlying S3Client (for advanced usage). */
  client: S3Client
}

export type S3Body = Buffer | Uint8Array | string | ReadableStream | Readable

// ── S3 factory ──────────────────────────────────────────────────────────────

export function s3(options: S3Options): S3Module & Middleware {
  const { bucket, publicUrl } = options

  const client = new S3Client({
    region: options.region ?? 'us-east-1',
    endpoint: options.endpoint,
    forcePathStyle: options.forcePathStyle,
    credentials: options.credentials,
  })

  async function put(key: string, body: S3Body, putOpts?: S3PutOptions): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body as any,
      ContentType: putOpts?.contentType,
      CacheControl: putOpts?.cacheControl ?? 'public, max-age=31536000',
      Metadata: putOpts?.metadata,
    })
    await client.send(command)
    return key
  }

  async function get(key: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({ Bucket: bucket, Key: key })
      const response = await client.send(command)
      const body = response.Body
      if (!body) return null
      return Buffer.from(await body.transformToByteArray())
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null
      throw err
    }
  }

  async function del(key: string): Promise<void> {
    const command = new DeleteObjectCommand({ Bucket: bucket, Key: key })
    await client.send(command)
  }

  async function exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({ Bucket: bucket, Key: key })
      await client.send(command)
      return true
    } catch (err: any) {
      if (err.name === 'NotFound' || err.name === 'NoSuchKey') return false
      throw err
    }
  }

  async function url(key: string, urlOpts?: S3UrlOptions): Promise<string> {
    const expiresIn = urlOpts?.expiresIn ?? 3600

    if (expiresIn === 0) {
      if (!publicUrl) {
        throw new Error(
          's3.url() with expiresIn=0 requires publicUrl in S3Options. ' +
            'Set publicUrl to enable unsigned public URLs.',
        )
      }
      const base = publicUrl.replace(/\/+$/, '')
      const objectKey = key.startsWith('/') ? key.slice(1) : key
      return `${base}/${objectKey}`
    }

    const command = new GetObjectCommand({ Bucket: bucket, Key: key })
    return getSignedUrl(client, command, { expiresIn })
  }

  async function list(prefix?: string): Promise<string[]> {
    const keys: string[] = []
    let continuationToken: string | undefined

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
      const response = await client.send(command)
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) keys.push(obj.Key)
        }
      }
      continuationToken = response.NextContinuationToken
    } while (continuationToken)

    return keys
  }

  // Build the module object with all methods
  const mod: S3Module = {
    put,
    get,
    delete: del,
    exists,
    url,
    list,
    client,
  }

  // Return as middleware — injects ctx.s3
  const mw = ((req, ctx, next) => {
    ;(ctx as any).s3 = mod
    return next(req, ctx)
  }) as Middleware & S3Module

  // Copy all S3Module methods onto the middleware
  mw.put = put
  mw.get = get
  mw.delete = del
  mw.exists = exists
  mw.url = url
  mw.list = list
  mw.client = client
  ;(mw as any).__meta = { injects: ['s3'], depends: [] }
  return mw
}
