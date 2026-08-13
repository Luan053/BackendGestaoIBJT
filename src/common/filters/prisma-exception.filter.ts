import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    switch (exception.code) {
      case 'P2002':
        response.status(409).json({
          statusCode: 409,
          message: 'Registro duplicado: um campo único já está em uso.',
          error: 'Conflict',
          meta: exception.meta,
        });
        break;
      case 'P2025':
        response.status(404).json({
          statusCode: 404,
          message: 'Registro não encontrado.',
          error: 'Not Found',
        });
        break;
      case 'P2003':
        response.status(400).json({
          statusCode: 400,
          message: 'Operação inválida: registro referenciado não existe.',
          error: 'Bad Request',
          meta: exception.meta,
        });
        break;
      default:
        response.status(500).json({
          statusCode: 500,
          message: 'Erro interno de banco de dados.',
          error: 'Internal Server Error',
          code: exception.code,
        });
    }
  }
}
