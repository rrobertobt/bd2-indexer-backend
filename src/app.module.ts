import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import * as dotenv from 'dotenv';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductsModule } from './products/products.module';
import { RedisModule } from './redis/redis.module';
import { ConfigModule } from '@nestjs/config';
import appConfig from './app.config';

dotenv.config();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    MongooseModule.forRoot(
      `mongodb://${process.env.MONGO_USER}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`,
      {
        authMechanism: 'DEFAULT',
        dbName: process.env.MONGO_DB_NAME,
        auth: {
          password: process.env.MONGO_PASSWORD,
          username: process.env.MONGO_USER,
        },
      },
    ),
    ProductsModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
