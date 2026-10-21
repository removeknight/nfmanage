from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://watermanage:watermanage@db:5432/watermanage"
    cors_origins: str = "*"
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    mini_auth_mode: str = "wechat"
    seed_demo_data: bool = False
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", str_strip_whitespace=True)

settings = Settings()
