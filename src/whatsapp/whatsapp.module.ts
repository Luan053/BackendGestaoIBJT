import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';

/**
 * Módulo WhatsApp — STUB.
 *
 * Fase futura: implementar aqui a integração com WhatsApp Cloud API
 * (ou provider tipo Twilio/Z-API). As tabelas `Conversation` e `Message`
 * já existem no schema Prisma e estão prontas para receber o histórico.
 */
@Module({
  controllers: [WhatsappController],
})
export class WhatsappModule {}
