import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';

@Module({
  controllers: [],
  providers: [ProductsService],
})
export class ProductsModule {}
