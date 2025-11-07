import { Body, Controller, Get, Post } from '@nestjs/common';
import { KioskService } from './kiosk.service';
import { CreateKioskOrderDto } from './dto/dto/create-kiosk-order.dto';

@Controller('kiosk')
export class KioskController {
  constructor(private readonly svc: KioskService) {}

  @Get('menu')
  getMenu() {
    return this.svc.getMenuForKiosk();
  }

  @Post('orders')
  createPaidOrder(@Body() dto: CreateKioskOrderDto) {
    return this.svc.createPaidOrder(dto);
  }
}