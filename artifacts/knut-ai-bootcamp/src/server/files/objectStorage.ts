import { randomUUID } from 'node:crypto';
import { Storage } from '@google-cloud/storage';
import type { Readable } from 'node:stream';

const SIDECAR_ENDPOINT = 'http://127.0.0.1:1106';
const OBJECTS_PREFIX = '/objects/';

const storageClient = new Storage({
  credentials: {
    audience: 'replit',
    subject_token_type: 'access_token',
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: 'external_account',
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: 'json', subject_token_field_name: 'access_token' },
    },
    universe_domain: 'googleapis.com',
  },
  projectId: '',
});

export interface AppStorageFile {
  exists(): Promise<[boolean]>;
  download(): Promise<[Buffer]>;
  getMetadata(): Promise<[Record<string, unknown>]>;
  createReadStream(): Readable;
  delete(options?: { ignoreNotFound?: boolean }): Promise<unknown>;
}

export interface AppStorageClient {
  bucket(bucketName: string): { file(objectName: string): AppStorageFile };
}

export interface AppObjectStorageOptions {
  privateObjectDirectory?: () => string;
  sidecarEndpoint?: string;
  storageClient?: AppStorageClient;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const parts = (path.startsWith('/') ? path : `/${path}`).split('/');
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join('/')) {
    throw new Error('Invalid private object path.');
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join('/') };
}

async function signPutURL(bucketName: string, objectName: string, sidecarEndpoint: string): Promise<string> {
  const response = await fetch(`${sidecarEndpoint}/object-storage/signed-object-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: 'PUT',
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error('Could not create a private upload URL.');
  const value: unknown = await response.json();
  if (!value || typeof value !== 'object' || !('signed_url' in value) || typeof value.signed_url !== 'string') {
    throw new Error('The private upload URL response was invalid.');
  }
  return value.signed_url;
}

export interface NewPrivateUpload {
  uploadUrl: string;
  objectPath: string;
  storageKey: string;
}

/** Private App Storage access is always mediated by the application's file permission checks. */
export class AppObjectStorage {
  private readonly objectDirectory: () => string;
  private readonly sidecarEndpoint: string;
  private readonly client: AppStorageClient;

  constructor(options: AppObjectStorageOptions = {}) {
    this.objectDirectory = options.privateObjectDirectory ?? (() => process.env.PRIVATE_OBJECT_DIR ?? '');
    this.sidecarEndpoint = options.sidecarEndpoint ?? SIDECAR_ENDPOINT;
    this.client = options.storageClient ?? storageClient as unknown as AppStorageClient;
  }

  private privateDirectory(): string {
    const configured = this.objectDirectory().trim();
    if (!configured) throw new Error('Private App Storage is not configured.');
    return configured.replace(/\/+$/, '');
  }

  async createUpload(): Promise<NewPrivateUpload> {
    const objectId = randomUUID();
    const storageKey = `uploads/${objectId}`;
    const fullPath = `${this.privateDirectory()}/${storageKey}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const uploadUrl = await signPutURL(bucketName, objectName, this.sidecarEndpoint);
    return { uploadUrl, storageKey, objectPath: `${OBJECTS_PREFIX}${storageKey}` };
  }

  async getFile(storageKey: string): Promise<AppStorageFile> {
    if (!/^uploads\/[0-9a-f-]{36}$/.test(storageKey)) throw new Error('Invalid private object key.');
    const { bucketName, objectName } = parseObjectPath(`${this.privateDirectory()}/${storageKey}`);
    const file = this.client.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new Error('Private object was not found.');
    return file;
  }

  async download(storageKey: string): Promise<Buffer> {
    const file = await this.getFile(storageKey);
    const [bytes] = await file.download();
    return bytes;
  }

  async remove(storageKey: string): Promise<void> {
    if (!/^uploads\/[0-9a-f-]{36}$/.test(storageKey)) throw new Error('Invalid private object key.');
    const { bucketName, objectName } = parseObjectPath(`${this.privateDirectory()}/${storageKey}`);
    const file = this.client.bucket(bucketName).file(objectName);
    await file.delete({ ignoreNotFound: true });
  }
}
