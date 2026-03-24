# Live DB Editing

This project uses a live PostgreSQL database, not a text file database.

## What to edit

Edit this file in VS Code:

- `data/live-edit.sql`

See the current live rows in:

- `data/live-current.md`

If `npm run dev` is running, saving `data/live-edit.sql` auto-applies it to the live database.

You can also apply it manually with:

```bash
npm run db:apply
```

Refresh the readable live data file with:

```bash
npm run db:view
```

## What not to edit

- `data/pillcount-postgres.sql`

That file is only a dump/snapshot. Editing it does not change the live web app.

## Page to table map

- `/overview`: `Machine`, `MachineEvent`, `CountingJob`, report aggregates
- `/machines`: `Machine`, `MachineEvent`
- `/lots-expiry`: `Lot`, `PillType`
- `/inventory`: `InventoryBalance`, `InventoryTransaction`, `PillType`, `Lot`
- `/jobs`: `CountingJob`, `JobProgress`, `JobEvidence`, `Machine`, `PillType`, `Lot`
- `/users-roles`: `User`, `Role`, `UserRole`
- `/settings`: `ApiKey`
- `/audit-log`: `AuditLog`

## Notes

- Changes made through `data/live-edit.sql` affect the live PostgreSQL database.
- In development, `npm run dev` includes the SQL watcher, and the web app refetches data every 3 seconds.
- Direct SQL bypasses application validation and business rules. Use it carefully.
