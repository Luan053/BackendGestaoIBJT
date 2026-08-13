import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
} from 'class-validator';
import { TransactionCategory, TransactionType } from '../../generated/prisma/enums';

export class CreateTransactionDto {
  @IsEnum(TransactionType, { message: 'tipo deve ser ENTRADA ou SAIDA.' })
  tipo: TransactionType;

  @IsEnum(TransactionCategory, { message: 'categoria inválida.' })
  categoria: TransactionCategory;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'valor inválido.' })
  @IsPositive({ message: 'O valor deve ser sempre positivo (o tipo define entrada/saída).' })
  @Max(99_999_999.99, { message: 'Valor acima do limite permitido.' })
  valor: number;

  @IsOptional()
  @IsISO8601({}, { message: 'Data inválida.' })
  data?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descricao?: string;

  @IsOptional()
  @IsUUID('4', { message: 'membroId inválido.' })
  membroId?: string;
}