"""Schalter: Screensaver aktivieren/deaktivieren."""

from __future__ import annotations

from typing import Any

from homeassistant.components.switch import SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.restore_state import RestoreEntity

from . import ScreensaverConfigEntry
from .const import DOMAIN, VERSION


def device_info(entry_id: str) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, entry_id)},
        name="Modular Screensaver",
        manufacturer="Modular Screensaver",
        sw_version=VERSION,
        entry_type=DeviceEntryType.SERVICE,
    )


async def async_setup_entry(
    hass: HomeAssistant, entry: ScreensaverConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([ScreensaverEnabledSwitch(entry)])


class ScreensaverEnabledSwitch(SwitchEntity, RestoreEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "enabled"
    _attr_icon = "mdi:monitor-shimmer"

    def __init__(self, entry: ScreensaverConfigEntry) -> None:
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_enabled"
        self._attr_device_info = device_info(entry.entry_id)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last is not None and last.state in ("on", "off"):
            self._entry.runtime_data.set_enabled(last.state == "on")

    @property
    def is_on(self) -> bool:
        return self._entry.runtime_data.enabled

    async def async_turn_on(self, **kwargs: Any) -> None:
        self._entry.runtime_data.set_enabled(True)
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._entry.runtime_data.set_enabled(False)
        self.async_write_ha_state()
