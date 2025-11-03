import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { CreateIndexDto } from './dto/create-index.dto';
import { IndexService } from './index.service';

const UPLOAD_DIR = join(tmpdir(), 'bd2-indexer-upload');

if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

@Controller('index')
export class IndexController {
  constructor(private readonly indexService: IndexService) {}

  @Post('load')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (_req, file, cb) => {
          const extension = extname(file.originalname || '') || '.csv';
          cb(null, `${Date.now()}-${randomUUID()}${extension}`);
        },
      }),
      limits: {
        fileSize: 1024 * 1024 * 1024, // 1GB
      },
    }),
  )
  create(
    @UploadedFile() file: Express.Multer.File,
    @Body() createIndexDto: CreateIndexDto,
  ) {
    if (
      file?.mimetype &&
      !file.mimetype.startsWith('text/') &&
      file.mimetype !== 'application/vnd.ms-excel'
    ) {
      throw new BadRequestException({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message:
          'Tipo de archivo inválido. Se requiere un archivo CSV o de texto.',
      });
    }

    return this.indexService.create(createIndexDto, file);
  }
}
