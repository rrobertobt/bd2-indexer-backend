import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema()
export class Product {
  @Prop()
  title: string;

  @Prop()
  category: string;

  @Prop()
  brand: string;

  @Prop()
  product_type: string;

  @Prop()
  sku: string;

  @Prop()
  price: number;

  @Prop({ required: false })
  description: string;
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
    default_language: 'spanish', // o "none"
  },
);
