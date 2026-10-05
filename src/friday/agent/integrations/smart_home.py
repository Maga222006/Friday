from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from homeassistant_api import Client

load_dotenv()


def _get_client() -> Client:
    url = os.getenv("HOMEASSISTANT_URL")
    token = os.getenv("HOMEASSISTANT_TOKEN")

    if not url:
        raise ValueError("HOMEASSISTANT_URL is missing")
    if not token:
        raise ValueError("HOMEASSISTANT_TOKEN is missing")

    return Client(url, token)


def get_device_list() -> str:
    """
    Return controllable Home Assistant entities with state, actions, and attributes.
    Always returns a string so agent middleware does not crash.
    """
    try:
        client = _get_client()

        if not client.check_api_running():
            return "The connection to the smart home service failed. Please check your Home Assistant URL/token."

        domains = client.get_domains()
        states = client.get_states()

        candidate_actions = {
            "turn_on",
            "turn_off",
            "toggle",
            "open_cover",
            "close_cover",
            "stop_cover",
            "lock",
            "unlock",
            "open",
            "close",
            "press",
            "start",
            "stop",
            "pause",
            "unpause",
            "set_temperature",
            "set_percentage",
            "set_hvac_mode",
            "set_fan_mode",
            "set_swing_mode",
            "set_preset_mode",
        }

        devices: list[dict[str, Any]] = []

        for state in states:
            entity_id = getattr(state, "entity_id", None)
            if not entity_id or "." not in entity_id:
                continue

            domain_name = entity_id.split(".", 1)[0]
            domain_obj = domains.get(domain_name)
            if not domain_obj:
                continue

            service_names = set(domain_obj.services.keys())
            actions = sorted(service_names & candidate_actions)

            if not actions:
                continue

            devices.append(
                {
                    "entity_id": entity_id,
                    "state": getattr(state, "state", None),
                    "actions": actions,
                    "attributes": getattr(state, "attributes", {}) or {},
                }
            )

        if not devices:
            return "No controllable Home Assistant entities were found."

        def format_attributes(attrs: dict[str, Any]) -> str:
            if not attrs:
                return "None"
            return "\n".join(f"    {key}: {value}" for key, value in attrs.items())

        return "Your devices:\n\n" + "\n\n".join(
            f"{i + 1}. {device['entity_id']}\n"
            f"State: {device['state']}\n"
            f"Actions: {', '.join(device['actions'])}\n"
            f"Attributes:\n{format_attributes(device['attributes'])}"
            for i, device in enumerate(devices)
        )

    except Exception as e:
        print(e)
        return "The connection to the smart home service failed. Please check your api credentials and try again."


def change_device_states(
    entity_id: str,
    action: str,
    service_data: dict[str, Any] = {},
) -> str:
    """
    Control a Home Assistant entity.

    - entity_id: e.g. "light.kitchen"
    - action: e.g. "turn_on", "turn_off", "set_temperature"
    - service_data: optional dict of extra parameters. Keys must be plain strings
      with no extra quotes. Only use keys that appear in the device's attributes
      from get_device_list.

    Examples:
      change_device_states("light.kitchen", "turn_on", {"brightness": 180})
      change_device_states("light.kitchen", "turn_on", {"rgb_color": [255, 0, 0]})
      change_device_states("climate.living_room", "set_temperature", {"temperature": 22})
    """
    try:
        client = _get_client()

        if not client.check_api_running():
            return "The connection to the smart home service failed. Please check your api credentials and try again."

        if "." not in entity_id:
            return "failure: invalid entity_id"
        print(service_data)
        domain = entity_id.split(".", 1)[0]
        response = client.trigger_service(domain, action, entity_id=entity_id, **service_data)

        return "success" if response is not None else "failure"

    except Exception as e:
        print(e)
        return f"failure: {e}"


smart_home_tools = [get_device_list, change_device_states]