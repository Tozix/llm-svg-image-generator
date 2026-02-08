import { Module } from '@nestjs/common';
import { LibraryApiController } from './library-api.controller';

@Module({
  controllers: [LibraryApiController],
})
export class LibraryApiModule {}
