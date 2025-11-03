import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KioskController } from './kiosk.controller';
import { KioskService } from './kiosk.service';

@Module({
  imports: [PrismaModule],
  controllers: [KioskController],
  providers: [KioskService],
})
export class KioskModule {}
