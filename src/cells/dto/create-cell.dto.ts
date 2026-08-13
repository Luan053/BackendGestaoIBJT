import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCellDto {
  @IsString()
  @MinLength(2, { message: 'O nome deve ter no mínimo 2 caracteres.' })
  @MaxLength(120)
  nome: string;

  @IsString()
  @MaxLength(20)
  diaDaSemana: string;

  @IsString()
  @MaxLength(10)
  horario: string;

  @IsString()
  @MaxLength(255)
  local: string;

  @IsOptional()
  @IsUUID('4', { message: 'liderId inválido.' })
  liderId?: string;
}