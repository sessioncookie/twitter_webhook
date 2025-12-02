from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
import aiomysql
import os
from dotenv import load_dotenv
import uvicorn
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from contextlib import asynccontextmanager
import asyncio
from twitter_hook import main
import aiohttp
import json
import httpx
from pathlib import Path
from fastapi.responses import JSONResponse


load_dotenv(dotenv_path=".env")

# 環境變數
DB_HOST = os.getenv("TWITTER_DB_HOST")
DB_PORT = int(os.getenv("TWITTER_DB_PORT"))
DB_USER = os.getenv("TWITTER_DB_USER")
DB_PASSWORD = os.getenv("TWITTER_DB_PASSWORD")
DB_DATABASE = os.getenv("TWITTER_DB_DATABASE")

error_webhook = os.getenv("error_webhook")
username_dict = json.loads(os.getenv("username_dict"))
username_dict_count = len(username_dict)
one_username_limit = 15


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 建立資料庫連線池
    db_pool = await aiomysql.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_DATABASE,
        autocommit=True,
        minsize=1,
        maxsize=10,
    )
    app.state.db_pool = db_pool

    # 背景排程任務（每 15 分鐘執行一次）
    async def scheduler():
        while True:
            try:
                await main()
            except Exception as e:
                print(f"排程執行錯誤: {e}")
            await asyncio.sleep(900)  # 15 分鐘

    app.state.bg_task = asyncio.create_task(scheduler())

    yield

    # 關閉資料庫連線池
    db_pool.close()
    await db_pool.wait_closed()
    app.state.bg_task.cancel()


# 初始化 FastAPI 應用
app = FastAPI(
    lifespan=lifespan,
)

# 靜態資源與首頁
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/twitterfollow/", response_class=FileResponse)
async def twitterfollow():
    return FileResponse("static/twitterfollow.html")


@app.post("/twitterfollow/")
async def twitterfollow_post(request: Request):
    # 你也可以在這裡記錄一些 Cloudflare POST 或用戶行為資訊
    return RedirectResponse(url="/twitterfollow/", status_code=303)


@app.get("/", response_class=FileResponse)
async def home():
    return FileResponse("static/index.html")


@app.get("/obstemplate", response_class=FileResponse)
async def obstemplate():
    return FileResponse("static/obstemplate.html")


async def send_webhook_message(webhook_url: str, message: str) -> dict:
    """
    向指定的 Webhook URL 發送指定的訊息。

    參數:
        webhook_url (str): 要發送訊息的 Webhook URL。
        message (str): 要發送的訊息內容。

    回傳:
        dict: 包含執行結果的資訊，例如是否成功或錯誤訊息。
    """
    # 準備要發送的資料
    payload = {"content": message}

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                webhook_url, data=json.dumps(payload), headers={"Content-Type": "application/json"}
            ) as response:
                if response.status == 200 or response.status == 204:
                    return {"success": True, "message": "訊息發送成功"}
                else:
                    return {
                        "success": False,
                        "message": f"訊息發送失敗，狀態碼: {response.status}",
                        "details": await response.text(),
                    }
    except aiohttp.ClientError as e:
        return {"success": False, "message": f"訊息發送失敗: {str(e)}"}


# 資料庫插入函式
async def insert_follow_data(pool, follow_user: str, webhook_url: str, notify: str):
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(
                    """
                    SELECT COUNT(*) FROM follow_data WHERE state = 1
                    """
                )
                results = await cur.fetchone()
                count = results[0]
                limit = username_dict_count * one_username_limit
                if count >= limit:
                    return {"message": f"已達到最大訂閱數量: {limit}"}
            except Exception as e:
                await send_webhook_message(error_webhook, f"資料庫查詢失敗: {str(e)}")
                return {"message": "資料庫查詢失敗"}

    # 嘗試發送測試訊息到 Webhook
    async with aiohttp.ClientSession() as session:
        try:
            test_message = {"content": "測試訊息"}
            async with session.post(webhook_url, json=test_message, timeout=5) as response:
                if response.status != 200 and response.status != 204:
                    return {"message": f"Webhook 測試訊息發送失敗，狀態碼: {response.status}"}
        except Exception as e:
            await send_webhook_message(error_webhook, f"Webhook 測試失敗: {str(e)}")
            return {"message": "Webhook 測試失敗"}

    # 如果測試訊息成功，繼續執行資料庫插入
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                # 查詢當前最大的 id
                await cur.execute(
                    """
                    SELECT MAX(id) FROM follow_data
                    """
                )
                result = await cur.fetchone()
                max_id = result[0] if result[0] is not None else 0
                new_id = max_id + 1

                # 插入新資料或更新現有資料
                await cur.execute(
                    """
                    INSERT INTO follow_data (id, follow_user, webhook_url, notify)
                    VALUES (%s, %s, %s, %s)
                    ON DUPLICATE KEY UPDATE notify = VALUES(notify)
                    """,
                    (
                        new_id,
                        follow_user,
                        webhook_url,
                        notify,
                    ),
                )
                return {"message": "訂閱成功"}
            except Exception as e:
                await send_webhook_message(
                    error_webhook, f"資料庫插入失敗: {str(e)},{follow_user},{webhook_url},{notify}"
                )
                return {"message": "資料庫插入失敗"}


class SaveData(BaseModel):
    filename: str
    cssdata: dict
    ts_token: str


TEMPLATE_DIR = Path("templates")
TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
TURNSTILE_SECRET = "0x4AAAAAACDheqBBQkga5_2A8BOuVJZU8G4"


@app.post("/savetemplate")
async def save_text(data: SaveData):
    # 1. Cloudflare Turnstile 驗證
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": TURNSTILE_SECRET, "response": data.ts_token},
        )
    result = r.json()

    if not result.get("success"):
        raise HTTPException(status_code=403, detail="Turnstile 驗證失敗")

    # 2. 檔名安全性處理
    safe_filename = os.path.basename(data.filename).strip()

    if not safe_filename:
        raise HTTPException(status_code=400, detail="檔名無效")

    if not safe_filename.endswith(".json"):
        safe_filename += ".json"

    # 3. 路徑處理
    file_path = TEMPLATE_DIR / safe_filename

    # *** 新增：檔案存在就失敗 ***
    if file_path.exists():
        raise HTTPException(status_code=409, detail=f"模板 '{safe_filename}' 已存在，無法覆蓋")

    # 4. 執行儲存
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data.cssdata, f, ensure_ascii=False, indent=4)
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"伺服器寫入失敗: {str(e)}")

    return {
        "status": "success",
        "message": f"模板 '{safe_filename}' 已成功儲存",
        "saved_as": safe_filename,
    }


@app.get("/gettemplate")
async def get_all_templates():
    # 如果資料夾還沒建立，直接回傳空物件
    if not TEMPLATE_DIR.exists():
        return {}

    all_templates = {}

    # 搜尋資料夾內所有 .json 檔案
    for file_path in TEMPLATE_DIR.glob("*.json"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = json.load(f)

                # file_path.stem 會取得 "my-style" (從 "templates/my-style.json")
                # 使用檔名(不含副檔名)作為 Key，方便前端顯示
                template_name = file_path.stem

                all_templates[template_name] = content

        except Exception as e:
            # 萬一某個檔案損壞或格式錯誤，印出 Log 但不要讓 API 崩潰
            print(f"Error reading template {file_path}: {e}")
            continue

    return all_templates


@app.get("/fx/list")
async def fx_list():
    # 假設你的特效檔案放在 static/fx 資料夾下
    folder = "./static/fx"
    # 如果資料夾不存在就建立，避免報錯
    if not os.path.exists(folder):
        os.makedirs(folder)

    # 讀取所有 .js 檔案
    files = [f for f in os.listdir(folder) if f.endswith(".js")]
    return JSONResponse(files)


class FollowData(BaseModel):
    follow_user: str
    webhook_url: str
    notify: str


# POST 端點
@app.post("/add-follow/")
async def add_follow(data: FollowData):
    follow_user = data.follow_user
    follow_user = follow_user.replace("@", "")
    webhook_url = data.webhook_url
    notify = data.notify
    try:
        pool = app.state.db_pool
        state = await insert_follow_data(pool, follow_user, webhook_url, notify)
        return {"message": state["message"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("twitter_webhook_api:app", host="0.0.0.0", port=8000, reload=True)
