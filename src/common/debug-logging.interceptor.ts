import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { isDebug } from '../config';

@Injectable()
export class DebugLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isDebug) return next.handle();
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url, body } = req;
    const safeBody =
      body && typeof body === 'object'
        ? { ...body, password: body.password ? '[REDACTED]' : undefined }
        : body;
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        console.log(`[DEBUG] ${method} ${url} ${JSON.stringify(safeBody)} -> ${ms}ms`);
      }),
    );
  }
}
