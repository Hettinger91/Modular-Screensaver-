"""Binärsensor: Screensaver gerade sichtbar (auf mindestens einem Gerät)."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import ScreensaverConfigEntry
from .const import SIGNAL_ACTIVE
from .switch import device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: ScreensaverConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    async_add_entities([ScreensaverActiveSensor(entry)])


class ScreensaverActiveSensor(BinarySensorEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "active"
    _attr_icon = "mdi:monitor-eye"
    _attr_should_poll = False

    def __init__(self, entry: ScreensaverConfigEntry) -> None:
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_active"
        self._attr_device_info = device_info(entry.entry_id)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_ACTIVE, self.async_write_ha_state)
        )

    @property
    def is_on(self) -> bool:
        return self._entry.runtime_data.any_active

    @property
    def extra_state_attributes(self) -> dict:
        return {"devices": len(self._entry.runtime_data.active_clients)}
