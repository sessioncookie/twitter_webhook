import aiomysql
from tweety import Twitter
from tweety.exceptions import TwitterError
from dotenv import load_dotenv
import asyncio
import os
import redis.asyncio as redis
from dateutil import parser
from typing import Optional, Dict, List
import aiohttp
import json
from typing import Union
from datetime import datetime

load_dotenv(dotenv_path="./.env")

DB_HOST = os.getenv("TWITTER_DB_HOST")
DB_PORT = int(os.getenv("TWITTER_DB_PORT"))
DB_USER = os.getenv("TWITTER_DB_USER")
DB_PASSWORD = os.getenv("TWITTER_DB_PASSWORD")
DB_DATABASE = os.getenv("TWITTER_DB_DATABASE")
TWITTER_REDIS_URL = os.getenv("TWITTER_REDIS_URL")
TWITTER_REDIS_MAX_CONNECTIONS = os.getenv("TWITTER_REDIS_MAX_CONNECTIONS")
username_dict = json.loads(os.getenv("username_dict"))
pool = redis.ConnectionPool.from_url(
    TWITTER_REDIS_URL, max_connections=int(TWITTER_REDIS_MAX_CONNECTIONS)
)
redis_client = redis.Redis(connection_pool=pool)


async def create_pool():
    try:
        pool = await aiomysql.create_pool(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            db=DB_DATABASE,
            minsize=1,
            maxsize=10,
            charset="utf8mb4",
            loop=asyncio.get_event_loop(),
        )
        print("連線池建立成功")
        return pool
    except aiomysql.Error as e:
        print(f"連線池建立失敗: {e}")
        return None


async def fetch_with_pool(pool):
    async with pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute(
                "SELECT id,follow_user,webhook_url,notify FROM follow_data WHERE state = 1"
            )
            results = await cursor.fetchall()
            return results


async def update_state(pool, id: int):
    async with pool.acquire() as conn:
        async with conn.cursor() as cursor:
            await cursor.execute("UPDATE follow_data SET state = 0 WHERE id = %s", (id,))
            await conn.commit()


async def twitter(
    target_username: str,
    TWITTER_username: str = "0",
    TWITTER_password: str = "0",
):
    try:
        token_path = f".twitter_token/{TWITTER_username}"
        app = Twitter(token_path)
        if not os.path.exists(token_path):
            await app.sign_in(username=TWITTER_username, password=TWITTER_password)
        await app.connect()

        try:
            user = await app.get_user_info(target_username)
        except TwitterError as e:
            print(f"Error fetching user info: {e}")
            return f"抱歉，無法獲取用戶{target_username}的資訊，請檢查是否輸入錯誤，已關閉服務。", datetime.now(), True

        try:
            all_tweets = await app.get_tweets(user)
            for tweet in all_tweets.tweets:
                if hasattr(tweet, "tweets"):
                    for _tweet in tweet:
                        if not _tweet.is_retweet:
                            return _tweet.url, _tweet.created_on, False
                else:
                    if not tweet.is_retweet:
                        return tweet.url, tweet.created_on, False
        except TwitterError as e:
            print(f"Error fetching tweets: {e}")
            return None

    except Exception as e:
        print(f"Unexpected error in Twitter task: {e}")
        return None


REDIS_KEY = "twitter:last_tweet_time"


async def twitter_and_redis(username: str, time: Union[str, datetime]) -> bool:
    if isinstance(time, str):
        new_time = parser.parse(time)
    else:
        new_time = time

    old_time_str: Optional[str] = await redis_client.hget(REDIS_KEY, username)

    if old_time_str is None:
        await redis_client.hset(REDIS_KEY, username, new_time.isoformat())
        return True

    old_time = parser.parse(old_time_str)

    if old_time < new_time:
        await redis_client.hset(REDIS_KEY, username, new_time.isoformat())
        return True
    return False


async def message_to_webhook(message: str, webhook_url: str) -> bool:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(webhook_url, json={"content": message}) as resp:
                return resp.status == 200 or resp.status == 204
        except aiohttp.ClientError as e:
            print(f"❌ 發送 webhook 時發生錯誤: {e}")
            return False


async def check_network() -> bool:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get("https://www.google.com", timeout=5) as resp:
                return resp.status == 200
        except aiohttp.ClientError:
            return False


async def main():
    pool = await create_pool()
    if not pool:
        return

    followers = [[username, token] for username, token in username_dict.items()]
    follow_data = await fetch_with_pool(pool)

    # Group by follow_user to avoid duplicate Twitter queries
    grouped_data: Dict[str, List[dict]] = {}
    for data in follow_data:
        follow_user = data[1]
        if follow_user not in grouped_data:
            grouped_data[follow_user] = []
        grouped_data[follow_user].append({"id": data[0], "webhook_url": data[2], "notify": data[3]})

    for idx, (follow_user, entries) in enumerate(grouped_data.items()):
        # Use index to cycle through followers list
        twitter_account = followers[idx % len(followers)]
        result = await twitter(
            target_username=follow_user,
            TWITTER_username=twitter_account[0],
            TWITTER_password=twitter_account[1],
        )

        if result is None:
            continue

        tw_url, tw_time, user_can_not_find = result
        if await twitter_and_redis(follow_user, tw_time):
            for entry in entries:
                success = await message_to_webhook(
                    message=entry["notify"] + f"\n{tw_url}", webhook_url=entry["webhook_url"]
                )
                if not success or user_can_not_find:
                    # Check network status before disabling
                    if await check_network():
                        print("網路正常，更新狀態")
                        await update_state(pool, entry["id"])
                    else:
                        print("檢測到網路問題，跳過狀態更新")
                        pool.close()
                        await pool.wait_closed()
                        return

    pool.close()
    await pool.wait_closed()


async def scheduler():
    while True:
        try:
            await main()
        except Exception as e:
            print(f"執行任務時出錯: {e}")
        await asyncio.sleep(900)  # 每隔 900 秒（15 分鐘）


if __name__ == "__main__":
    asyncio.run(scheduler())
