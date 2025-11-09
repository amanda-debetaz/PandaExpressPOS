import { Controller, Get, Param, Post, Body, BadRequestException } from '@nestjs/common';
import { KitchenService } from './kitchen.service';

@Controller('kitchen')
export class KitchenController {
	constructor(private readonly kitchenService: KitchenService) {}

	/** Return active kitchen queue */
	@Get('queue')
	getQueue() {
		return this.kitchenService.getQueue();
	}

	/** Generic status update */
	@Post(':id/status')
	setStatus(@Param('id') id: string, @Body('status') status: string) {
		if (!status) throw new BadRequestException('status required');
		return this.kitchenService.setStatus(Number(id), status);
	}

	/** Convenience endpoint to mark order done */
	@Post(':id/complete')
	complete(@Param('id') id: string) {
		return this.kitchenService.setStatus(Number(id), 'done');
	}
}

