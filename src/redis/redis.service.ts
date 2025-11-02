import { Inject, Injectable } from '@nestjs/common';
import { RedisRepository } from './redis.repository';
import { SaveDatasetDto } from './dto/save-dataset.dto';
import { GetDatasetDto } from './dto/get-dataset.dto';
import { DeleteDatasetDto } from './dto/delete-dataset.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService {
  constructor(
    @Inject(RedisRepository) private readonly redisRepository: RedisRepository,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Método que permite guardar la información de un dataset en Redis, asigna valores por defecto si estos no se envían
   * @param saveDatasetDto DTO con la información del dataset a guardar
   * @returns Los valores del dataset guardado
   */
  async saveDataset(saveDatasetDto: SaveDatasetDto): Promise<SaveDatasetDto> {
    saveDatasetDto.key =
      saveDatasetDto.key ?? Math.random().toString(36).substring(2, 7);
    saveDatasetDto.ttl =
      saveDatasetDto.ttl ?? this.configService.get<number>('redis.defaultTTL');
    saveDatasetDto.prefix =
      saveDatasetDto.prefix ??
      this.configService.get<string>('redis.defaultPrefix');
    return await this.redisRepository.set(saveDatasetDto);
  }

  /**
   * Método que permite obtener la información de un dataset en Redis
   * @param getDatasetDto DTO con la información del dataset a obtener
   * @returns El valor del dataset
   */
  async getDataset(getDatasetDto: GetDatasetDto): Promise<string> {
    getDatasetDto.prefix =
      getDatasetDto.prefix ??
      this.configService.get<string>('redis.defaultPrefix');
    return await this.redisRepository.get(getDatasetDto.fullKey);
  }

  /**
   * Método que elimina un dataset de la base de datos Redis, verifica primero a través del método get si dicho dataset existe
   * @param deleteDatasetDto DTO con la información del dataset a eliminar
   * @returns True si se eliminó correctamente, falso en caso contrario
   */
  async deleteDataset(deleteDatasetDto: DeleteDatasetDto): Promise<boolean> {
    await this.redisRepository.get(deleteDatasetDto.fullKey);
    return await this.redisRepository.delete(deleteDatasetDto);
  }
}
