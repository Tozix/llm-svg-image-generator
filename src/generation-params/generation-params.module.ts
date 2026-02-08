import { Module } from '@nestjs/common';
import { GenerationParamsController } from './generation-params.controller';

@Module({
  controllers: [GenerationParamsController],
})
export class GenerationParamsModule {}
