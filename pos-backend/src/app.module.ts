import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { KioskModule } from './kiosk/kiosk.module';

@Module({
  imports: [KioskModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}