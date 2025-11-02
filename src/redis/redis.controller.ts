import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { DeleteDatasetDto } from './dto/delete-dataset.dto';
import { GetDatasetDto } from './dto/get-dataset.dto';
import { SaveDatasetDto } from './dto/save-dataset.dto';
import { RedisService } from './redis.service';

@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Post('dataset')
  async createDataset(
    @Body(new ValidationPipe({ transform: true })) body: SaveDatasetDto,
  ) {
    return this.redisService.saveDataset(body);
  }

  @Get('dataset')
  async getDataset(
    @Query(new ValidationPipe({ transform: true })) query: GetDatasetDto,
  ) {
    return this.redisService.getDataset(query);
  }

  @Delete('dataset')
  async deleteDataset(
    @Body(new ValidationPipe({ transform: true })) body: DeleteDatasetDto,
  ) {
    return this.redisService.deleteDataset(body);
  }
}
