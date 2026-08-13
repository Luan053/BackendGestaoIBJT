import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider } from './storage-provider.interface';

/**
 * Implementação local (desenvolvimento): salva em disco (ex: storage/reports)
 * e expõe a URL através do endpoint dedicado da API.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly dir: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('STORAGE_LOCAL_DIR', './storage/reports');
    this.baseUrl = config.get<string>('PUBLIC_BASE_URL', 'http://localhost:3000');
  }

  async save(
    key: string,
    data: Buffer,
    _contentType: string,
    publicUrl?: string,
  ): Promise<string> {
    const filePath = this.resolvePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);

    this.logger.log(`Relatório salvo em disco: ${filePath}`);
    return publicUrl ?? `${this.baseUrl}/reports/${key}`;
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolvePath(key));
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.resolvePath(key));
  }

  private resolvePath(key: string): string {
    return join(this.dir, key);
  }
}