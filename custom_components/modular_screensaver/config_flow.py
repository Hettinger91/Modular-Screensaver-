"""Config- und Options-Flow für Modular Screensaver."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector as sel

from .const import (
    BG_BLACK,
    BG_GRADIENT,
    BG_IMAGE,
    CONF_ACCENT_COLOR,
    CONF_ALERT_ENTITIES,
    CONF_BACKGROUND,
    CONF_BACKGROUND_IMAGE,
    CONF_BURN_IN,
    CONF_CLOCK_24H,
    CONF_CLOCK_SIZE,
    CONF_DIM_BRIGHTNESS,
    CONF_DISPLAY_ENTITY,
    CONF_ENTITIES,
    CONF_FORECAST_DAYS,
    CONF_IDLE_TIME,
    CONF_NIGHT_ACTION,
    CONF_NIGHT_END,
    CONF_NIGHT_START,
    CONF_NORMAL_BRIGHTNESS,
    CONF_PATHS,
    CONF_SHOW_CLOCK,
    CONF_SHOW_DATE,
    CONF_SHOW_FORECAST,
    CONF_SHOW_SECONDS,
    CONF_SOFT_DIM,
    CONF_USERS,
    CONF_WEATHER_ENTITY,
    CONTENT_KEYS,
    DEFAULTS,
    DISPLAY_KEYS,
    DOMAIN,
    GENERAL_KEYS,
    LOOK_KEYS,
    NIGHT_DIM,
    NIGHT_NONE,
    NIGHT_OFF,
)


def _num(min_: int, max_: int, step: int = 1, unit: str | None = None, box: bool = False) -> sel.NumberSelector:
    config: dict[str, Any] = {
        "min": min_,
        "max": max_,
        "step": step,
        "mode": sel.NumberSelectorMode.BOX if box else sel.NumberSelectorMode.SLIDER,
    }
    if unit:
        config["unit_of_measurement"] = unit
    return sel.NumberSelector(sel.NumberSelectorConfig(**config))


class ScreensaverConfigFlow(ConfigFlow, domain=DOMAIN):
    """Einrichtung – eine Instanz, keine Pflichtangaben."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Modular Screensaver", data={}, options=dict(DEFAULTS))
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return ScreensaverOptionsFlow()


class ScreensaverOptionsFlow(OptionsFlow):
    """Einstellungen in drei Bereichen (Menü)."""

    def _opts(self) -> dict[str, Any]:
        return {**DEFAULTS, **self.config_entry.options}

    def _save(self, keys: tuple[str, ...], user_input: dict[str, Any]) -> ConfigFlowResult:
        # Felder dieses Bereichs komplett ersetzen, damit geleerte Felder wirklich leer werden
        data = {k: v for k, v in self._opts().items() if k not in keys}
        for key in keys:
            data[key] = user_input.get(key, None if DEFAULTS[key] is None else type(DEFAULTS[key])())
        return self.async_create_entry(data=data)

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        return self.async_show_menu(step_id="init", menu_options=["general", "content", "look", "display"])

    # ------------------------------------------------------------- Allgemein
    async def async_step_general(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            user_input[CONF_IDLE_TIME] = int(user_input[CONF_IDLE_TIME])
            user_input[CONF_PATHS] = (user_input.get(CONF_PATHS) or "").strip()
            return self._save(GENERAL_KEYS, user_input)

        users = await self.hass.auth.async_get_users()
        user_options = [
            sel.SelectOptionDict(value=u.id, label=u.name or u.id)
            for u in users
            if not u.system_generated and u.is_active
        ]
        opts = self._opts()
        valid_ids = {o["value"] for o in user_options}
        current_users = [u for u in (opts[CONF_USERS] or []) if u in valid_ids]
        schema = vol.Schema(
            {
                vol.Required(CONF_IDLE_TIME, default=opts[CONF_IDLE_TIME]): _num(10, 3600, 5, "s", box=True),
                vol.Optional(CONF_USERS, default=current_users): sel.SelectSelector(
                    sel.SelectSelectorConfig(options=user_options, multiple=True, mode=sel.SelectSelectorMode.LIST)
                ),
                vol.Optional(CONF_PATHS, description={"suggested_value": opts[CONF_PATHS]}): sel.TextSelector(),
            }
        )
        return self.async_show_form(step_id="general", data_schema=schema)

    # ---------------------------------------------------------------- Inhalt
    async def async_step_content(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            user_input[CONF_FORECAST_DAYS] = int(user_input[CONF_FORECAST_DAYS])
            return self._save(CONTENT_KEYS, user_input)

        opts = self._opts()
        schema = vol.Schema(
            {
                vol.Required(CONF_SHOW_CLOCK, default=opts[CONF_SHOW_CLOCK]): sel.BooleanSelector(),
                vol.Required(CONF_CLOCK_24H, default=opts[CONF_CLOCK_24H]): sel.BooleanSelector(),
                vol.Required(CONF_SHOW_SECONDS, default=opts[CONF_SHOW_SECONDS]): sel.BooleanSelector(),
                vol.Required(CONF_SHOW_DATE, default=opts[CONF_SHOW_DATE]): sel.BooleanSelector(),
                vol.Optional(
                    CONF_WEATHER_ENTITY, description={"suggested_value": opts[CONF_WEATHER_ENTITY]}
                ): sel.EntitySelector(sel.EntitySelectorConfig(domain="weather")),
                vol.Required(CONF_SHOW_FORECAST, default=opts[CONF_SHOW_FORECAST]): sel.BooleanSelector(),
                vol.Required(CONF_FORECAST_DAYS, default=opts[CONF_FORECAST_DAYS]): _num(1, 7),
                vol.Optional(CONF_ENTITIES, default=opts[CONF_ENTITIES] or []): sel.EntitySelector(
                    sel.EntitySelectorConfig(multiple=True)
                ),
                vol.Optional(CONF_ALERT_ENTITIES, default=opts[CONF_ALERT_ENTITIES] or []): sel.EntitySelector(
                    sel.EntitySelectorConfig(multiple=True)
                ),
            }
        )
        return self.async_show_form(step_id="content", data_schema=schema)

    # -------------------------------------------------------------- Aussehen
    async def async_step_look(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            user_input[CONF_CLOCK_SIZE] = int(user_input[CONF_CLOCK_SIZE])
            user_input[CONF_SOFT_DIM] = int(user_input[CONF_SOFT_DIM])
            user_input[CONF_BACKGROUND_IMAGE] = (user_input.get(CONF_BACKGROUND_IMAGE) or "").strip()
            color = user_input.get(CONF_ACCENT_COLOR)
            user_input[CONF_ACCENT_COLOR] = list(color) if color else list(DEFAULTS[CONF_ACCENT_COLOR])
            return self._save(LOOK_KEYS, user_input)

        opts = self._opts()
        schema = vol.Schema(
            {
                vol.Required(CONF_BACKGROUND, default=opts[CONF_BACKGROUND]): sel.SelectSelector(
                    sel.SelectSelectorConfig(
                        options=[BG_BLACK, BG_GRADIENT, BG_IMAGE],
                        translation_key="background",
                        mode=sel.SelectSelectorMode.DROPDOWN,
                    )
                ),
                vol.Optional(
                    CONF_BACKGROUND_IMAGE, description={"suggested_value": opts[CONF_BACKGROUND_IMAGE]}
                ): sel.TextSelector(),
                vol.Required(CONF_ACCENT_COLOR, default=opts[CONF_ACCENT_COLOR]): sel.ColorRGBSelector(),
                vol.Required(CONF_CLOCK_SIZE, default=opts[CONF_CLOCK_SIZE]): _num(40, 200, 5, "%"),
                vol.Required(CONF_SOFT_DIM, default=opts[CONF_SOFT_DIM]): _num(0, 90, 5, "%"),
                vol.Required(CONF_BURN_IN, default=opts[CONF_BURN_IN]): sel.BooleanSelector(),
            }
        )
        return self.async_show_form(step_id="look", data_schema=schema)

    # --------------------------------------------------------------- Display
    async def async_step_display(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            user_input[CONF_DIM_BRIGHTNESS] = int(user_input[CONF_DIM_BRIGHTNESS])
            user_input[CONF_NORMAL_BRIGHTNESS] = int(user_input[CONF_NORMAL_BRIGHTNESS])
            return self._save(DISPLAY_KEYS, user_input)

        opts = self._opts()
        schema = vol.Schema(
            {
                vol.Optional(
                    CONF_DISPLAY_ENTITY, description={"suggested_value": opts[CONF_DISPLAY_ENTITY]}
                ): sel.EntitySelector(sel.EntitySelectorConfig(domain="light")),
                vol.Required(CONF_DIM_BRIGHTNESS, default=opts[CONF_DIM_BRIGHTNESS]): _num(0, 100, 1, "%"),
                vol.Required(CONF_NORMAL_BRIGHTNESS, default=opts[CONF_NORMAL_BRIGHTNESS]): _num(1, 100, 1, "%"),
                vol.Optional(
                    CONF_NIGHT_START, description={"suggested_value": opts[CONF_NIGHT_START]}
                ): sel.TimeSelector(),
                vol.Optional(
                    CONF_NIGHT_END, description={"suggested_value": opts[CONF_NIGHT_END]}
                ): sel.TimeSelector(),
                vol.Required(CONF_NIGHT_ACTION, default=opts[CONF_NIGHT_ACTION]): sel.SelectSelector(
                    sel.SelectSelectorConfig(
                        options=[NIGHT_OFF, NIGHT_DIM, NIGHT_NONE],
                        translation_key="night_action",
                        mode=sel.SelectSelectorMode.DROPDOWN,
                    )
                ),
            }
        )
        return self.async_show_form(step_id="display", data_schema=schema)
