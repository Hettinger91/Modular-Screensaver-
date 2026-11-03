"""Modular Screensaver – konfigurierbarer Bildschirmschoner für Home-Assistant-Dashboards."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
import logging
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_ENTITY_ID, Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import (
    CONF_DIM_BRIGHTNESS,
    CONF_DISPLAY_ENTITY,
    CONF_NIGHT_ACTION,
    CONF_NIGHT_END,
    CONF_NIGHT_START,
    CONF_NORMAL_BRIGHTNESS,
    CONF_USERS,
    DEFAULTS,
    DOMAIN,
    FRONTEND_KEYS,
    JS_FILE,
    NIGHT_DIM,
    NIGHT_OFF,
    SIGNAL_ACTIVE,
    SIGNAL_COMMAND,
    SIGNAL_UPDATE,
    URL_BASE,
    VERSION,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SWITCH, Platform.BINARY_SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type ScreensaverConfigEntry = ConfigEntry[ScreensaverRuntime]


def merged_options(entry: ConfigEntry) -> dict[str, Any]:
    """Optionen mit Standardwerten zusammenführen."""
    return {**DEFAULTS, **entry.options}


@dataclass
class ScreensaverRuntime:
    """Laufzeitzustand der Integration."""

    hass: HomeAssistant
    entry: ConfigEntry
    enabled: bool = True
    active_clients: set[int] = field(default_factory=set)
    applied_mode: str | None = None  # "normal" | "dim" | "off" | "none"

    @property
    def options(self) -> dict[str, Any]:
        return merged_options(self.entry)

    @property
    def any_active(self) -> bool:
        return bool(self.active_clients)

    # ------------------------------------------------------------------ Frontend
    def user_applies(self, user_id: str | None) -> bool:
        users = self.options.get(CONF_USERS) or []
        return not users or (user_id in users)

    def frontend_payload(self, user_id: str | None) -> dict[str, Any]:
        opts = self.options
        return {
            "type": "config",
            "version": VERSION,
            "enabled": self.enabled,
            "applies": self.user_applies(user_id),
            "config": {key: opts.get(key) for key in FRONTEND_KEYS},
        }

    @callback
    def notify_update(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_UPDATE)

    @callback
    def set_enabled(self, enabled: bool) -> None:
        self.enabled = enabled
        if not enabled:
            self.active_clients.clear()
            async_dispatcher_send(self.hass, SIGNAL_ACTIVE)
            self.hass.async_create_task(self.async_apply_display())
        self.notify_update()

    @callback
    def set_client_active(self, client: int, active: bool) -> None:
        before = self.any_active
        if active and self.enabled:
            self.active_clients.add(client)
        else:
            self.active_clients.discard(client)
        if before != self.any_active:
            async_dispatcher_send(self.hass, SIGNAL_ACTIVE)
            self.hass.async_create_task(self.async_apply_display())

    # ------------------------------------------------------------------- Display
    def _is_night(self, now: datetime) -> bool:
        opts = self.options
        start = _parse_time(opts.get(CONF_NIGHT_START))
        end = _parse_time(opts.get(CONF_NIGHT_END))
        if start is None or end is None or start == end:
            return False
        cur = now.time()
        if start < end:
            return start <= cur < end
        return cur >= start or cur < end

    def _desired_mode(self) -> str:
        if not self.any_active:
            return "normal"
        if self._is_night(dt_util.now()):
            action = self.options.get(CONF_NIGHT_ACTION)
            if action == NIGHT_OFF:
                return "off"
            if action == NIGHT_DIM:
                return "dim"
            return "none"
        return "dim"

    async def async_apply_display(self, force: bool = False) -> None:
        opts = self.options
        entity_id = opts.get(CONF_DISPLAY_ENTITY)
        if not entity_id:
            self.applied_mode = None
            return
        mode = self._desired_mode()
        if mode == self.applied_mode and not force:
            return
        self.applied_mode = mode
        try:
            if mode == "off":
                await self.hass.services.async_call(
                    "light", "turn_off", {ATTR_ENTITY_ID: entity_id}, blocking=True
                )
            elif mode == "dim":
                await self._turn_on(entity_id, opts.get(CONF_DIM_BRIGHTNESS))
            elif mode == "normal":
                await self._turn_on(entity_id, opts.get(CONF_NORMAL_BRIGHTNESS))
        except Exception:  # noqa: BLE001 – Display-Fehler dürfen den Schoner nicht stoppen
            _LOGGER.exception("Display %s konnte nicht gesteuert werden", entity_id)

    async def _turn_on(self, entity_id: str, pct: Any) -> None:
        pct = int(pct or 0)
        if pct <= 0:
            await self.hass.services.async_call(
                "light", "turn_off", {ATTR_ENTITY_ID: entity_id}, blocking=True
            )
            return
        await self.hass.services.async_call(
            "light",
            "turn_on",
            {ATTR_ENTITY_ID: entity_id, "brightness_pct": min(pct, 100)},
            blocking=True,
        )


def _parse_time(value: Any) -> time | None:
    if not value:
        return None
    if isinstance(value, time):
        return value
    return dt_util.parse_time(str(value))


def _runtime(hass: HomeAssistant) -> ScreensaverRuntime | None:
    return hass.data.get(DOMAIN)


# ----------------------------------------------------------------------- Setup
async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Websocket-Befehle und Dienste einmalig registrieren."""
    websocket_api.async_register_command(hass, ws_subscribe)
    websocket_api.async_register_command(hass, ws_report)

    async def _command(call: ServiceCall) -> None:
        async_dispatcher_send(hass, SIGNAL_COMMAND, call.service)

    for service in ("show", "hide"):
        hass.services.async_register(DOMAIN, service, _command, schema=vol.Schema({}))
    return True


async def _async_register_frontend(hass: HomeAssistant) -> str:
    url = f"{URL_BASE}/{JS_FILE}"
    if not hass.data.get(f"{DOMAIN}_static"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    URL_BASE, str(Path(__file__).parent / "frontend"), False
                )
            ]
        )
        hass.data[f"{DOMAIN}_static"] = True
    full = f"{url}?v={VERSION}"
    frontend.add_extra_js_url(hass, full)
    return full


async def async_setup_entry(hass: HomeAssistant, entry: ScreensaverConfigEntry) -> bool:
    runtime = ScreensaverRuntime(hass=hass, entry=entry)
    entry.runtime_data = runtime
    hass.data[DOMAIN] = runtime

    js_url = await _async_register_frontend(hass)
    entry.async_on_unload(lambda: frontend.remove_extra_js_url(hass, js_url))

    async def _tick(_now: datetime) -> None:
        if runtime.any_active:
            await runtime.async_apply_display()

    entry.async_on_unload(
        async_track_time_interval(hass, _tick, timedelta(seconds=30))
    )
    entry.async_on_unload(entry.add_update_listener(_async_options_updated))

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    runtime.notify_update()
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ScreensaverConfigEntry) -> None:
    runtime = entry.runtime_data
    runtime.notify_update()
    await runtime.async_apply_display(force=runtime.any_active)


async def async_unload_entry(hass: HomeAssistant, entry: ScreensaverConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        runtime = entry.runtime_data
        was_active = runtime.any_active
        runtime.active_clients.clear()
        if hass.data.get(DOMAIN) is runtime:
            hass.data.pop(DOMAIN)
        if was_active:
            await runtime.async_apply_display(force=True)
        async_dispatcher_send(hass, SIGNAL_UPDATE)
    return unloaded


# ------------------------------------------------------------------- Websocket
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Konfiguration abonnieren; liefert sofort und bei jeder Änderung."""
    msg_id = msg["id"]
    user_id = connection.user.id if connection.user else None
    client = id(connection)

    @callback
    def _send_config() -> None:
        runtime = _runtime(hass)
        if runtime is None:
            payload = {"type": "config", "version": VERSION, "enabled": False, "applies": False, "config": {}}
        else:
            payload = runtime.frontend_payload(user_id)
        connection.send_message(websocket_api.event_message(msg_id, payload))

    @callback
    def _send_command(command: str) -> None:
        runtime = _runtime(hass)
        if runtime is None or not runtime.enabled or not runtime.user_applies(user_id):
            return
        connection.send_message(
            websocket_api.event_message(msg_id, {"type": "command", "command": command})
        )

    unsub_update = async_dispatcher_connect(hass, SIGNAL_UPDATE, _send_config)
    unsub_cmd = async_dispatcher_connect(hass, SIGNAL_COMMAND, _send_command)

    @callback
    def _unsub() -> None:
        unsub_update()
        unsub_cmd()
        runtime = _runtime(hass)
        if runtime is not None:
            runtime.set_client_active(client, False)

    connection.subscriptions[msg_id] = _unsub
    connection.send_result(msg_id)
    _send_config()


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/report", vol.Required("active"): bool}
)
@callback
def ws_report(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Frontend meldet, ob der Schoner gerade sichtbar ist."""
    runtime = _runtime(hass)
    if runtime is not None:
        runtime.set_client_active(id(connection), msg["active"])
    connection.send_result(msg["id"])
