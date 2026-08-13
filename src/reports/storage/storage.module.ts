import { Global, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';
import { STORAGE_PROVIDER, StorageProvider } from './storage-provider.interface';

const storageProviderFactory: Provider<StorageProvider> = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): StorageProvider => {
    const provider = config.get<string>('STORAGE_PROVIDER', 'local');
    switch (provider) {
      case 's3':
        return new S3StorageProvider();
      case 'local':
      default:
        return new LocalStorageProvider(config);
    }
  },
};

@Global()
@Module({
  providers: [storageProviderFactory, LocalStorageProvider, S3StorageProvider],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}