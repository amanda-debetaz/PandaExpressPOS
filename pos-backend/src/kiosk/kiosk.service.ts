import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKioskOrderDto } from './dto/dto/create-kiosk-order.dto';

@Injectable()
export class KioskService {
  private readonly kioskEmployeeId = 9999;

  constructor(private readonly prisma: PrismaService) {}

  async getMenuForKiosk() {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ display_order: 'asc' }, { name: 'asc' }],
      include: {
        menu_item: {
          where: { is_active: true },
          select: {
            menu_item_id: true,
            name: true,
            price: true,
            menu_item_option_group: {
              select: {
                option_group: {
                  select: {
                    option_group_id: true,
                    name: true,
                    min_select: true,
                    max_select: true,
                    option: {
                      where: { /* optional availability filter */ },
                      select: {
                        option_id: true,
                        name: true,
                        price_delta: true,
                        menu_item_id: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return categories;
  }

  async createPaidOrder(dto: CreateKioskOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('No items.');
    }

    return this.prisma.$transaction(async (tx) => {
      const itemIds = [...new Set(dto.items.map(i => i.menuItemId))];
      const optionIds = [...new Set(dto.items.flatMap(i => i.optionIds ?? []))];

      const items = await tx.menu_item.findMany({
        where: { menu_item_id: { in: itemIds } },
        select: { menu_item_id: true, price: true, name: true },
      });

      const options = optionIds.length
        ? await tx.option.findMany({
            where: { option_id: { in: optionIds } },
            select: { option_id: true, price_delta: true, name: true, menu_item_id: true },
          })
        : [];

      const priceByItem = new Map<number, number>(items.map(i => [i.menu_item_id, Number(i.price)]));
      const priceDeltaByOption = new Map<number, number>(options.map(o => [o.option_id, Number(o.price_delta ?? 0)]));
      const optionMetaById = new Map<number, { menu_item_id: number | null }>(
        options.map(o => [o.option_id, { menu_item_id: o.menu_item_id }])
      );

      let orderSubtotal = 0;
      const lineBuild = dto.items.map((it) => {
        const unitPriceRaw = priceByItem.get(it.menuItemId);
        if (unitPriceRaw == null) {
          throw new BadRequestException(`Unknown menu item ${it.menuItemId}`);
        }
        const unitPrice = Number(unitPriceRaw);
        const validatedOptionIds = (it.optionIds ?? []).map((oid) => {
          const meta = optionMetaById.get(oid);
          if (!meta) {
            throw new BadRequestException(`Unknown option ${oid}`);
          }
          if (meta.menu_item_id != null && meta.menu_item_id !== it.menuItemId) {
            throw new BadRequestException(`Option ${oid} does not belong to menu item ${it.menuItemId}`);
          }
          return oid;
        });
        const optionTotal = validatedOptionIds.reduce<number>((sum, oid) => sum + Number(priceDeltaByOption.get(oid) ?? 0), 0);
        const lineUnit = unitPrice + optionTotal;
        const lineSubtotal = lineUnit * it.qty;
        orderSubtotal += lineSubtotal;
        return { menuItemId: it.menuItemId, qty: it.qty, unit: lineUnit, optionIds: validatedOptionIds };
      });

      const taxRate = 0.0825;
      const taxAmount = +(orderSubtotal * taxRate).toFixed(2);
      const orderTotal = +(orderSubtotal + taxAmount).toFixed(2);

      if (typeof dto.payAmount === 'number' && Math.abs(dto.payAmount - orderTotal) > 0.01) {
        throw new BadRequestException(`Mismatched total (client ${dto.payAmount} vs server ${orderTotal})`);
      }

      const order = await tx.order.create({
        data: {
          dine_option: dto.dineOption === 'dine_in' ? 'dine_in' : 'takeout',
          employee_id: this.kioskEmployeeId,
          notes: dto.notes ?? null,
        },
        select: { order_id: true },
      });

      for (const line of lineBuild) {
        const oi = await tx.order_item.create({
          data: {
            order_id: order.order_id,
            menu_item_id: line.menuItemId,
            qty: line.qty,
            unit_price: line.unit,
            discount_amount: 0,
            tax_amount: +(line.unit * line.qty * taxRate).toFixed(2),
          },
          select: { order_item_id: true },
        });

        if (line.optionIds.length) {
          await tx.order_item_option.createMany({
            data: line.optionIds.map((oid) => ({
              order_item_id: oi.order_item_id,
              option_id: oid,
              qty: 1,
            })),
          });
        }
      }

      await tx.payment.create({
        data: {
          order_id: order.order_id,
          method: dto.payMethod as any,
          amount: orderTotal,
          paid_at: new Date(),
          auth_ref: null,
        },
      });

      for (const line of lineBuild) {
        const recipes = await tx.recipe.findMany({
          where: { menu_item_id: line.menuItemId },
          select: { ingredient_id: true, qty_per_item: true },
        });

        for (const r of recipes) {
          const deduction = Number(r.qty_per_item ?? 0) * line.qty;
          if (deduction > 0) {
            await tx.inventory.update({
              where: { ingredient_id: r.ingredient_id },
              data: {
                current_quantity: { decrement: deduction } as any,
              },
            });
          }
        }
      }

      return { orderId: order.order_id, total: orderTotal };
    });
  }
}
