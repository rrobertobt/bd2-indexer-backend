import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query('q') q: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.searchService.findAll(q ?? '', Number(page), Number(limit));
  }

  @Get('suggest')
  suggest(@Query('q') q: string) {
    return this.searchService.suggest((q ?? '').toLowerCase());
  }
}
