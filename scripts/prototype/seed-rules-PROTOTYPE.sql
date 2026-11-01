-- PROTOTYPE, wipe me: seed data for the Rules page variants (scratch DB finance_manager_proto).
INSERT INTO category_group (id, name, type, sort) VALUES
  ('00000000-0000-0000-0000-0000000000a1','Food','expense',1),
  ('00000000-0000-0000-0000-0000000000a2','Transport','expense',2),
  ('00000000-0000-0000-0000-0000000000a3','Income','income',3);
INSERT INTO category (id, group_id, name, sort) VALUES
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','Groceries',1),
  ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','Restaurants',2),
  ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-0000000000a2','Public transport',1),
  ('00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000a3','Salary',1);
INSERT INTO payee (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000b1','Migros'),
  ('00000000-0000-0000-0000-0000000000b2','Coop'),
  ('00000000-0000-0000-0000-0000000000b3','SBB'),
  ('00000000-0000-0000-0000-0000000000b4','Acme AG');
INSERT INTO tag (id, name) VALUES
  ('00000000-0000-0000-0000-0000000000d1','card'),
  ('00000000-0000-0000-0000-0000000000d2','commute'),
  ('00000000-0000-0000-0000-0000000000d3','recurring');
INSERT INTO rule (name, sort, enabled, conditions, actions) VALUES
 ('Migros groceries',1,true,'[{"type":"text","field":"description","operator":"contains","value":"migros"},{"type":"direction","direction":"out"}]','{"payeeId":"00000000-0000-0000-0000-0000000000b1","categoryId":"00000000-0000-0000-0000-0000000000c1","tagIds":["00000000-0000-0000-0000-0000000000d1"]}'),
 ('Coop groceries',2,true,'[{"type":"text","field":"counterparty","operator":"startsWith","value":"coop"}]','{"payeeId":"00000000-0000-0000-0000-0000000000b2","categoryId":"00000000-0000-0000-0000-0000000000c1","tagIds":[]}'),
 ('SBB tickets',3,true,'[{"type":"text","field":"description","operator":"regex","value":"sbb|cff"}]','{"payeeId":"00000000-0000-0000-0000-0000000000b3","categoryId":"00000000-0000-0000-0000-0000000000c3","tagIds":["00000000-0000-0000-0000-0000000000d2"]}'),
 ('Salary',4,true,'[{"type":"text","field":"counterparty","operator":"equals","value":"Acme AG"},{"type":"amount","operator":"greaterThan","amountMinor":300000}]','{"payeeId":"00000000-0000-0000-0000-0000000000b4","categoryId":"00000000-0000-0000-0000-0000000000c4","tagIds":["00000000-0000-0000-0000-0000000000d3"]}'),
 ('Lunch near office',5,false,'[{"type":"amount","operator":"between","amountMinor":-4000,"toAmountMinor":-1200},{"type":"bookingDate","operator":"after","date":"2026-01-01"}]','{"categoryId":"00000000-0000-0000-0000-0000000000c2","tagIds":[]}'),
 ('Tag all card payments',6,true,'[{"type":"text","field":"description","operator":"contains","value":"card payment"}]','{"tagIds":["00000000-0000-0000-0000-0000000000d1"]}');
