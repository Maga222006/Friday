from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from langgraph.store.postgres import AsyncPostgresStore
from sqlmodel.ext.asyncio.session import AsyncSession
from friday.database.models import User, Users
from sqlmodel import SQLModel, select
from dotenv import load_dotenv
import os

load_dotenv()

AEGRA_DB = "postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}".format(**os.environ)
engine = create_async_engine(os.environ["APP_DATABASE_URL"], echo=False)
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)

async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

async def get_user(user_id: int) -> User | None:
    async with async_session() as session:
        row = await session.get(Users, user_id)
        return User.from_row(row) if row else None

async def remove_user(user_id: int) -> User | None:
    async with async_session() as session:
        row = await session.get(Users, user_id)
        if not row:
            return None
        await session.delete(row)
        await session.commit()
    ns = (str(user_id), "memories")
    async with AsyncPostgresStore.from_conn_string(AEGRA_DB) as store:
        while items := await store.asearch(ns, limit=100):
            for item in items:
                await store.adelete(ns, item.key)
    return User.from_row(row)


async def list_users() -> list[User]:
    async with async_session() as session:
        rows = (await session.exec(select(Users))).all()
        return [User.from_row(r) for r in rows]

async def resolve_telegram(telegram_id: str) -> User | None:
    async with async_session() as session:
        row = (await session.exec(
            select(Users).where(Users.telegram_id == telegram_id)
        )).first()
        return User.from_row(row) if row else None

async def create_user(username: str, telegram_id: str | None = None, location: dict | None = None) -> User:
    async with async_session() as session:
        row = Users(telegram_id=telegram_id, username=username, location=location)
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return User.from_row(row)
