import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MemberStatus } from '../../generated/prisma/enums';

const CPF_REGEX = /^\d{11}$/;

export class CreateMemberDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter no mínimo 2 caracteres.' })
  @MaxLength(120)
  nome: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido.' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s()-]{8,20}$/, {
    message: 'Telefone inválido.',
  })
  telefone?: string;

  @IsOptional()
  @IsString()
  @Matches(CPF_REGEX, { message: 'CPF deve conter 11 dígitos.' })
  cpf?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Data de nascimento inválida.' })
  dataNascimento?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'Data de batismo inválida.' })
  dataBatismo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fotoUrl?: string;

  @IsOptional()
  @IsEnum(MemberStatus, { message: 'Status inválido.' })
  status?: MemberStatus;

  @IsOptional()
  @IsUUID('4', { message: 'cellId inválido.' })
  cellId?: string;

  @IsOptional()
  @IsBoolean()
  consentimentoLGPD?: boolean;
}