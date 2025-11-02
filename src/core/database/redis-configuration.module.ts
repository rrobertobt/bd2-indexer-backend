import { FactoryProvider } from '@nestjs/common';
import Redis from 'ioredis';

export const redisClientFactory: FactoryProvider<Redis> = {
  provide: 'RedisClient',
  useFactory: () => {
    const redisinstance = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    });

    redisinstance.on('error', (e) => {
      //throw new Error(`Error connecting to Redis: ${e}`)
      console.log(`Error connecting to Redis: ${e}`);
    });

    redisinstance.on('ready', () => {
      console.log('Redis client connected');
    });

    return redisinstance;
  },
  inject: [],
};
