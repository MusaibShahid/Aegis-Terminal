from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8000
    log_level: str = "INFO"

    binance_ws_url: str = "wss://stream.binance.com:9443/ws"
    mt5_account: int | None = None
    mt5_password: str | None = None
    mt5_server: str = "Exness-Demo"
    mt5_timeout: int = 30

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
