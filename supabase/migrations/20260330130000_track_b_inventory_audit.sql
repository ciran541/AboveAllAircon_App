CREATE TABLE public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    user_id UUID,
    change_amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs" ON public.inventory_logs FOR SELECT USING (true);
CREATE POLICY "Users can insert logs" ON public.inventory_logs FOR INSERT WITH CHECK (true);

DROP TRIGGER IF EXISTS tr_reduce_inventory_stock ON public.job_materials;
DROP TRIGGER IF EXISTS tr_job_materials_insert ON public.job_materials;
DROP FUNCTION IF EXISTS reduce_inventory_stock();

CREATE OR REPLACE FUNCTION handle_job_materials_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (SELECT stock_quantity FROM public.inventory_items WHERE id = NEW.item_id) < NEW.quantity_used THEN
      RAISE EXCEPTION 'Insufficient stock to fulfill this job material.';
    END IF;
    
    UPDATE public.inventory_items
    SET stock_quantity = stock_quantity - NEW.quantity_used
    WHERE id = NEW.item_id;
    
    INSERT INTO public.inventory_logs (item_id, job_id, user_id, change_amount, reason)
    VALUES (NEW.item_id, NEW.job_id, NEW.created_by, -NEW.quantity_used, 'Logged to Job');
    
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.quantity_used != OLD.quantity_used THEN
      IF (NEW.quantity_used > OLD.quantity_used) AND 
         (SELECT stock_quantity FROM public.inventory_items WHERE id = NEW.item_id) < (NEW.quantity_used - OLD.quantity_used) THEN
        RAISE EXCEPTION 'Insufficient stock to increase material usage.';
      END IF;

      UPDATE public.inventory_items
      SET stock_quantity = stock_quantity + OLD.quantity_used - NEW.quantity_used
      WHERE id = NEW.item_id;
      
      INSERT INTO public.inventory_logs (item_id, job_id, user_id, change_amount, reason)
      VALUES (NEW.item_id, NEW.job_id, NEW.created_by, OLD.quantity_used - NEW.quantity_used, 'Job Usage Edited');
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.inventory_items
    SET stock_quantity = stock_quantity + OLD.quantity_used
    WHERE id = OLD.item_id;
    
    INSERT INTO public.inventory_logs (item_id, job_id, user_id, change_amount, reason)
    VALUES (OLD.item_id, OLD.job_id, OLD.created_by, OLD.quantity_used, 'Removed from Job');
    
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_job_materials_change
AFTER INSERT OR UPDATE OR DELETE ON public.job_materials
FOR EACH ROW EXECUTE FUNCTION handle_job_materials_change();
