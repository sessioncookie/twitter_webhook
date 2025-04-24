from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import aiomysql
import os
from dotenv import load_dotenv
import uvicorn

load_dotenv(dotenv_path=".env")

app = FastAPI()

# 環境變數
DB_HOST = os.getenv("TWITTER_DB_HOST")
DB_PORT = int(os.getenv("TWITTER_DB_PORT"))
DB_USER = os.getenv("TWITTER_DB_USER")
DB_PASSWORD = os.getenv("TWITTER_DB_PASSWORD")
DB_DATABASE = os.getenv("TWITTER_DB_DATABASE")


# Pydantic 資料模型
class FollowData(BaseModel):
    follow_user: str
    webhook_url: str
    notify: bool
    data: str


# 資料庫插入函式
async def insert_follow_data(follow_user: str, webhook_url: str, notify: str):
    conn = await aiomysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        db=DB_DATABASE,
        autocommit=True
    )
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO follow_data (follow_user, webhook_url, notify, data)
            VALUES (%s, %s, %s, DATE_FORMAT(DATE_ADD(CURDATE(), INTERVAL 1 MONTH), '%%Y-%m-%d'))
            """,
            (follow_user, webhook_url, notify,)
        )
    conn.close()


# POST 端點
@app.post("/add-follow/")
async def add_follow(follow_user: str, webhook_url: str, notify: str):
    try:
        await insert_follow_data(follow_user, webhook_url, notify,)
        return {"message": "Follow data inserted successfully!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run("twitter_webhook_api:app", host="0.0.0.0", port=65533, reload=True)
