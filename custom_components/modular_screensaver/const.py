"""Konstanten für Modular Screensaver."""

from __future__ import annotations

DOMAIN = "modular_screensaver"
VERSION = "1.0.0"

URL_BASE = f"/{DOMAIN}_static"
JS_FILE = "modular-screensaver.js"

SIGNAL_UPDATE = f"{DOMAIN}_update"
SIGNAL_COMMAND = f"{DOMAIN}_command"
SIGNAL_ACTIVE = f"{DOMAIN}_active"

# --- Allgemein
CONF_IDLE_TIME = "idle_time"
CONF_USERS = "users"
CONF_PATHS = "paths"

# --- Inhalt
CONF_SHOW_CLOCK = "show_clock"
CONF_CLOCK_24H = "clock_24h"
CONF_SHOW_SECONDS = "show_seconds"
CONF_SHOW_DATE = "show_date"
CONF_WEATHER_ENTITY = "weather_entity"
CONF_SHOW_FORECAST = "show_forecast"
CONF_FORECAST_DAYS = "forecast_days"
CONF_ENTITIES = "entities"
CONF_ALERT_ENTITIES = "alert_entities"

# --- Aussehen
CONF_BACKGROUND = "background"
CONF_BACKGROUND_IMAGE = "background_image"
CONF_ACCENT_COLOR = "accent_color"
CONF_CLOCK_SIZE = "clock_size"
CONF_SOFT_DIM = "soft_dim"
CONF_BURN_IN = "burn_in"

# --- Display
CONF_DISPLAY_ENTITY = "display_entity"
CONF_DIM_BRIGHTNESS = "dim_brightness"
CONF_NORMAL_BRIGHTNESS = "normal_brightness"
CONF_NIGHT_START = "night_start"
CONF_NIGHT_END = "night_end"
CONF_NIGHT_ACTION = "night_action"

BG_BLACK = "black"
BG_GRADIENT = "gradient"
BG_IMAGE = "image"

NIGHT_OFF = "off"
NIGHT_DIM = "dim"
NIGHT_NONE = "none"

GENERAL_KEYS = (CONF_IDLE_TIME, CONF_USERS, CONF_PATHS)
CONTENT_KEYS = (
    CONF_SHOW_CLOCK,
    CONF_CLOCK_24H,
    CONF_SHOW_SECONDS,
    CONF_SHOW_DATE,
    CONF_WEATHER_ENTITY,
    CONF_SHOW_FORECAST,
    CONF_FORECAST_DAYS,
    CONF_ENTITIES,
    CONF_ALERT_ENTITIES,
)
LOOK_KEYS = (
    CONF_BACKGROUND,
    CONF_BACKGROUND_IMAGE,
    CONF_ACCENT_COLOR,
    CONF_CLOCK_SIZE,
    CONF_SOFT_DIM,
    CONF_BURN_IN,
)
DISPLAY_KEYS = (
    CONF_DISPLAY_ENTITY,
    CONF_DIM_BRIGHTNESS,
    CONF_NORMAL_BRIGHTNESS,
    CONF_NIGHT_START,
    CONF_NIGHT_END,
    CONF_NIGHT_ACTION,
)

DEFAULTS: dict = {
    CONF_IDLE_TIME: 120,
    CONF_USERS: [],
    CONF_PATHS: "",
    CONF_SHOW_CLOCK: True,
    CONF_CLOCK_24H: True,
    CONF_SHOW_SECONDS: False,
    CONF_SHOW_DATE: True,
    CONF_WEATHER_ENTITY: None,
    CONF_SHOW_FORECAST: True,
    CONF_FORECAST_DAYS: 4,
    CONF_ENTITIES: [],
    CONF_ALERT_ENTITIES: [],
    CONF_BACKGROUND: BG_BLACK,
    CONF_BACKGROUND_IMAGE: "",
    CONF_ACCENT_COLOR: [255, 255, 255],
    CONF_CLOCK_SIZE: 100,
    CONF_SOFT_DIM: 0,
    CONF_BURN_IN: True,
    CONF_DISPLAY_ENTITY: None,
    CONF_DIM_BRIGHTNESS: 10,
    CONF_NORMAL_BRIGHTNESS: 70,
    CONF_NIGHT_START: None,
    CONF_NIGHT_END: None,
    CONF_NIGHT_ACTION: NIGHT_OFF,
}

# Schlüssel, die ans Frontend gehen (Benutzer-IDs und Display-Steuerung bleiben im Backend)
FRONTEND_KEYS = (
    CONF_IDLE_TIME,
    CONF_PATHS,
    *CONTENT_KEYS,
    *LOOK_KEYS,
)
