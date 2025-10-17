
--Add a new column called current_quantity which will be used to compare with par_level and reorder_point for ordering more stock
ALTER TABLE inventory
ADD COLUMN current_quantity INTEGER DEFAULT 0;
--Set the current_quantity to reasonable values
--closer to par level for perishable items, nonperishable can be kept at higher quantity
UPDATE inventory
SET current_quantity = CASE
    WHEN is_perishable THEN (par_level + (par_level - reorder_point) * 0.25 )
    ELSE par_level + (par_level - reorder_point) * 0.50
END;

