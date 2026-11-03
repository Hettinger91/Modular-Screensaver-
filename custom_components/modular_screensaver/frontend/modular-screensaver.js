/* Modular Screensaver – Frontend-Overlay
 * Wird von der Integration automatisch in jede Home-Assistant-Seite geladen.
 * Einstellungen kommen per Websocket (modular_screensaver/subscribe).
 */
(() => {
  if (window.__modularScreensaver) return;
  window.__modularScreensaver = true;

  const TAG = "modular-screensaver-overlay";
  const EXCLUDED = ["/config", "/developer-tools", "/hassio", "/profile", "/auth", "/onboarding", "/hacs", "/_my_redirect"];
  const ACTIVITY = ["pointerdown", "touchstart", "keydown", "wheel"];

  const WEATHER_ICONS = {
    "clear-night": "mdi:weather-night", cloudy: "mdi:weather-cloudy", exceptional: "mdi:alert-circle-outline",
    fog: "mdi:weather-fog", hail: "mdi:weather-hail", lightning: "mdi:weather-lightning",
    "lightning-rainy": "mdi:weather-lightning-rainy", partlycloudy: "mdi:weather-partly-cloudy",
    pouring: "mdi:weather-pouring", rainy: "mdi:weather-rainy", snowy: "mdi:weather-snowy",
    "snowy-rainy": "mdi:weather-snowy-rainy", sunny: "mdi:weather-sunny", windy: "mdi:weather-windy",
    "windy-variant": "mdi:weather-windy-variant",
  };
  const INACTIVE = new Set(["off", "closed", "locked", "unavailable", "unknown", "idle", "none", "", "disarmed",
    "not_home", "ok", "clear", "standby", "false", "no", "normal", "paused", "docked", "0"]);

  const state = {
    cfg: null, enabled: false, applies: false,
    visible: false, timer: null, swallowUntil: 0,
    el: null, tick: null, moveTimer: null,
    forecast: null, forecastUnsub: null, forecastKey: null,
    subscribed: false, subscribing: false,
  };

  // ------------------------------------------------------------ Hilfen
  const hassEl = () => document.querySelector("home-assistant");
  const getHass = () => { const h = hassEl(); return h && h.hass ? h.hass : null; };
  const lang = () => { const h = getHass(); return (h && h.locale && h.locale.language) || h?.language || navigator.language || "de"; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function fmtState(hass, st) {
    try { if (typeof hass.formatEntityState === "function") return hass.formatEntityState(st); } catch (e) { /* weiter */ }
    const u = st.attributes.unit_of_measurement;
    return u ? `${st.state} ${u}` : st.state;
  }
  function entityName(hass, st) {
    return st.attributes.friendly_name || st.entity_id;
  }
  function isAlertActive(st) {
    if (!st) return false;
    const s = String(st.state).toLowerCase();
    const n = Number(s);
    if (s !== "" && !Number.isNaN(n)) return n > 0;
    return !INACTIVE.has(s);
  }
  const SENSOR_DC = {
    temperature: "mdi:thermometer", humidity: "mdi:water-percent", moisture: "mdi:water-percent", power: "mdi:flash",
    apparent_power: "mdi:flash", reactive_power: "mdi:flash", energy: "mdi:lightning-bolt", energy_storage: "mdi:battery",
    voltage: "mdi:sine-wave", current: "mdi:current-ac", frequency: "mdi:sine-wave", power_factor: "mdi:angle-acute",
    illuminance: "mdi:brightness-5", pressure: "mdi:gauge", atmospheric_pressure: "mdi:gauge", co2: "mdi:molecule-co2",
    carbon_dioxide: "mdi:molecule-co2", carbon_monoxide: "mdi:molecule-co", gas: "mdi:meter-gas", water: "mdi:water",
    pm25: "mdi:blur", pm10: "mdi:blur", pm1: "mdi:blur", aqi: "mdi:air-filter", volatile_organic_compounds: "mdi:molecule",
    volatile_organic_compounds_parts: "mdi:molecule", monetary: "mdi:cash", timestamp: "mdi:clock-outline",
    duration: "mdi:progress-clock", speed: "mdi:speedometer", wind_speed: "mdi:weather-windy", wind_direction: "mdi:compass-outline",
    precipitation: "mdi:weather-rainy", precipitation_intensity: "mdi:weather-pouring", distance: "mdi:arrow-left-right",
    weight: "mdi:weight", volume: "mdi:car-coolant-level", volume_storage: "mdi:storage-tank", signal_strength: "mdi:wifi",
    data_rate: "mdi:transmission-tower", data_size: "mdi:database", irradiance: "mdi:sun-wireless", sound_pressure: "mdi:ear-hearing",
    enum: "mdi:format-list-bulleted", date: "mdi:calendar", ozone: "mdi:molecule", nitrogen_dioxide: "mdi:molecule",
  };
  const BIN_DC = {
    door: ["mdi:door-closed", "mdi:door-open"], garage_door: ["mdi:garage", "mdi:garage-open"],
    window: ["mdi:window-closed", "mdi:window-open"], opening: ["mdi:square", "mdi:square-outline"],
    motion: ["mdi:motion-sensor-off", "mdi:motion-sensor"], occupancy: ["mdi:home-outline", "mdi:home"],
    presence: ["mdi:home-outline", "mdi:home"], smoke: ["mdi:smoke-detector", "mdi:smoke-detector-alert"],
    moisture: ["mdi:water-off", "mdi:water"], gas: ["mdi:check-circle", "mdi:alert-circle"],
    carbon_monoxide: ["mdi:smoke-detector", "mdi:smoke-detector-alert"], lock: ["mdi:lock", "mdi:lock-open"],
    battery: ["mdi:battery", "mdi:battery-outline"], battery_charging: ["mdi:battery", "mdi:battery-charging"],
    problem: ["mdi:check-circle", "mdi:alert-circle"], safety: ["mdi:check-circle", "mdi:alert-circle"],
    connectivity: ["mdi:close-network-outline", "mdi:check-network-outline"], plug: ["mdi:power-plug-off", "mdi:power-plug"],
    power: ["mdi:power-plug-off", "mdi:power-plug"], vibration: ["mdi:crop-portrait", "mdi:vibrate"],
    sound: ["mdi:music-note-off", "mdi:music-note"], light: ["mdi:brightness-5", "mdi:brightness-7"],
    cold: ["mdi:thermometer", "mdi:snowflake"], heat: ["mdi:thermometer", "mdi:fire"], tamper: ["mdi:check-circle", "mdi:alert-circle"],
    running: ["mdi:stop", "mdi:play"], update: ["mdi:package", "mdi:package-up"], door_bell: ["mdi:bell-outline", "mdi:bell-ring"],
  };
  const DOMAIN_ICON = {
    light: ["mdi:lightbulb-outline", "mdi:lightbulb"], switch: ["mdi:toggle-switch-off-outline", "mdi:toggle-switch"],
    input_boolean: ["mdi:toggle-switch-off-outline", "mdi:toggle-switch"], fan: ["mdi:fan-off", "mdi:fan"],
    binary_sensor: ["mdi:radiobox-blank", "mdi:checkbox-marked-circle"], cover: ["mdi:window-shutter", "mdi:window-shutter-open"],
    lock: ["mdi:lock", "mdi:lock-open-variant"], media_player: ["mdi:cast-off", "mdi:cast-connected"],
    siren: ["mdi:bullhorn-outline", "mdi:bullhorn"], humidifier: ["mdi:air-humidifier-off", "mdi:air-humidifier"],
    climate: "mdi:thermostat", water_heater: "mdi:water-boiler", person: "mdi:account", device_tracker: "mdi:account",
    sun: "mdi:white-balance-sunny", weather: "mdi:weather-partly-cloudy", vacuum: "mdi:robot-vacuum", lawn_mower: "mdi:robot-mower",
    alarm_control_panel: "mdi:shield-home", camera: "mdi:video", button: "mdi:button-pointer", number: "mdi:ray-vertex",
    input_number: "mdi:ray-vertex", select: "mdi:format-list-bulleted", input_select: "mdi:format-list-bulleted",
    input_text: "mdi:form-textbox", input_datetime: "mdi:calendar-clock", update: "mdi:package-up", automation: "mdi:robot",
    script: "mdi:script-text", scene: "mdi:palette", timer: "mdi:timer-outline", counter: "mdi:counter", calendar: "mdi:calendar",
    todo: "mdi:clipboard-list", zone: "mdi:map-marker-radius", valve: "mdi:valve", event: "mdi:eye-check", image: "mdi:image",
    remote: "mdi:remote", sensor: "mdi:eye",
  };
  function iconFor(hass, st, fallbackIcon) {
    if (!st) return fallbackIcon || "mdi:information-outline";
    const reg = hass && hass.entities ? hass.entities[st.entity_id] : null;
    if (reg && reg.icon) return reg.icon;
    if (st.attributes.icon) return st.attributes.icon;
    const domain = st.entity_id.split(".")[0];
    const dc = st.attributes.device_class;
    const on = isAlertActive(st);
    if (domain === "sensor" && dc === "battery") {
      const n = Number(st.state);
      if (!Number.isNaN(n)) { const r = Math.round(n / 10) * 10; return r >= 100 ? "mdi:battery" : r <= 0 ? "mdi:battery-outline" : `mdi:battery-${r}`; }
    }
    if ((domain === "sensor" || domain === "number") && dc && SENSOR_DC[dc]) return SENSOR_DC[dc];
    if (domain === "binary_sensor" && dc && BIN_DC[dc]) return BIN_DC[dc][on ? 1 : 0];
    if (domain === "cover" && dc === "garage") return on ? "mdi:garage-open" : "mdi:garage";
    if (domain === "cover" && (dc === "door" || dc === "gate")) return on ? "mdi:door-open" : "mdi:door-closed";
    if (domain === "cover" && dc === "window") return on ? "mdi:window-open" : "mdi:window-closed";
    if (domain === "sensor" && !dc) {
      const u = st.attributes.unit_of_measurement || "";
      if (/°[CF]/.test(u)) return "mdi:thermometer";
      if (/^(k|M)?Wh$/.test(u)) return "mdi:lightning-bolt";
      if (/^(k|M)?W$/.test(u)) return "mdi:flash";
    }
    const d = DOMAIN_ICON[domain];
    if (Array.isArray(d)) return d[on ? 1 : 0];
    return d || fallbackIcon || "mdi:information-outline";
  }
  function makeIcon(hass, st, fallbackIcon) {
    const i = document.createElement("ha-icon");
    i.setAttribute("icon", iconFor(hass, st, fallbackIcon));
    return i;
  }

  function pathAllowed() {
    const p = window.location.pathname;
    if (EXCLUDED.some((x) => p === x || p.startsWith(x + "/"))) return false;
    const raw = (state.cfg && state.cfg.paths) || "";
    const list = raw.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean).map((s) => (s.startsWith("/") ? s : "/" + s));
    if (!list.length) return true;
    return list.some((x) => p === x || p.startsWith(x.endsWith("/") ? x : x + "/") || p === x.replace(/\/$/, ""));
  }
  const canRun = () => !!(state.cfg && state.enabled && state.applies);

  // ------------------------------------------------------------ Timer
  function resetTimer() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (!canRun() || state.visible) return;
    const ms = Math.max(5, Number(state.cfg.idle_time) || 120) * 1000;
    state.timer = setTimeout(onIdle, ms);
  }
  function onIdle() {
    state.timer = null;
    if (!canRun()) return;
    if (document.visibilityState === "hidden" || !pathAllowed()) { resetTimer(); return; }
    show();
  }

  // ------------------------------------------------------------ Websocket
  function report(active) {
    const h = getHass();
    if (!h || !h.connection) return;
    h.connection.sendMessagePromise({ type: "modular_screensaver/report", active }).catch(() => {});
  }

  function onMessage(msg) {
    if (!msg) return;
    if (msg.type === "command") {
      if (msg.command === "show" && canRun() && pathAllowed()) show();
      else if (msg.command === "hide") hide();
      return;
    }
    if (msg.type === "config") {
      state.cfg = msg.config || {};
      state.enabled = !!msg.enabled;
      state.applies = !!msg.applies;
      if (!canRun()) { hide(true); }
      else if (state.visible) { build(); report(true); }
      resetTimer();
    }
  }

  let retryMs = 3000;
  let boundConn = null;
  async function subscribe() {
    const h = getHass();
    if (!h || !h.connection || state.subscribing) return false;
    const conn = h.connection;
    if (boundConn !== conn) {
      boundConn = conn;
      // Nach Verbindungsabbruch (z. B. HA-Neustart) selbst neu abonnieren
      conn.addEventListener("ready", () => { state.subscribed = false; subscribe(); });
    }
    state.subscribing = true;
    try {
      await conn.subscribeMessage(onMessage, { type: "modular_screensaver/subscribe" }, { resubscribe: false });
      state.subscribed = true;
      retryMs = 3000;
      if (state.visible) report(true);
    } catch (err) {
      state.subscribed = false;
      // Integration (noch) nicht geladen -> später erneut
      setTimeout(() => { if (!state.subscribed) subscribe(); }, retryMs);
      retryMs = Math.min(retryMs * 2, 60000);
    } finally {
      state.subscribing = false;
    }
    return true;
  }

  // ------------------------------------------------------------ Overlay
  function ensureEl() {
    if (state.el) return state.el;
    const el = document.createElement(TAG);
    const root = el.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><div class="bg"></div><div class="dim"></div><div class="wrap"><div class="content"></div></div>`;
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
    el.addEventListener("pointerdown", swallow);
    el.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
    el.addEventListener("pointerup", (e) => { swallow(e); setTimeout(() => hide(), 300); });
    el.addEventListener("click", (e) => { swallow(e); hide(); });
    el.addEventListener("contextmenu", swallow);
    state.el = el;
    return el;
  }

  function show() {
    if (state.visible) return;
    if (state.timer) { clearTimeout(state.timer); state.timer = null; }
    const el = ensureEl();
    build();
    document.body.appendChild(el);
    state.visible = true;
    requestAnimationFrame(() => el.classList.add("on"));
    update();
    state.tick = setInterval(update, 1000);
    if (state.cfg.burn_in) { move(); state.moveTimer = setInterval(move, 60000); }
    report(true);
  }

  function hide(silent) {
    if (!state.visible) return;
    state.visible = false;
    clearInterval(state.tick); state.tick = null;
    clearInterval(state.moveTimer); state.moveTimer = null;
    stopForecast();
    if (state.el) { state.el.classList.remove("on"); state.el.remove(); }
    state.swallowUntil = Date.now() + 600;
    report(false);
    resetTimer();
  }

  function move() {
    const c = state.el && state.el.shadowRoot.querySelector(".content");
    if (!c) return;
    const x = (Math.random() * 2 - 1) * 4;
    const y = (Math.random() * 2 - 1) * 4;
    c.style.transform = `translate(${x.toFixed(2)}vw, ${y.toFixed(2)}vh)`;
  }

  function rgb(c, a = 1) {
    const v = Array.isArray(c) && c.length === 3 ? c : [255, 255, 255];
    return `rgba(${v[0]},${v[1]},${v[2]},${a})`;
  }

  // Grundgerüst neu aufbauen (bei Anzeige / Konfigurationsänderung)
  function build() {
    const el = ensureEl();
    const cfg = state.cfg || {};
    const root = el.shadowRoot;
    const hass = getHass();

    el.style.setProperty("--ss-fg", rgb(cfg.accent_color));
    el.style.setProperty("--ss-fg2", rgb(cfg.accent_color, 0.65));
    el.style.setProperty("--ss-fg3", rgb(cfg.accent_color, 0.12));
    el.style.setProperty("--ss-scale", String((Number(cfg.clock_size) || 100) / 100));
    root.querySelector(".dim").style.opacity = String(Math.min(0.9, (Number(cfg.soft_dim) || 0) / 100));

    const bg = root.querySelector(".bg");
    bg.className = "bg " + (cfg.background || "black");
    bg.style.backgroundImage = "";
    if (cfg.background === "image" && cfg.background_image) {
      bg.style.backgroundImage = `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.55)), url("${String(cfg.background_image).replace(/"/g, "%22")}")`;
    }

    const c = root.querySelector(".content");
    c.innerHTML = `
      ${cfg.show_clock ? `<div class="clock"><span class="hm"></span><span class="sec"></span><span class="ampm"></span></div>` : ""}
      ${cfg.show_date ? `<div class="date"></div>` : ""}
      ${cfg.weather_entity ? `<div class="weather"><span class="wicon"></span><span class="wtemp"></span><span class="wcond"></span></div>` : ""}
      ${cfg.weather_entity && cfg.show_forecast ? `<div class="forecast"></div>` : ""}
      <div class="alerts"></div>
      <div class="entities"></div>`;

    // Entitäten-Kacheln
    const ents = c.querySelector(".entities");
    (cfg.entities || []).forEach((id) => {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.entity = id;
      tile.innerHTML = `<span class="ticon"></span><span class="ttext"><span class="tval"></span><span class="tname"></span></span>`;
      ents.appendChild(tile);
    });
    state.lastAlertKey = null;
    startForecast(hass);
    if (state.visible) update();
  }

  // Werte aktualisieren (jede Sekunde)
  function update() {
    if (!state.visible || !state.el) return;
    const hass = getHass();
    const cfg = state.cfg || {};
    const root = state.el.shadowRoot;
    const now = new Date();
    const lg = lang();

    // Uhr
    const hm = root.querySelector(".hm");
    if (hm) {
      let h = now.getHours();
      let ampm = "";
      if (!cfg.clock_24h) { ampm = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; }
      const H = cfg.clock_24h ? String(h).padStart(2, "0") : String(h);
      hm.textContent = `${H}:${String(now.getMinutes()).padStart(2, "0")}`;
      root.querySelector(".sec").textContent = cfg.show_seconds ? `:${String(now.getSeconds()).padStart(2, "0")}` : "";
      root.querySelector(".ampm").textContent = ampm;
    }
    const d = root.querySelector(".date");
    if (d) d.textContent = now.toLocaleDateString(lg, { weekday: "long", day: "numeric", month: "long" });

    if (!hass) return;

    // Wetter
    const w = root.querySelector(".weather");
    if (w) {
      const st = hass.states[cfg.weather_entity];
      if (!st) { w.style.display = "none"; }
      else {
        w.style.display = "";
        const icon = WEATHER_ICONS[st.state] || "mdi:weather-cloudy";
        const wi = root.querySelector(".wicon");
        if (wi.dataset.icon !== icon) { wi.innerHTML = `<ha-icon icon="${icon}"></ha-icon>`; wi.dataset.icon = icon; }
        const t = st.attributes.temperature;
        const unit = st.attributes.temperature_unit || "°C";
        root.querySelector(".wtemp").textContent = typeof t === "number" ? `${Math.round(t)}${unit.startsWith("°") ? "°" : " " + unit}` : "";
        root.querySelector(".wcond").textContent = fmtState(hass, st);
      }
    }
    renderForecast(root, lg);

    // Hinweise
    const al = root.querySelector(".alerts");
    if (al) {
      const items = [];
      (cfg.alert_entities || []).forEach((id) => {
        const st = hass.states[id];
        if (!isAlertActive(st)) return;
        const cnt = Number(st.attributes.warning_count);
        if (cnt > 0 && st.attributes.warning_1_headline) {
          for (let i = 1; i <= cnt; i++) {
            const hl = st.attributes[`warning_${i}_headline`];
            if (hl) items.push({ key: `${id}#${i}`, st, text: hl, color: st.attributes[`warning_${i}_color`] || "#ff9800" });
          }
        } else {
          items.push({ key: id, st, text: `${entityName(hass, st)}: ${fmtState(hass, st)}`, color: "#ff9800" });
        }
      });
      const key = items.map((i) => i.key + "|" + i.text + "|" + i.st.last_changed).join(";");
      if (key !== state.lastAlertKey) {
        state.lastAlertKey = key;
        al.innerHTML = "";
        items.forEach((it) => {
          const div = document.createElement("div");
          div.className = "alert";
          div.style.setProperty("--ac", it.color);
          div.appendChild(makeIcon(hass, it.st, "mdi:alert"));
          const s = document.createElement("span");
          s.textContent = it.text;
          div.appendChild(s);
          al.appendChild(div);
        });
      }
    }

    // Entitäten
    root.querySelectorAll(".tile").forEach((tile) => {
      const st = hass.states[tile.dataset.entity];
      if (!st) { tile.style.display = "none"; return; }
      tile.style.display = "";
      const ic = tile.querySelector(".ticon");
      const stamp = st.last_updated + st.state;
      if (ic.dataset.stamp !== stamp) {
        ic.dataset.stamp = stamp;
        ic.innerHTML = "";
        ic.appendChild(makeIcon(hass, st));
        tile.querySelector(".tval").textContent = fmtState(hass, st);
        tile.querySelector(".tname").textContent = entityName(hass, st);
      }
    });
  }

  // ------------------------------------------------------------ Vorhersage
  function stopForecast() {
    if (state.forecastUnsub) {
      const u = state.forecastUnsub;
      state.forecastUnsub = null;
      Promise.resolve(u).then((fn) => typeof fn === "function" && fn()).catch(() => {});
    }
    state.forecastKey = null;
    state.forecast = null;
  }

  function startForecast(hass) {
    const cfg = state.cfg || {};
    const id = cfg.weather_entity;
    if (!hass || !id || !cfg.show_forecast) { stopForecast(); return; }
    const st = hass.states[id];
    if (!st) { stopForecast(); return; }
    const feat = Number(st.attributes.supported_features) || 0;
    const type = feat & 1 ? "daily" : feat & 4 ? "twice_daily" : feat & 2 ? "hourly" : null;
    if (!type) { stopForecast(); return; }
    const key = `${id}|${type}`;
    if (state.forecastKey === key && state.forecastUnsub) return;
    stopForecast();
    state.forecastKey = key;
    state.forecastUnsub = hass.connection
      .subscribeMessage((ev) => { state.forecast = { type, items: (ev && ev.forecast) || [] }; }, {
        type: "weather/subscribe_forecast", entity_id: id, forecast_type: type,
      })
      .catch((e) => { console.warn("[Modular Screensaver] Vorhersage nicht verfügbar", e); state.forecastUnsub = null; });
  }

  function renderForecast(root, lg) {
    const box = root.querySelector(".forecast");
    if (!box) return;
    const fc = state.forecast;
    const cfg = state.cfg || {};
    if (!fc || !fc.items.length) { box.innerHTML = ""; box.dataset.key = ""; return; }
    let items = fc.items;
    if (fc.type === "twice_daily") items = items.filter((i) => i.is_daytime !== false);
    if (fc.type !== "hourly") {
      const start = new Date(); start.setHours(23, 59, 59, 999);
      const future = items.filter((i) => new Date(i.datetime) > start);
      if (future.length) items = future;
    } else {
      const nowMs = Date.now();
      items = items.filter((i) => new Date(i.datetime).getTime() >= nowMs - 3600000);
    }
    items = items.slice(0, Math.max(1, Number(cfg.forecast_days) || 4));
    const key = JSON.stringify(items.map((i) => [i.datetime, i.condition, i.temperature, i.templow]));
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    box.innerHTML = items.map((i) => {
      const dt = new Date(i.datetime);
      const label = fc.type === "hourly"
        ? dt.toLocaleTimeString(lg, { hour: "2-digit", minute: "2-digit" })
        : dt.toLocaleDateString(lg, { weekday: "short" });
      const hi = typeof i.temperature === "number" ? Math.round(i.temperature) + "°" : "";
      const lo = typeof i.templow === "number" ? Math.round(i.templow) + "°" : "";
      return `<div class="fday"><span class="fl">${esc(label)}</span><ha-icon icon="${WEATHER_ICONS[i.condition] || "mdi:weather-cloudy"}"></ha-icon><span class="ft">${esc(hi)}${lo ? ` <span class="flo">${esc(lo)}</span>` : ""}</span></div>`;
    }).join("");
  }

  // ------------------------------------------------------------ Styles
  const CSS = `
    :host { position: fixed; inset: 0; z-index: 2147483000; display: block; opacity: 0; transition: opacity .6s ease;
      color: var(--ss-fg); font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, "Helvetica Neue", Arial, sans-serif));
      cursor: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; touch-action: none; }
    :host(.on) { opacity: 1; }
    .bg { position: absolute; inset: 0; background: #000; background-size: cover; background-position: center; }
    .bg.gradient { background: radial-gradient(ellipse at 30% 20%, #1c2541 0%, #0b132b 45%, #000 100%); }
    .dim { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
    .wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
    .content { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1.2vh;
      transition: transform 8s ease-in-out; max-width: 94vw; }
    .clock { font-weight: 200; line-height: 1; letter-spacing: .02em; font-variant-numeric: tabular-nums;
      font-size: calc(min(24vw, 34vh) * var(--ss-scale)); }
    .sec { font-size: .35em; color: var(--ss-fg2); margin-left: .05em; }
    .ampm { font-size: .25em; color: var(--ss-fg2); margin-left: .15em; }
    .date { font-size: calc(min(4.2vw, 5.5vh)); font-weight: 300; color: var(--ss-fg2); }
    .weather { display: flex; align-items: center; gap: .45em; font-size: min(4.4vw, 6vh); font-weight: 300; margin-top: 1vh; }
    .weather ha-icon { --mdc-icon-size: 1.25em; display: flex; }
    .wcond { color: var(--ss-fg2); }
    .forecast { display: flex; gap: min(4vw, 48px); margin-top: .5vh; }
    .fday { display: flex; flex-direction: column; align-items: center; gap: .3em; font-size: min(2.4vw, 3.2vh); color: var(--ss-fg2); }
    .fday ha-icon { --mdc-icon-size: 1.8em; color: var(--ss-fg); }
    .ft { color: var(--ss-fg); } .flo { color: var(--ss-fg2); }
    .alerts { display: flex; flex-direction: column; align-items: center; gap: .6vh; margin-top: 1vh; }
    .alerts:empty, .entities:empty, .forecast:empty { display: none; }
    .alert { display: flex; align-items: center; gap: .5em; font-size: min(2.6vw, 3.4vh); color: var(--ac);
      padding: .35em .9em; border-radius: 999px; background: rgba(255,255,255,.08); background: color-mix(in srgb, var(--ac) 14%, transparent); }
    .alert ha-icon, .alert ha-state-icon { --mdc-icon-size: 1.2em; color: var(--ac); }
    .entities { display: flex; flex-wrap: wrap; justify-content: center; gap: min(1.6vw, 18px); margin-top: 2.5vh; max-width: 90vw; }
    .tile { display: flex; align-items: center; gap: .7em; padding: .7em 1.1em; border-radius: 18px;
      background: var(--ss-fg3); font-size: min(2.2vw, 3vh); min-width: 8em; text-align: left; }
    .ticon { display: flex; } .ticon > * { --mdc-icon-size: 1.7em; color: var(--ss-fg); }
    .ttext { display: flex; flex-direction: column; line-height: 1.2; }
    .tval { font-size: 1.25em; font-weight: 400; white-space: nowrap; }
    .tname { color: var(--ss-fg2); font-size: .8em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14em; }
  `;

  // ------------------------------------------------------------ Start
  ACTIVITY.forEach((evt) =>
    window.addEventListener(evt, () => { if (!state.visible) resetTimer(); }, { capture: true, passive: true })
  );
  // Tipp, der den Schoner beendet, nicht an das Dashboard durchreichen
  ["click", "pointerup", "mouseup", "touchend"].forEach((evt) =>
    window.addEventListener(evt, (e) => {
      if (Date.now() < state.swallowUntil) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }
    }, { capture: true })
  );
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resetTimer(); });

  // Diagnose in der Browser-Konsole: modularScreensaver()
  window.modularScreensaver = () => ({
    enabled: state.enabled, applies: state.applies, visible: state.visible, subscribed: state.subscribed,
    timerRunning: !!state.timer, pathAllowed: state.cfg ? pathAllowed() : null, path: window.location.pathname, config: state.cfg,
  });

  const boot = setInterval(() => {
    const h = getHass();
    if (h && h.connection) { clearInterval(boot); subscribe(); }
  }, 500);
})();
