import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Browser } from 'puppeteer';
import { TransactionCategory } from '../../generated/prisma/enums';

export interface PdfReportData {
  periodo: string;
  ano: number;
  mes: number;
  saldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  saldoFinal: number;
  porCategoria: {
    categoria: TransactionCategory;
    total: number;
    transacoes: {
      data: Date;
      tipo: 'ENTRADA' | 'SAIDA';
      descricao: string | null;
      membro: string | null;
      valor: number;
    }[];
  }[];
  geradoEm: Date;
}

const CATEGORIA_LABEL: Record<TransactionCategory, string> = {
  DIZIMO: 'Dízimos',
  OFERTA: 'Ofertas',
  EVENTO: 'Eventos',
  CONTAS: 'Contas',
  MANUTENCAO: 'Manutenção',
  OUTROS: 'Outros',
};

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR');
}

@Injectable()
export class ReportPdfService implements OnModuleDestroy {
  private browserPromise: Promise<Browser> | null = null;

  /**
   * puppeteer é ESM-only; o dynamic import via Function permite usá-lo tanto
   * no runtime CommonJS do Nest quanto no ambiente de testes do Jest.
   */
  private async loadPuppeteer() {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const module = (await Function(
      'return import("puppeteer")',
    )()) as typeof import('puppeteer');
    return module;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      const puppeteer = await this.loadPuppeteer();
      this.browserPromise = puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browserPromise;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browserPromise) {
      const browser = await this.browserPromise;
      await browser.close();
      this.browserPromise = null;
    }
  }

  async generate(data: PdfReportData): Promise<Buffer> {
    const html = this.buildHtml(data);
    const browser = await this.getBrowser();

    let page;
    try {
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      return await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      });
    } finally {
      // fecha apenas a página; o browser fica em cache para o próximo relatório
      await page?.close().catch(() => undefined);
    }
  }

  private buildHtml(data: PdfReportData): string {
    const linhasCategorias = data.porCategoria
      .map(
        (grupo) => `
        <tr class="grupo">
          <td colspan="3">${CATEGORIA_LABEL[grupo.categoria] ?? grupo.categoria}</td>
          <td class="num">${formatBRL(grupo.total)}</td>
        </tr>
        ${grupo.transacoes
          .map(
            (t) => `
        <tr>
          <td>${formatDate(t.data)}</td>
          <td>${t.tipo === 'ENTRADA' ? 'Entrada' : 'Saída'}</td>
          <td>${t.descricao ?? (t.membro ? `Membro: ${t.membro}` : '—')}</td>
          <td class="num">${formatBRL(t.valor)}</td>
        </tr>`,
          )
          .join('')}`,
      )
      .join('');

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .subtitulo { color: #6b7280; margin-bottom: 16px; }
  .resumo { display: flex; gap: 8px; margin-bottom: 16px; }
  .card { flex: 1; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; }
  .card .label { font-size: 9px; text-transform: uppercase; color: #6b7280; }
  .card .valor { font-size: 14px; font-weight: bold; margin-top: 4px; }
  .entradas { color: #047857; }
  .saidas { color: #b91c1c; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #111827; color: #fff; text-align: left; padding: 6px 8px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  tr.grupo td { background: #f3f4f6; font-weight: bold; }
  .num { text-align: right; }
  .rodape { margin-top: 16px; color: #6b7280; font-size: 9px; }
</style>
</head>
<body>
  <h1>Balanço Mensal — IBJT</h1>
  <div class="subtitulo">Período: ${data.periodo}</div>

  <div class="resumo">
    <div class="card"><div class="label">Saldo inicial</div><div class="valor">${formatBRL(data.saldoInicial)}</div></div>
    <div class="card"><div class="label">Total de entradas</div><div class="valor entradas">${formatBRL(data.totalEntradas)}</div></div>
    <div class="card"><div class="label">Total de saídas</div><div class="valor saidas">${formatBRL(data.totalSaidas)}</div></div>
    <div class="card"><div class="label">Saldo final</div><div class="valor">${formatBRL(data.saldoFinal)}</div></div>
  </div>

  <table>
    <thead>
      <tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="num">Valor</th></tr>
    </thead>
    <tbody>
      ${linhasCategorias}
    </tbody>
  </table>

  <div class="rodape">Documento gerado automaticamente em ${formatDate(data.geradoEm)} pelo sistema de gestão IBJT.</div>
</body>
</html>`;
  }
}
