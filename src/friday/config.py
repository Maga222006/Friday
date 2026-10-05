from langchain_core.language_models import BaseChatModel
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, BeforeValidator
from typing import Annotated
from dotenv import load_dotenv
from pathlib import Path
import yaml
import os

load_dotenv()

CONFIG_PATH = Path(__file__).resolve().parents[2]/"config.yaml"

# "provider:model" stays a string; {model, base_url, api_key, ...} becomes a chat model
# (kwargs for init_chat_model). The agent and ModelFallbackMiddleware accept both.
Model = Annotated[str | BaseChatModel, BeforeValidator(lambda v: init_chat_model(**v) if isinstance(v, dict) else v)]

class Models(BaseModel):
    primary: Model
    fallbacks: list[Model] = []
    researcher: Model


class Config(BaseModel):
    models: Models
    mcp: dict[str, dict] = {}

# ${VAR} placeholders are filled from the environment (.env), so secrets stay out of the file
cfg = Config.model_validate(yaml.safe_load(os.path.expandvars(CONFIG_PATH.read_text())))