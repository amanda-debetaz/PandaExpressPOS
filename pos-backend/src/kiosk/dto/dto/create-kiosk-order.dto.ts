export type KioskOrderItem = {
    menuItemId: number;
    qty: number;
    optionIds?: number[]; // e.g., "no side", "extra sauce", etc.
  };
  
  export class CreateKioskOrderDto {
    dineOption: 'takeout' | 'dine_in';
    items: KioskOrderItem[];
    payAmount: number;
    payMethod: 'cash' | 'card' | 'dining_dollars';
    notes?: string;
  }
  