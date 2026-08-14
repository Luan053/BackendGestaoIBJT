/**
 * Interpreta uma data pura (YYYY-MM-DD) como meia-noite no fuso do servidor.
 * Evita o deslocamento de -3h/-4h do UTC que faz datas de dia 1 caírem no
 * mês anterior nos filtros mensais. Valores com hora (ISO completo) passam
 * direto.
 */
export function toLocalDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  if (value.includes('T')) {
    return new Date(value);
  }
  return new Date(`${value}T00:00:00`);
}