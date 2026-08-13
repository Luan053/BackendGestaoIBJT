import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty({ message: 'O refresh token é obrigatório.' })
  refreshToken: string;
}