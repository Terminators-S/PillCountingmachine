function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function machineStatusFromLastSeen(lastSeen, offlineThresholdMs) {
  if (!lastSeen) return 'offline';
  return Date.now() - Number(lastSeen) <= offlineThresholdMs ? 'online' : 'offline';
}

function makeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function safeJsonStringify(payload) {
  try {
    return payload ? JSON.stringify(payload) : null;
  } catch (_error) {
    return JSON.stringify({ error: 'payload_not_serializable' });
  }
}

function parsePayload(rawPayload) {
  if (!rawPayload) return null;
  try {
    return JSON.parse(rawPayload);
  } catch (_error) {
    return { malformed: true };
  }
}

function createGeneratedJobId(now) {
  const stamp = new Date(now).toISOString().replaceAll('-', '').replaceAll(':', '').slice(0, 15);
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);
  return `JOB-${stamp}-${suffix}`;
}

function createOperationsService({
  getDb,
  offlineThresholdMs
}) {
  async function getPillTypes() {
    return getDb().all(`SELECT * FROM pill_types ORDER BY name ASC`);
  }

  async function createPillType(input) {
    const { code, name, dosageMg, manufacturer } = input || {};
    await getDb().run(
      `INSERT INTO pill_types (code, name, dosage_mg, manufacturer) VALUES (?, ?, ?, ?)`,
      normalizeText(code).toUpperCase(),
      normalizeText(name),
      toNumber(dosageMg),
      normalizeText(manufacturer) || null
    );
  }

  async function getMachines() {
    const rows = await getDb().all(`SELECT * FROM machines ORDER BY machine_id ASC`);
    return rows.map((item) => ({
      ...item,
      status: machineStatusFromLastSeen(item.last_seen, offlineThresholdMs)
    }));
  }

  async function upsertMachine(machineId, options = {}) {
    const normalizedMachineId = normalizeText(machineId);
    const now = options.lastSeen ?? Date.now();

    await getDb().run(
      `
      INSERT INTO machines (machine_id, location, status, firmware_version, last_seen)
      VALUES (?, ?, 'online', ?, ?)
      ON CONFLICT(machine_id) DO UPDATE SET
        location=COALESCE(excluded.location, machines.location),
        firmware_version=COALESCE(excluded.firmware_version, machines.firmware_version),
        last_seen=excluded.last_seen,
        status='online'
      `,
      normalizedMachineId,
      normalizeText(options.location) || null,
      normalizeText(options.firmwareVersion) || null,
      now
    );

    return now;
  }

  async function logMachineEvent(machineId, eventType, payload, timestamp = Date.now(), meta = {}) {
    const result = await getDb().run(
      `
      INSERT INTO machine_events (
        machine_id,
        event_type,
        payload,
        timestamp,
        event_id,
        sequence_no,
        idempotency_key,
        received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      normalizeText(machineId),
      normalizeText(eventType),
      safeJsonStringify(payload),
      toNumber(timestamp, Date.now()),
      normalizeText(meta.eventId) || null,
      toNumber(meta.sequenceNo),
      normalizeText(meta.idempotencyKey) || null,
      toNumber(meta.receivedAt, Date.now())
    );

    return result.lastID;
  }

  async function registerMachine(input) {
    const { machineId, location, firmwareVersion } = input || {};
    const normalizedMachineId = normalizeText(machineId);
    const now = await upsertMachine(normalizedMachineId, {
      location,
      firmwareVersion,
      lastSeen: Date.now()
    });

    await logMachineEvent(
      normalizedMachineId,
      'register',
      { location: location || null, firmwareVersion: firmwareVersion || null },
      now
    );

    return {
      machineId: normalizedMachineId,
      lastSeen: now
    };
  }

  async function createHeartbeat(input) {
    const { machineId, payload } = input || {};
    const normalizedMachineId = normalizeText(machineId);
    const now = await upsertMachine(normalizedMachineId, { lastSeen: Date.now() });
    await logMachineEvent(normalizedMachineId, 'heartbeat', payload || null, now);
    return {
      machineId: normalizedMachineId,
      lastSeen: now
    };
  }

  async function createRecord(input) {
    const normalizedMachineId = normalizeText(input.machineId);
    const normalizedPillCode = normalizeText(input.pillTypeCode).toUpperCase();
    const normalizedIdempotencyKey = normalizeText(input.idempotencyKey) || null;

    if (!normalizedMachineId || !normalizedPillCode || input.quantity === undefined) {
      throw makeError(400, 'machineId, pillTypeCode, and quantity are required');
    }

    const qty = toNumber(input.quantity, NaN);
    if (!Number.isInteger(qty) || qty < 0) {
      throw makeError(400, 'quantity must be a non-negative integer');
    }

    if (normalizedIdempotencyKey) {
      const existingRecord = await getDb().get(
        `SELECT id FROM pill_records WHERE idempotency_key = ?`,
        normalizedIdempotencyKey
      );
      if (existingRecord?.id) {
        return { id: existingRecord.id, deduped: true };
      }
    }

    const pillType = await getDb().get(`SELECT code FROM pill_types WHERE code = ?`, normalizedPillCode);
    if (!pillType) {
      throw makeError(404, 'pill type not found. create it first.');
    }

    const now = Date.now();
    await upsertMachine(normalizedMachineId, { lastSeen: now });

    const result = await getDb().run(
      `
      INSERT INTO pill_records (
        machine_id,
        pill_type_code,
        quantity,
        count_mode,
        confidence,
        status,
        timestamp,
        lot_no,
        expiry_date,
        location,
        operator_id,
        session_id,
        source_event_id,
        idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      normalizedMachineId,
      normalizedPillCode,
      qty,
      normalizeText(input.countMode) || 'auto',
      toNumber(input.confidence),
      normalizeText(input.status).toLowerCase() || 'normal',
      toNumber(input.timestamp, now),
      normalizeText(input.lotNo) || null,
      normalizeText(input.expiryDate) || null,
      normalizeText(input.location) || null,
      normalizeText(input.operatorId) || null,
      normalizeText(input.sessionId) || null,
      normalizeText(input.sourceEventId) || null,
      normalizedIdempotencyKey
    );

    await getDb().run(
      `
      INSERT INTO inventory_transactions (
        record_id,
        machine_id,
        pill_type_code,
        lot_no,
        expiry_date,
        location,
        operator_id,
        quantity_delta,
        transaction_type,
        source_event_id,
        timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      result.lastID,
      normalizedMachineId,
      normalizedPillCode,
      normalizeText(input.lotNo) || null,
      normalizeText(input.expiryDate) || null,
      normalizeText(input.location) || null,
      normalizeText(input.operatorId) || null,
      qty,
      'count_recorded',
      normalizeText(input.sourceEventId) || null,
      toNumber(input.timestamp, now)
    );

    return { id: result.lastID, deduped: false };
  }

  async function getRecords(limitInput) {
    const limit = Math.min(Math.max(toNumber(limitInput, 50), 1), 500);
    return getDb().all(
      `
      SELECT
        pr.id,
        pr.machine_id AS machineId,
        pr.pill_type_code AS pillTypeCode,
        pt.name AS pillName,
        pt.dosage_mg AS dosageMg,
        pr.quantity,
        pr.count_mode AS countMode,
        pr.confidence,
        pr.status,
        pr.timestamp,
        pr.lot_no AS lotNo,
        pr.expiry_date AS expiryDate,
        pr.location,
        pr.operator_id AS operatorId,
        pr.session_id AS sessionId,
        pr.source_event_id AS sourceEventId
      FROM pill_records pr
      LEFT JOIN pill_types pt ON pt.code = pr.pill_type_code
      ORDER BY pr.timestamp DESC
      LIMIT ?
      `,
      limit
    );
  }

  async function getStats() {
    const totalPills = await getDb().get(`SELECT COALESCE(SUM(quantity), 0) AS value FROM pill_records`);
    const totalRecords = await getDb().get(`SELECT COUNT(*) AS value FROM pill_records`);
    const totalTypes = await getDb().get(`SELECT COUNT(*) AS value FROM pill_types`);
    const activeJobs = await getDb().get(`SELECT COUNT(*) AS value FROM jobs WHERE status IN ('planned', 'in_progress')`);
    const machineRows = await getDb().all(`SELECT machine_id, last_seen FROM machines`);

    const machinesOnline = machineRows.filter(
      (m) => machineStatusFromLastSeen(m.last_seen, offlineThresholdMs) === 'online'
    ).length;

    return {
      totalPills: totalPills.value,
      totalRecords: totalRecords.value,
      totalTypes: totalTypes.value,
      activeJobs: activeJobs.value,
      machinesOnline,
      machinesTotal: machineRows.length,
      updatedAt: Date.now()
    };
  }

  async function getEvents(limitInput) {
    const limit = Math.min(Math.max(toNumber(limitInput, 30), 1), 300);
    const rows = await getDb().all(
      `
      SELECT
        id,
        machine_id AS machineId,
        event_type AS eventType,
        payload,
        timestamp,
        event_id AS eventId,
        sequence_no AS sequenceNo,
        idempotency_key AS idempotencyKey,
        received_at AS receivedAt
      FROM machine_events
      ORDER BY timestamp DESC
      LIMIT ?
      `,
      limit
    );

    return rows.map((row) => ({
      ...row,
      payload: parsePayload(row.payload)
    }));
  }

  async function getJobs(limitInput) {
    const limit = Math.min(Math.max(toNumber(limitInput, 50), 1), 300);
    return getDb().all(
      `
      SELECT
        id,
        job_id AS jobId,
        machine_id AS machineId,
        pill_type_code AS pillTypeCode,
        lot_no AS lotNo,
        target_quantity AS targetQuantity,
        actual_quantity AS actualQuantity,
        operator_id AS operatorId,
        status,
        notes,
        created_at AS createdAt,
        started_at AS startedAt,
        completed_at AS completedAt
      FROM jobs
      ORDER BY created_at DESC
      LIMIT ?
      `,
      limit
    );
  }

  async function createJob(input) {
    const machineId = normalizeText(input.machineId);
    const pillTypeCode = normalizeText(input.pillTypeCode).toUpperCase();
    const targetQuantity = toNumber(input.targetQuantity, NaN);
    const operatorId = normalizeText(input.operatorId) || null;
    const lotNo = normalizeText(input.lotNo) || null;

    if (!machineId || !pillTypeCode || !Number.isInteger(targetQuantity) || targetQuantity < 0) {
      throw makeError(400, 'machineId, pillTypeCode, and targetQuantity are required');
    }

    const pillType = await getDb().get(`SELECT code FROM pill_types WHERE code = ?`, pillTypeCode);
    if (!pillType) {
      throw makeError(404, 'pill type not found');
    }

    const now = Date.now();
    const requestedJobId = normalizeText(input.jobId);
    const jobId = requestedJobId || createGeneratedJobId(now);

    await upsertMachine(machineId, { lastSeen: now });

    try {
      await getDb().run(
        `
        INSERT INTO jobs (
          job_id,
          machine_id,
          pill_type_code,
          lot_no,
          target_quantity,
          operator_id,
          status,
          notes,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        jobId,
        machineId,
        pillTypeCode,
        lotNo,
        targetQuantity,
        operatorId,
        normalizeText(input.status) || 'planned',
        normalizeText(input.notes) || null,
        now
      );
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) {
        throw makeError(409, 'job id already exists');
      }
      throw error;
    }

    return {
      jobId,
      machineId,
      pillTypeCode,
      targetQuantity,
      status: normalizeText(input.status) || 'planned',
      createdAt: now
    };
  }

  async function startJob(jobId, input = {}) {
    const normalizedJobId = normalizeText(jobId);
    const now = Date.now();
    const existing = await getDb().get(`SELECT * FROM jobs WHERE job_id = ?`, normalizedJobId);
    if (!existing) {
      throw makeError(404, 'job not found');
    }

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw makeError(409, 'job is already closed');
    }

    await getDb().run(
      `
      UPDATE jobs
      SET status = 'in_progress',
          operator_id = COALESCE(?, operator_id),
          started_at = COALESCE(started_at, ?)
      WHERE job_id = ?
      `,
      normalizeText(input.operatorId) || null,
      now,
      normalizedJobId
    );

    return {
      jobId: normalizedJobId,
      status: 'in_progress',
      startedAt: now
    };
  }

  async function finishJob(jobId, input = {}) {
    const normalizedJobId = normalizeText(jobId);
    const actualQuantity = toNumber(input.actualQuantity, NaN);
    const now = Date.now();

    if (!Number.isInteger(actualQuantity) || actualQuantity < 0) {
      throw makeError(400, 'actualQuantity must be a non-negative integer');
    }

    const existing = await getDb().get(`SELECT * FROM jobs WHERE job_id = ?`, normalizedJobId);
    if (!existing) {
      throw makeError(404, 'job not found');
    }

    if (existing.status === 'completed' || existing.status === 'cancelled') {
      throw makeError(409, 'job is already closed');
    }

    await getDb().run(
      `
      UPDATE jobs
      SET status = 'completed',
          actual_quantity = ?,
          operator_id = COALESCE(?, operator_id),
          completed_at = ?
      WHERE job_id = ?
      `,
      actualQuantity,
      normalizeText(input.operatorId) || null,
      now,
      normalizedJobId
    );

    return {
      jobId: normalizedJobId,
      status: 'completed',
      actualQuantity,
      completedAt: now
    };
  }

  async function getInventoryBalances(limitInput) {
    const limit = Math.min(Math.max(toNumber(limitInput, 200), 1), 1000);
    return getDb().all(
      `
      SELECT
        it.pill_type_code AS pillTypeCode,
        pt.name AS pillName,
        COALESCE(it.lot_no, 'UNSPECIFIED') AS lotNo,
        COALESCE(it.expiry_date, '') AS expiryDate,
        COALESCE(it.location, 'UNASSIGNED') AS location,
        SUM(it.quantity_delta) AS quantity
      FROM inventory_transactions it
      LEFT JOIN pill_types pt ON pt.code = it.pill_type_code
      GROUP BY it.pill_type_code, it.lot_no, it.expiry_date, it.location
      HAVING SUM(it.quantity_delta) <> 0
      ORDER BY pt.name ASC, it.expiry_date ASC, it.lot_no ASC
      LIMIT ?
      `,
      limit
    );
  }

  async function ingestEvent(input) {
    const machineId = normalizeText(input.machineId);
    const eventType = normalizeText(input.eventType).toLowerCase();
    const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
    const receivedAt = Date.now();
    const occurredAt = toNumber(input.occurredAt ?? input.timestamp, receivedAt);
    const eventId = normalizeText(input.eventId) || null;
    const sequenceNo = toNumber(input.sequenceNo);
    const idempotencyKey = normalizeText(input.idempotencyKey) || eventId || null;

    if (!machineId || !eventType) {
      throw makeError(400, 'machineId and eventType are required');
    }

    if (idempotencyKey) {
      const existingIdempotency = await getDb().get(
        `SELECT key, status, resource_id AS resourceId FROM event_idempotency WHERE key = ?`,
        idempotencyKey
      );
      if (existingIdempotency) {
        return {
          accepted: true,
          deduped: true,
          projected: existingIdempotency.status === 'processed',
          eventId,
          machineId,
          eventType
        };
      }

      await getDb().run(
        `
        INSERT INTO event_idempotency (key, resource_type, resource_id, status, created_at)
        VALUES (?, 'machine_event', NULL, 'processing', ?)
        `,
        idempotencyKey,
        receivedAt
      );
    }

    try {
      if (eventType === 'machine.register') {
        await upsertMachine(machineId, {
          location: normalizeText(payload.location) || null,
          firmwareVersion: normalizeText(payload.firmwareVersion) || null,
          lastSeen: occurredAt
        });
      } else if (eventType === 'machine.heartbeat') {
        await upsertMachine(machineId, {
          location: normalizeText(payload.location) || null,
          firmwareVersion: normalizeText(payload.firmwareVersion) || null,
          lastSeen: occurredAt
        });
      } else if (eventType.startsWith('count.')) {
        await upsertMachine(machineId, { lastSeen: occurredAt });
      } else if (eventType === 'machine.error') {
        await upsertMachine(machineId, { lastSeen: occurredAt });
      }

      const eventRowId = await logMachineEvent(
        machineId,
        eventType,
        payload,
        occurredAt,
        {
          eventId,
          sequenceNo,
          idempotencyKey,
          receivedAt
        }
      );

      if (eventType === 'count.completed') {
        const productCode = normalizeText(payload?.product?.code || payload?.pillTypeCode).toUpperCase();
        const actualQuantity = toNumber(payload?.actualQuantity ?? payload?.actual_quantity ?? payload?.quantity, NaN);

        if (productCode && Number.isInteger(actualQuantity) && actualQuantity >= 0) {
          await createRecord({
            machineId,
            pillTypeCode: productCode,
            quantity: actualQuantity,
            countMode: 'auto',
            status: payload?.tolerance?.within_tolerance === false ? 'warn' : 'normal',
            timestamp: occurredAt,
            lotNo: payload?.lot?.lot_no || payload?.lot?.lotNo || payload?.lotNo,
            expiryDate: payload?.lot?.expiry_date || payload?.lot?.expiryDate || payload?.expiryDate,
            location: payload?.lot?.location_id || payload?.lot?.locationId || payload?.location,
            operatorId: payload?.operator_id || payload?.operatorId || null,
            sessionId: payload?.session_id || payload?.sessionId || null,
            sourceEventId: eventId || String(eventRowId),
            idempotencyKey: idempotencyKey ? `record:${idempotencyKey}` : null
          });
        }

        if (payload?.job_id || payload?.jobId) {
          const jobId = normalizeText(payload.job_id || payload.jobId);
          const existingJob = await getDb().get(`SELECT job_id FROM jobs WHERE job_id = ?`, jobId);
          if (!existingJob) {
            await createJob({
              jobId,
              machineId,
              pillTypeCode: productCode || 'UNKNOWN',
              lotNo: payload?.lot?.lot_no || payload?.lotNo,
              targetQuantity: toNumber(payload?.targetQuantity ?? payload?.target_quantity, 0),
              status: 'completed',
              operatorId: normalizeText(payload?.operator_id || payload?.operatorId) || null,
              notes: 'Created automatically from count.completed event'
            }).catch(() => null);
          }

          if (existingJob || productCode) {
            await getDb().run(
              `
              UPDATE jobs
              SET status = 'completed',
                  actual_quantity = COALESCE(?, actual_quantity),
                  completed_at = COALESCE(completed_at, ?),
                  operator_id = COALESCE(?, operator_id)
              WHERE job_id = ?
              `,
              toNumber(payload?.actualQuantity ?? payload?.actual_quantity),
              occurredAt,
              normalizeText(payload?.operator_id || payload?.operatorId) || null,
              jobId
            );
          }
        }
      }

      if (idempotencyKey) {
        await getDb().run(
          `UPDATE event_idempotency SET status = 'processed', resource_id = ?, error_message = NULL WHERE key = ?`,
          String(eventRowId),
          idempotencyKey
        );
      }

      return {
        accepted: true,
        deduped: false,
        projected: true,
        eventId,
        machineId,
        eventType
      };
    } catch (error) {
      if (idempotencyKey) {
        await getDb().run(
          `UPDATE event_idempotency SET status = 'failed', error_message = ? WHERE key = ?`,
          normalizeText(error.message).slice(0, 1000) || 'unknown error',
          idempotencyKey
        );
      }
      throw error;
    }
  }

  return {
    toNumber,
    upsertMachine,
    logMachineEvent,
    createRecord,
    getPillTypes,
    createPillType,
    getMachines,
    registerMachine,
    createHeartbeat,
    getRecords,
    getStats,
    getEvents,
    getJobs,
    createJob,
    startJob,
    finishJob,
    getInventoryBalances,
    ingestEvent
  };
}

module.exports = {
  createOperationsService
};
