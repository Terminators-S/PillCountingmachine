import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type EditableFieldKind = 'scalar' | 'enum';

export interface ModelFieldMeta {
  name: string;
  type: string;
  kind: EditableFieldKind;
  isId: boolean;
  isList: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isUpdatedAt: boolean;
  hasDefaultValue: boolean;
}

export interface ModelMeta {
  name: string;
  delegateKey: string;
  primaryKeyFields: string[];
  fields: ModelFieldMeta[];
}

type GenericDelegate = {
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  create(args: Record<string, unknown>): Promise<unknown>;
  update(args: Record<string, unknown>): Promise<unknown>;
  delete(args: Record<string, unknown>): Promise<unknown>;
};

@Injectable()
export class AdminService {
  private readonly models = new Map<string, ModelMeta>();

  constructor(private readonly prisma: PrismaService) {
    for (const model of Prisma.dmmf.datamodel.models) {
      const editableFields = model.fields
        .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
        .map<ModelFieldMeta>((field) => ({
          name: field.name,
          type: String(field.type),
          kind: field.kind as EditableFieldKind,
          isId: Boolean(field.isId),
          isList: Boolean(field.isList),
          isRequired: Boolean(field.isRequired),
          isUnique: Boolean(field.isUnique),
          isUpdatedAt: Boolean(field.isUpdatedAt),
          hasDefaultValue: Boolean(field.hasDefaultValue)
        }));

      const primaryKeyFields = model.primaryKey?.fields?.length
        ? [...model.primaryKey.fields]
        : editableFields.filter((field) => field.isId).map((field) => field.name);

      this.models.set(model.name, {
        name: model.name,
        delegateKey: model.name.charAt(0).toLowerCase() + model.name.slice(1),
        primaryKeyFields,
        fields: editableFields
      });
    }
  }

  listModels() {
    return [...this.models.values()]
      .map((model) => ({
        name: model.name,
        primaryKeyFields: model.primaryKeyFields,
        fields: model.fields
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listRows(modelName: string, limit = 100) {
    const model = this.getModel(modelName);
    const delegate = this.getDelegate(model);
    const take = Math.min(Math.max(Number(limit || 100), 1), 250);
    const orderBy = this.buildDefaultOrderBy(model);

    const rows = await delegate.findMany({
      take,
      orderBy
    });

    return {
      model: model.name,
      primaryKeyFields: model.primaryKeyFields,
      rows: rows.map((row) => this.serialize(row))
    };
  }

  async createRow(modelName: string, payload: Record<string, unknown>) {
    const model = this.getModel(modelName);
    const delegate = this.getDelegate(model);
    const data = this.prepareData(model, payload, true);

    const created = await delegate.create({ data });
    return this.serialize(created);
  }

  async updateRow(modelName: string, whereInput: Record<string, unknown>, payload: Record<string, unknown>) {
    const model = this.getModel(modelName);
    const delegate = this.getDelegate(model);
    const where = this.prepareWhere(model, whereInput);
    const data = this.prepareData(model, payload, false);

    if (!Object.keys(data).length) {
      throw new BadRequestException({ code: 'ADMIN_EMPTY_UPDATE', message: 'No editable fields were provided' });
    }

    const updated = await delegate.update({ where, data });
    return this.serialize(updated);
  }

  async deleteRow(modelName: string, whereInput: Record<string, unknown>) {
    const model = this.getModel(modelName);
    const delegate = this.getDelegate(model);
    const where = this.prepareWhere(model, whereInput);
    const deleted = await delegate.delete({ where });
    return this.serialize(deleted);
  }

  private getModel(modelName: string) {
    const model = this.models.get(modelName);
    if (!model) {
      throw new NotFoundException({ code: 'ADMIN_MODEL_NOT_FOUND', message: `Unknown model: ${modelName}` });
    }
    return model;
  }

  private getDelegate(model: ModelMeta): GenericDelegate {
    const delegate = (this.prisma as unknown as Record<string, GenericDelegate | undefined>)[model.delegateKey];
    if (!delegate) {
      throw new NotFoundException({ code: 'ADMIN_DELEGATE_NOT_FOUND', message: `Missing delegate: ${model.delegateKey}` });
    }
    return delegate;
  }

  private buildDefaultOrderBy(model: ModelMeta) {
    if (model.fields.some((field) => field.name === 'createdAt')) {
      return { createdAt: 'desc' } as const;
    }

    if (model.primaryKeyFields.length === 1) {
      return { [model.primaryKeyFields[0]]: 'desc' };
    }

    return undefined;
  }

  private prepareWhere(model: ModelMeta, whereInput: Record<string, unknown>) {
    if (!whereInput || typeof whereInput !== 'object') {
      throw new BadRequestException({ code: 'ADMIN_INVALID_WHERE', message: 'where must be an object' });
    }

    if (!model.primaryKeyFields.length) {
      throw new BadRequestException({ code: 'ADMIN_NO_PRIMARY_KEY', message: `${model.name} does not expose a primary key` });
    }

    if (model.primaryKeyFields.length === 1) {
      const field = this.getField(model, model.primaryKeyFields[0]);
      if (!(field.name in whereInput)) {
        throw new BadRequestException({ code: 'ADMIN_MISSING_PRIMARY_KEY', message: `Missing primary key field: ${field.name}` });
      }

      return {
        [field.name]: this.prepareFieldValue(field, (whereInput as Record<string, unknown>)[field.name])
      };
    }

    const compoundWhere: Record<string, unknown> = {};
    for (const fieldName of model.primaryKeyFields) {
      const field = this.getField(model, fieldName);
      if (!(field.name in whereInput)) {
        throw new BadRequestException({ code: 'ADMIN_MISSING_PRIMARY_KEY', message: `Missing primary key field: ${field.name}` });
      }
      compoundWhere[field.name] = this.prepareFieldValue(field, (whereInput as Record<string, unknown>)[field.name]);
    }

    return {
      [model.primaryKeyFields.join('_')]: compoundWhere
    };
  }

  private prepareData(model: ModelMeta, payload: Record<string, unknown>, allowPrimaryKeys: boolean) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException({ code: 'ADMIN_INVALID_DATA', message: 'data must be an object' });
    }

    const data: Record<string, unknown> = {};

    for (const field of model.fields) {
      if (!(field.name in payload)) {
        continue;
      }

      if (!allowPrimaryKeys && (field.isId || model.primaryKeyFields.includes(field.name))) {
        continue;
      }

      if (field.isUpdatedAt) {
        continue;
      }

      data[field.name] = this.prepareFieldValue(field, (payload as Record<string, unknown>)[field.name]);
    }

    return data;
  }

  private prepareFieldValue(field: ModelFieldMeta, value: unknown): unknown {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return null;
    }

    if (field.isList) {
      if (!Array.isArray(value)) {
        throw new BadRequestException({
          code: 'ADMIN_INVALID_LIST_VALUE',
          message: `${field.name} must be an array`
        });
      }

      return value.map((entry) => this.prepareScalarValue(field, entry));
    }

    return this.prepareScalarValue(field, value);
  }

  private prepareScalarValue(field: ModelFieldMeta, value: unknown): unknown {
    if (value === null) {
      return null;
    }

    switch (field.type) {
      case 'Int':
        return this.toNumber(field.name, value, true);
      case 'BigInt':
        return this.toBigInt(field.name, value);
      case 'Float':
        return this.toNumber(field.name, value, false);
      case 'Decimal':
        return typeof value === 'number' ? value.toString() : String(value);
      case 'Boolean':
        return this.toBoolean(field.name, value);
      case 'DateTime':
        return this.toDate(field.name, value);
      case 'Json':
        return value;
      default:
        return String(value);
    }
  }

  private toNumber(fieldName: string, value: unknown, integer: boolean) {
    const numeric = Number(value);
    const valid = integer ? Number.isInteger(numeric) : Number.isFinite(numeric);

    if (!valid) {
      throw new BadRequestException({
        code: 'ADMIN_INVALID_NUMBER',
        message: `${fieldName} must be ${integer ? 'an integer' : 'a number'}`
      });
    }

    return numeric;
  }

  private toBigInt(fieldName: string, value: unknown) {
    try {
      return BigInt(String(value));
    } catch (_error) {
      throw new BadRequestException({
        code: 'ADMIN_INVALID_BIGINT',
        message: `${fieldName} must be a bigint-compatible value`
      });
    }
  }

  private toBoolean(fieldName: string, value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }

    throw new BadRequestException({
      code: 'ADMIN_INVALID_BOOLEAN',
      message: `${fieldName} must be true or false`
    });
  }

  private toDate(fieldName: string, value: unknown) {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException({
        code: 'ADMIN_INVALID_DATE',
        message: `${fieldName} must be a valid ISO datetime string`
      });
    }

    return date;
  }

  private getField(model: ModelMeta, fieldName: string) {
    const field = model.fields.find((entry) => entry.name === fieldName);
    if (!field) {
      throw new BadRequestException({
        code: 'ADMIN_FIELD_NOT_FOUND',
        message: `Unknown field ${fieldName} on model ${model.name}`
      });
    }
    return field;
  }

  private serialize(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.serialize(entry));
    }

    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, this.serialize(entry)])
      );
    }

    return value;
  }
}
