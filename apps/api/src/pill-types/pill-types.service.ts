import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePillTypeDto } from './dto/create-pill-type.dto';
import { UpdatePillTypeDto } from './dto/update-pill-type.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PillTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePillTypeDto) {
    try {
      return await this.prisma.pillType.create({
        data: {
          code: input.code.trim().toUpperCase(),
          name: input.name,
          dosageMg: input.dosageMg,
          manufacturer: input.manufacturer,
          barcode: input.barcode
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'PILL_TYPE_DUPLICATE', message: 'Pill type code or barcode already exists' });
      }
      throw error;
    }
  }

  async list(query?: { search?: string }) {
    return this.prisma.pillType.findMany({
      where: query?.search
        ? {
            OR: [
              { code: { contains: query.search, mode: 'insensitive' } },
              { name: { contains: query.search, mode: 'insensitive' } },
              { manufacturer: { contains: query.search, mode: 'insensitive' } }
            ]
          }
        : undefined,
      orderBy: { name: 'asc' }
    });
  }

  async details(id: string) {
    const row = await this.prisma.pillType.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'PILL_TYPE_NOT_FOUND', message: 'Pill type not found' });
    }
    return row;
  }

  async update(id: string, input: UpdatePillTypeDto) {
    await this.details(id);
    try {
      return await this.prisma.pillType.update({
        where: { id },
        data: {
          code: input.code?.trim().toUpperCase(),
          name: input.name,
          dosageMg: input.dosageMg,
          manufacturer: input.manufacturer,
          barcode: input.barcode
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'PILL_TYPE_DUPLICATE', message: 'Pill type code or barcode already exists' });
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.details(id);
    await this.prisma.pillType.delete({ where: { id } });
    return { ok: true };
  }
}
