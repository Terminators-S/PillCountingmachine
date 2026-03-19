-- Live PostgreSQL edit file.
-- Edit this file in VS Code while npm run dev is running.
-- Saving this file will auto-apply it to the live PostgreSQL database.
--
-- This file applies to the live PostgreSQL database from apps/api/.env.
-- It is not a dump. It is meant for direct updates and checks.

-- Quick read helpers
select id, "machineCode", "displayName", location, "firmwareVersion", status, "lastSeen"
from "Machine"
order by "machineCode";

select id, code, name, "dosageMg", manufacturer, barcode
from "PillType"
order by code;

select id, "lotNumber", location, "expiryDate", "receivedDate", "unitCost", "isQuarantined"
from "Lot"
order by "lotNumber";

select id, "jobNumber", status, "targetQty", "actualQty", "machineId", "pillTypeId", "createdAt"
from "CountingJob"
order by "createdAt" desc
limit 20;

select id, "txnType", location, quantity, "pillTypeId", "lotId", "machineId", "createdAt"
from "InventoryTransaction"
order by "createdAt" desc
limit 20;

-- Example live updates. Uncomment the lines you want to apply.
-- update "Machine"
-- set "displayName" = 'Front Counter'
-- where "machineCode" = 'MCH-001';

-- update "Lot"
-- set location = 'Warehouse A'
-- where "lotNumber" = 'AMX-LOT-2401';

-- update "PillType"
-- set name = 'Amoxicillin 500mg'
-- where code = 'AMOX500';

-- After updates, keep matching verification queries below.
-- select "machineCode", "displayName" from "Machine" where "machineCode" = 'MCH-001';
-- select "lotNumber", location from "Lot" where "lotNumber" = 'AMX-LOT-2401';
-- select code, name from "PillType" where code = 'AMOX500';
