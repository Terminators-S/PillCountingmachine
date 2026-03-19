import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { stringify } from 'csv-stringify/sync';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [machinesTotal, jobsTotal, jobsCompleted, pillsTotal, inventoryMovements] = await Promise.all([
      this.prisma.machine.count(),
      this.prisma.countingJob.count(),
      this.prisma.countingJob.count({ where: { status: 'COMPLETED' } }),
      this.prisma.pillType.count(),
      this.prisma.inventoryTransaction.count()
    ]);

    const machinesOnline = await this.prisma.machine.count({
      where: {
        status: 'ONLINE',
        lastSeen: {
          gte: new Date(Date.now() - 60 * 1000)
        }
      }
    });

    return {
      machinesTotal,
      machinesOnline,
      jobsTotal,
      jobsCompleted,
      pillsTotal,
      inventoryMovements
    };
  }

  async throughput(from?: string, to?: string) {
    const rows = await this.prisma.countingJob.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined
        }
      },
      include: {
        machine: { select: { machineCode: true } },
        pillType: { select: { code: true, name: true } }
      },
      orderBy: { completedAt: 'desc' }
    });

    return rows.map((job) => ({
      jobId: job.id,
      jobNumber: job.jobNumber,
      machineCode: job.machine.machineCode,
      pillTypeCode: job.pillType.code,
      pillName: job.pillType.name,
      targetQty: job.targetQty,
      actualQty: job.actualQty,
      completedAt: job.completedAt
    }));
  }

  async valuationByLocation() {
    const balances = await this.prisma.inventoryBalance.findMany({
      include: {
        lot: true,
        pillType: true
      }
    });

    const byLocation = new Map<string, { location: string; totalValue: number; lines: number }>();

    for (const row of balances) {
      const value = Number(row.lot.unitCost) * row.onHand;
      const current = byLocation.get(row.location) || { location: row.location, totalValue: 0, lines: 0 };
      current.totalValue += value;
      current.lines += 1;
      byLocation.set(row.location, current);
    }

    return [...byLocation.values()].sort((a, b) => b.totalValue - a.totalValue);
  }

  async exportRecordsCsv() {
    const rows = await this.prisma.countingJob.findMany({
      include: {
        machine: true,
        pillType: true,
        operator: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10000
    });

    const csv = stringify(
      rows.map((row) => ({
        job_id: row.id,
        job_number: row.jobNumber,
        machine_code: row.machine.machineCode,
        pill_code: row.pillType.code,
        target_qty: row.targetQty,
        actual_qty: row.actualQty,
        status: row.status,
        operator: row.operator?.email || '',
        started_at: row.startedAt?.toISOString() || '',
        completed_at: row.completedAt?.toISOString() || ''
      })),
      { header: true }
    );

    return csv;
  }

  async exportInventoryMovementsCsv() {
    const rows = await this.prisma.inventoryTransaction.findMany({
      include: {
        pillType: true,
        lot: true,
        machine: true,
        operator: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20000
    });

    const csv = stringify(
      rows.map((row) => ({
        transaction_id: row.id,
        created_at: row.createdAt.toISOString(),
        txn_type: row.txnType,
        pill_code: row.pillType.code,
        lot_number: row.lot?.lotNumber || '',
        location: row.location,
        from_location: row.fromLocation || '',
        to_location: row.toLocation || '',
        quantity: row.quantity,
        machine_code: row.machine?.machineCode || '',
        operator_email: row.operator?.email || '',
        idempotency_key: row.idempotencyKey || ''
      })),
      { header: true }
    );

    return csv;
  }
}
