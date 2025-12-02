import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, NamedTuple, Optional, Union

import aiohttp
import aiomysql
import redis.asyncio as redis
from dateutil import parser
from dotenv import load_dotenv
from tweety import Twitter
from tweety.exceptions import TwitterError
from tweety.types import Tweet

# --- 配置設定 ---
load_dotenv(dotenv_path="./.env")


class Config:
    DB_HOST = os.getenv("TWITTER_DB_HOST")
    DB_PORT = int(os.getenv("TWITTER_DB_PORT", 3306))
    DB_USER = os.getenv("TWITTER_DB_USER")
    DB_PASSWORD = os.getenv("TWITTER_DB_PASSWORD")
    DB_DATABASE = os.getenv("TWITTER_DB_DATABASE")

    REDIS_URL = os.getenv("TWITTER_REDIS_URL")
    REDIS_MAX_CONNS = int(os.getenv("TWITTER_REDIS_MAX_CONNECTIONS", 10))

    # 解析帳號字典
    try:
        ACCOUNTS = json.loads(os.getenv("username_dict", "{}"))
        ACCOUNT_LIST = list(ACCOUNTS.items())  # 轉為 list 方便輪詢
    except json.JSONDecodeError:
        print("❌ username_dict 格式錯誤")
        sys.exit(1)

    REDIS_KEY_PREFIX = "twitter:last_tweet_time"


# --- 資料結構 ---
class FollowTask(NamedTuple):
    id: int
    follow_user: str
    webhook_url: str
    notify_msg: str


class TweetResult(NamedTuple):
    url: str
    created_at: datetime


class UserNotFoundError(Exception):
    """當 Twitter 用戶不存在或鎖定時拋出"""

    pass


# --- 全域連線池 ---
redis_pool = redis.ConnectionPool.from_url(Config.REDIS_URL, max_connections=Config.REDIS_MAX_CONNS)
redis_client = redis.Redis(connection_pool=redis_pool)


# --- 資料庫操作 ---
async def create_db_pool():
    try:
        pool = await aiomysql.create_pool(
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            db=Config.DB_DATABASE,
            minsize=1,
            maxsize=10,
            charset="utf8mb4",
            autocommit=True,
        )
        print("✅ 資料庫連線池建立成功")
        return pool
    except Exception as e:
        print(f"❌ 資料庫連線失敗: {e}")
        return None


async def fetch_active_tasks(pool) -> Dict[str, List[FollowTask]]:
    """獲取任務並按用戶分組"""
    async with pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(
                "SELECT id, follow_user, webhook_url, notify FROM follow_data WHERE state = 1"
            )
            rows = await cursor.fetchall()

            # 將資料轉換為物件並分組
            grouped = {}
            for row in rows:
                task = FollowTask(
                    id=row[0], follow_user=row[1], webhook_url=row[2], notify_msg=row[3]
                )
                if task.follow_user not in grouped:
                    grouped[task.follow_user] = []
                grouped[task.follow_user].append(task)
            return grouped


async def disable_task(pool, task_id: int):
    """發生嚴重錯誤時停用任務"""
    async with pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute("UPDATE follow_data SET state = 0 WHERE id = %s", (task_id,))


# --- Twitter 邏輯 ---
async def get_latest_tweet(target_username: str, auth_user: str, auth_pass: str) -> Optional[TweetResult]:
    """獲取最新貼文，若用戶不存在則拋出 UserNotFoundError"""
    token_path = f".twitter_token/{auth_user}"
    app = Twitter(token_path)
    
    try:
        if not os.path.exists(token_path):
            await app.sign_in(username=auth_user, password=auth_pass)
        await app.connect()
        
        # 獲取用戶
        try:
            user_info = await app.get_user_info(target_username)
        except TwitterError as e:
            if "User Account wasn't Found" in str(e) or "Protected" in str(e):
                raise UserNotFoundError(f"用戶 {target_username} 不存在或已鎖定")
            raise e

        # 獲取推文
        all_tweets = await app.get_tweets(user_info)
        
        # 尋找第一則非轉推且「有時間」的推文
        for tweet in all_tweets.tweets:
            actual_tweet = tweet
            if hasattr(tweet, "tweets") and tweet.tweets: 
                actual_tweet = tweet.tweets[0]
            elif isinstance(tweet, list):
                actual_tweet = tweet[0]

            # --- 修正點開始 ---
            # 1. 確保不是轉推
            # 2. 確保 created_on 不為 None (防呆)
            if not actual_tweet.is_retweet and actual_tweet.created_on is not None:
                return TweetResult(url=actual_tweet.url, created_at=actual_tweet.created_on)
            # --- 修正點結束 ---
                
        return None

    except UserNotFoundError:
        raise
    except Exception as e:
        print(f"⚠️ 抓取 {target_username} 失敗 (使用帳號 {auth_user}): {e}")
        return None


# --- 輔助功能 ---
async def is_new_tweet(username: str, tweet_time: datetime) -> bool:
    """檢查 Redis 是否為新推文"""
    cached_time_str = await redis_client.hget(Config.REDIS_KEY_PREFIX, username)

    if cached_time_str:
        cached_time = parser.parse(cached_time_str.decode("utf-8"))
        if cached_time >= tweet_time:
            return False

    await redis_client.hset(Config.REDIS_KEY_PREFIX, username, tweet_time.isoformat())
    return True


async def send_discord_webhook(url: str, content: str) -> bool:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, json={"content": content}) as resp:
                return resp.status in (200, 204)
        except Exception as e:
            print(f"❌ Webhook 發送錯誤 ({url}): {e}")
            return False


async def is_network_online() -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("https://www.google.com", timeout=5) as resp:
                return resp.status == 200
    except:
        return False


# --- 主程序 ---
async def process_user_tasks(pool, target_user: str, tasks: List[FollowTask], account_idx: int):
    """處理單一監控目標的所有任務"""
    # 輪詢使用 Twitter 帳號
    auth_user, auth_pass = Config.ACCOUNT_LIST[account_idx % len(Config.ACCOUNT_LIST)]

    try:
        tweet_data = await get_latest_tweet(target_user, auth_user, auth_pass)

        if tweet_data and await is_new_tweet(target_user, tweet_data.created_at):
            print(f"🔔 {target_user} 發現新推文，開始推送...")
            for task in tasks:
                msg = f"{task.notify_msg}\n{tweet_data.url}"
                await send_discord_webhook(task.webhook_url, msg)

    except UserNotFoundError as e:
        print(f"⛔ {target_user} 帳號異常，發送通知並停用任務。")
        error_msg = f"無法獲取用戶 {target_user} 的資訊（不存在或鎖定），已停止監控。"

        # 檢查網路是否正常，避免因網路問題誤判
        if await is_network_online():
            for task in tasks:
                await send_discord_webhook(task.webhook_url, error_msg)
                await disable_task(pool, task.id)
        else:
            print("⚠️ 檢測到網路異常，跳過停用操作。")


async def main():
    db_pool = await create_db_pool()
    if not db_pool:
        return

    try:
        grouped_tasks = await fetch_active_tasks(db_pool)

        # 併發處理所有用戶 (可選：如果怕被鎖，可以用 for 迴圈改成序列執行)
        # 這裡保持原本的邏輯：序列執行
        for i, (target_user, tasks) in enumerate(grouped_tasks.items()):
            await process_user_tasks(db_pool, target_user, tasks, i)

    finally:
        db_pool.close()
        await db_pool.wait_closed()


async def scheduler():
    print(f"🚀 服務啟動，監控 {len(Config.ACCOUNT_LIST)} 個 Twitter 帳號中...")
    while True:
        try:
            await main()
        except Exception as e:
            print(f"💥 主迴圈發生未預期錯誤: {e}")

        print(f"💤 等待 900 秒...")
        await asyncio.sleep(900)


if __name__ == "__main__":
    try:
        asyncio.run(scheduler())
    except KeyboardInterrupt:
        print("程式已手動停止")
