import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { Model } from 'mongoose';
import { Product } from 'src/products/entities/product.entity';

@Injectable()
export class SearchService {
  private readonly TTL_SECONDS = 60;

  constructor(
    @InjectModel(Product.name) private productModel: Model<Product>,
    @Inject('RedisClient') private readonly redisClient: Redis,
  ) {}

  /**
   * Búsqueda con cache-aside en Redis y relevancia por textScore.
   * - Cache key: search:q={q}:page={page}:limit={limit}
   * - TTL corto para acelerar queries repetidas sin introducir staleness alto.
   */
  async findAll(q: string, page: number, limit: number) {
    const query = (q ?? '').trim();
    const clampedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const clampedPage = Math.max(Number(page) || 1, 1);
    const skip = (clampedPage - 1) * clampedLimit;

    if (!query) {
      return {
        items: [],
        page: clampedPage,
        limit: clampedLimit,
        tookMs: 0,
        cached: false,
      };
    }

    const cacheKey = `search:q=${query}:page=${clampedPage}:limit=${clampedLimit}`;

    // 1) Intento de cache
    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return parsed;
      }
    } catch (e) {
      // Si Redis falla, seguimos sin interrumpir la búsqueda
      console.warn('Redis GET failed:', e);
    }

    // 2) Consulta en Mongo con índice de texto ponderado
    const t0 = Date.now();
    const filter = { $text: { $search: query } };

    // Proyección con textScore; cast a any para evitar conflictos de tipos
    const projection = {
      score: { $meta: 'textScore' },
      title: 1,
      brand: 1,
      category: 1,
      sku: 1,
      product_type: 1,
      price: 1,
      description: 1,
    };

    const sortByScore = { score: { $meta: 'textScore' } };

    let items = await this.productModel
      .find(filter, projection)
      .sort(sortByScore)
      .skip(skip)
      .limit(clampedLimit)
      .lean()
      .exec();
    console.log('Items found:', items.length);

    // (Opcional) Boost para SKU exacto: si coincide, lo anteponemos
    if (query.length <= 64) {
      const exact = await this.productModel.findOne({ sku: query }).lean();
      if (exact) {
        const exists = items.find(
          (d: any) => String(d._id) === String(exact._id),
        );
        if (!exists) items = [exact, ...items];
      }
    }

    const tookMs = Date.now() - t0;

    const response = {
      items,
      page: clampedPage,
      limit: clampedLimit,
      tookMs,
      cached: false,
    };

    // 3) Guarda en cache (TTL)
    try {
      await this.redisClient.set(
        cacheKey,
        JSON.stringify(response),
        'EX',
        this.TTL_SECONDS,
      );
    } catch (e) {
      // console.warn('Redis SET failed:', e);
    }

    return response;
  }

  /**
   * Sugerencias basadas en Redis ZSET por prefijo.
   * Se espera que durante la ingesta se hayan incrementado los prefijos:
   *  ZINCRBY sugg:{prefix} 1 {term}
   */
  async suggest(q: string) {
    const input = (q ?? '').trim().toLowerCase();
    if (!input) return { suggestions: [] };

    const parts = input.split(/\s+/);
    const prefix = parts[parts.length - 1] || '';
    if (prefix.length < 3) return { suggestions: [] };

    try {
      // Top 10 términos con mayor score para ese prefijo
      const suggestions = await this.redisClient.zrevrange(
        `sugg:${prefix}`,
        0,
        9,
      );
      return { suggestions };
    } catch (e) {
      // Si Redis falla, devolvemos vacío sin romper
      return { suggestions: [] };
    }
  }
}
