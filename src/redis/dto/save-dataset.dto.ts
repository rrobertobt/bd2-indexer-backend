import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  isString,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class SaveDatasetDto {
  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  @Length(5, 8)
  key?: string;

  @IsNotEmpty()
  @IsString()
  value: string;

  @IsOptional()
  @IsNumber()
  ttl?: number;

  get fullKey(): string {
    return `${this.prefix}:${this.key}`;
  }
}
