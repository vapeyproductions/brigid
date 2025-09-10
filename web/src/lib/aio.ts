// app/lib/aio.ts
import EventEmitter from "events";
import mqtt, { MqttClient } from "mqtt";

declare global {
  // eslint-disable-next-line no-var
  var __AIO__: { client: MqttClient | null; bus: EventEmitter | null } | undefined;
}

const HOST = "wss://io.adafruit.com:443/mqtt"; // MQTT over WSS
const USER = process.env.AIO_USERNAME!;
const KEY  = process.env.AIO_KEY!;
const FEED = process.env.AIO_FEED || "contractions";

// Subscribe to JSON topic so your full JSON arrives intact
const TOPIC_JSON = `${USER}/feeds/${FEED}/json`; // also valid: `${USER}/feeds/${FEED}`

function connectOnce() {
  if (!global.__AIO__) global.__AIO__ = { client: null, bus: null };
  if (global.__AIO__!.client && global.__AIO__!.bus) return global.__AIO__!;

  const bus = new EventEmitter();
  const client = mqtt.connect(HOST, {
    username: USER,
    password: KEY,
    clean: true,
    reconnectPeriod: 1500,
  });

  client.on("connect", () => client.subscribe(TOPIC_JSON));
  client.on("message", (_topic, payload) => {
    try { bus.emit("reading", JSON.parse(payload.toString())); } catch {}
  });
  client.on("error", (e) => console.error("[AIO] error", e));
  client.on("close", () => console.warn("[AIO] disconnected"));

  global.__AIO__ = { client, bus };
  return global.__AIO__!;
}

export function getAioBus(): EventEmitter {
  return connectOnce().bus!;
}
