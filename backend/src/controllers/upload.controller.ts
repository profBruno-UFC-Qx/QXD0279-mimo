import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authenticate } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorization.js';
import { HttpError } from '../middlewares/http-error.js';
import { UserRole } from '../models/enums.js';
import type { ApiResponse } from '../shared/api-response.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 5;
const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:3000';

const uploadsDir = fileURLToPath(new URL('../../data/uploads/', import.meta.url));
const mediaFilenamePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

interface ImageFormat {
  mime: string;
  extension: string;
  matches: (buffer: Buffer) => boolean;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const imageFormats: ImageFormat[] = [
  {
    mime: 'image/jpeg',
    extension: 'jpg',
    matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    mime: 'image/png',
    extension: 'png',
    matches: (buffer) => buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
  },
  {
    mime: 'image/webp',
    extension: 'webp',
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

function uploadFiles(req: Request, res: Response, next: NextFunction): void {
  upload.array('photos', MAX_FILES)(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new HttpError(413, 'Cada imagem deve ter no máximo 5 MB.'));
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new HttpError(400, 'Envie no máximo 5 imagens no campo photos.'));
      return;
    }
    next(error);
  });
}

function resolvePublicBaseUrl(): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (!configured) return DEFAULT_PUBLIC_BASE_URL;

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
  } catch {
    throw new HttpError(500, 'Configuração interna de URL pública inválida.');
  }

  return configured.replace(/\/+$/, '');
}

export const uploadRouter = Router();

uploadRouter.post(
  '/',
  /* #swagger.tags = ['Uploads'] */
  /* #swagger.summary = 'Enviar fotos de itens encontrados' */
  /* #swagger.security = [{ "bearerAuth": [] }] */
  /* #swagger.description = 'Recebe até 5 imagens JPEG, PNG ou WebP de até 5 MB no campo multipart photos. Requer ADMIN/SUPERADMIN.' */
  /* #swagger.responses[201] = { description: 'URLs públicas das imagens salvas', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[400] = { description: 'Arquivos ausentes, inválidos ou em quantidade acima do limite', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[401] = { description: 'Não autenticado', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[403] = { description: 'Acesso restrito a administradores', schema: { $ref: '#/definitions/ApiResponse' } } */
  /* #swagger.responses[413] = { description: 'Imagem acima de 5 MB', schema: { $ref: '#/definitions/ApiResponse' } } */
  authenticate,
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  uploadFiles,
  async (req: Request, res: Response): Promise<void> => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      throw new HttpError(400, 'Envie ao menos uma imagem no campo photos.');
    }

    const publicBaseUrl = resolvePublicBaseUrl();

    const validated = files.map((file) => {
      const format = imageFormats.find(
        (candidate) => candidate.mime === file.mimetype && candidate.matches(file.buffer),
      );
      if (!format) {
        throw new HttpError(400, 'As imagens devem ser JPEG, PNG ou WebP válidos.');
      }
      return { buffer: file.buffer, filename: `${randomUUID()}.${format.extension}` };
    });

    await fs.mkdir(uploadsDir, { recursive: true });

    const written: string[] = [];
    try {
      for (const photo of validated) {
        const target = path.join(uploadsDir, photo.filename);
        await fs.writeFile(target, photo.buffer, { flag: 'wx' });
        written.push(target);
      }
    } catch {
      await Promise.all(written.map((file) => fs.unlink(file).catch(() => undefined)));
      throw new HttpError(500, 'Não foi possível salvar as imagens.');
    }

    const urls = validated.map(
      (photo) => `${publicBaseUrl}/api/v1/media/${photo.filename}`,
    );
    const response: ApiResponse<{ urls: string[] }> = { success: true, data: { urls } };
    res.status(201).json(response);
  },
);

export const mediaRouter = Router();

mediaRouter.get('/:filename', async (req: Request<{ filename: string }>, res: Response): Promise<void> => {
  const filename = req.params.filename;
  if (!mediaFilenamePattern.test(filename)) {
    throw new HttpError(404, 'Imagem não encontrada.');
  }

  const filePath = path.join(uploadsDir, filename);
  try {
    await fs.access(filePath);
  } catch {
    throw new HttpError(404, 'Imagem não encontrada.');
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.type(path.extname(filename));
  res.sendFile(filePath);
});
