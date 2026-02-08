import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { StatusController } from './status.controller';
import { TasksService } from './tasks.service';
import { TaskStoreService } from './task-store.service';
import { WorkersModule } from '../workers/workers.module';

@Module({
  imports: [WorkersModule],
  controllers: [TasksController, StatusController],
  providers: [TaskStoreService, TasksService],
  exports: [TaskStoreService],
})
export class TasksModule {}
