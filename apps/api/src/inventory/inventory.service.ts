import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InventoryTxnType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LiveEventsService } from '../live/live-events.service';
import {
  AdjustStockDto,
  CycleCountDto,
  DispenseStockDto,
  InventoryBalanceQueryDto,
  InventoryMovementQueryDto,
  ReceiveStockDto,
  ReleaseStockDto,
  ReserveStockDto,
  TransferStockDto
} from './dto/inventory.dto';

@Injectable()
export class InventoryService {
  private readonly lowStockThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEvents: LiveEventsService,
    private readonly configService: ConfigService
  ) {
    this.lowStockThreshold = Number(this.configService.get('LOW_STOCK_THRESHOLD') || 20);
  }

  private async findExistingByIdempotency(idempotencyKey: string) {
    const existing = await this.prisma.inventoryTransaction.findFirst({
      where: {
        OR: [
          { idempotencyKey },
          { idempotencyKey: { startsWith: `${idempotencyKey}:` } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    return existing;
  }

  private async ensureLot(tx: Prisma.TransactionClient, lotId: string, pillTypeId: string) {
    const lot = await tx.lot.findUnique({ where: { id: lotId } });
    if (!lot || lot.pillTypeId !== pillTypeId) {
      throw new NotFoundException({ code: 'LOT_NOT_FOUND', message: 'Lot does not exist for this pill type' });
    }

    return lot;
  }

  private async getOrCreateBalance(tx: Prisma.TransactionClient, pillTypeId: string, lotId: string, location: string) {
    return tx.inventoryBalance.upsert({
      where: {
        pillTypeId_lotId_location: {
          pillTypeId,
          lotId,
          location
        }
      },
      update: {},
      create: {
        pillTypeId,
        lotId,
        location,
        onHand: 0,
        reserved: 0,
        quarantined: 0
      }
    });
  }

  private assertAvailability(balance: { onHand: number; reserved: number; quarantined: number }, qty: number) {
    const available = balance.onHand - balance.reserved - balance.quarantined;
    if (available < qty) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_AVAILABLE_STOCK',
        message: `Insufficient available stock. Required ${qty}, available ${available}`
      });
    }
  }

  private async createTransaction(tx: Prisma.TransactionClient, data: Prisma.InventoryTransactionCreateInput) {
    try {
      return await tx.inventoryTransaction.create({ data });
    } catch (error) {
      if ((error as any)?.code === 'P2002') {
        throw new ConflictException({
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Duplicate idempotency key'
        });
      }
      throw error;
    }
  }

  private emitLowStock(balance: { location: string; onHand: number; lotId: string; pillTypeId: string }) {
    const available = balance.onHand;
    if (available <= this.lowStockThreshold) {
      this.liveEvents.publish('inventory.low_stock', {
        location: balance.location,
        lotId: balance.lotId,
        pillTypeId: balance.pillTypeId,
        onHand: available,
        threshold: this.lowStockThreshold
      });
    }
  }

  async receiveStock(input: ReceiveStockDto, actorUserId?: string) {
    const existing = await this.findExistingByIdempotency(input.idempotencyKey);
    if (existing) {
      return { deduped: true, transactionId: existing.id };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.pillType.findUniqueOrThrow({ where: { id: input.pillTypeId } });
      await this.ensureLot(tx, input.lotId, input.pillTypeId);

      const balance = await this.getOrCreateBalance(tx, input.pillTypeId, input.lotId, input.location);
      const updated = await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHand: { increment: input.quantity } }
      });

      const transaction = await this.createTransaction(tx, {
        txnType: InventoryTxnType.RECEIVE,
        pillType: { connect: { id: input.pillTypeId } },
        lot: { connect: { id: input.lotId } },
        location: input.location,
        quantity: input.quantity,
        operator: actorUserId ? { connect: { id: actorUserId } } : undefined,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason || 'Receive stock'
      });

      return { transaction, updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.liveEvents.publish('inventory.received', {
      transactionId: result.transaction.id,
      pillTypeId: input.pillTypeId,
      lotId: input.lotId,
      location: input.location,
      quantity: input.quantity
    });

    return { deduped: false, transactionId: result.transaction.id };
  }

  async transferStock(input: TransferStockDto, actorUserId?: string) {
    if (input.fromLocation === input.toLocation) {
      throw new BadRequestException({ code: 'INVALID_TRANSFER', message: 'fromLocation and toLocation must differ' });
    }

    const existing = await this.findExistingByIdempotency(input.idempotencyKey);
    if (existing) {
      return { deduped: true, transactionId: existing.id };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.pillType.findUniqueOrThrow({ where: { id: input.pillTypeId } });
      await this.ensureLot(tx, input.lotId, input.pillTypeId);

      const fromBalance = await this.getOrCreateBalance(tx, input.pillTypeId, input.lotId, input.fromLocation);
      this.assertAvailability(fromBalance, input.quantity);

      await tx.inventoryBalance.update({
        where: { id: fromBalance.id },
        data: { onHand: fromBalance.onHand - input.quantity }
      });

      const toBalance = await this.getOrCreateBalance(tx, input.pillTypeId, input.lotId, input.toLocation);
      await tx.inventoryBalance.update({
        where: { id: toBalance.id },
        data: { onHand: toBalance.onHand + input.quantity }
      });

      const transaction = await this.createTransaction(tx, {
        txnType: InventoryTxnType.TRANSFER,
        pillType: { connect: { id: input.pillTypeId } },
        lot: { connect: { id: input.lotId } },
        location: input.toLocation,
        fromLocation: input.fromLocation,
        toLocation: input.toLocation,
        quantity: input.quantity,
        operator: actorUserId ? { connect: { id: actorUserId } } : undefined,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason || 'Transfer stock'
      });

      return transaction;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.liveEvents.publish('inventory.transferred', {
      transactionId: result.id,
      pillTypeId: input.pillTypeId,
      lotId: input.lotId,
      fromLocation: input.fromLocation,
      toLocation: input.toLocation,
      quantity: input.quantity
    });

    return { deduped: false, transactionId: result.id };
  }

  async adjustStock(input: AdjustStockDto, actorUserId?: string) {
    if (!input.approvedByUserId) {
      throw new BadRequestException({ code: 'APPROVAL_REQUIRED', message: 'approvedByUserId is required for adjustments' });
    }

    const existing = await this.findExistingByIdempotency(input.idempotencyKey);
    if (existing) {
      return { deduped: true, transactionId: existing.id };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.user.findUniqueOrThrow({ where: { id: input.approvedByUserId } });
      await tx.pillType.findUniqueOrThrow({ where: { id: input.pillTypeId } });
      await this.ensureLot(tx, input.lotId, input.pillTypeId);

      const balance = await this.getOrCreateBalance(tx, input.pillTypeId, input.lotId, input.location);
      const nextOnHand = balance.onHand + input.quantityDelta;

      if (nextOnHand < 0 || nextOnHand < balance.reserved + balance.quarantined) {
        throw new BadRequestException({ code: 'NEGATIVE_STOCK', message: 'Adjustment would result in invalid balance' });
      }

      const updated = await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { onHand: nextOnHand }
      });

      const transaction = await this.createTransaction(tx, {
        txnType: InventoryTxnType.ADJUST,
        pillType: { connect: { id: input.pillTypeId } },
        lot: { connect: { id: input.lotId } },
        location: input.location,
        quantity: input.quantityDelta,
        operator: actorUserId ? { connect: { id: actorUserId } } : undefined,
        approvedBy: { connect: { id: input.approvedByUserId } },
        idempotencyKey: input.idempotencyKey,
        reason: input.reason || 'Stock adjustment'
      });

      return { transaction, updated };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.emitLowStock({
      location: input.location,
      lotId: input.lotId,
      pillTypeId: input.pillTypeId,
      onHand: result.updated.onHand
    });

    return { deduped: false, transactionId: result.transaction.id };
  }

  async reserveStock(input: ReserveStockDto, actorUserId?: string) {
    const existing = await this.findExistingByIdempotency(input.idempotencyKey);
    if (existing) {
      return { deduped: true, transactionId: existing.id };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const balance = await this.getOrCreateBalance(tx, input.pillTypeId, input.lotId, input.location);
      this.assertAvailability(balance, input.quantity);

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { reserved: balance.reserved + input.quantity }
      });

      return this.createTransaction(tx, {
        txnType: InventoryTxnType.RESERVE,
        pillType: { connect: { id: input.pillTypeId } },
        lot: { connect: { id: input.lotId } },
        location: input.location,
        quantity: input.quantity,
        operator: actorUserId ? { connect: { id: actorUserId } } : undefined,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason || 'Reserve stock'
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { deduped: false, transactionId: result.id };
  }

  async releaseStock(input: ReleaseStockDto, actorUserId?: string) {
    const existing = await this.findExistingByIdempotency(input.idempotencyKey);
    if (existing) {
      return { deduped: true, transactionId: existing.id };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const balance = await this.getOrCreateBalance(tx, input.pillTypeId, input.lotId, input.location);
      if (balance.reserved < input.quantity) {
        throw new BadRequestException({ code: 'RESERVE_UNDERFLOW', message: 'Release quantity exceeds reserved stock' });
      }

      await tx.inventoryBalance.update({
        where: { id: balance.id },
        data: { reserved: balance.reserved - input.quantity }
      });

      return this.createTransaction(tx, {
        txnType: InventoryTxnType.RELEASE,
        pillType: { connect: { id: input.pillTypeId } },
        lot: { connect: { id: input.lotId } },
        location: input.location,
        quantity: input.quantity,
        operator: actorUserId ? { connect: { id: actorUserId } } : undefined,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason || 'Release stock'
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { deduped: false, transactionId: result.id };
  }

  async dispenseStock(input: DispenseStockDto, actorUserId?: string) {
    const existing = await this.findExistingByIdempotency(input.idempotencyKey);
    if (existing) {
      return { deduped: true, transactionId: existing.id };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.pillType.findUniqueOrThrow({ where: { id: input.pillTypeId } });

      let candidates = await tx.inventoryBalance.findMany({
        where: {
          pillTypeId: input.pillTypeId,
          location: input.location,
          lotId: input.lotId || undefined
        },
        include: {
          lot: true
        }
      });

      candidates = candidates
        .filter((row) => (row.onHand - row.reserved - row.quarantined) > 0)
        .filter((row) => !row.lot.isQuarantined)
        .sort((left, right) => left.lot.expiryDate.getTime() - right.lot.expiryDate.getTime());

      if (!candidates.length) {
        throw new BadRequestException({ code: 'NO_STOCK_AVAILABLE', message: 'No stock available for dispense' });
      }

      let remaining = input.quantity;
      const allocations: Array<{ balanceId: string; lotId: string; qty: number; onHand: number }> = [];

      for (const candidate of candidates) {
        if (remaining <= 0) break;
        const available = candidate.onHand - candidate.reserved - candidate.quarantined;
        if (available <= 0) continue;

        const takeQty = Math.min(available, remaining);
        allocations.push({
          balanceId: candidate.id,
          lotId: candidate.lotId,
          qty: takeQty,
          onHand: candidate.onHand
        });
        remaining -= takeQty;
      }

      if (remaining > 0) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_AVAILABLE_STOCK',
          message: `Unable to allocate ${input.quantity}; missing ${remaining}`
        });
      }

      const transactionIds: string[] = [];
      for (let index = 0; index < allocations.length; index += 1) {
        const allocation = allocations[index];
        const updated = await tx.inventoryBalance.update({
          where: { id: allocation.balanceId },
          data: {
            onHand: allocation.onHand - allocation.qty
          }
        });

        const transaction = await this.createTransaction(tx, {
          txnType: InventoryTxnType.DISPENSE,
          pillType: { connect: { id: input.pillTypeId } },
          lot: { connect: { id: allocation.lotId } },
          machine: input.machineId ? { connect: { id: input.machineId } } : undefined,
          job: input.jobId ? { connect: { id: input.jobId } } : undefined,
          operator: actorUserId ? { connect: { id: actorUserId } } : undefined,
          location: input.location,
          quantity: allocation.qty,
          idempotencyKey: `${input.idempotencyKey}:${index}`,
          reason: input.reason || 'Dispense stock'
        });

        transactionIds.push(transaction.id);
        this.emitLowStock({
          location: input.location,
          lotId: allocation.lotId,
          pillTypeId: input.pillTypeId,
          onHand: updated.onHand
        });
      }

      return transactionIds;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.liveEvents.publish('inventory.dispensed', {
      pillTypeId: input.pillTypeId,
      location: input.location,
      quantity: input.quantity,
      transactionIds: result
    });

    return { deduped: false, transactionIds: result };
  }

  async cycleCount(input: CycleCountDto, actorUserId: string) {
    const existing = await this.findExistingByIdempotency(input.idempotencyKey);
    if (existing) {
      return { deduped: true, sessionId: existing.referenceId };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.cycleCountSession.create({
        data: {
          location: input.location,
          startedById: actorUserId,
          notes: input.reason || 'Cycle count session',
          completedAt: new Date()
        }
      });

      for (let index = 0; index < input.items.length; index += 1) {
        const item = input.items[index];
        const balance = await this.getOrCreateBalance(tx, item.pillTypeId, item.lotId, input.location);
        const expectedQty = balance.onHand;
        const delta = item.countedQty - expectedQty;

        await tx.cycleCountItem.create({
          data: {
            sessionId: session.id,
            lotId: item.lotId,
            pillTypeId: item.pillTypeId,
            expectedQty,
            countedQty: item.countedQty,
            delta
          }
        });

        if (delta !== 0) {
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { onHand: item.countedQty }
          });

          await this.createTransaction(tx, {
            txnType: InventoryTxnType.CYCLE_COUNT,
            pillType: { connect: { id: item.pillTypeId } },
            lot: { connect: { id: item.lotId } },
            location: input.location,
            quantity: delta,
            operator: { connect: { id: actorUserId } },
            idempotencyKey: `${input.idempotencyKey}:${index}`,
            reason: input.reason || 'Cycle count adjustment',
            referenceType: 'CYCLE_COUNT',
            referenceId: session.id
          });
        }
      }

      return session.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    this.liveEvents.publish('inventory.cycle_count.completed', {
      sessionId: result,
      location: input.location,
      itemCount: input.items.length
    });

    return { deduped: false, sessionId: result };
  }

  async balances(query: InventoryBalanceQueryDto) {
    return this.prisma.inventoryBalance.findMany({
      where: {
        pillTypeId: query.pillTypeId || undefined,
        location: query.location || undefined,
        lot: query.lotNumber ? { lotNumber: { contains: query.lotNumber, mode: 'insensitive' } } : undefined
      },
      include: {
        pillType: true,
        lot: true
      },
      orderBy: [{ lot: { expiryDate: 'asc' } }, { location: 'asc' }]
    });
  }

  async movements(query: InventoryMovementQueryDto) {
    const limit = Math.min(500, Math.max(1, Number(query.limit || 100)));

    return this.prisma.inventoryTransaction.findMany({
      where: {
        txnType: query.txnType as InventoryTxnType | undefined,
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined
        }
      },
      include: {
        pillType: { select: { id: true, code: true, name: true } },
        lot: { select: { id: true, lotNumber: true, expiryDate: true } },
        machine: { select: { id: true, machineCode: true } },
        operator: { select: { id: true, email: true, fullName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}
