import { PrismaClient, RoleCode, MachineStatus, InventoryTxnType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const roleEntries: Array<{ code: RoleCode; name: string }> = [
    { code: RoleCode.ADMIN, name: 'Admin' },
    { code: RoleCode.SUPERVISOR, name: 'Supervisor' },
    { code: RoleCode.OPERATOR, name: 'Operator' },
    { code: RoleCode.AUDITOR, name: 'Auditor' },
    { code: RoleCode.VIEWER, name: 'Viewer' },
    { code: RoleCode.API_ONLY, name: 'API-only' }
  ];

  for (const role of roleEntries) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role
    });
  }

  const adminPasswordHash = await bcrypt.hash('Admin1234!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@pillcount.local' },
    update: { fullName: 'Platform Admin', passwordHash: adminPasswordHash },
    create: {
      email: 'admin@pillcount.local',
      fullName: 'Platform Admin',
      passwordHash: adminPasswordHash
    }
  });

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: adminRole.id
      }
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: adminRole.id
    }
  });

  const seedApiKey = 'mch_live_seed_key_123456789';
  const keyHash = createHash('sha256').update(seedApiKey).digest('hex');
  await prisma.apiKey.upsert({
    where: { keyPrefix: seedApiKey.slice(0, 8) },
    update: {
      name: 'Seed machine key',
      keyHash,
      isActive: true,
      scopes: ['machine:write', 'events:write']
    },
    create: {
      name: 'Seed machine key',
      keyPrefix: seedApiKey.slice(0, 8),
      keyHash,
      isActive: true,
      scopes: ['machine:write', 'events:write'],
      createdById: admin.id
    }
  });

  await prisma.appSetting.upsert({
    where: { key: 'branding' },
    update: {
      value: {
        productName: 'PillCount Operations Console',
        organizationName: 'Pharmacy Operations',
        logoUrl: '',
        supportLabel: 'Real-time machine control',
        welcomeMessage: 'Live pill counting, machine monitoring, exports, and audit-ready operations in one place.',
        accentNote: 'Use the live dashboard for camera control, model switching, and session exports.',
        liveTagline: 'Monitor your machine, model, and count stream in real time.',
        authHeadline: 'Secure operator sign-in',
        authSubheadline: 'Access the pharmacy and warehouse workflow with your staff account.'
      }
    },
    create: {
      key: 'branding',
      value: {
        productName: 'PillCount Operations Console',
        organizationName: 'Pharmacy Operations',
        logoUrl: '',
        supportLabel: 'Real-time machine control',
        welcomeMessage: 'Live pill counting, machine monitoring, exports, and audit-ready operations in one place.',
        accentNote: 'Use the live dashboard for camera control, model switching, and session exports.',
        liveTagline: 'Monitor your machine, model, and count stream in real time.',
        authHeadline: 'Secure operator sign-in',
        authSubheadline: 'Access the pharmacy and warehouse workflow with your staff account.'
      }
    }
  });

  const machine = await prisma.machine.upsert({
    where: { machineCode: 'MCH-001' },
    update: {
      displayName: 'Main Line Counter',
      location: 'Main Pharmacy',
      firmwareVersion: '1.2.0',
      status: MachineStatus.ONLINE,
      lastSeen: new Date()
    },
    create: {
      machineCode: 'MCH-001',
      displayName: 'Main Line Counter',
      location: 'Main Pharmacy',
      firmwareVersion: '1.2.0',
      status: MachineStatus.ONLINE,
      lastSeen: new Date()
    }
  });

  const amox = await prisma.pillType.upsert({
    where: { code: 'AMOX500' },
    update: {},
    create: {
      code: 'AMOX500',
      name: 'Amoxicillin',
      dosageMg: 500,
      manufacturer: 'MedCo',
      barcode: '1111111111111'
    }
  });

  const para = await prisma.pillType.upsert({
    where: { code: 'PARA500' },
    update: {},
    create: {
      code: 'PARA500',
      name: 'Paracetamol',
      dosageMg: 500,
      manufacturer: 'Health Labs',
      barcode: '2222222222222'
    }
  });

  const ceti = await prisma.pillType.upsert({
    where: { code: 'CETI10' },
    update: {},
    create: {
      code: 'CETI10',
      name: 'Cetirizine',
      dosageMg: 10,
      manufacturer: 'Allergy Pharma',
      barcode: '3333333333333'
    }
  });

  const lot1 = await prisma.lot.upsert({
    where: { pillTypeId_lotNumber: { pillTypeId: amox.id, lotNumber: 'AMX-LOT-2401' } },
    update: {},
    create: {
      pillTypeId: amox.id,
      lotNumber: 'AMX-LOT-2401',
      expiryDate: new Date('2027-08-31T00:00:00Z'),
      receivedDate: new Date('2026-01-15T00:00:00Z'),
      unitCost: 0.12,
      location: 'Main Pharmacy'
    }
  });

  const lot2 = await prisma.lot.upsert({
    where: { pillTypeId_lotNumber: { pillTypeId: para.id, lotNumber: 'PARA-LOT-2409' } },
    update: {},
    create: {
      pillTypeId: para.id,
      lotNumber: 'PARA-LOT-2409',
      expiryDate: new Date('2027-02-28T00:00:00Z'),
      receivedDate: new Date('2026-02-12T00:00:00Z'),
      unitCost: 0.05,
      location: 'Main Pharmacy'
    }
  });

  const lot3 = await prisma.lot.upsert({
    where: { pillTypeId_lotNumber: { pillTypeId: ceti.id, lotNumber: 'CETI-LOT-2501' } },
    update: {},
    create: {
      pillTypeId: ceti.id,
      lotNumber: 'CETI-LOT-2501',
      expiryDate: new Date('2026-12-31T00:00:00Z'),
      receivedDate: new Date('2026-03-01T00:00:00Z'),
      unitCost: 0.08,
      location: 'Main Pharmacy'
    }
  });

  const receiveRows = [
    { lot: lot1, pillType: amox, qty: 1200 },
    { lot: lot2, pillType: para, qty: 2000 },
    { lot: lot3, pillType: ceti, qty: 800 }
  ];

  for (const row of receiveRows) {
    await prisma.inventoryBalance.upsert({
      where: {
        pillTypeId_lotId_location: {
          pillTypeId: row.pillType.id,
          lotId: row.lot.id,
          location: 'Main Pharmacy'
        }
      },
      update: { onHand: row.qty, reserved: 0, quarantined: 0 },
      create: {
        pillTypeId: row.pillType.id,
        lotId: row.lot.id,
        location: 'Main Pharmacy',
        onHand: row.qty,
        reserved: 0,
        quarantined: 0
      }
    });

    await prisma.inventoryTransaction.create({
      data: {
        txnType: InventoryTxnType.RECEIVE,
        pillTypeId: row.pillType.id,
        lotId: row.lot.id,
        location: 'Main Pharmacy',
        quantity: row.qty,
        idempotencyKey: `seed-receive-${row.lot.id}`,
        referenceType: 'SEED',
        referenceId: row.lot.lotNumber,
        reason: 'Seed stock'
      }
    });
  }

  await prisma.machineEvent.create({
    data: {
      machineId: machine.id,
      eventType: 'machine.register',
      occurredAt: new Date(),
      idempotencyKey: `seed-register-${machine.id}`,
      payload: {
        machineCode: machine.machineCode,
        firmwareVersion: machine.firmwareVersion,
        location: machine.location
      }
    }
  });

  await prisma.machineEvent.create({
    data: {
      machineId: machine.id,
      eventType: 'machine.heartbeat',
      occurredAt: new Date(),
      idempotencyKey: `seed-heartbeat-${machine.id}`,
      payload: {
        status: 'ONLINE',
        queueDepth: 0
      }
    }
  });

  console.log('Seed complete.');
  console.log('Admin login: admin@pillcount.local / Admin1234!');
  console.log('Seed machine API key:', seedApiKey);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
