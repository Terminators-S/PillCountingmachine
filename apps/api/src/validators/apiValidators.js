function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateCreatePillTypeBody(body) {
  if (!isNonEmptyString(body.code) || !isNonEmptyString(body.name)) {
    return 'code and name are required';
  }
  return null;
}

function validateRegisterMachineBody(body) {
  if (!isNonEmptyString(body.machineId)) {
    return 'machineId is required';
  }
  return null;
}

function validateHeartbeatBody(body) {
  if (!isNonEmptyString(body.machineId)) {
    return 'machineId is required';
  }
  return null;
}

function validateCreateRecordBody(body) {
  if (!isNonEmptyString(body.machineId) || !isNonEmptyString(body.pillTypeCode)) {
    return 'machineId and pillTypeCode are required';
  }

  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 0) {
    return 'quantity must be a non-negative integer';
  }

  return null;
}

function validateCreateJobBody(body) {
  if (!isNonEmptyString(body.machineId) || !isNonEmptyString(body.pillTypeCode)) {
    return 'machineId and pillTypeCode are required';
  }

  const targetQuantity = Number(body.targetQuantity);
  if (!Number.isInteger(targetQuantity) || targetQuantity < 0) {
    return 'targetQuantity must be a non-negative integer';
  }

  return null;
}

function validateFinishJobBody(body) {
  const actualQuantity = Number(body.actualQuantity);
  if (!Number.isInteger(actualQuantity) || actualQuantity < 0) {
    return 'actualQuantity must be a non-negative integer';
  }

  return null;
}

function validateIngestEventBody(body) {
  if (!isNonEmptyString(body.eventType)) {
    return 'eventType is required';
  }

  if (!isNonEmptyString(body.machineId)) {
    return 'machineId is required';
  }

  if (body.payload !== undefined && (body.payload === null || typeof body.payload !== 'object' || Array.isArray(body.payload))) {
    return 'payload must be an object when provided';
  }

  return null;
}

module.exports = {
  validateCreatePillTypeBody,
  validateCreateRecordBody,
  validateCreateJobBody,
  validateFinishJobBody,
  validateIngestEventBody,
  validateRegisterMachineBody,
  validateHeartbeatBody
};
