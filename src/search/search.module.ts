import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from 'src/products/entities/product.entity';
import { RedisModule } from 'src/redis/redis.module';

@Module({
  controllers: [SearchController],
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
    RedisModule,
  ],
  providers: [SearchService],
})
export class SearchModule {}
