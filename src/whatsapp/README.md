# Módulo WhatsApp — (stub)

> **Status: NÃO IMPLEMENTADO.** Este módulo apenas reserva a estrutura para a
> fase futura de integração com WhatsApp.

## O que já existe

- `POST /whatsapp/webhook` → retorna `501 Not Implemented`, apenas para
  reservar a rota no gateway/frontend.
- Tabelas `Conversation` e `Message` no schema Prisma (ver
  `prisma/schema.prisma`), prontas para receber o histórico de conversas:
  - `Conversation` está vinculada a `Member` (via `memberId`) e guarda o
    `telefone` usado na conversa.
  - `Message` guarda remetente, conteúdo, timestamp (`sentAt`) e flag `lida`.

## Próximos passos (fase 2)

1. Escolher o provider:
   - **WhatsApp Cloud API** (oficial, Meta) — mensagens por telefone comercial;
   - **Twilio WhatsApp** ou **Z-API** — alternativas com SDK simples.
2. Configurar as variáveis de ambiente (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`,
   `WHATSAPP_VERIFY_TOKEN`, ...) e adicioná-las ao `.env.example`.
3. Implementar o webhook:
   - Verificação de assinatura/verificação (GET + POST) exigida pelo provider;
   - Persistir mensagens recebidas em `Message` (criando `Conversation` por
     membro/telefone);
   - Disparar respostas automáticas (ex: aviso de culto, confirmação de
     dízimo) com templates pré-aprovados.
4. Criar `WhatsappService` e mover o `WhatsappController` do stub para a
   implementação real.
