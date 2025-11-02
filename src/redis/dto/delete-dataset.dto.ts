import { IsNotEmpty, IsNumber, IsOptional, isString, IsString } from "class-validator";

export class DeleteDatasetDto {

    @IsNotEmpty()
    @IsString()
    prefix: string;

    @IsNotEmpty()
    @IsString()
    key: string;

    get fullKey(): string{
        return `${this.prefix}:${this.key}`;
    }

}