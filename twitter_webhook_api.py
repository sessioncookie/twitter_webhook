from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import aiomysql
import os
from dotenv import load_dotenv
import uvicorn
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import asyncio
from twitter_hook import main
import aiohttp
import json


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
app = FastAPI(lifespan=lifespan, docs_url=None)

# 靜態資源與首頁
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/twitterfollow/", response_class=FileResponse)
async def twitterfollow():
    return FileResponse("static/twitterfollow.html")


@app.get("/", response_class=FileResponse)
async def home():
    return FileResponse("static/index.html")


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
                await send_webhook_message()
                return {"message": f"資料庫查詢失敗: {str(e)}"}

    # 嘗試發送測試訊息到 Webhook
    async with aiohttp.ClientSession() as session:
        try:
            test_message = {"content": "測試訊息"}
            async with session.post(webhook_url, json=test_message, timeout=5) as response:
                if response.status != 200 and response.status != 204:
                    return {"message": f"Webhook 測試訊息發送失敗，狀態碼: {response.status}"}
        except Exception as e:
            return {"message": f"Webhook 測試失敗: {str(e)}"}

    # 如果測試訊息成功，繼續執行資料庫插入
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            try:
                await cur.execute(
                    """
                    INSERT INTO follow_data (follow_user, webhook_url, notify)
                    VALUES (%s, %s, %s)
                    """,
                    (
                        follow_user,
                        webhook_url,
                        notify,
                    ),
                )
                return {"message": "訂閱成功"}
            except Exception as e:
                return {"message": f"資料庫插入失敗: {str(e)}"}


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
