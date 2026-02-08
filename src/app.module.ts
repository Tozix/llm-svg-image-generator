import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { WorkersModule } from './workers/workers.module';
import { PromptsModule } from './prompts-api/prompts.module';
import { GenerationParamsModule } from './generation-params/generation-params.module';
import { LibraryApiModule } from './library-api/library-api.module';

const projectRoot = process.cwd();

@Module({
  imports: [
    ServeStaticModule.forRoot(
      { rootPath: join(projectRoot, 'public'), serveRoot: '/' },
      { rootPath: join(projectRoot, 'output'), serveRoot: '/output' },
    ),
    AuthModule,
    TasksModule,
    WorkersModule,
    PromptsModule,
    GenerationParamsModule,
    LibraryApiModule,
  ],
})
export class AppModule {}
