import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : { message: 'Internal server error' };

    const payload = typeof exceptionResponse === 'string' ? { message: exceptionResponse } : exceptionResponse;

    response.status(status).json({
      code: (payload as any)?.code || 'HTTP_ERROR',
      message: (payload as any)?.message || 'Request failed',
      details: (payload as any)?.details || null,
      timestamp: new Date().toISOString(),
      path: request.originalUrl
    });
  }
}
