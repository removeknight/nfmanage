from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://watermanage:watermanage@db:5432/watermanage"
    cors_origins: str = "*"
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    mini_auth_mode: str = "wechat"
    merchant_api_key: str = ""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
