import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { LiveEventsService } from '../live/live-events.service';
import {
  AddEvidenceDto,
  CompleteJobDto,
  CreateJobDto,
  JobProgressDto,
  RecountJobDto,
  StartJobDto
} from './dto/jobs.dto';

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly liveEvents: LiveEventsService
  ) {}

  private createJobNumber() {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    const suffix = Math.floor(Math.random() * 9000) + 1000;
    return `JOB-${stamp}-${suffix}`;
  }

  async create(input: CreateJobDto, createdById: string) {
    await this.prisma.machine.findUniqueOrThrow({ where: { id: input.machineId } });
    await this.prisma.pillType.findUniqueOrThrow({ where: { id: input.pillTypeId } });

    if (input.lotPreferenceId) {
      const lot = await this.prisma.lot.findUnique({ where: { id: input.lotPreferenceId } });
      if (!lot || lot.pillTypeId !== input.pillTypeId) {
        throw new BadRequestException({ code: 'LOT_MISMATCH', message: 'Lot preference does not match pill type' });
      }
    }

    const job = await this.prisma.countingJob.create({
      data: {
        jobNumber: this.createJobNumber(),
        machineId: input.machineId,
        pillTypeId: input.pillTypeId,
        targetQty: input.targetQty,
        lotPreferenceId: input.lotPreferenceId,
        tolerancePct: input.tolerancePct ?? 2,
        operatorId: input.operatorId,
        notes: input.notes,
        createdById
      }
    });

    this.liveEvents.publish('job.created', {
      jobId: job.id,
      jobNumber: job.jobNumber,
      machineId: job.machineId,
      pillTypeId: job.pillTypeId,
      targetQty: job.targetQty
    });

    return job;
  }

  async list(query: { status?: JobStatus; machineId?: string; pillTypeId?: string }) {
    return this.prisma.countingJob.findMany({
      where: {
        status: query.status,
        machineId: query.machineId,
        pillTypeId: query.pillTypeId
      },
      include: {
        machine: true,
        pillType: true,
        lotPreference: true,
        operator: true,
        createdBy: true,
        progress: {
          take: 20,
          orderBy: { createdAt: 'desc' }
        },
        evidence: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async details(jobId: string) {
    const job = await this.prisma.countingJob.findUnique({
      where: { id: jobId },
      include: {
        machine: true,
        pillType: true,
        lotPreference: true,
        progress: { orderBy: { createdAt: 'desc' } },
        evidence: { orderBy: { createdAt: 'desc' } },
        createdBy: true,
        operator: true
      }
    });

    if (!job) {
      throw new NotFoundException({ code: 'JOB_NOT_FOUND', message: 'Job not found' });
    }

    return job;
  }

  async start(jobId: string, input: StartJobDto) {
    const job = await this.details(jobId);
    if (job.status !== JobStatus.CREATED && job.status !== JobStatus.NEEDS_RECOUNT) {
      throw new BadRequestException({ code: 'JOB_INVALID_STATE', message: 'Only created/recount jobs can be started' });
    }

    const updated = await this.prisma.countingJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.IN_PROGRESS,
        startedAt: job.startedAt || new Date(),
        operatorId: input.operatorId || job.operatorId
      }
    });

    this.liveEvents.publish('job.started', {
      jobId: updated.id,
      jobNumber: updated.jobNumber
    });

    return updated;
  }

  async progress(jobId: string, input: JobProgressDto, actorUserId: string) {
    const job = await this.details(jobId);
    if (job.status !== JobStatus.IN_PROGRESS) {
      throw new BadRequestException({ code: 'JOB_NOT_ACTIVE', message: 'Job must be in progress' });
    }

    const entry = await this.prisma.jobProgress.create({
      data: {
        jobId,
        progressQty: input.progressQty,
        message: input.message,
        createdById: actorUserId
      }
    });

    this.liveEvents.publish('job.progress', {
      jobId,
      progressQty: input.progressQty,
      message: input.message || null
    });

    return entry;
  }

  async complete(jobId: string, input: CompleteJobDto, actorUserId: string) {
    const job = await this.details(jobId);
    if (job.status !== JobStatus.IN_PROGRESS) {
      throw new BadRequestException({ code: 'JOB_NOT_ACTIVE', message: 'Job must be in progress before completion' });
    }

    const target = Number(job.targetQty || 0);
    const actual = Number(input.actualQty || 0);
    const variancePct = target === 0 ? 0 : (Math.abs(actual - target) / target) * 100;
    const tolerance = Number(job.tolerancePct || 0);

    const nextStatus = variancePct > tolerance ? JobStatus.NEEDS_RECOUNT : JobStatus.COMPLETED;

    const updated = await this.prisma.countingJob.update({
      where: { id: jobId },
      data: {
        actualQty: actual,
        status: nextStatus,
        operatorId: input.operatorId || job.operatorId || actorUserId,
        completedAt: nextStatus === JobStatus.COMPLETED ? new Date() : null
      }
    });

    if (Array.isArray(input.evidenceLinks) && input.evidenceLinks.length) {
      await this.prisma.jobEvidence.createMany({
        data: input.evidenceLinks.map((url) => ({
          jobId,
          url,
          uploadedById: actorUserId,
          evidenceType: 'external-link'
        }))
      });
    }

    if (nextStatus === JobStatus.COMPLETED) {
      const location = job.machine.location;
      await this.inventoryService.dispenseStock(
        {
          idempotencyKey: `job-complete:${job.id}`,
          pillTypeId: job.pillTypeId,
          lotId: job.lotPreferenceId || undefined,
          location,
          quantity: actual,
          machineId: job.machineId,
          jobId: job.id,
          reason: 'Dispense on job completion'
        },
        actorUserId
      );

      this.liveEvents.publish('job.completed', {
        jobId: updated.id,
        jobNumber: updated.jobNumber,
        targetQty: target,
        actualQty: actual,
        tolerancePct: tolerance,
        variancePct
      });
    } else {
      this.liveEvents.publish('job.recount.required', {
        jobId: updated.id,
        jobNumber: updated.jobNumber,
        targetQty: target,
        actualQty: actual,
        tolerancePct: tolerance,
        variancePct
      });
    }

    return {
      ...updated,
      variancePct
    };
  }

  async recount(jobId: string, input: RecountJobDto, actorUserId: string) {
    const original = await this.details(jobId);

    if (original.status !== JobStatus.NEEDS_RECOUNT) {
      throw new BadRequestException({ code: 'RECOUNT_NOT_ALLOWED', message: 'Job is not in NEEDS_RECOUNT state' });
    }

    const newJob = await this.prisma.countingJob.create({
      data: {
        jobNumber: this.createJobNumber(),
        machineId: original.machineId,
        pillTypeId: original.pillTypeId,
        targetQty: original.targetQty,
        lotPreferenceId: original.lotPreferenceId,
        tolerancePct: original.tolerancePct,
        status: JobStatus.CREATED,
        createdById: actorUserId,
        operatorId: original.operatorId,
        recountOfJobId: original.id,
        notes: input.reason
      }
    });

    this.liveEvents.publish('job.recount.created', {
      originalJobId: original.id,
      recountJobId: newJob.id,
      reason: input.reason
    });

    return newJob;
  }

  async addEvidence(jobId: string, input: AddEvidenceDto, actorUserId: string) {
    await this.details(jobId);

    return this.prisma.jobEvidence.create({
      data: {
        jobId,
        url: input.url,
        evidenceType: input.evidenceType || 'external-link',
        uploadedById: actorUserId
      }
    });
  }
}
