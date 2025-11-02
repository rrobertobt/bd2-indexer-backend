import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { parse } from 'fast-csv';
import { AnyBulkWriteOperation, Model } from 'mongoose';
import { CSVRow } from 'src/core/interfaces/csvrow.interface';
import { Product } from 'src/products/entities/product.entity';
import { CreateIndexDto } from './dto/create-index.dto';

@Injectable()
export class IndexService {
  private readonly BATCH = 2000;
  constructor(
    @InjectModel(Product.name) private productModel: Model<Product>,
  ) {}

  async create(createIndexDto: CreateIndexDto, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({
        message: 'File is required',
        statusCode: 400,
      });
    }

    const ops: AnyBulkWriteOperation<Product>[] = [];
    let total = 0;

    await new Promise<void>((resolve, reject) => {
      const stream = parse({ headers: true })
        .on('error', reject)
        .on('data', (row: CSVRow) => {
          const doc = this.normalizeRow(row);
          // upsert por sku (si existe) o por clave lógica:
          const filter = doc.sku
            ? { sku: doc.sku }
            : {
                title: doc.title,
                brand: doc.brand,
                category: doc.category,
                product_type: doc.product_type,
              };
          ops.push({
            updateOne: { filter, update: { $set: doc }, upsert: true },
          });

          if (ops.length >= this.BATCH) {
            stream.pause();
            this.productModel
              .bulkWrite(ops.splice(0))
              .then(() => {
                stream.resume();
              })
              .catch(reject);
          }
          total++;
        })
        .on('end', () => {
          if (ops.length) {
            this.productModel
              .bulkWrite(ops)
              .then(() => resolve())
              .catch(reject);
          } else {
            resolve();
          }
          resolve();
        });

      stream.write(file.buffer);
      stream.end();
    });

    return { ok: true, totalIndexed: total };
  }

  private normalizeRow(row: CSVRow): Partial<Product> {
    const clean = (v: string) => (v ? v.trim() : v);
    return {
      title: clean(row.title),
      brand: clean(row.brand),
      category: clean(row.category),
      product_type: clean(row.product_type),
      description: clean(row.description),
      price: parseFloat(row.price),
      currency: clean(row.currency),
      stock: parseInt(row.stock, 10),
      sku: clean(row.sku),
      rating: parseFloat(row.rating),
      created_at: new Date(row.created_at),
    };
  }
}
