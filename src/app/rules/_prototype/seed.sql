-- PROTOTYPE seed (wipe me): 60 Rules over 24 Payees / 16 Categories for judging the grouped Rules variants.
-- Run on a scratch database only: psql "$DATABASE_URL" -f src/app/rules/_prototype/seed.sql
INSERT INTO category_group (name, type, sort) VALUES ('Food','expense',1),('Home','expense',2),('Transport','expense',3),('Leisure','expense',4),('Health','expense',5),('Income','income',6);
INSERT INTO category (group_id, name, sort) SELECT g.id, c.name, 0 FROM (VALUES
 ('Food','Groceries'),('Food','Restaurants'),('Food','Coffee'),('Home','Rent'),('Home','Utilities'),('Home','Insurance'),
 ('Transport','Public transport'),('Transport','Fuel'),('Transport','Parking'),('Leisure','Streaming'),('Leisure','Sport'),('Leisure','Travel'),
 ('Health','Pharmacy'),('Health','Doctor'),('Income','Salary'),('Income','Refunds')) c(g,name) JOIN category_group g ON g.name=c.g;
INSERT INTO payee (name) VALUES ('Migros'),('Coop'),('Aldi'),('Lidl'),('Starbucks'),('McDonald''s'),('SBB'),('ZVV'),('Shell'),('BP'),('Netflix'),('Spotify'),('Swisscom'),('EWZ'),('Helsana'),('Amavita'),('Employer AG'),('Landlord'),('Decathlon'),('Booking.com'),('Easyjet'),('Uber'),('Galaxus'),('Digitec');
INSERT INTO tag (name) VALUES ('card'),('subscription'),('work'),('family');
WITH spec(n, rname, payee, cat, cond, tag, enabled) AS (VALUES
 (1,'Migros groceries','Migros','Groceries','migros',null,true),(2,'Migros online','Migros','Groceries','migros online','card',true),(3,'Migros restaurant','Migros','Restaurants','migros resto',null,true),
 (4,'Coop groceries','Coop','Groceries','coop',null,true),(5,'Coop pronto','Coop','Groceries','coop pronto','card',true),(6,'Coop fuel','Coop','Fuel','coop mineraloel',null,true),
 (7,'Aldi','Aldi','Groceries','aldi',null,true),(8,'Lidl','Lidl','Groceries','lidl',null,false),(9,'Starbucks','Starbucks','Coffee','starbucks','card',true),
 (10,'McDonalds','McDonald''s','Restaurants','mcdonald',null,true),(11,'SBB tickets','SBB','Public transport','sbb',null,true),(12,'SBB GA','SBB','Public transport','generalabonnement','subscription',true),
 (13,'SBB mobile','SBB','Public transport','sbb mobile','card',true),(14,'ZVV','ZVV','Public transport','zvv',null,true),(15,'Shell','Shell','Fuel','shell',null,true),
 (16,'BP','BP','Fuel','bp ',null,false),(17,'Netflix','Netflix','Streaming','netflix','subscription',true),(18,'Spotify','Spotify','Streaming','spotify','subscription',true),
 (19,'Swisscom mobile','Swisscom','Utilities','swisscom',null,true),(20,'Swisscom TV','Swisscom','Streaming','swisscom blue','subscription',true),(21,'EWZ electricity','EWZ','Utilities','ewz',null,true),
 (22,'Helsana premium','Helsana','Insurance','helsana',null,true),(23,'Helsana refund','Helsana','Refunds','helsana rueck',null,true),(24,'Amavita','Amavita','Pharmacy','amavita',null,true),
 (25,'Salary','Employer AG','Salary','lohn','work',true),(26,'Expense refund','Employer AG','Refunds','spesen','work',true),(27,'Rent','Landlord','Rent','miete',null,true),
 (28,'Decathlon','Decathlon','Sport','decathlon',null,true),(29,'Booking','Booking.com','Travel','booking.com',null,true),(30,'Easyjet','Easyjet','Travel','easyjet',null,true),
 (31,'Uber rides','Uber','Public transport','uber',null,true),(32,'Uber eats','Uber','Restaurants','uber eats',null,true),(33,'Galaxus','Galaxus',null,'galaxus',null,true),
 (34,'Digitec','Digitec',null,'digitec',null,true),(35,'Card tag','',null,'kartenzahlung','card',true),(36,'Family tag','',null,'twint family','family',true),
 (37,'Parking city','',  'Parking','parkhaus',null,true),(38,'Parking app','','Parking','parkingpay',null,true),(39,'Doctor','', 'Doctor','praxis',null,true),
 (40,'Migros fitness','Migros','Sport','migros fitness','subscription',true),(41,'Coop restaurant','Coop','Restaurants','coop restaurant',null,true),(42,'Aldi suisse','Aldi','Groceries','aldi suisse',null,true),
 (43,'Lidl plus','Lidl','Groceries','lidl plus','card',true),(44,'Starbucks app','Starbucks','Coffee','starbucks app',null,false),(45,'Shell shop','Shell','Coffee','shell shop',null,true),
 (46,'Netflix annual','Netflix','Streaming','netflix yr','subscription',false),(47,'Spotify family','Spotify','Streaming','spotify fam','family',true),(48,'Booking hotel','Booking.com','Travel','hotel',null,true),
 (49,'Easyjet bags','Easyjet','Travel','easyjet bag',null,true),(50,'Galaxus refunds','Galaxus','Refunds','galaxus gutschrift',null,true),(51,'Digitec refunds','Digitec','Refunds','digitec gutschrift',null,true),
 (52,'SBB refund','SBB','Refunds','sbb erstattung',null,true),(53,'Amavita card','Amavita','Pharmacy','amavita card','card',true),(54,'Helsana extra','Helsana','Insurance','helsana zusatz',null,true),
 (55,'ZVV monthly','ZVV','Public transport','zvv abo','subscription',true),(56,'EWZ gas','EWZ','Utilities','ewz gas',null,true),(57,'Coop vitality','Coop','Pharmacy','coop vitality',null,true),
 (58,'Migros do it','Migros',null,'do it',null,true),(59,'Migros take away','Migros','Restaurants','migros take',null,true),(60,'Swisscom refund','Swisscom','Refunds','swisscom gutschrift',null,true)
)
INSERT INTO rule (name, sort, enabled, conditions, actions)
SELECT s.rname, s.n, s.enabled,
  jsonb_build_array(jsonb_build_object('type','text','field','description','operator','contains','value',s.cond)),
  jsonb_build_object('payeeId', p.id, 'categoryId', c.id, 'tagIds', CASE WHEN t.id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(t.id) END)
FROM spec s LEFT JOIN payee p ON p.name = s.payee LEFT JOIN category c ON c.name = s.cat LEFT JOIN tag t ON t.name = s.tag
;
