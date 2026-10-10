ALTER TABLE tracking_plans
  ADD COLUMN source_parameters jsonb NOT NULL
  DEFAULT '{"cve_id":null,"vendor":null,"ted_procedure_id":null}'::jsonb;

ALTER TABLE tracking_plans
  ADD CONSTRAINT tracking_plans_source_parameters_object
  CHECK (jsonb_typeof(source_parameters) = 'object');
