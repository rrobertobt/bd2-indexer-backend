import { Module } from '@nestjs/common';
import { IndexService } from './index.service';
import { IndexController } from './index.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from 'src/products/entities/product.entity';

@Module({
  controllers: [IndexController],
  imports: [
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
  ],
  providers: [IndexService],
})
export class IndexModule {}
