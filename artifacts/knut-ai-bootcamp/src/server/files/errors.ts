export class FileServiceError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, message: string) {
    super(message);
    this.name = 'FileServiceError';
  }
}

export function invalidFile(message = '파일 내용과 형식을 확인해 주세요.'): never {
  throw new FileServiceError('INVALID_FILE', 415, message);
}
