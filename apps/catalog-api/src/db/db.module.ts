import { Module, Global } from '@nestjs/common';
import { DbService } from './db.service';

@Global()                   // optional, but convenient
@Module({
  providers: [DbService],
  exports: [DbService],     // ← must have this line
})
export class DbModule {}