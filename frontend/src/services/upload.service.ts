import { api } from './api'

interface UploadResponse {
  urls: string[]
}

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
    return data.urls
  },
}
