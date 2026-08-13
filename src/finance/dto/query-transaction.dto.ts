import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TransactionCategory, TransactionType } from '../../generated/prisma/enums';

export class QueryTransactionDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'mes deve ser um número inteiro.' })
  @Min(1, { message: 'mes deve estar entre 1 e 12.' })
  @Max(12, { message: 'mes deve estar entre 1 e 12.' })
  mes?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: 'ano deve ser um número inteiro.' })
  @Min(2000)
  ano?: number;

  @IsOptional()
  @IsEnum(TransactionType, { message: 'tipo inválido.' })
  tipo?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionCategory, { message: 'categoria inválida.' })
  categoria?: TransactionCategory;

  @IsOptional()
  @IsUUID('4', { message: 'membroId inválido.' })
  membroId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 20 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}