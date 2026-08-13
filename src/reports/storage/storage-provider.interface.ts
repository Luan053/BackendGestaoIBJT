export interface StorageProvider {
  /**
   * Salva o arquivo e retorna a URL pública para persistir (ex: FinancialReport.pdfUrl).
   */
  save(
    key: string,
    data: Buffer,
    contentType: string,
    publicUrl?: string,
  ): Promise<string>;

  read(key: string): Promise<Buffer>;

  exists(key: string): Promise<boolean>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
