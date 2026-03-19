import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(120)
});

export const createPillTypeSchema = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  dosageMg: z.number().int().positive().optional(),
  manufacturer: z.string().max(120).optional(),
  barcode: z.string().max(120).optional()
});

export const createLotSchema = z.object({
  pillTypeId: z.string().uuid(),
  lotNumber: z.string().min(1).max(64),
  expiryDate: z.string().datetime(),
  receivedDate: z.string().datetime(),
  unitCost: z.number().positive(),
  location: z.string().min(1).max(120)
});
