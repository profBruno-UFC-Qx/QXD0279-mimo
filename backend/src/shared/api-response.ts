export interface ApiError {
  code: number;
  details: string;
}

export interface ApiSuccess<T> {
  success: true;
  message?: string;
  data: T;
  error?: null;
}

export interface ApiFailure {
  success: false;
  message?: string;
  data: null;
  error: ApiError;
}

// Permite que a resposta da API seja do tipo ApiSuccess ou ApiFailure, dependendo do resultado da operação.
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure; 