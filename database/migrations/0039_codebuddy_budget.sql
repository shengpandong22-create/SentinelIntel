-- CodeBuddy is used only by explicitly invoked offline evaluation tooling, but it is still a paid
-- provider and therefore gets its own circuit breaker rather than inheriting an unlimited default.
INSERT INTO budgets (service, per_minute, per_hour, per_day, note) VALUES
  ('codebuddy', 5, 50, 300, 'Phase 2 evaluation model review (CodeBuddy CLI)')
ON CONFLICT (service) DO NOTHING;
