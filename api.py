from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from datetime import datetime

app = FastAPI()

# 假設的最新版本資訊

FILE_PATH = "path/to/your/latest_file.zip"  # 請改成實際檔案路徑


class TokenRequest(BaseModel):
    token: str


@app.get("/version")
def get_version():
    """
    回傳最新版本號
    """
    # 開啟版本檔案
    try:
        with open("version.txt", "r") as f:
            LATEST_VERSION = f.read().strip()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Version file not found")
    return {"latest_version": LATEST_VERSION}


@app.get("/download")
def download_file():
    """
    下載最新檔案
    """
    try:
        return FileResponse(FILE_PATH, filename="app.pyd", media_type="application/octet-stream")
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")


@app.post("/check_token")
def check_token(req: TokenRequest):
    """
    檢查 token 是否有效，並回傳有效期限
    """
    # 讀取TOKEN 檔案
    with open("tokens.json", "r") as f:
        TOKENS = f.readlines()
    token = req.token
    expiry_str = TOKENS.get(token)
    if not expiry_str:
        raise HTTPException(status_code=401, detail="Invalid token")

    expiry_date = datetime.strptime(expiry_str, "%Y-%m-%d").date()
    today = datetime.today().date()

    if expiry_date < today:
        return {"valid": False, "expiry_date": expiry_str}

    return {"valid": True, "expiry_date": expiry_str}
