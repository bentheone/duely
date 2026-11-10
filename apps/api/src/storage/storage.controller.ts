import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import {
  ALLOWED_MIME,
  DriveSessionSchema,
  FileSignSchema,
  MAX_FILE_BYTES,
  StoragePutSchema,
  uuidv7,
  type StorageInfo,
} from '@duely/shared';
import { CurrentUser, ZodPipe, type AuthedUser } from '../common/http';
import { decrypt, encrypt, sha1 } from '../common/crypto';
import { config } from '../config';
import { FileAttachmentModel, IntegrationAccountModel, StorageConfigModel, UserModel } from '../db/models';
import { GoogleSyncService } from '../google/google-sync.service';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

interface CloudinaryCreds {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
}

/** Cloudinary request signature: sha1 of sorted k=v pairs + secret. */
export function cloudinarySignature(params: Record<string, string | number>, secret: string): string {
  const s = Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] != null)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return sha1(s + secret);
}

/** Signed delivery URL component (s--XXXXXXXX--). */
export function cloudinaryDeliverySig(toSign: string, secret: string): string {
  return createHash('sha1').update(toSign + secret).digest('base64url').slice(0, 8);
}

export function validateFile(mime: string, size: number): void {
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) throw new BadRequestException(`File type not allowed: ${mime}`);
  if (size > MAX_FILE_BYTES) throw new BadRequestException('File is larger than 25 MB');
}

@Controller()
export class StorageController {
  constructor(private readonly google: GoogleSyncService) {}

  private async isOwner(userId: string): Promise<boolean> {
    const owner = config().ownerEmail;
    if (!owner) return false;
    const u = await UserModel.findById(userId).lean();
    return u?.email.toLowerCase() === owner;
  }

  private async creds(userId: string): Promise<CloudinaryCreds | null> {
    const sc = await StorageConfigModel.findOne({ userId }).lean();
    const owner = config().ownerCloudinary;
    if (sc?.provider === 'cloudinary' && sc.cloudinary && !sc.useOwner) {
      return {
        cloudName: sc.cloudinary.cloudName,
        apiKey: sc.cloudinary.apiKey,
        apiSecret: decrypt(sc.cloudinary.apiSecretEnc),
        folder: sc.cloudinary.folder || 'duely',
      };
    }
    if ((sc?.useOwner || !sc) && owner && (await this.isOwner(userId))) return { ...owner, folder: 'duely' };
    return null;
  }

  @Get('storage')
  async get(@CurrentUser() u: AuthedUser): Promise<StorageInfo> {
    const sc = await StorageConfigModel.findOne({ userId: u.userId }).lean();
    const acc = await IntegrationAccountModel.findOne({ userId: u.userId }).lean();
    const owner = await this.isOwner(u.userId);
    const usingOwner = (!sc || !!sc.useOwner) && owner && !!config().ownerCloudinary && sc?.provider !== 'gdrive';
    return {
      provider: sc?.provider ?? (usingOwner ? 'cloudinary' : null),
      usingOwnerCloudinary: usingOwner,
      cloudName: usingOwner ? config().ownerCloudinary!.cloudName : (sc?.cloudinary?.cloudName ?? undefined),
      pdfDeliveryConfirmed: usingOwner ? true : !!sc?.pdfDeliveryConfirmed,
      hasDriveScope: !!acc?.scopes.includes(DRIVE_SCOPE),
    };
  }

  /** PUT /storage — validates Cloudinary creds with a signed ping before saving (§12). */
  @Put('storage')
  async put(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(StoragePutSchema)) b: z.infer<typeof StoragePutSchema>) {
    const existing = await StorageConfigModel.findOne({ userId: u.userId }).lean();
    const id = existing?._id ?? uuidv7();
    if (b.provider === 'gdrive') {
      const acc = await IntegrationAccountModel.findOne({ userId: u.userId }).lean();
      if (!acc?.scopes.includes(DRIVE_SCOPE)) throw new BadRequestException('Grant Google Drive access first');
      await StorageConfigModel.updateOne(
        { userId: u.userId },
        { $set: { _id: id, provider: 'gdrive', useOwner: false, cloudinary: null, pdfDeliveryConfirmed: true } },
        { upsert: true },
      );
      return this.get(u);
    }
    if (b.useOwner) {
      if (!(await this.isOwner(u.userId)) || !config().ownerCloudinary) throw new ForbiddenException();
      await StorageConfigModel.updateOne(
        { userId: u.userId },
        { $set: { _id: id, provider: 'cloudinary', useOwner: true, cloudinary: null, pdfDeliveryConfirmed: true } },
        { upsert: true },
      );
      return this.get(u);
    }
    if (!b.cloudinary) throw new BadRequestException('Cloudinary credentials required');
    const { cloudName, apiKey, apiSecret, folder } = b.cloudinary;
    const ping = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/ping`, {
      headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` },
    }).catch(() => null);
    if (!ping || !ping.ok) throw new BadRequestException('Cloudinary rejected these credentials');
    await StorageConfigModel.updateOne(
      { userId: u.userId },
      {
        $set: {
          _id: id,
          provider: 'cloudinary',
          useOwner: false,
          cloudinary: { cloudName, apiKey, apiSecretEnc: encrypt(apiSecret), folder: folder || 'duely' },
          pdfDeliveryConfirmed: b.pdfDeliveryConfirmed,
        },
      },
      { upsert: true },
    );
    return this.get(u);
  }

  /** §9.2 Cloudinary: sign a direct upload; the secret never leaves the server. */
  @Post('files/sign')
  @HttpCode(200)
  async sign(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(FileSignSchema)) b: z.infer<typeof FileSignSchema>) {
    validateFile(b.mime, b.size);
    const c = await this.creds(u.userId);
    if (!c) throw new BadRequestException('Cloudinary is not configured');
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = [c.folder, ...(b.folder ? b.folder.split('/') : [])]
      .map((p) => p.replace(/[^\w\- ]+/g, '').trim())
      .filter(Boolean)
      .join('/');
    const publicId = b.resourceType === 'raw' ? `${b.attachmentId}${MIME_EXT[b.mime] ?? ''}` : b.attachmentId;
    const params = { folder, public_id: publicId, timestamp };
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${c.cloudName}/${b.resourceType}/upload`,
      cloudName: c.cloudName,
      apiKey: c.apiKey,
      timestamp,
      folder,
      publicId,
      resourceType: b.resourceType,
      signature: cloudinarySignature(params, c.apiSecret),
    };
  }

  /** §9.2 Google Drive: resumable session in the user's "Duely" folder. */
  @Post('files/drive-session')
  @HttpCode(200)
  async driveSession(@CurrentUser() u: AuthedUser, @Body(new ZodPipe(DriveSessionSchema)) b: z.infer<typeof DriveSessionSchema>) {
    validateFile(b.mime, b.size);
    const acc = await this.google.account(u.userId);
    if (!acc?.refreshTokenEnc || !acc.scopes.includes(DRIVE_SCOPE)) throw new BadRequestException('Google Drive not granted');
    const api = this.google.api(acc);
    let folderId = acc.driveFolderId;
    if (!folderId) {
      folderId = await api.createDriveFolder('Duely');
      await IntegrationAccountModel.updateOne({ _id: acc._id }, { $set: { driveFolderId: folderId } });
    }
    const uploadUrl = await api.createResumableUpload(folderId, b.name, b.mime, b.size);
    return { uploadUrl };
  }

  /** Delivery URL for a stored file (signed for Cloudinary raw; bearer header for Drive). */
  @Get('files/:id/url')
  async url(@CurrentUser() u: AuthedUser, @Param('id') id: string) {
    const f = await FileAttachmentModel.findOne({ _id: id, userId: u.userId, deletedAt: null }).lean();
    if (!f || !f.remoteId) throw new NotFoundException();
    if (f.provider === 'gdrive') {
      const acc = await this.google.account(u.userId);
      if (!acc) throw new NotFoundException();
      const token = await this.google.api(acc).accessToken();
      return {
        url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(f.remoteId))}?alt=media`,
        headers: { Authorization: `Bearer ${token}` },
      };
    }
    const c = await this.creds(u.userId);
    if (!c) throw new BadRequestException('Cloudinary is not configured');
    const type = String(f.mime).startsWith('image/') ? 'image' : 'raw';
    const publicId = String(f.remoteId);
    const sig = cloudinaryDeliverySig(publicId, c.apiSecret);
    return { url: `https://res.cloudinary.com/${c.cloudName}/${type}/upload/s--${sig}--/${publicId}`, headers: {} };
  }
}
