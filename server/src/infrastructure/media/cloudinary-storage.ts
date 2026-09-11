/**
 * Cloudinary adapter for the MediaStorage port.
 *
 * The application never imports this file: it receives the port. Media binaries
 * live in Cloudinary; PostgreSQL stores only the reference and metadata.
 *
 * Implemented against Cloudinary's REST upload endpoint with a signed request,
 * so there is no SDK dependency and no vendor types leaking inward.
 */
import { createHash } from 'node:crypto';
import type { MediaStorage, StoredMedia } from '../../shared/application/ports.ts';
import { AppException } from '../../core/errors.ts';

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export class CloudinaryMediaStorage implements MediaStorage {
  constructor(private readonly config: CloudinaryConfig) {}

  async upload(input: {
    bytes: Buffer;
    contentType: string;
    folder: string;
    fileName: string;
  }): Promise<StoredMedia> {
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `${input.folder}/${input.fileName}`;
    const signature = this.sign({ folder: input.folder, public_id: publicId, timestamp: String(timestamp) });

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(input.bytes)], { type: input.contentType }));
    form.append('api_key', this.config.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('public_id', publicId);
    form.append('folder', input.folder);
    form.append('signature', signature);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${this.config.cloudName}/auto/upload`,
      { method: 'POST', body: form },
    );
    if (!res.ok) {
      throw new AppException('UNKNOWN', 'Upload failed', await res.text());
    }
    const body = (await res.json()) as {
      public_id: string; bytes: number; width?: number; height?: number; resource_type: string; format: string;
    };
    return {
      reference: body.public_id,
      contentType: `${body.resource_type}/${body.format}`,
      byteSize: body.bytes,
      width: body.width,
      height: body.height,
    };
  }

  urlFor(reference: string, options?: { width?: number; height?: number }): string {
    const transform = [
      options?.width ? `w_${options.width}` : null,
      options?.height ? `h_${options.height}` : null,
      'c_fill',
      'f_auto',
      'q_auto',
    ]
      .filter(Boolean)
      .join(',');
    return `https://res.cloudinary.com/${this.config.cloudName}/image/upload/${transform}/${reference}`;
  }

  async delete(reference: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign({ public_id: reference, timestamp: String(timestamp) });
    const form = new FormData();
    form.append('public_id', reference);
    form.append('api_key', this.config.apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/destroy`,
      { method: 'POST', body: form },
    );
    if (!res.ok) throw new AppException('UNKNOWN', 'Delete failed', await res.text());
  }

  private sign(params: Record<string, string>): string {
    const canonical = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return createHash('sha1').update(canonical + this.config.apiSecret).digest('hex');
  }
}

/** Used until Cloudinary credentials are configured, and in tests. */
export class InMemoryMediaStorage implements MediaStorage {
  private readonly items = new Map<string, StoredMedia>();

  async upload(input: { bytes: Buffer; contentType: string; folder: string; fileName: string }) {
    const reference = `${input.folder}/${input.fileName}`;
    const stored: StoredMedia = {
      reference,
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
    };
    this.items.set(reference, stored);
    return stored;
  }

  urlFor(reference: string): string {
    return `memory://${reference}`;
  }

  async delete(reference: string): Promise<void> {
    this.items.delete(reference);
  }
}
