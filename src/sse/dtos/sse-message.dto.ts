import { IsOptional, IsString } from 'class-validator';

export class SseMessageDto {
  @IsString()
  data: string;

  @IsString()
  @IsOptional()
  type?: string;
}
