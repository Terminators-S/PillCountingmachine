const mqtt = require('mqtt');

function createMqttService(options) {
  const {
    brokerUrl,
    username,
    password,
    topicPrefix,
    logInfo,
    logError,
    upsertMachine,
    logMachineEvent,
    createRecord
  } = options;

  const state = {
    enabled: false,
    connected: false,
    brokerUrl: brokerUrl || null,
    topicPrefix,
    lastMessageAt: null,
    lastError: null
  };

  function init() {
    if (!brokerUrl) {
      logInfo('MQTT disabled: set MQTT_BROKER_URL to enable device ingestion.');
      return;
    }

    state.enabled = true;
    state.brokerUrl = brokerUrl;

    const client = mqtt.connect(brokerUrl, {
      username: username || undefined,
      password: password || undefined,
      reconnectPeriod: 3000
    });

    client.on('connect', () => {
      state.connected = true;
      state.lastError = null;

      const topics = [
        `${topicPrefix}/+/heartbeat`,
        `${topicPrefix}/+/record`,
        `${topicPrefix}/+/register`
      ];

      client.subscribe(topics, (error) => {
        if (error) {
          state.lastError = error.message;
          logError('MQTT subscribe error', { error: error.message });
        } else {
          logInfo(`MQTT connected and subscribed: ${topics.join(', ')}`);
        }
      });
    });

    client.on('reconnect', () => {
      state.connected = false;
    });

    client.on('error', (error) => {
      state.lastError = error.message;
      logError('MQTT error', { error: error.message });
    });

    client.on('close', () => {
      state.connected = false;
    });

    client.on('message', async (topic, buffer) => {
      state.lastMessageAt = Date.now();

      try {
        const payload = buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
        const parts = String(topic).split('/');
        if (parts.length < 3 || parts[0] !== topicPrefix) {
          return;
        }

        const machineId = String(parts[1] || '').trim() || String(payload.machineId || '').trim();
        const messageType = parts[2];
        if (!machineId) {
          return;
        }

        if (messageType === 'register') {
          const now = await upsertMachine(machineId, {
            location: payload.location ? String(payload.location).trim() : null,
            firmwareVersion: payload.firmwareVersion ? String(payload.firmwareVersion).trim() : null,
            lastSeen: Date.now()
          });
          await logMachineEvent(machineId, 'register', payload, now);
          return;
        }

        if (messageType === 'heartbeat') {
          const now = await upsertMachine(machineId, {
            location: payload.location ? String(payload.location).trim() : null,
            firmwareVersion: payload.firmwareVersion ? String(payload.firmwareVersion).trim() : null,
            lastSeen: Date.now()
          });
          await logMachineEvent(machineId, 'heartbeat', payload, now);
          return;
        }

        if (messageType === 'record') {
          await createRecord({
            machineId,
            pillTypeCode: payload.pillTypeCode,
            quantity: payload.quantity,
            countMode: payload.countMode,
            confidence: payload.confidence,
            status: payload.status,
            timestamp: payload.timestamp,
            lotNo: payload.lotNo || payload.lot_no,
            expiryDate: payload.expiryDate || payload.expiry_date,
            location: payload.location,
            operatorId: payload.operatorId || payload.operator_id,
            sessionId: payload.sessionId || payload.session_id,
            sourceEventId: payload.eventId || payload.event_id || null,
            idempotencyKey: payload.idempotencyKey || payload.idempotency_key || null
          });
        }
      } catch (error) {
        state.lastError = error.message;
        logError(`MQTT message handling failed for topic ${topic}`, { error: error.message });
      }
    });
  }

  function getState() {
    return state;
  }

  return {
    init,
    getState
  };
}

module.exports = {
  createMqttService
};
