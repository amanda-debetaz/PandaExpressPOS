import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * KitchenService exposes a queue of active kitchen orders and lets the kitchen
 * advance or complete them. Orders flow through kitchen_status enum values
 * (queued -> prepping -> done). We exclude done from the queue list.
 */
@Injectable()
export class KitchenService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Fetch current kitchen queue (all orders not done), oldest first, with
	 * joined line items, menu item names, and selected option names.
	 */
	async getQueue() {
		const orders = await this.prisma.order.findMany({
			where: { status: { not: 'done' } },
			orderBy: { created_at: 'asc' },
			include: {
				order_item: {
					include: {
						menu_item: { select: { name: true } },
						order_item_option: {
							include: { option: { select: { name: true } } },
						},
					},
				},
			},
		});

		return orders.map((o) => ({
			orderId: o.order_id,
			placedAt: o.created_at,
			status: o.status,
			dineOption: o.dine_option,
			notes: o.notes ?? null,
			items: o.order_item.map((oi) => ({
				orderItemId: oi.order_item_id,
				menuItemId: oi.menu_item_id,
				name: oi.menu_item?.name,
				qty: oi.qty,
				unitPrice: oi.unit_price,
				options: (oi.order_item_option ?? [])
					.map((x) => x.option?.name)
					.filter(Boolean),
			})),
		}));
	}

	/** Update a kitchen order status. Enforces valid enum values. */
	async setStatus(orderId: number, status: string) {
		const allowed: string[] = ['queued', 'prepping', 'done'];
		if (!allowed.includes(status)) {
			throw new BadRequestException(`Invalid status '${status}'`);
		}
		return this.prisma.order.update({
			where: { order_id: orderId },
			data: {
				status: status as any,
				completed_at: status === 'done' ? new Date() : null,
			},
			select: { order_id: true, status: true },
		});
	}
}

