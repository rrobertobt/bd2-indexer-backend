import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema()
export class Product {
  @Prop()
  title: string;

  @Prop()
  brand: string;

  @Prop()
  category: string;

  @Prop()
  product_type: string;

  @Prop()
  description: string;

  @Prop()
  price: number;

  @Prop()
  currency: string;

  @Prop()
  stock: number;

  @Prop()
  sku: string;

  @Prop()
  rating: number;

  @Prop()
  created_at: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index(
  {
    title: 'text',
    category: 'text',
    brand: 'text',
    sku: 'text',
    product_type: 'text',
  },
  {
    weights: {
      title: 10,
      category: 6,
      brand: 4,
      sku: 3,
      product_type: 2,
    },
    name: 'text_search_weighted',
    default_language: 'none', // o "none"
  },
);
