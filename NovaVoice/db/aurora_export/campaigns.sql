-- Data export for campaigns
DELETE FROM campaigns;

INSERT INTO campaigns (id, name, description, status, batch_size, call_spacing_seconds, prompt_override, created_by, created_at, updated_at) VALUES (1, 'EventBridge Test Campaign', 'Testing EventBridge integration end-to-end', 'scheduled', 3, 30, NULL, 'test', '2025-06-27T01:04:06Z', '2025-06-27T01:04:06Z');
