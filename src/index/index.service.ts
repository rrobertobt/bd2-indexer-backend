import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { parseStream } from 'fast-csv';
import { createReadStream, promises as fs } from 'fs';
import { AnyBulkWriteOperation, Document, Model } from 'mongoose';
import { CSVRow } from 'src/core/interfaces/csvrow.interface';
import { Product } from 'src/products/entities/product.entity';
import { CreateIndexDto } from './dto/create-index.dto';
import { Readable } from 'stream';

@Injectable()
export class IndexService {
  private readonly BATCH = 10000;
  private readonly MAX_PARALLEL_WRITES = 10;
  private readonly allowedMimeTypes = [
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
  ];
  private readonly requiredHeaders = [
    'id',
    'title',
    'brand',
    'category',
    'product_type',
    'description',
    'price',
    'currency',
    'stock',
    'sku',
    'rating',
    'created_at',
  ];

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

    await this.validateCsvFile(file);

    const operations: AnyBulkWriteOperation<Document>[] = [];
    const pendingWrites: Promise<unknown>[] = [];
    let total = 0;

    const flush = async () => {
      if (!operations.length) return;
      const batch = operations.splice(0);

      //@ts-ignore
      const writePromise = this.productModel.collection.bulkWrite(batch, {
        ordered: false,
        bypassDocumentValidation: true,
      });
      pendingWrites.push(writePromise);

      if (pendingWrites.length >= this.MAX_PARALLEL_WRITES) {
        await Promise.all(pendingWrites.splice(0));
      }
    };

    const stream = this.createFileStream(file);
    const parser = parseStream<CSVRow, CSVRow>(stream, {
      headers: true,
      trim: true,
      ignoreEmpty: true,
    });

    let processingError: unknown;

    try {
      for await (const row of parser) {
        const normalizedDoc = this.pruneUndefined(this.normalizeRow(row));
        if (!Object.keys(normalizedDoc).length) {
          continue;
        }

        const filter = this.buildUpsertFilter(normalizedDoc);
        if (!Object.keys(filter).length) {
          continue;
        }

        // operations.push({
        //   updateOne: { filter, update: { $set: normalizedDoc }, upsert: true },
        // });
        operations.push({
          updateOne: {
            filter,
            update: { $set: normalizedDoc },
            upsert: true,
          },
        });

        total++;

        if (operations.length >= this.BATCH) {
          await flush();
        }
      }

      await flush();
      if (pendingWrites.length) {
        await Promise.all(pendingWrites);
        pendingWrites.length = 0;
      }
    } catch (error) {
      processingError = error;
    } finally {
      if (pendingWrites.length) {
        const results = await Promise.allSettled(pendingWrites);
        const failed = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        if (!processingError && failed) {
          processingError = failed.reason;
        }
        pendingWrites.length = 0;
      }

      if (!stream.readableEnded) {
        stream.destroy();
      }
      if ('path' in file && file.path) {
        await fs.unlink(file.path).catch(() => undefined);
      }
    }

    if (processingError) {
      if (processingError instanceof BadRequestException) {
        throw processingError;
      }

      const detail =
        processingError instanceof Error
          ? processingError.message
          : String(processingError);

      throw new BadRequestException({
        message: 'Error al procesar el archivo CSV.',
        statusCode: 400,
        detail,
      });
    }

    return { ok: true, totalIndexed: total };
  }

  private createFileStream(file: Express.Multer.File): Readable {
    if ('path' in file && file.path) {
      return createReadStream(file.path, {
        encoding: 'utf8',
        highWaterMark: 1 << 20, // 1MB chunks para mejorar throughput
      });
    }

    if (file.buffer?.length) {
      const buffer = file.buffer;
      const readable = new Readable({
        read() {
          this.push(buffer);
          this.push(null);
        },
      });
      readable.setEncoding('utf8');
      return readable;
    }

    if (file.stream) {
      file.stream.setEncoding?.('utf8');
      return file.stream;
    }

    throw new BadRequestException({
      message: 'No se pudo leer el archivo subido.',
      statusCode: 400,
    });
  }

  private pruneUndefined(input: Partial<Product>): Partial<Product> {
    const output: Partial<Product> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      (output as any)[key] = value;
    }
    return output;
  }

  private buildUpsertFilter(
    doc: Partial<Product>,
  ): Record<string, string | number | Date> {
    if (doc.sku) {
      return { sku: doc.sku };
    }

    const filter: Record<string, string | number | Date> = {};
    if (doc.title) filter.title = doc.title;
    if (doc.brand) filter.brand = doc.brand;
    if (doc.category) filter.category = doc.category;
    if (doc.product_type) filter.product_type = doc.product_type;

    return filter;
  }

  private async validateCsvFile(file: Express.Multer.File) {
    const size = file.size ?? file.buffer?.length ?? 0;

    if (!size) {
      throw new BadRequestException({
        message: 'El archivo está vacío.',
        statusCode: 400,
      });
    }

    if (
      file.mimetype &&
      !this.allowedMimeTypes.includes(file.mimetype) &&
      !file.mimetype.startsWith('text/')
    ) {
      throw new BadRequestException({
        message:
          'Tipo de archivo inválido. Solo se permiten archivos CSV o de texto.',
        statusCode: 400,
      });
    }

    const previewBuffer = await this.getPreviewBuffer(file);

    if (!previewBuffer.length || !this.isTextBuffer(previewBuffer)) {
      throw new BadRequestException({
        message:
          'El archivo parece binario. Se requiere un archivo CSV codificado en texto.',
        statusCode: 400,
      });
    }

    const headers = this.extractHeaders(previewBuffer);
    if (!headers.length) {
      throw new BadRequestException({
        message:
          'No se encontraron encabezados en el archivo. Verifica que sea un CSV válido.',
        statusCode: 400,
      });
    }

    const normalizedHeaders = headers.map((h) => h.toLowerCase());
    const missingHeaders = this.requiredHeaders.filter(
      (field) => !normalizedHeaders.includes(field),
    );

    if (missingHeaders.length) {
      throw new BadRequestException({
        message: `Faltan las siguientes columnas requeridas: ${missingHeaders.join(', ')}`,
        statusCode: 400,
      });
    }
  }

  private async getPreviewBuffer(
    file: Express.Multer.File,
    maxBytes = 32768,
  ): Promise<Buffer> {
    if (file.buffer?.length) {
      return file.buffer.subarray(0, Math.min(file.buffer.length, maxBytes));
    }

    if ('path' in file && file.path) {
      const handle = await fs.open(file.path, 'r');
      try {
        const length = Math.min(
          maxBytes,
          typeof file.size === 'number' && file.size > 0 ? file.size : maxBytes,
        );
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    }

    return Buffer.alloc(0);
  }

  private isTextBuffer(buffer: Buffer): boolean {
    if (!buffer?.length) return false;

    const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
    const text = sample.toString('utf8');

    if (text.includes('\u0000')) return false;

    const stripped = text.replace(/[\x09\x0A\x0D\x20-\x7E]/g, '');
    return stripped.length <= text.length * 0.1;
  }

  private extractHeaders(buffer: Buffer): string[] {
    const preview = buffer
      .subarray(0, Math.min(buffer.length, 32768))
      .toString('utf8');

    const lines = preview
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const [rawHeader] = lines;

    if (!rawHeader) return [];

    const sanitized = rawHeader.replace(/^\uFEFF/, '');
    const commaCount = (sanitized.match(/,/g) || []).length;
    const semicolonCount = (sanitized.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';

    return sanitized
      .split(delimiter)
      .map((header) => header.trim())
      .filter((header) => header.length > 0);
  }

  private normalizeRow(row: CSVRow): Partial<Product> {
    const clean = (value?: string) => {
      if (typeof value !== 'string') return undefined;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    };

    const toFloat = (value?: string) => {
      const cleaned = clean(value);
      if (cleaned === undefined) return undefined;
      const num = Number.parseFloat(cleaned);
      return Number.isFinite(num) ? num : undefined;
    };

    const toInt = (value?: string) => {
      const cleaned = clean(value);
      if (cleaned === undefined) return undefined;
      const num = Number.parseInt(cleaned, 10);
      return Number.isFinite(num) ? num : undefined;
    };

    const toDate = (value?: string) => {
      const cleaned = clean(value);
      if (cleaned === undefined) return undefined;
      const date = new Date(cleaned);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };

    return {
      title: clean(row.title),
      brand: clean(row.brand),
      category: clean(row.category),
      product_type: clean(row.product_type),
      description: clean(row.description),
      price: toFloat(row.price),
      currency: clean(row.currency),
      stock: toInt(row.stock),
      sku: clean(row.sku),
      rating: toFloat(row.rating),
      created_at: toDate(row.created_at),
    };
  }
}
