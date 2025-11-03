import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { Model } from 'mongoose';
import { Product, ProductDocument } from 'src/products/entities/product.entity';

export interface SearchResponse {
  items: Product[];
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  tookMs: number;
  cached: boolean;
}

@Injectable()
export class SearchService {
  private readonly TTL_SECONDS = 60;
  private readonly SUGGEST_TTL_SECONDS = 30;

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
        totalItems: 0,
        totalPages: 0,
        tookMs: 0,
        cached: false,
      };
    }

    const cacheKey = `search:q=${query}:page=${clampedPage}:limit=${clampedLimit}`;

    const t0cache = Date.now();

    // 1) Intento de cache
    try {
      const cached = await this.redisClient.get(cacheKey);
      console.log(
        'Cached search result for key:',
        cacheKey,
        cached ? 'HIT' : 'MISS',
      );
      if (cached) {
        const parsed = JSON.parse(cached) as SearchResponse;
        console.log('Returning cached search result');
        parsed.cached = true;
        parsed.tookMs = Date.now() - t0cache;
        return parsed;
      }
    } catch (e) {
      // Si Redis falla, seguimos sin interrumpir la búsqueda
      console.warn('Redis GET failed:', e);
    }

    const baseProjection = {
      title: 1,
      brand: 1,
      category: 1,
      product_type: 1,
      description: 1,
      price: 1,
      currency: 1,
      stock: 1,
      sku: 1,
      rating: 1,
      created_at: 1,
    };

    // 2) Consulta en Mongo con índice de texto ponderado
    const t0 = Date.now();
    const filter = { $text: { $search: query } };
    let totalItems = await this.productModel.countDocuments(filter);

    // Proyección con textScore; cast a any para evitar conflictos de tipos
    const projection = {
      score: { $meta: 'textScore' },
      ...baseProjection,
    };

    const sortByScore = { score: { $meta: 'textScore' } };

    let items: Product[] = [];

    if (totalItems) {
      items = await this.productModel
        .find(filter, projection)
        .sort(sortByScore)
        .skip(skip)
        .limit(clampedLimit)
        .lean()
        .exec();
    } else {
      const escapeRegex = (value: string) =>
        value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pieces = query.split(/\s+/).filter(Boolean);
      const pattern = pieces.map(escapeRegex).join('.*');
      const fallbackRegex = new RegExp(pattern || escapeRegex(query), 'i');
      const fallbackFilter = {
        $or: [
          { title: fallbackRegex },
          { brand: fallbackRegex },
          { category: fallbackRegex },
          { sku: fallbackRegex },
          { product_type: fallbackRegex },
        ],
      };

      totalItems = await this.productModel.countDocuments(fallbackFilter);

      items = await this.productModel
        .find(fallbackFilter, baseProjection)
        .sort({ title: 1 })
        .skip(skip)
        .limit(clampedLimit)
        .lean()
        .exec();
    }

    // (Opcional) Boost para SKU exacto: si coincide, lo anteponemos
    if (query.length <= 64) {
      const exact = await this.productModel.findOne({ sku: query }).lean();
      console.log('Exact SKU boost check:', exact ? 'FOUND' : 'NOT FOUND');
      if (exact) {
        const exists = items.find(
          (d: ProductDocument) => String(d._id) === String(exact._id),
        );
        if (!exists) items = [exact, ...items];
      }
    }

    const tookMs = Date.now() - t0;
    const totalPages =
      totalItems > 0 ? Math.ceil(totalItems / clampedLimit) : 0;

    const response = {
      items,
      page: clampedPage,
      limit: clampedLimit,
      totalItems,
      totalPages,
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
      console.warn('Redis SET failed:', e);
    }

    return response;
  }

  /**
   * Sugerencias basadas en Redis ZSET por prefijo.
   * Se espera que durante la ingesta se hayan incrementado los prefijos:
   *  ZINCRBY sugg:{prefix} 1 {term}
   */
  async suggest(q: string) {
    const query = (q ?? '').trim();
    if (!query) return { suggestions: [] };

    const normalized = query.toLowerCase();
    const cacheKey = `suggest:q=${normalized}`;

    try {
      const cached = await this.redisClient.get(cacheKey);
      if (cached) {
        const suggestions = JSON.parse(cached);
        if (Array.isArray(suggestions)) {
          return { suggestions };
        }
      }
    } catch (err) {
      console.warn('Redis suggest cache GET failed:', err);
    }

    const suggestionsSet = new Map<string, number>();
    const append = (value: string, score: number) => {
      const existing = suggestionsSet.get(value);
      if (existing === undefined || score > existing) {
        suggestionsSet.set(value, score);
      }
    };

    const parts = normalized.split(/\s+/);
    const prefix = parts[parts.length - 1] || '';

    if (prefix.length >= 2) {
      try {
        const redisSuggestions = await this.redisClient.zrevrange(
          `sugg:${prefix}`,
          0,
          9,
        );
        for (const suggestion of redisSuggestions) {
          if (typeof suggestion === 'string' && suggestion.trim().length) {
            append(suggestion, 100);
          }
        }
      } catch (err) {
        console.warn('Redis suggest ZSET failed:', err);
      }
    }

    if (!suggestionsSet.size) {
      const mongoSuggestions = await this.querySuggestionsFromMongo(query, 10);
      for (let i = 0; i < mongoSuggestions.length; i++) {
        append(mongoSuggestions[i], 80 - i);
      }
    }

    const suggestions = Array.from(suggestionsSet.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([value]) => value);

    try {
      await this.redisClient.set(
        cacheKey,
        JSON.stringify(suggestions),
        'EX',
        this.SUGGEST_TTL_SECONDS,
      );
    } catch (err) {
      console.warn('Redis suggest cache SET failed:', err);
    }

    return { suggestions };
  }

  private async querySuggestionsFromMongo(query: string, limit = 10) {
    const escapeRegex = (value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const pieces = query.split(/\s+/).filter(Boolean);
    const flexiblePattern = pieces.map(escapeRegex).join('.*');
    const flexibleRegex = new RegExp(
      flexiblePattern || escapeRegex(query),
      'i',
    );
    const prefixRegex = new RegExp(`^${escapeRegex(query)}`, 'i');

    const candidates = await this.productModel
      .find(
        {
          $or: [
            { title: flexibleRegex },
            { brand: flexibleRegex },
            { category: flexibleRegex },
            { product_type: flexibleRegex },
            { sku: flexibleRegex },
          ],
        },
        {
          title: 1,
          brand: 1,
          category: 1,
          product_type: 1,
          sku: 1,
        },
      )
      .limit(50)
      .lean()
      .exec();

    const scored = new Map<string, number>();
    const track = (value: unknown, baseScore: number) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed.length) return;

      const lower = trimmed.toLowerCase();
      let score = baseScore;
      if (prefixRegex.test(trimmed)) score += 5;
      if (lower === query.toLowerCase()) score += 10;
      if (flexibleRegex.test(trimmed)) score += 2;

      const current = scored.get(trimmed);
      if (current === undefined || score > current) {
        scored.set(trimmed, score);
      }
    };

    for (const candidate of candidates) {
      track(candidate.title, 50);
      track(candidate.brand, 40);
      track(candidate.category, 30);
      track(candidate.product_type, 20);
      track(candidate.sku, 35);
    }

    return Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([value]) => value);
  }
}
