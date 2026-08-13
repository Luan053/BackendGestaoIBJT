import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('whatsapp')
@Controller('whatsapp')
export class WhatsappController {
  /**
   * Rota reservada para a futura integração com WhatsApp.
   * A validação do webhook (verificação de assinatura do provider) será
   * adicionada junto com a implementação real (WhatsApp Cloud API ou
   * Twilio/Z-API).
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @ApiOperation({ summary: 'Stub do webhook do WhatsApp (fase futura)' })
  webhook(@Body() _payload: Record<string, unknown>) {
    throw new NotImplementedException(
      'Integração com WhatsApp ainda não implementada.',
    );
  }
}