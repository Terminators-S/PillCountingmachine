import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MachineRuntimeModelCatalog,
  MachineRuntimeModelCatalogEntry,
  RoboflowDeploymentTarget,
  RuntimeDeviceProfile
} from '../runtime/runtime.types';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateRoboflowConfigDto } from './dto/update-roboflow-config.dto';
import { UpsertRoboflowModelDto } from './dto/upsert-roboflow-model.dto';

const BRANDING_KEY = 'branding';
const ROBOFLOW_KEY = 'runtime.roboflow';
const RUNTIME_CATALOG_KEY = 'runtime.catalog';
const MAX_CUSTOM_MODELS = 24;

export interface BrandingSettings {
  productName: string;
  organizationName: string;
  logoUrl: string;
  supportLabel: string;
  welcomeMessage: string;
  accentNote: string;
  headerEyebrow: string;
  headerSummary: string;
  liveTagline: string;
  authHeadline: string;
  authSubheadline: string;
}

export interface StoredRoboflowSettings {
  apiKey: string;
  deploymentTarget: RoboflowDeploymentTarget;
  inferenceServerUrl: string;
  deviceProfile: RuntimeDeviceProfile;
}

export interface StoredRuntimeCatalogSettings {
  defaultModelKey: string | null;
  customModels: MachineRuntimeModelCatalogEntry[];
}

@Injectable()
export class AppSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicBranding(): Promise<BrandingSettings> {
    return this.getBranding();
  }

  async getBranding(): Promise<BrandingSettings> {
    const stored = await this.getSetting<Partial<BrandingSettings>>(BRANDING_KEY, {});
    return {
      ...this.getDefaultBranding(),
      ...this.normalizeBranding(stored)
    };
  }

  async updateBranding(input: UpdateBrandingDto): Promise<BrandingSettings> {
    const current = await this.getBranding();
    const next = {
      ...current,
      ...this.normalizeBranding(input)
    };
    await this.setSetting(BRANDING_KEY, next);
    return next;
  }

  async getRoboflowSettings() {
    const roboflow = await this.getRoboflowRuntimeConfig();
    const runtimeCatalog = await this.getRuntimeCatalogSettings();
    return {
      hasApiKey: Boolean(roboflow.apiKey.trim()),
      apiKeyPreview: this.maskApiKey(roboflow.apiKey),
      defaultModelKey: runtimeCatalog.defaultModelKey,
      deploymentTarget: roboflow.deploymentTarget,
      inferenceServerUrl: roboflow.inferenceServerUrl,
      deviceProfile: roboflow.deviceProfile,
      customModels: [...runtimeCatalog.customModels]
    };
  }

  async updateRoboflowConfig(input: UpdateRoboflowConfigDto) {
    const currentRoboflow = await this.getRoboflowRuntimeConfig();
    const currentCatalog = await this.getRuntimeCatalogSettings();

    const nextRoboflow: StoredRoboflowSettings = {
      apiKey: input.clearApiKey ? '' : input.apiKey !== undefined ? this.cleanText(input.apiKey, 500) : currentRoboflow.apiKey,
      deploymentTarget:
        input.deploymentTarget !== undefined ? this.normalizeDeploymentTarget(input.deploymentTarget) : currentRoboflow.deploymentTarget,
      inferenceServerUrl:
        input.inferenceServerUrl !== undefined
          ? this.normalizeInferenceServerUrl(input.inferenceServerUrl)
          : currentRoboflow.inferenceServerUrl,
      deviceProfile: input.deviceProfile !== undefined ? this.normalizeDeviceProfile(input.deviceProfile) : currentRoboflow.deviceProfile
    };

    const nextCatalog: StoredRuntimeCatalogSettings = {
      ...currentCatalog,
      defaultModelKey: input.defaultModelKey !== undefined ? this.cleanOptionalText(input.defaultModelKey, 120) : currentCatalog.defaultModelKey
    };

    await this.setSetting(ROBOFLOW_KEY, nextRoboflow);
    await this.setSetting(RUNTIME_CATALOG_KEY, nextCatalog);
    return this.getRoboflowSettings();
  }

  async upsertRoboflowModel(input: UpsertRoboflowModelDto) {
    const parsed = this.parseRoboflowReference(input.reference);
    const roboflow = await this.getRoboflowRuntimeConfig();
    const runtimeCatalog = await this.getRuntimeCatalogSettings();
    const modelKey = parsed.key;
    const cleanedClasses = this.normalizeClasses(input.classes);
    const deploymentTarget =
      input.deploymentTarget !== undefined ? this.normalizeDeploymentTarget(input.deploymentTarget) : roboflow.deploymentTarget;
    const inferenceServerUrl =
      deploymentTarget === 'ondevice'
        ? this.normalizeInferenceServerUrl(input.inferenceServerUrl || roboflow.inferenceServerUrl)
        : undefined;
    const modelEntry: MachineRuntimeModelCatalogEntry = {
      key: modelKey,
      name: this.cleanText(input.name || parsed.defaultName, 120),
      provider: 'roboflow',
      deploymentTarget,
      inferenceServerUrl,
      modelId: parsed.modelId,
      recommendedForCounting: input.recommendedForCounting !== false,
      classes: cleanedClasses.length ? cleanedClasses : ['pill', 'tablet'],
      notes: this.cleanText(
        input.notes || `Imported from Roboflow reference ${parsed.sourceUrl || parsed.modelId}.`,
        500
      ),
      sourceUrl: parsed.sourceUrl || `https://serverless.roboflow.com/${parsed.modelId}`,
      isCustom: true
    };

    const existingByKey = runtimeCatalog.customModels.findIndex((entry) => entry.key === modelKey);
    const existingByModelId = runtimeCatalog.customModels.findIndex((entry) => entry.modelId === parsed.modelId);
    const targetIndex = existingByKey >= 0 ? existingByKey : existingByModelId;
    const nextCustomModels = [...runtimeCatalog.customModels];

    if (targetIndex >= 0) {
      nextCustomModels[targetIndex] = modelEntry;
    } else {
      if (nextCustomModels.length >= MAX_CUSTOM_MODELS) {
        throw new BadRequestException({
          code: 'CUSTOM_MODEL_LIMIT_REACHED',
          message: `Only ${MAX_CUSTOM_MODELS} custom Roboflow models can be stored at once.`
        });
      }
      nextCustomModels.unshift(modelEntry);
    }

    const nextCatalog: StoredRuntimeCatalogSettings = {
      customModels: nextCustomModels,
      defaultModelKey: input.makeDefault ? modelEntry.key : runtimeCatalog.defaultModelKey
    };

    await this.setSetting(RUNTIME_CATALOG_KEY, nextCatalog);

    const extractedApiKey = this.cleanOptionalText(input.apiKey, 500) || parsed.apiKey || '';
    if (extractedApiKey) {
      await this.setSetting(ROBOFLOW_KEY, { apiKey: extractedApiKey });
    }

    return this.getRoboflowSettings();
  }

  async removeRoboflowModel(modelKey: string) {
    const runtimeCatalog = await this.getRuntimeCatalogSettings();
    const nextCustomModels = runtimeCatalog.customModels.filter((entry) => entry.key !== modelKey);
    if (nextCustomModels.length === runtimeCatalog.customModels.length) {
      throw new NotFoundException({ code: 'ROBOFLOW_MODEL_NOT_FOUND', message: 'Roboflow model not found' });
    }

    await this.setSetting(RUNTIME_CATALOG_KEY, {
      customModels: nextCustomModels,
      defaultModelKey: runtimeCatalog.defaultModelKey === modelKey ? null : runtimeCatalog.defaultModelKey
    });

    return this.getRoboflowSettings();
  }

  async mergeRuntimeCatalog(baseCatalog: MachineRuntimeModelCatalog): Promise<MachineRuntimeModelCatalog> {
    const runtimeCatalog = await this.getRuntimeCatalogSettings();
    const mergedModels = [...baseCatalog.models];

    for (const customModel of runtimeCatalog.customModels) {
      const existingIndex = mergedModels.findIndex((entry) => entry.key === customModel.key || entry.modelId === customModel.modelId);
      if (existingIndex >= 0) {
        mergedModels[existingIndex] = { ...mergedModels[existingIndex], ...customModel, isCustom: true };
      } else {
        mergedModels.unshift({ ...customModel, isCustom: true });
      }
    }

    const defaultModelKey =
      runtimeCatalog.defaultModelKey && mergedModels.some((entry) => entry.key === runtimeCatalog.defaultModelKey)
        ? runtimeCatalog.defaultModelKey
        : baseCatalog.defaultModelKey;

    return {
      ...baseCatalog,
      generatedAt: new Date().toISOString(),
      defaultModelKey,
      models: mergedModels
    };
  }

  async getRoboflowApiKey() {
    const stored = await this.getRoboflowRuntimeConfig();
    return stored.apiKey.trim();
  }

  async getRoboflowRuntimeConfig(): Promise<StoredRoboflowSettings> {
    const stored = await this.getSetting<Partial<StoredRoboflowSettings>>(ROBOFLOW_KEY, {});
    return {
      apiKey: this.cleanText(stored.apiKey, 500),
      deploymentTarget: this.normalizeDeploymentTarget(stored.deploymentTarget),
      inferenceServerUrl: this.normalizeInferenceServerUrl(stored.inferenceServerUrl),
      deviceProfile: this.normalizeDeviceProfile(stored.deviceProfile)
    };
  }

  private async getRuntimeCatalogSettings(): Promise<StoredRuntimeCatalogSettings> {
    const stored = await this.getSetting<Partial<StoredRuntimeCatalogSettings>>(RUNTIME_CATALOG_KEY, {});
    const rawModels = Array.isArray(stored.customModels) ? stored.customModels : [];
    const customModels = rawModels
      .filter((entry): entry is MachineRuntimeModelCatalogEntry => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry)))
      .map((entry) => ({
        ...entry,
        provider: 'roboflow' as const,
        deploymentTarget: this.normalizeDeploymentTarget(entry.deploymentTarget),
        inferenceServerUrl:
          this.normalizeDeploymentTarget(entry.deploymentTarget) === 'ondevice'
            ? this.normalizeInferenceServerUrl(entry.inferenceServerUrl)
            : undefined,
        isCustom: true
      }));

    return {
      defaultModelKey: this.cleanOptionalText(stored.defaultModelKey, 120),
      customModels
    };
  }

  private getDefaultBranding(): BrandingSettings {
    const organizationName = this.cleanText(process.env.NEXT_PUBLIC_STORE_NAME || 'Pharmacy Operations', 80);
    return {
      productName: 'PillCount Operations Console',
      organizationName,
      logoUrl: this.cleanText(process.env.NEXT_PUBLIC_STORE_LOGO_URL || '', 500),
      supportLabel: 'Real-time machine control',
      welcomeMessage: 'Live pill counting, machine monitoring, exports, and audit-ready operations in one place.',
      accentNote: 'Use the live dashboard for camera control, model switching, and session exports.',
      headerEyebrow: 'Operations command layer',
      headerSummary: 'Track machine status, move between workflows faster, and keep the operator focused on the current run.',
      liveTagline: 'Monitor your machine, model, and count stream in real time.',
      authHeadline: 'Secure operator sign-in',
      authSubheadline: 'Access the pharmacy and warehouse workflow with your staff account.'
    };
  }

  private normalizeBranding(input: Partial<BrandingSettings>): Partial<BrandingSettings> {
    const normalized: Partial<BrandingSettings> = {};
    if (input.productName !== undefined) normalized.productName = this.cleanText(input.productName, 80);
    if (input.organizationName !== undefined) normalized.organizationName = this.cleanText(input.organizationName, 80);
    if (input.logoUrl !== undefined) normalized.logoUrl = this.cleanText(input.logoUrl, 500);
    if (input.supportLabel !== undefined) normalized.supportLabel = this.cleanText(input.supportLabel, 80);
    if (input.welcomeMessage !== undefined) normalized.welcomeMessage = this.cleanText(input.welcomeMessage, 220);
    if (input.accentNote !== undefined) normalized.accentNote = this.cleanText(input.accentNote, 220);
    if (input.headerEyebrow !== undefined) normalized.headerEyebrow = this.cleanText(input.headerEyebrow, 80);
    if (input.headerSummary !== undefined) normalized.headerSummary = this.cleanText(input.headerSummary, 220);
    if (input.liveTagline !== undefined) normalized.liveTagline = this.cleanText(input.liveTagline, 220);
    if (input.authHeadline !== undefined) normalized.authHeadline = this.cleanText(input.authHeadline, 120);
    if (input.authSubheadline !== undefined) normalized.authSubheadline = this.cleanText(input.authSubheadline, 220);
    return normalized;
  }

  private normalizeClasses(value?: string[]) {
    if (!Array.isArray(value)) {
      return [];
    }

    return Array.from(
      new Set(
        value
          .map((entry) => this.cleanText(entry, 40).toLowerCase())
          .filter(Boolean)
      )
    );
  }

  private async getSetting<T>(key: string, fallback: T): Promise<T> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!setting) {
      return fallback;
    }

    return setting.value as T;
  }

  private async setSetting(key: string, value: unknown) {
    const jsonValue = JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
    return this.prisma.appSetting.upsert({
      where: { key },
      update: { value: jsonValue },
      create: { key, value: jsonValue }
    });
  }

  private parseRoboflowReference(reference: string) {
    const cleaned = this.cleanText(reference, 500);
    if (!cleaned) {
      throw new BadRequestException({ code: 'ROBOFLOW_REFERENCE_REQUIRED', message: 'Roboflow reference is required.' });
    }

    if (/^https?:\/\//i.test(cleaned)) {
      const parsedUrl = new URL(cleaned);
      const host = parsedUrl.hostname.toLowerCase();
      const segments = parsedUrl.pathname.split('/').filter(Boolean);
      const queryApiKey = this.cleanOptionalText(parsedUrl.searchParams.get('api_key') || '', 500) || '';

      if (host.includes('serverless.roboflow.com') && segments.length >= 2) {
        const project = segments[0];
        const version = segments[1];
        return {
          modelId: `${project}/${version}`,
          key: this.createCustomModelKey(project, version),
          defaultName: `${this.toTitleCase(project)} v${version}`,
          sourceUrl: cleaned,
          apiKey: queryApiKey
        };
      }

      if (host.includes('universe.roboflow.com')) {
        const modelIndex = segments.findIndex((segment) => segment === 'model');
        if (modelIndex >= 2 && modelIndex < segments.length - 1) {
          const project = segments[modelIndex - 1];
          const version = segments[modelIndex + 1];
          return {
            modelId: `${project}/${version}`,
            key: this.createCustomModelKey(project, version),
            defaultName: `${this.toTitleCase(project)} v${version}`,
            sourceUrl: cleaned,
            apiKey: queryApiKey
          };
        }
      }

      throw new BadRequestException({
        code: 'ROBOFLOW_REFERENCE_INVALID',
        message: 'Paste a Roboflow Universe model URL, serverless inference URL, or model ID like project/3.'
      });
    }

    const modelMatch = cleaned.match(/^([a-z0-9][a-z0-9-_]*)\/(\d+)$/i);
    if (!modelMatch) {
      throw new BadRequestException({
        code: 'ROBOFLOW_REFERENCE_INVALID',
        message: 'Use a Roboflow model ID like project-name/3 or paste the full Roboflow model URL.'
      });
    }

    const [, project, version] = modelMatch;
    return {
      modelId: `${project}/${version}`,
      key: this.createCustomModelKey(project, version),
      defaultName: `${this.toTitleCase(project)} v${version}`,
      sourceUrl: '',
      apiKey: ''
    };
  }

  private createCustomModelKey(project: string, version: string) {
    return `rf-custom-${project
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')}-v${version}`;
  }

  private toTitleCase(value: string) {
    return value
      .replace(/[-_]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }

  private cleanText(value: unknown, maxLength: number) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  }

  private cleanOptionalText(value: unknown, maxLength: number) {
    const cleaned = this.cleanText(value, maxLength);
    return cleaned || null;
  }

  private normalizeDeploymentTarget(value: unknown): RoboflowDeploymentTarget {
    return value === 'ondevice' ? 'ondevice' : 'hosted';
  }

  private normalizeDeviceProfile(value: unknown): RuntimeDeviceProfile {
    return value === 'raspberry-pi-5' ? 'raspberry-pi-5' : 'desktop';
  }

  private normalizeInferenceServerUrl(value: unknown) {
    return this.cleanText(value, 500) || String(process.env.ROBOFLOW_INFERENCE_SERVER_URL || 'http://127.0.0.1:9001').trim();
  }

  private maskApiKey(apiKey: string) {
    const cleaned = apiKey.trim();
    if (!cleaned) {
      return null;
    }

    if (cleaned.length <= 10) {
      return `${cleaned.slice(0, 2)}...${cleaned.slice(-2)}`;
    }

    return `${cleaned.slice(0, 6)}...${cleaned.slice(-4)}`;
  }
}
