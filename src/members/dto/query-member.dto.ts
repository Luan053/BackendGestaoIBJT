import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { MemberStatus } from '../../generated/prisma/enums';

export class QueryMemberDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsEnum(MemberStatus, { message: 'Status inválido.' })
  status?: MemberStatus;

  @IsOptional()
  @IsUUID('4', { message: 'cellId inválido.' })
  cellId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt({ message: 'page deve ser um número inteiro.' })
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 10 : Number(value)))
  @IsInt({ message: 'limit deve ser um número inteiro.' })
  @Min(1)
  @Max(100)
  limit?: number = 10;
}