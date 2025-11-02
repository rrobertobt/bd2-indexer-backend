import {
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { SaveDatasetDto } from './dto/save-dataset.dto';
import { DeleteDatasetDto } from './dto/delete-dataset.dto';

@Injectable()
export class RedisRepository implements OnModuleDestroy {
  constructor(@Inject('RedisClient') private readonly redisClient: Redis) {}

  async onModuleDestroy() {
    await this.redisClient.quit();
  }

  async get(fullKey: string): Promise<string> {
    const value = await this.redisClient.get(fullKey);
    if (!value)
      throw new NotFoundException(
        `Llave de redis ${fullKey} no encontrada o ha expirado`,
      );
    return value;
  }

  async set(saveDatasetDto: SaveDatasetDto): Promise<SaveDatasetDto> {
    await this.redisClient.set(
      `${saveDatasetDto.fullKey}`,
      saveDatasetDto.value,
      // @ts-expect-error: ioredis types are outdated
      'EX',
      saveDatasetDto.ttl,
    );
    return saveDatasetDto;
  }

  async delete(deleteDatasetDto: DeleteDatasetDto): Promise<boolean> {
    const result = await this.redisClient.del(deleteDatasetDto.fullKey);
    return result === 1;
  }
}
