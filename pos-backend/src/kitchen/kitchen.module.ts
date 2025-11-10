import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KitchenService } from './kitchen.service';
import { KitchenController } from './kitchen.controller';

@Module({
	imports: [PrismaModule],
	providers: [KitchenService],
	controllers: [KitchenController],
})
export class KitchenModule {}

