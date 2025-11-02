import { Module } from '@nestjs/common';
import { RedisController } from './redis.controller';
import { RedisService } from './redis.service';
import { RedisRepository } from './redis.repository';
import { redisClientFactory } from 'src/core/database/redis-configuration.module';

@Module({
  controllers: [RedisController],
  providers: [RedisService, RedisRepository, redisClientFactory],
  imports: [],
  exports: [RedisService],
})
export class RedisModule {}
