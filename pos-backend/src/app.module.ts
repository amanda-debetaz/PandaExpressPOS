import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { KioskModule } from './kiosk/kiosk.module';
import { KitchenModule } from './kitchen/kitchen.module';

@Module({
  imports: [KioskModule, KitchenModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}