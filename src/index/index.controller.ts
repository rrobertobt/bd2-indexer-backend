import {
  Body,
  Controller,
  HttpStatus,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateIndexDto } from './dto/create-index.dto';
import { IndexService } from './index.service';

@Controller('index')
export class IndexController {
  constructor(private readonly indexService: IndexService) {}

  @Post('load')
  @UseInterceptors(FileInterceptor('file'))
  create(
    @UploadedFile() // new ParseFilePipeBuilder()
    //   .addFileTypeValidator({
    file //     fileType: 'text/csv',
    //   })
    //   .build({
    //     errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    //     exceptionFactory: () => ({
    //       statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    //       message: 'Tipo de archivo inválido. Se requiere un archivo CSV.',
    //     }),
    //   }),
    : Express.Multer.File,
    @Body() createIndexDto: CreateIndexDto,
  ) {
    return this.indexService.create(createIndexDto, file);
  }
}
