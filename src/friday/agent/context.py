from pydantic import BaseModel
from friday.database.models import User

class Ctx(BaseModel):
    user: User
    channel: str