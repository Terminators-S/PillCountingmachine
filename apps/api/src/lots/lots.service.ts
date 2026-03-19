import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLotDto } from './dto/create-lot.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { Prisma } from '@prisma/client';
import { LiveEventsService } from '../live/live-events.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LotsService {
  private readonly expiryAlertDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly liveEvents: LiveEventsService,
    private readonly configService: ConfigService
  ) {
    this.expiryAlertDays = Number(this.configService.get('EXPIRY_ALERT_DAYS') || 30);
  }

  private emitExpiryAlertIfNeeded(lot: { id: string; lotNumber: string; expiryDate: Date; location: string }) {
    const daysToExpiry = Math.ceil((lot.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysToExpiry <= this.expiryAlertDays) {
      this.liveEvents.publish('expiry.alert', {
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        location: lot.location,
        daysToExpiry
      });
    }
  }

  async create(input: CreateLotDto) {
    try {
      const lot = await this.prisma.lot.create({
        data: {
          pillTypeId: input.pillTypeId,
          lotNumber: input.lotNumber,
          expiryDate: new Date(input.expiryDate),
          receivedDate: new Date(input.receivedDate),
          unitCost: input.unitCost,
          location: input.location,
          isQuarantined: Boolean(input.isQuarantined)
        }
      });

      this.emitExpiryAlertIfNeeded(lot);
      return lot;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'LOT_DUPLICATE', message: 'Lot number already exists for this pill type' });
      }
      throw error;
    }
  }

  async list(query?: { pillTypeId?: string; location?: string; expiringDays?: number }) {
    const expiryUpper = query?.expiringDays ? new Date(Date.now() + query.expiringDays * 24 * 60 * 60 * 1000) : undefined;

    return this.prisma.lot.findMany({
      where: {
        pillTypeId: query?.pillTypeId || undefined,
        location: query?.location || undefined,
        expiryDate: expiryUpper ? { lte: expiryUpper } : undefined
      },
      include: {
        pillType: {
          select: {
            id: true,
            code: true,
            name: true
          }
        }
      },
      orderBy: [{ expiryDate: 'asc' }, { lotNumber: 'asc' }]
    });
  }

  async details(id: string) {
    const row = await this.prisma.lot.findUnique({
      where: { id },
      include: { pillType: true }
    });
    if (!row) {
      throw new NotFoundException({ code: 'LOT_NOT_FOUND', message: 'Lot not found' });
    }

    return row;
  }

  async update(id: string, input: UpdateLotDto) {
    await this.details(id);

    try {
      const lot = await this.prisma.lot.update({
        where: { id },
        data: {
          pillTypeId: input.pillTypeId,
          lotNumber: input.lotNumber,
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
          receivedDate: input.receivedDate ? new Date(input.receivedDate) : undefined,
          unitCost: input.unitCost,
          location: input.location,
          isQuarantined: typeof input.isQuarantined === 'boolean' ? input.isQuarantined : undefined
        }
      });

      this.emitExpiryAlertIfNeeded(lot);
      return lot;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'LOT_DUPLICATE', message: 'Lot number already exists for this pill type' });
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.details(id);
    await this.prisma.lot.delete({ where: { id } });
    return { ok: true };
  }
}
