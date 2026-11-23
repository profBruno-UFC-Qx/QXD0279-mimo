import { api } from './api'

interface UploadResponse {
  urls: string[]
}

export class IncompletePhotoUploadError extends Error {}

export const uploadService = {
  async uploadPhotos(files: File[]): Promise<string[]> {
    const form = new FormData()
    for (const file of files) form.append('photos', file)

    const { data } = await api.post<UploadResponse>('/uploads', form, {
      headers: { 'Content-Type': null },
    })
    if (!Array.isArray(data.urls)) {
      throw new Error('Resposta de upload inválida.')
    }
    if (data.urls.length !== files.length) {
      throw new IncompletePhotoUploadError('Resposta de upload não contém uma URL por foto.')
    }
    return data.urls
  },
}
