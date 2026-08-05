/** error ที่แปลงเป็น HTTP response ได้ตรง ๆ — อย่างอื่นที่หลุดมาถือเป็น 500 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  static notFound(code: string, message: string): ApiError {
    return new ApiError(404, code, message)
  }

  static badRequest(code: string, message: string): ApiError {
    return new ApiError(400, code, message)
  }

  /** content ที่ agent เขียนมาผิดรูป — 422 เพราะ request ถูก แต่ของบนดิสก์พัง */
  static invalidContent(message: string): ApiError {
    return new ApiError(422, 'invalid_content', message)
  }
}
