import { Injectable, NotImplementedException } from '@nestjs/common';
import { StorageProvider } from './storage-provider.interface';

/**
 * Placeholder para produção (S3 / Supabase Storage / Cloudinary).
 * A implementação real deve preencher save/read/exists usando o SDK do
 * provedor escolhido. A lógica de geração do relatório não muda.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  save(): Promise<string> {
    return Promise.reject(
      new NotImplementedException(
        'S3StorageProvider ainda não implementado. Use STORAGE_PROVIDER=local ou implemente o provider.',
      ),
    );
  }

  read(): Promise<Buffer> {
    return Promise.reject(
      new NotImplementedException('S3StorageProvider ainda não implementado.'),
    );
  }

  exists(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
