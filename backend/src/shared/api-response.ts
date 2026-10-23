export interface ApiError {
  code: number;
  details: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T | null;
  error?: ApiError | null;
}

